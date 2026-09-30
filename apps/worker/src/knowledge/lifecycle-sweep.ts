import { getDb, knowledgeDocuments, knowledgeSources, rfpDocuments, type Database } from "@rfp-os/db";
import {
  KNOWLEDGE_JOBS,
  knowledgeDocumentJobId,
  type KnowledgeDocumentJobPayload,
} from "@rfp-os/jobs";
import {
  classifyKnowledgeReviewState,
  daysUntilKnowledgeExpiry,
  knowledgeStaleCutoffIso,
  KNOWLEDGE_STALE_AFTER_DAYS,
  type KnowledgeReviewState,
} from "@rfp-os/types";
import type { Queue } from "bullmq";
import { and, eq, isNotNull, lt, or, sql } from "drizzle-orm";

import { addOrRetryJob } from "../shared/queue";
import { inAppEnabled, insertNotificationOnce } from "../shared/notifications";

/** A document `processing` for longer than this has lost its worker. */
const STUCK_PROCESSING_MS = 30 * 60_000;

export interface SweepResult {
  organizations: number;
  reviewStateChanges: number;
  notifications: number;
  flaggedCitations: number;
  reembedQueued: number;
  stuckRecovered: number;
}

/**
 * The job that keeps knowledge from going quietly stale.
 *
 * Staleness used to exist only as a calculation at page-load time: nothing
 * ever changed state, nobody was told, and drafting silently stopped using a
 * source the day it crossed 180 days. The sweep makes that visible:
 *
 * 1. stores each ACTIVE source's review state (shared rule) and when it changed
 * 2. notifies owners when a source goes stale, and at 30 / 7 / 0 days before expiry
 * 3. flags tender citations whose source is now stale, archived or re-versioned
 * 4. re-embeds chunks written by an embedding model that is no longer configured
 * 5. recovers knowledge and RFP documents stuck in `processing`
 *
 * Every step is idempotent — the sweep runs hourly and a re-run is a no-op.
 */
export async function runKnowledgeLifecycleSweep(input: {
  organizationId?: string;
  knowledgeQueue: Queue;
  embeddingModel: string | null;
  now?: Date;
}): Promise<SweepResult> {
  const db = getDb();
  const now = input.now ?? new Date();
  const result: SweepResult = { organizations: 0, reviewStateChanges: 0, notifications: 0, flaggedCitations: 0, reembedQueued: 0, stuckRecovered: 0 };

  const orgRows = input.organizationId
    ? [{ organizationId: input.organizationId }]
    : await db.selectDistinct({ organizationId: knowledgeSources.organizationId }).from(knowledgeSources);

  for (const { organizationId } of orgRows) {
    result.organizations += 1;
    const notify = await inAppEnabled(db, organizationId, "Knowledge");
    const changes = await updateReviewStates(db, organizationId, now);
    result.reviewStateChanges += changes.changed;
    if (notify) result.notifications += await notifyOwners(db, organizationId, changes.sources, now);
    const flagged = await flagCitations(db, organizationId, now);
    result.flaggedCitations += flagged.count;
    if (notify) result.notifications += await notifyFlaggedAnswers(db, organizationId, flagged.tenders);
    if (input.embeddingModel) result.reembedQueued += await queueReembedding(db, input.knowledgeQueue, organizationId, input.embeddingModel);
  }
  result.stuckRecovered += await recoverStuckKnowledgeDocuments(db, input.knowledgeQueue, now);
  result.stuckRecovered += await failStuckRfpDocuments(db, now);
  return result;
}

interface SourceState {
  id: string;
  name: string;
  ownerId: string | null;
  expiresAt: string | null;
  previous: KnowledgeReviewState | null;
  current: KnowledgeReviewState | null;
}

async function updateReviewStates(db: Database, organizationId: string, now: Date) {
  const rows = await db
    .select({
      id: knowledgeSources.id,
      name: knowledgeSources.name,
      ownerId: knowledgeSources.ownerId,
      status: knowledgeSources.lifecycleStatus,
      lastVerified: knowledgeSources.lastVerified,
      expiresAt: knowledgeSources.expiresAt,
      reviewState: knowledgeSources.reviewState,
    })
    .from(knowledgeSources)
    .where(eq(knowledgeSources.organizationId, organizationId));

  const sources: SourceState[] = [];
  let changed = 0;
  for (const row of rows) {
    const current = classifyKnowledgeReviewState({ status: row.status, lastVerified: row.lastVerified, expiresAt: row.expiresAt }, now);
    const previous = (row.reviewState ?? null) as KnowledgeReviewState | null;
    if (current !== previous) {
      await db
        .update(knowledgeSources)
        .set({ reviewState: current, reviewStateChangedAt: now })
        .where(eq(knowledgeSources.id, row.id));
      changed += 1;
    }
    sources.push({ id: row.id, name: row.name, ownerId: row.ownerId, expiresAt: row.expiresAt, previous, current });
  }
  return { changed, sources };
}

/**
 * The notification's detail names the milestone ("expires in 7 days"), so
 * insertNotificationOnce sends each milestone once however often this runs.
 */
async function notifyOwners(db: Database, organizationId: string, sources: SourceState[], now: Date): Promise<number> {
  let sent = 0;
  for (const source of sources) {
    if (!source.ownerId || source.current === null) continue;
    let title: string | null = null;
    let detail = "";
    let severity: "info" | "warning" | "danger" = "warning";
    const daysLeft = daysUntilKnowledgeExpiry(source.expiresAt, now);

    if (source.current === "expired") {
      title = "Knowledge source expired";
      detail = `${source.name} expired and is no longer used when drafting tender answers. Verify it with a new expiry date or archive it.`;
      severity = "danger";
    } else if (source.current === "stale" && source.previous !== "stale") {
      title = "Knowledge source needs re-verification";
      detail = `${source.name} was last verified over ${KNOWLEDGE_STALE_AFTER_DAYS} days ago and is now skipped when drafting answers.`;
    } else if (daysLeft !== null && daysLeft >= 0 && daysLeft <= 30) {
      const milestone = daysLeft === 0 ? 0 : daysLeft <= 7 ? 7 : 30;
      title = "Knowledge source expiring soon";
      detail = milestone === 0
        ? `${source.name} expires today.`
        : `${source.name} expires within ${milestone} days. Verify it before it drops out of tender drafting.`;
      severity = milestone <= 7 ? "danger" : "warning";
    }
    if (!title) continue;
    const inserted = await insertNotificationOnce(db, {
      organizationId,
      userId: source.ownerId,
      category: "Knowledge",
      severity,
      title,
      detail,
      relatedEntityType: "knowledge_source",
      relatedEntityId: source.id,
    });
    if (inserted) sent += 1;
  }
  return sent;
}

/**
 * Recomputes citation_status in one statement. A citation is:
 * - source_archived: its knowledge source was archived
 * - source_stale:    the source is expired or past the stale cut-off
 * - source_changed:  the source has a newer version than the one cited
 * - current:         otherwise (including tender-owned evidence, which never matches a source)
 * Returns the tenders whose citations newly left `current`.
 */
async function flagCitations(db: Database, organizationId: string, now: Date) {
  const today = now.toISOString().slice(0, 10);
  const staleCutoff = knowledgeStaleCutoffIso(now);
  const rows = (await db.execute(sql`
    with computed as (
      select e.id, e.tender_id, e.citation_status as previous,
        case
          when s.lifecycle_status = 'ARCHIVED' then 'source_archived'
          when s.expires_at < ${today}::date or s.last_verified < ${staleCutoff}::date then 'source_stale'
          when e.source_version is not null and e.source_version <> s.version then 'source_changed'
          else 'current'
        end as next
      from tender_answer_evidence e
      join knowledge_sources s on s.id::text = e.source_id
      where e.organization_id = ${organizationId}
    )
    update tender_answer_evidence e
    set citation_status = computed.next, citation_checked_at = now()
    from computed
    where e.id = computed.id and computed.previous is distinct from computed.next
    returning e.tender_id, computed.next as next`)) as unknown as Array<{ tender_id: string; next: string }>;
  const tenders = new Map<string, number>();
  for (const row of rows) {
    if (row.next === "current") continue;
    tenders.set(row.tender_id, (tenders.get(row.tender_id) ?? 0) + 1);
  }
  return { count: rows.filter((row) => row.next !== "current").length, tenders };
}

async function notifyFlaggedAnswers(db: Database, organizationId: string, tenders: Map<string, number>): Promise<number> {
  if (tenders.size === 0) return 0;
  const rows = (await db.execute(sql`
    select id, title, owner_id from tenders
    where organization_id = ${organizationId} and id in (${sql.join([...tenders.keys()].map((id) => sql`${id}::uuid`), sql`, `)})
      and status not in ('SUBMITTED', 'CLOSED', 'CANCELLED', 'ARCHIVED')`)) as unknown as Array<{ id: string; title: string; owner_id: string | null }>;
  let sent = 0;
  for (const tender of rows) {
    if (!tender.owner_id) continue;
    const count = tenders.get(tender.id) ?? 0;
    const inserted = await insertNotificationOnce(db, {
      organizationId,
      userId: tender.owner_id,
      category: "Knowledge",
      severity: "warning",
      title: "Answers cite knowledge that changed",
      detail: `${count} citation${count === 1 ? "" : "s"} in ${tender.title} point at knowledge that is now stale, archived or updated. Review and re-draft those answers.`,
      relatedEntityType: "tender",
      relatedEntityId: tender.id,
    });
    if (inserted) sent += 1;
  }
  return sent;
}

async function queueReembedding(db: Database, queue: Queue, organizationId: string, embeddingModel: string): Promise<number> {
  const documents = (await db.execute(sql`
    select distinct d.id, d.source_id, d.file_id, d.version, d.mime_type, f.object_key
    from knowledge_documents d
    join files f on f.id = d.file_id
    join knowledge_chunks c on c.document_id = d.id
    where d.organization_id = ${organizationId}
      and d.status in ('parsed', 'embedded')
      and (c.embedding is null or c.embedding_model is distinct from ${embeddingModel})
    limit 200`)) as unknown as Array<{ id: string; source_id: string; file_id: string; version: number; mime_type: string; object_key: string }>;
  let queued = 0;
  for (const document of documents) {
    const payload: KnowledgeDocumentJobPayload = {
      organizationId,
      sourceId: document.source_id,
      documentId: document.id,
      fileId: document.file_id,
      version: document.version,
      objectKey: document.object_key,
      mimeType: document.mime_type,
      actorId: null,
    };
    const outcome = await addOrRetryJob(queue, KNOWLEDGE_JOBS.EMBED, payload, `${knowledgeDocumentJobId(KNOWLEDGE_JOBS.EMBED, document.id, document.version)}:${embeddingModel}`);
    if (outcome !== "pending") queued += 1;
  }
  return queued;
}

/** Re-queues knowledge documents whose ingest worker died, with a fresh version so the job id is new. */
async function recoverStuckKnowledgeDocuments(db: Database, queue: Queue, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - STUCK_PROCESSING_MS);
  const stuck = await db
    .update(knowledgeDocuments)
    .set({ status: "queued", version: sql`${knowledgeDocuments.version} + 1`, failureReason: null, updatedAt: now })
    .where(
      or(
        and(eq(knowledgeDocuments.status, "processing"), lt(knowledgeDocuments.processingStartedAt, cutoff)),
        and(eq(knowledgeDocuments.status, "queued"), lt(knowledgeDocuments.updatedAt, cutoff)),
      ),
    )
    .returning();
  for (const document of stuck) {
    const [file] = (await db.execute(sql`select object_key from files where id = ${document.fileId}`)) as unknown as Array<{ object_key: string }>;
    if (!file) continue;
    await addOrRetryJob(
      queue,
      KNOWLEDGE_JOBS.INGEST,
      {
        organizationId: document.organizationId,
        sourceId: document.sourceId,
        documentId: document.id,
        fileId: document.fileId,
        version: document.version,
        objectKey: file.object_key,
        mimeType: document.mimeType,
        actorId: null,
      } satisfies KnowledgeDocumentJobPayload,
      knowledgeDocumentJobId(KNOWLEDGE_JOBS.INGEST, document.id, document.version),
    );
  }
  return stuck.length;
}

/**
 * RFP documents stuck in `processing` are failed with a clear reason rather
 * than silently re-run: their parse can hand off to OCR and requirement
 * extraction, and the user's "reprocess" action is the safe way back in.
 */
async function failStuckRfpDocuments(db: Database, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - STUCK_PROCESSING_MS);
  const rows = await db
    .update(rfpDocuments)
    .set({ status: "failed", failureReason: "Processing stopped responding. Reprocess the document to try again.", updatedAt: now })
    .where(and(eq(rfpDocuments.status, "processing"), lt(rfpDocuments.updatedAt, cutoff), isNotNull(rfpDocuments.fileId)))
    .returning({ id: rfpDocuments.id });
  return rows.length;
}

