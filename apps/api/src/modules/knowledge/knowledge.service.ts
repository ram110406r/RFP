import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import {
  knowledgeClaims,
  knowledgeConflictVariants,
  knowledgeConflicts,
  knowledgeDocuments,
  knowledgeSourceRevisions,
  knowledgeSources,
  knowledgeVersions,
  organizationMembers,
  responseTemplates,
  tenderAnswerEvidence,
  tenders,
  type Database,
  type KnowledgeRevisionChanges,
  type Transaction,
  withTransaction,
} from "@rfp-os/db";
import {
  knowledgeExpiringCutoffIso,
  knowledgeStaleCutoffIso,
  type AuthContext,
} from "@rfp-os/types";

import { PinoLoggerService } from "../../common/logger/pino-logger.service";
import { ActivityService } from "../../infrastructure/activity";
import { AuditService } from "../../infrastructure/audit";
import { DATABASE } from "../../infrastructure/database";
import { JobQueue } from "../../infrastructure/queue";
import type {
  BulkClaimDecisionInput,
  CreateKnowledgeInput,
  CreateResponseTemplateInput,
  KnowledgeSort,
  ListKnowledgeInput,
  ListKnowledgeIssuesInput,
  ListResponseTemplatesInput,
  ResolveKnowledgeIssueInput,
  RevisionDecisionInput,
  UpdateKnowledgeInput,
  UpdateResponseTemplateInput,
  VerifyKnowledgeInput,
} from "./knowledge.dto";
import {
  buildKnowledgeSnapshot,
  bumpVersion,
  type ClaimRow,
  hasContentChanges,
  isUuid,
  type KnowledgeRow,
  lifecycleIssuesForSource,
  parseIssueId,
  planClaimChanges,
  serializeClaim,
  serializeKnowledgeSource,
  splitKnowledgeUpdate,
  stringifyConfidence,
  todayIso,
} from "./knowledge.logic";

type ConflictRow = typeof knowledgeConflicts.$inferSelect;
type ResponseTemplateRow = typeof responseTemplates.$inferSelect;
type RevisionRow = typeof knowledgeSourceRevisions.$inferSelect;
type Executor = Database | Transaction;

const KNOWLEDGE_ACTIVITY_ACTIONS = {
  CREATED: "knowledge.created",
  UPDATED: "knowledge.updated",
  APPROVED: "knowledge.approved",
  ARCHIVED: "knowledge.archived",
  VERIFIED: "knowledge.verified",
  REVISION_PROPOSED: "knowledge.revision.proposed",
  REVISION_APPLIED: "knowledge.revision.applied",
  REVISION_REJECTED: "knowledge.revision.rejected",
  CLAIMS_REVIEWED: "knowledge.claims.reviewed",
  CONFLICT_RESOLVED: "knowledge.conflict_resolved",
  TEMPLATE_CREATED: "knowledge.template.created",
  TEMPLATE_UPDATED: "knowledge.template.updated",
  TEMPLATE_APPROVED: "knowledge.template.approved",
  TEMPLATE_ARCHIVED: "knowledge.template.archived",
  TEMPLATE_DUPLICATED: "knowledge.template.duplicated",
} as const;

const KNOWLEDGE_AUDIT_ACTIONS = {
  CREATED: "KNOWLEDGE_CREATED",
  UPDATED: "KNOWLEDGE_UPDATED",
  APPROVED: "KNOWLEDGE_APPROVED",
  ARCHIVED: "KNOWLEDGE_ARCHIVED",
  VERIFIED: "KNOWLEDGE_VERIFIED",
  REVISION_PROPOSED: "KNOWLEDGE_REVISION_PROPOSED",
  REVISION_APPLIED: "KNOWLEDGE_REVISION_APPLIED",
  REVISION_REJECTED: "KNOWLEDGE_REVISION_REJECTED",
  CLAIMS_REVIEWED: "KNOWLEDGE_CLAIMS_REVIEWED",
  CONFLICT_RESOLVED: "KNOWLEDGE_CONFLICT_RESOLVED",
  TEMPLATE_CREATED: "RESPONSE_TEMPLATE_CREATED",
  TEMPLATE_UPDATED: "RESPONSE_TEMPLATE_UPDATED",
  TEMPLATE_APPROVED: "RESPONSE_TEMPLATE_APPROVED",
  TEMPLATE_ARCHIVED: "RESPONSE_TEMPLATE_ARCHIVED",
  TEMPLATE_DUPLICATED: "RESPONSE_TEMPLATE_DUPLICATED",
} as const;

@Injectable()
export class KnowledgeService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly activity: ActivityService,
    private readonly audit: AuditService,
    private readonly jobs: JobQueue,
    private readonly logger: PinoLoggerService,
  ) {}

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  async list(auth: AuthContext, filters: Partial<ListKnowledgeInput> = {}) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 25;
    const where = this.knowledgeWhere(auth.organizationId, filters);

    const [totalRow] = await this.db.select({ value: sql<number>`count(*)` }).from(knowledgeSources).where(where);
    const rows = await this.db
      .select()
      .from(knowledgeSources)
      .where(where)
      .orderBy(...knowledgeOrder(filters.sort ?? "updatedAt:desc"))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return {
      items: rows.map((row) => serializeKnowledgeSource(row)),
      total: Number(totalRow?.value ?? 0),
      page,
      pageSize,
    };
  }

  /**
   * Counts come from one aggregate query rather than loading the library and
   * reducing it in memory — the old approach grew linearly with every source
   * the org ever wrote. The stale/expired/expiring predicates are the SQL
   * form of classifyKnowledgeReviewState and must stay in step with it.
   */
  async summary(auth: AuthContext) {
    const staleCutoff = knowledgeStaleCutoffIso();
    const today = todayIso();
    const expiringCutoff = knowledgeExpiringCutoffIso();
    const active = sql`${knowledgeSources.lifecycleStatus} = 'ACTIVE'`;
    const expired = sql`${knowledgeSources.expiresAt} < ${today}`;
    const [row] = await this.db
      .select({
        total: sql<number>`count(*)`,
        draft: sql<number>`count(*) filter (where ${knowledgeSources.lifecycleStatus} = 'DRAFT')`,
        active: sql<number>`count(*) filter (where ${active})`,
        archived: sql<number>`count(*) filter (where ${knowledgeSources.lifecycleStatus} = 'ARCHIVED')`,
        expired: sql<number>`count(*) filter (where ${active} and ${expired})`,
        stale: sql<number>`count(*) filter (where ${active} and not coalesce(${expired}, false) and ${knowledgeSources.lastVerified} < ${staleCutoff})`,
        unverified: sql<number>`count(*) filter (where ${active} and not coalesce(${expired}, false) and ${knowledgeSources.lastVerified} is null)`,
        expiring: sql<number>`count(*) filter (where ${active} and ${knowledgeSources.expiresAt} >= ${today} and ${knowledgeSources.expiresAt} <= ${expiringCutoff} and ${knowledgeSources.lastVerified} >= ${staleCutoff})`,
        documentBacked: sql<number>`count(*) filter (where exists (select 1 from ${knowledgeDocuments} where ${knowledgeDocuments.sourceId} = ${knowledgeSources.id}))`,
      })
      .from(knowledgeSources)
      .where(eq(knowledgeSources.organizationId, auth.organizationId));

    const [[templateRow], [conflictRow], [revisionRow], [suggestedRow], [processingRow], recent, attentionRows] =
      await Promise.all([
        this.db
          .select({ value: sql<number>`count(*)` })
          .from(responseTemplates)
          .where(and(eq(responseTemplates.organizationId, auth.organizationId), sql`${responseTemplates.status} <> 'ARCHIVED'`)),
        this.db
          .select({ value: sql<number>`count(*)` })
          .from(knowledgeConflicts)
          .innerJoin(knowledgeSources, eq(knowledgeConflicts.sourceId, knowledgeSources.id))
          .where(and(eq(knowledgeSources.organizationId, auth.organizationId), eq(knowledgeConflicts.status, "OPEN"))),
        this.db
          .select({ value: sql<number>`count(*)` })
          .from(knowledgeSourceRevisions)
          .where(and(eq(knowledgeSourceRevisions.organizationId, auth.organizationId), eq(knowledgeSourceRevisions.status, "PENDING"))),
        this.db
          .select({ value: sql<number>`count(*)` })
          .from(knowledgeClaims)
          .innerJoin(knowledgeSources, eq(knowledgeClaims.sourceId, knowledgeSources.id))
          .where(and(eq(knowledgeSources.organizationId, auth.organizationId), eq(knowledgeClaims.status, "SUGGESTED"))),
        this.db
          .select({ value: sql<number>`count(*)` })
          .from(knowledgeDocuments)
          .where(
            and(
              eq(knowledgeDocuments.organizationId, auth.organizationId),
              inArray(knowledgeDocuments.status, ["queued", "processing"]),
            ),
          ),
        this.db
          .select()
          .from(knowledgeSources)
          .where(eq(knowledgeSources.organizationId, auth.organizationId))
          .orderBy(desc(knowledgeSources.updatedAt))
          .limit(8),
        this.db
          .select()
          .from(knowledgeSources)
          .where(and(eq(knowledgeSources.organizationId, auth.organizationId), this.attentionWhere()))
          .orderBy(asc(knowledgeSources.expiresAt), asc(knowledgeSources.lastVerified))
          .limit(5),
      ]);

    const counts = {
      total: Number(row?.total ?? 0),
      draft: Number(row?.draft ?? 0),
      active: Number(row?.active ?? 0),
      archived: Number(row?.archived ?? 0),
      stale: Number(row?.stale ?? 0),
      unverified: Number(row?.unverified ?? 0),
      expired: Number(row?.expired ?? 0),
      expiring: Number(row?.expiring ?? 0),
      documentBacked: Number(row?.documentBacked ?? 0),
      templates: Number(templateRow?.value ?? 0),
      conflicts: Number(conflictRow?.value ?? 0),
      pendingRevisions: Number(revisionRow?.value ?? 0),
      suggestedClaims: Number(suggestedRow?.value ?? 0),
      processingDocuments: Number(processingRow?.value ?? 0),
    };
    return {
      counts: {
        ...counts,
        openIssues:
          counts.draft + counts.stale + counts.unverified + counts.expired + counts.expiring + counts.conflicts + counts.pendingRevisions,
      },
      items: recent.map((source) => serializeKnowledgeSource(source)),
      attention: attentionRows.map((source) => serializeKnowledgeSource(source)),
      generatedAt: new Date().toISOString(),
    };
  }

  async getById(auth: AuthContext, id: string) {
    const row = await this.requireKnowledgeSource(auth.organizationId, id);
    return this.serializeWithChildren(row);
  }

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------

  async create(auth: AuthContext, input: CreateKnowledgeInput) {
    await this.requireActiveMember(auth.organizationId, input.ownerId ?? auth.userId);
    const created = await withTransaction(async (tx) => {
      const sourceKind = input.sourceKind ?? stringOrUndefined(input.metadata?.sourceKind) ?? stringOrUndefined(input.metadata?.source) ?? "manual";
      const [row] = await tx
        .insert(knowledgeSources)
        .values({
          organizationId: auth.organizationId,
          name: input.name,
          type: input.type,
          category: input.category as never,
          version: input.version ?? "1.0",
          authority: input.authority ?? "medium",
          ownerId: input.ownerId ?? auth.userId,
          lastVerified: input.lastVerified ?? null,
          lastUpdated: todayIso(),
          expiresAt: input.expiresAt ?? null,
          summary: input.summary ?? "",
          lifecycleStatus: "DRAFT",
          metadata: {
            ...(input.metadata ?? {}),
            lifecycleStatus: "DRAFT",
            source: sourceKind,
            sourceKind,
            approvedAt: null,
            approvedBy: null,
          },
        })
        .returning();
      if (!row) throw new BadRequestException("Could not create knowledge source.");

      if (input.claims?.length) {
        await tx.insert(knowledgeClaims).values(
          input.claims.map((claim) => ({
            sourceId: row.id,
            label: claim.label,
            value: claim.value,
            confidence: stringifyConfidence(claim.confidence ?? 0.5),
          })),
        );
      }
      await this.insertVersion(tx, row, auth.userId, "Created as draft knowledge.");
      await this.recordSourceEvent(tx, auth, row, "CREATED", `Created knowledge source ${row.name}`, { newValue: serializeKnowledgeSource(row) });
      return row;
    });

    return this.serializeWithChildren(created);
  }

  /**
   * Editing never pulls a live source out of tenders.
   *
   * - DRAFT sources are edited in place.
   * - ACTIVE sources apply metadata (owner, category, expiry, verification)
   *   immediately, and hold content changes (summary, claims, name, type,
   *   authority) as a PENDING revision. The approved content keeps serving
   *   tender answers until the revision is applied. Further edits amend the
   *   same pending revision.
   *
   * Previously any edit demoted an ACTIVE source to DRAFT, which silently
   * removed it from evidence retrieval until someone re-approved it.
   */
  async update(auth: AuthContext, id: string, input: UpdateKnowledgeInput) {
    const existing = await this.requireKnowledgeSource(auth.organizationId, id);
    if (existing.lifecycleStatus === "ARCHIVED") {
      throw new ConflictException("Archived knowledge sources cannot be updated.");
    }
    await this.requireActiveMember(auth.organizationId, input.ownerId ?? existing.ownerId ?? auth.userId);
    const existingClaims = await this.db.select().from(knowledgeClaims).where(eq(knowledgeClaims.sourceId, id));

    if (existing.lifecycleStatus === "DRAFT") {
      const updated = await withTransaction(async (tx) => {
        const row = await this.applyContentAndMetadata(tx, auth, existing, existingClaims, input, {
          version: input.version ?? existing.version,
        });
        await this.recordSourceEvent(tx, auth, row, "UPDATED", `Updated knowledge source ${row.name}`, {
          previousValue: serializeKnowledgeSource(existing),
          newValue: serializeKnowledgeSource(row),
          metadata: { changedFields: Object.keys(input) },
        });
        return row;
      });
      return this.serializeWithChildren(updated);
    }

    const { content, metadata } = splitKnowledgeUpdate(existing, existingClaims, input);
    const updated = await withTransaction(async (tx) => {
      const row = Object.keys(metadata).length > 0
        ? await this.applyContentAndMetadata(tx, auth, existing, existingClaims, metadata, { version: existing.version })
        : existing;

      if (hasContentChanges(content)) {
        const [pending] = await tx
          .select()
          .from(knowledgeSourceRevisions)
          .where(and(eq(knowledgeSourceRevisions.sourceId, id), eq(knowledgeSourceRevisions.status, "PENDING")));
        const changes: KnowledgeRevisionChanges = { ...(pending?.changes ?? {}), ...stripVersion(content) };
        if (pending) {
          await tx
            .update(knowledgeSourceRevisions)
            .set({ changes, createdBy: auth.userId, updatedAt: new Date() })
            .where(eq(knowledgeSourceRevisions.id, pending.id));
        } else {
          await tx.insert(knowledgeSourceRevisions).values({
            organizationId: auth.organizationId,
            sourceId: id,
            baseVersion: existing.version,
            changes,
            createdBy: auth.userId,
          });
        }
        await this.recordSourceEvent(tx, auth, row, "REVISION_PROPOSED", `Proposed a revision to ${row.name}`, {
          metadata: { changedFields: Object.keys(content) },
        });
      } else if (Object.keys(metadata).length > 0) {
        await this.recordSourceEvent(tx, auth, row, "UPDATED", `Updated knowledge source ${row.name}`, {
          previousValue: serializeKnowledgeSource(existing),
          newValue: serializeKnowledgeSource(row),
          metadata: { changedFields: Object.keys(metadata) },
        });
      }
      return row;
    });
    return this.serializeWithChildren(updated);
  }

  async approve(auth: AuthContext, id: string) {
    const existing = await this.requireKnowledgeSource(auth.organizationId, id);
    if (existing.lifecycleStatus === "ARCHIVED") {
      throw new ConflictException("Archived knowledge sources cannot be approved.");
    }
    const approved = await withTransaction(async (tx) => {
      const [row] = await tx
        .update(knowledgeSources)
        .set({
          lifecycleStatus: "ACTIVE",
          metadata: {
            ...(existing.metadata ?? {}),
            lifecycleStatus: "ACTIVE",
            approvedAt: new Date().toISOString(),
            approvedBy: auth.userId,
          },
          lastVerified: todayIso(),
          lastUpdated: todayIso(),
          updatedAt: new Date(),
        })
        .where(and(eq(knowledgeSources.organizationId, auth.organizationId), eq(knowledgeSources.id, id)))
        .returning();
      if (!row) throw new NotFoundException("Knowledge source not found.");
      await this.insertVersion(tx, row, auth.userId, "Approved knowledge source.");
      await this.recordSourceEvent(tx, auth, row, "APPROVED", `Approved knowledge source ${row.name}`, {
        previousValue: serializeKnowledgeSource(existing),
        newValue: serializeKnowledgeSource(row),
      });
      return row;
    });
    await this.queueConflictCheck(auth.organizationId, id, []);
    return this.serializeWithChildren(approved);
  }

  async archive(auth: AuthContext, id: string) {
    const existing = await this.requireKnowledgeSource(auth.organizationId, id);
    if (existing.lifecycleStatus === "ARCHIVED") return this.serializeWithChildren(existing);
    const archived = await withTransaction(async (tx) => {
      const [row] = await tx
        .update(knowledgeSources)
        .set({
          lifecycleStatus: "ARCHIVED",
          metadata: { ...(existing.metadata ?? {}), lifecycleStatus: "ARCHIVED", archivedAt: new Date().toISOString() },
          lastUpdated: todayIso(),
          updatedAt: new Date(),
        })
        .where(and(eq(knowledgeSources.organizationId, auth.organizationId), eq(knowledgeSources.id, id)))
        .returning();
      if (!row) throw new NotFoundException("Knowledge source not found.");
      // A pending revision of an archived source can never be applied.
      await tx
        .update(knowledgeSourceRevisions)
        .set({ status: "REJECTED", decidedBy: auth.userId, decidedAt: new Date(), note: "Source archived." })
        .where(and(eq(knowledgeSourceRevisions.sourceId, id), eq(knowledgeSourceRevisions.status, "PENDING")));
      await this.recordSourceEvent(tx, auth, row, "ARCHIVED", `Archived knowledge source ${row.name}`, {
        previousValue: serializeKnowledgeSource(existing),
        newValue: serializeKnowledgeSource(row),
      });
      return row;
    });
    return this.serializeWithChildren(archived);
  }

  async verify(auth: AuthContext, id: string, input: VerifyKnowledgeInput = {}) {
    const existing = await this.requireKnowledgeSource(auth.organizationId, id);
    if (existing.lifecycleStatus === "ARCHIVED") {
      throw new ConflictException("Archived knowledge sources cannot be verified.");
    }
    const verified = await withTransaction(async (tx) => {
      const [row] = await tx
        .update(knowledgeSources)
        .set({
          lifecycleStatus: "ACTIVE",
          lastVerified: todayIso(),
          lastUpdated: todayIso(),
          expiresAt: input.expiresAt === undefined ? existing.expiresAt : input.expiresAt,
          metadata: {
            ...(existing.metadata ?? {}),
            lifecycleStatus: "ACTIVE",
            verifiedAt: new Date().toISOString(),
            verifiedBy: auth.userId,
          },
          updatedAt: new Date(),
        })
        .where(and(eq(knowledgeSources.organizationId, auth.organizationId), eq(knowledgeSources.id, id)))
        .returning();
      if (!row) throw new NotFoundException("Knowledge source not found.");
      await this.insertVersion(tx, row, auth.userId, input.note ?? "Verified knowledge source.");
      await this.recordSourceEvent(tx, auth, row, "VERIFIED", input.note ?? `Verified knowledge source ${row.name}`, {
        previousValue: serializeKnowledgeSource(existing),
        newValue: serializeKnowledgeSource(row),
      });
      return row;
    });
    return this.serializeWithChildren(verified);
  }

  // ---------------------------------------------------------------------------
  // Revisions
  // ---------------------------------------------------------------------------

  async applyRevision(auth: AuthContext, sourceId: string, revisionId: string, input: RevisionDecisionInput = {}) {
    const existing = await this.requireKnowledgeSource(auth.organizationId, sourceId);
    const revision = await this.requirePendingRevision(auth.organizationId, sourceId, revisionId);
    if (existing.lifecycleStatus === "ARCHIVED") throw new ConflictException("Archived knowledge sources cannot be revised.");
    const existingClaims = await this.db.select().from(knowledgeClaims).where(eq(knowledgeClaims.sourceId, sourceId));

    const applied = await withTransaction(async (tx) => {
      const row = await this.applyContentAndMetadata(tx, auth, existing, existingClaims, revision.changes, {
        version: bumpVersion(existing.version),
        verified: true,
      });
      await tx
        .update(knowledgeSourceRevisions)
        .set({ status: "APPLIED", decidedBy: auth.userId, decidedAt: new Date(), note: input.note ?? null, updatedAt: new Date() })
        .where(eq(knowledgeSourceRevisions.id, revision.id));
      await this.insertVersion(tx, row, auth.userId, input.note ?? "Applied reviewed revision.");
      await this.recordSourceEvent(tx, auth, row, "REVISION_APPLIED", `Applied a revision to ${row.name}`, {
        previousValue: serializeKnowledgeSource(existing),
        newValue: serializeKnowledgeSource(row),
        metadata: { revisionId: revision.id, changedFields: Object.keys(revision.changes) },
      });
      return row;
    });
    await this.queueConflictCheck(auth.organizationId, sourceId, []);
    return this.serializeWithChildren(applied);
  }

  async rejectRevision(auth: AuthContext, sourceId: string, revisionId: string, input: RevisionDecisionInput = {}) {
    const existing = await this.requireKnowledgeSource(auth.organizationId, sourceId);
    const revision = await this.requirePendingRevision(auth.organizationId, sourceId, revisionId);
    await withTransaction(async (tx) => {
      await tx
        .update(knowledgeSourceRevisions)
        .set({ status: "REJECTED", decidedBy: auth.userId, decidedAt: new Date(), note: input.note ?? null, updatedAt: new Date() })
        .where(eq(knowledgeSourceRevisions.id, revision.id));
      await this.recordSourceEvent(tx, auth, existing, "REVISION_REJECTED", input.note ?? `Rejected a revision to ${existing.name}`, {
        metadata: { revisionId: revision.id },
      });
    });
    return this.serializeWithChildren(existing);
  }

  // ---------------------------------------------------------------------------
  // Suggested claims (AI extraction output)
  // ---------------------------------------------------------------------------

  /**
   * Accepting a suggested claim makes it ACTIVE — i.e. citable by tenders —
   * so it is gated like approval. Rejected suggestions are kept (REJECTED)
   * so the extractor's dedupe does not propose them again.
   */
  async decideClaims(auth: AuthContext, sourceId: string, input: BulkClaimDecisionInput) {
    const source = await this.requireKnowledgeSource(auth.organizationId, sourceId);
    if (source.lifecycleStatus === "ARCHIVED") throw new ConflictException("Archived knowledge sources cannot be changed.");
    const target = input.decision === "accept" ? "ACTIVE" : "REJECTED";
    const changed = await withTransaction(async (tx) => {
      const rows = await tx
        .update(knowledgeClaims)
        .set({ status: target, updatedAt: new Date() })
        .where(
          and(
            eq(knowledgeClaims.sourceId, sourceId),
            inArray(knowledgeClaims.id, input.claimIds),
            eq(knowledgeClaims.status, "SUGGESTED"),
          ),
        )
        .returning({ id: knowledgeClaims.id });
      if (rows.length === 0) throw new NotFoundException("No suggested claims matched.");
      if (target === "ACTIVE" && source.lifecycleStatus === "ACTIVE") {
        await tx
          .update(knowledgeSources)
          .set({ version: bumpVersion(source.version), lastUpdated: todayIso(), updatedAt: new Date() })
          .where(eq(knowledgeSources.id, sourceId));
      }
      await this.recordSourceEvent(
        tx,
        auth,
        source,
        "CLAIMS_REVIEWED",
        `${input.decision === "accept" ? "Accepted" : "Rejected"} ${rows.length} suggested claim${rows.length === 1 ? "" : "s"} on ${source.name}`,
        { metadata: { decision: input.decision, claimIds: rows.map((row) => row.id) } },
      );
      return rows.map((row) => row.id);
    });
    if (target === "ACTIVE") await this.queueConflictCheck(auth.organizationId, sourceId, changed);
    const refreshed = await this.requireKnowledgeSource(auth.organizationId, sourceId);
    return this.serializeWithChildren(refreshed);
  }

  // ---------------------------------------------------------------------------
  // Issues
  // ---------------------------------------------------------------------------

  /**
   * Only sources that can raise an issue are loaded (drafts, sources with a
   * pending revision, and active sources that are unverified, stale or near
   * expiry) — the healthy majority of the library is never read.
   */
  async listIssues(auth: AuthContext, filters: ListKnowledgeIssuesInput) {
    const wantsLifecycle = filters.status !== "RESOLVED" && filters.type !== "CONFLICT";
    const [candidates, pending] = wantsLifecycle
      ? await Promise.all([
          this.db
            .select()
            .from(knowledgeSources)
            .where(
              and(
                eq(knowledgeSources.organizationId, auth.organizationId),
                or(
                  eq(knowledgeSources.lifecycleStatus, "DRAFT"),
                  this.attentionWhere(),
                  sql`exists (select 1 from ${knowledgeSourceRevisions} r where r.source_id = ${knowledgeSources.id} and r.status = 'PENDING')`,
                ),
                filters.search ? ilike(knowledgeSources.name, `%${filters.search}%`) : undefined,
              ),
            )
            .orderBy(desc(knowledgeSources.updatedAt))
            .limit(1_000),
          this.db
            .select()
            .from(knowledgeSourceRevisions)
            .where(and(eq(knowledgeSourceRevisions.organizationId, auth.organizationId), eq(knowledgeSourceRevisions.status, "PENDING"))),
        ])
      : [[], []];
    const pendingBySource = new Map(pending.map((revision) => [revision.sourceId, revision]));

    const lifecycleIssues = candidates
      .flatMap((row) => {
        const revision = pendingBySource.get(row.id);
        return lifecycleIssuesForSource(serializeKnowledgeSource(row), {
          pendingRevisionId: revision?.id ?? null,
          pendingRevisionAt: revision?.updatedAt ?? null,
        });
      })
      .filter((issue) => !filters.type || issue.type === filters.type);

    const conflictIssues = filters.type && filters.type !== "CONFLICT"
      ? []
      : await this.conflictIssues(auth.organizationId, filters.status, filters.search);
    const all = [...lifecycleIssues, ...conflictIssues].filter((issue) =>
      filters.status === "ALL" ? true : issue.status === filters.status,
    );
    const counts = { total: 0, draft: 0, revision: 0, unverified: 0, stale: 0, expired: 0, expiring_soon: 0, conflict: 0 };
    for (const issue of all) {
      counts.total += 1;
      counts[issue.type.toLowerCase() as Exclude<keyof typeof counts, "total">] += 1;
    }
    const page = filters.page;
    const pageSize = filters.pageSize;
    return {
      items: all.slice((page - 1) * pageSize, page * pageSize),
      total: all.length,
      page,
      pageSize,
      counts,
    };
  }

  async resolveIssue(auth: AuthContext, issueId: string, input: ResolveKnowledgeIssueInput) {
    const parsed = parseIssueId(issueId);
    if (!parsed) throw new BadRequestException("Unknown knowledge issue id.");
    if (parsed.kind === "source") {
      if (input.action === "approve") return this.approve(auth, parsed.id);
      if (input.action === "verify") return this.verify(auth, parsed.id, { note: input.note });
      if (input.action === "archive") return this.archive(auth, parsed.id);
      throw new BadRequestException("Unsupported action for source issue.");
    }
    if (parsed.kind === "revision") {
      const [revision] = await this.db
        .select()
        .from(knowledgeSourceRevisions)
        .where(and(eq(knowledgeSourceRevisions.organizationId, auth.organizationId), eq(knowledgeSourceRevisions.id, parsed.id)));
      if (!revision) throw new NotFoundException("Knowledge revision not found.");
      if (input.action === "apply_revision") return this.applyRevision(auth, revision.sourceId, revision.id, { note: input.note });
      if (input.action === "reject_revision") return this.rejectRevision(auth, revision.sourceId, revision.id, { note: input.note });
      throw new BadRequestException("Unsupported action for revision issue.");
    }
    if (input.action === "resolve_conflict") return this.resolveConflict(auth, parsed.id, input.note);
    throw new BadRequestException("Unsupported action for conflict issue.");
  }

  async resolveConflict(auth: AuthContext, conflictId: string, note?: string) {
    const conflict = await this.requireConflict(auth.organizationId, conflictId);
    if (conflict.status === "RESOLVED") return serializeConflict(conflict, []);
    const resolved = await withTransaction(async (tx) => {
      const [row] = await tx
        .update(knowledgeConflicts)
        .set({ status: "RESOLVED", resolvedAt: new Date(), resolvedBy: auth.userId, resolutionNote: note ?? conflict.action })
        .where(eq(knowledgeConflicts.id, conflictId))
        .returning();
      if (!row) throw new NotFoundException("Knowledge conflict not found.");
      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: null,
          actorId: auth.userId,
          action: KNOWLEDGE_AUDIT_ACTIONS.CONFLICT_RESOLVED,
          entityType: "knowledge_conflict",
          entityId: row.id,
          previousValue: serializeConflict(conflict, []),
          newValue: serializeConflict(row, []),
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: null,
          actorId: auth.userId,
          label: `Resolved knowledge conflict ${row.topic}`,
          action: KNOWLEDGE_ACTIVITY_ACTIONS.CONFLICT_RESOLVED,
          entityType: "knowledge_conflict",
          entityId: row.id,
          summary: note ?? row.action,
        },
        tx,
      );
      return row;
    });
    const variants = await this.db.select().from(knowledgeConflictVariants).where(eq(knowledgeConflictVariants.conflictId, resolved.id));
    return serializeConflict(resolved, variants);
  }

  // ---------------------------------------------------------------------------
  // Templates
  // ---------------------------------------------------------------------------

  async listTemplates(auth: AuthContext, filters: ListResponseTemplatesInput) {
    const page = filters.page;
    const pageSize = filters.pageSize;
    const where = and(
      eq(responseTemplates.organizationId, auth.organizationId),
      filters.status !== "ALL" ? eq(responseTemplates.status, filters.status) : undefined,
      filters.category ? eq(responseTemplates.category, filters.category) : undefined,
      filters.ownerId ? eq(responseTemplates.ownerId, filters.ownerId) : undefined,
      filters.search
        ? or(
            ilike(responseTemplates.name, `%${filters.search}%`),
            ilike(responseTemplates.description, `%${filters.search}%`),
            ilike(sql<string>`${responseTemplates.category}::text`, `%${filters.search}%`),
          )
        : undefined,
    );
    const [totalRow] = await this.db.select({ value: sql<number>`count(*)` }).from(responseTemplates).where(where);
    const rows = await this.db
      .select()
      .from(responseTemplates)
      .where(where)
      .orderBy(desc(responseTemplates.updatedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return { items: rows.map(serializeTemplate), total: Number(totalRow?.value ?? 0), page, pageSize };
  }

  async getTemplate(auth: AuthContext, id: string) {
    return serializeTemplate(await this.requireTemplate(auth.organizationId, id));
  }

  async createTemplate(auth: AuthContext, input: CreateResponseTemplateInput) {
    await this.requireActiveMember(auth.organizationId, input.ownerId ?? auth.userId);
    const row = await withTransaction(async (tx) => {
      const [created] = await tx
        .insert(responseTemplates)
        .values({
          organizationId: auth.organizationId,
          name: input.name,
          category: input.category,
          ownerId: input.ownerId ?? auth.userId,
          description: input.description ?? "",
          sections: input.sections,
          variables: input.variables ?? [],
          version: input.version ?? "1.0",
          usageMetadata: input.usageMetadata ?? {},
        })
        .returning();
      if (!created) throw new BadRequestException("Could not create response template.");
      await this.recordTemplateEvent(tx, auth, created, KNOWLEDGE_AUDIT_ACTIONS.TEMPLATE_CREATED, KNOWLEDGE_ACTIVITY_ACTIONS.TEMPLATE_CREATED);
      return created;
    });
    return serializeTemplate(row);
  }

  async updateTemplate(auth: AuthContext, id: string, input: UpdateResponseTemplateInput) {
    const existing = await this.requireTemplate(auth.organizationId, id);
    if (existing.status === "ARCHIVED") throw new ConflictException("Archived templates cannot be updated.");
    if (input.ownerId) await this.requireActiveMember(auth.organizationId, input.ownerId);
    const contentChanged =
      (input.sections !== undefined && JSON.stringify(input.sections) !== JSON.stringify(existing.sections)) ||
      (input.variables !== undefined && JSON.stringify(input.variables) !== JSON.stringify(existing.variables));
    const row = await withTransaction(async (tx) => {
      const [updated] = await tx
        .update(responseTemplates)
        .set({
          name: input.name ?? existing.name,
          category: input.category ?? existing.category,
          ownerId: input.ownerId ?? existing.ownerId,
          description: input.description ?? existing.description,
          sections: input.sections ?? existing.sections,
          variables: input.variables ?? existing.variables,
          version: input.version ?? (contentChanged ? bumpVersion(existing.version) : existing.version),
          usageMetadata: input.usageMetadata ?? existing.usageMetadata,
          // Only a change to what the template says needs re-approval.
          status: existing.status === "ACTIVE" && contentChanged ? "DRAFT" : existing.status,
          updatedAt: new Date(),
        })
        .where(and(eq(responseTemplates.organizationId, auth.organizationId), eq(responseTemplates.id, id)))
        .returning();
      if (!updated) throw new NotFoundException("Response template not found.");
      await this.recordTemplateEvent(tx, auth, updated, KNOWLEDGE_AUDIT_ACTIONS.TEMPLATE_UPDATED, KNOWLEDGE_ACTIVITY_ACTIONS.TEMPLATE_UPDATED, existing);
      return updated;
    });
    return serializeTemplate(row);
  }

  async approveTemplate(auth: AuthContext, id: string) {
    const existing = await this.requireTemplate(auth.organizationId, id);
    if (existing.status === "ARCHIVED") throw new ConflictException("Archived templates cannot be approved.");
    const row = await withTransaction(async (tx) => {
      const [updated] = await tx
        .update(responseTemplates)
        .set({ status: "ACTIVE", updatedAt: new Date() })
        .where(and(eq(responseTemplates.organizationId, auth.organizationId), eq(responseTemplates.id, id)))
        .returning();
      if (!updated) throw new NotFoundException("Response template not found.");
      await this.recordTemplateEvent(tx, auth, updated, KNOWLEDGE_AUDIT_ACTIONS.TEMPLATE_APPROVED, KNOWLEDGE_ACTIVITY_ACTIONS.TEMPLATE_APPROVED, existing);
      return updated;
    });
    return serializeTemplate(row);
  }

  async archiveTemplate(auth: AuthContext, id: string) {
    const existing = await this.requireTemplate(auth.organizationId, id);
    if (existing.status === "ARCHIVED") return serializeTemplate(existing);
    const row = await withTransaction(async (tx) => {
      const [updated] = await tx
        .update(responseTemplates)
        .set({ status: "ARCHIVED", archivedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(responseTemplates.organizationId, auth.organizationId), eq(responseTemplates.id, id)))
        .returning();
      if (!updated) throw new NotFoundException("Response template not found.");
      await this.recordTemplateEvent(tx, auth, updated, KNOWLEDGE_AUDIT_ACTIONS.TEMPLATE_ARCHIVED, KNOWLEDGE_ACTIVITY_ACTIONS.TEMPLATE_ARCHIVED, existing);
      return updated;
    });
    return serializeTemplate(row);
  }

  async duplicateTemplate(auth: AuthContext, id: string) {
    const existing = await this.requireTemplate(auth.organizationId, id);
    const row = await withTransaction(async (tx) => {
      const [created] = await tx
        .insert(responseTemplates)
        .values({
          organizationId: auth.organizationId,
          name: `${existing.name} copy`,
          category: existing.category,
          ownerId: auth.userId,
          description: existing.description,
          sections: existing.sections,
          variables: existing.variables,
          version: "1.0",
          usageMetadata: { duplicatedFrom: existing.id },
        })
        .returning();
      if (!created) throw new BadRequestException("Could not duplicate response template.");
      await this.recordTemplateEvent(tx, auth, created, KNOWLEDGE_AUDIT_ACTIONS.TEMPLATE_DUPLICATED, KNOWLEDGE_ACTIVITY_ACTIONS.TEMPLATE_DUPLICATED, existing);
      return created;
    });
    return serializeTemplate(row);
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * Writes source fields and claims. Claims are upserted — existing ids are
   * updated in place and removed claims soft-deleted — because tender answers
   * cite claim ids and a delete-and-reinsert would orphan every citation.
   */
  private async applyContentAndMetadata(
    tx: Transaction,
    auth: AuthContext,
    existing: KnowledgeRow,
    existingClaims: ClaimRow[],
    input: Partial<UpdateKnowledgeInput> & KnowledgeRevisionChanges,
    options: { version: string; verified?: boolean },
  ): Promise<KnowledgeRow> {
    const [row] = await tx
      .update(knowledgeSources)
      .set({
        name: input.name ?? existing.name,
        type: input.type ?? existing.type,
        category: (input.category ?? existing.category) as never,
        version: options.version,
        authority: input.authority ?? existing.authority,
        ownerId: input.ownerId ?? existing.ownerId,
        lastVerified: options.verified ? todayIso() : (input.lastVerified ?? existing.lastVerified),
        lastUpdated: todayIso(),
        expiresAt: input.expiresAt === undefined ? existing.expiresAt : input.expiresAt,
        summary: input.summary ?? existing.summary,
        metadata: {
          ...(existing.metadata ?? {}),
          ...(input.metadata ?? {}),
          lifecycleStatus: existing.lifecycleStatus,
          ...(options.version !== existing.version ? { previousVersion: existing.version } : {}),
          ...(input.sourceKind ? { sourceKind: input.sourceKind, source: input.sourceKind } : {}),
        },
        updatedAt: new Date(),
      })
      .where(and(eq(knowledgeSources.organizationId, auth.organizationId), eq(knowledgeSources.id, existing.id)))
      .returning();
    if (!row) throw new NotFoundException("Knowledge source not found.");

    if (input.claims) {
      const plan = planClaimChanges(existingClaims, input.claims);
      for (const update of plan.updates) {
        await tx
          .update(knowledgeClaims)
          .set({
            label: update.label,
            value: update.value,
            confidence: stringifyConfidence(update.confidence),
            // The label may have changed; conflict detection re-embeds it lazily.
            labelEmbedding: null,
            labelEmbeddingModel: null,
            updatedAt: new Date(),
          })
          .where(eq(knowledgeClaims.id, update.id));
      }
      if (plan.inserts.length > 0) {
        await tx.insert(knowledgeClaims).values(
          plan.inserts.map((claim) => ({
            sourceId: row.id,
            label: claim.label,
            value: claim.value,
            confidence: stringifyConfidence(claim.confidence),
          })),
        );
      }
      if (plan.rejectIds.length > 0) {
        await tx
          .update(knowledgeClaims)
          .set({ status: "REJECTED", updatedAt: new Date() })
          .where(inArray(knowledgeClaims.id, plan.rejectIds));
      }
    }
    return row;
  }

  private async insertVersion(tx: Transaction, row: KnowledgeRow, actorId: string, note: string) {
    const claims = await tx.select().from(knowledgeClaims).where(eq(knowledgeClaims.sourceId, row.id));
    await tx.insert(knowledgeVersions).values({
      sourceId: row.id,
      version: row.version,
      date: todayIso(),
      note,
      snapshot: buildKnowledgeSnapshot(row, claims),
      createdBy: actorId,
    });
  }

  private async queueConflictCheck(organizationId: string, sourceId: string, claimIds: string[]) {
    try {
      await this.jobs.enqueueKnowledgeConflictCheck({ organizationId, sourceId, claimIds });
    } catch (error) {
      // Conflict detection is advisory; failing to queue it must not fail the approval.
      this.logger.warn(`failed to queue knowledge conflict check for ${sourceId}: ${(error as Error).message}`, "KnowledgeService");
    }
  }

  private async serializeWithChildren(row: KnowledgeRow) {
    const [claims, versions, conflicts, revisions, documents, usage] = await Promise.all([
      this.db
        .select()
        .from(knowledgeClaims)
        .where(and(eq(knowledgeClaims.sourceId, row.id), inArray(knowledgeClaims.status, ["ACTIVE", "SUGGESTED"])))
        .orderBy(asc(knowledgeClaims.createdAt)),
      this.db.select().from(knowledgeVersions).where(eq(knowledgeVersions.sourceId, row.id)).orderBy(desc(knowledgeVersions.createdAt)),
      this.db.select().from(knowledgeConflicts).where(eq(knowledgeConflicts.sourceId, row.id)),
      this.db
        .select()
        .from(knowledgeSourceRevisions)
        .where(and(eq(knowledgeSourceRevisions.sourceId, row.id), eq(knowledgeSourceRevisions.status, "PENDING"))),
      this.db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.sourceId, row.id)).orderBy(desc(knowledgeDocuments.createdAt)),
      this.usageFor(row.organizationId, row.id),
    ]);
    const conflictIds = conflicts.map((conflict) => conflict.id);
    const variants = conflictIds.length > 0
      ? await this.db.select().from(knowledgeConflictVariants).where(inArray(knowledgeConflictVariants.conflictId, conflictIds))
      : [];
    return {
      ...serializeKnowledgeSource(row),
      claims: claims.filter((claim) => claim.status === "ACTIVE").map(serializeClaim),
      suggestedClaims: claims.filter((claim) => claim.status === "SUGGESTED").map(serializeClaim),
      versions: versions.map((version) => ({
        id: version.id,
        version: version.version,
        date: version.date,
        note: version.note,
        snapshot: version.snapshot,
        createdBy: version.createdBy,
        createdAt: version.createdAt,
      })),
      conflicts: conflicts.map((conflict) =>
        serializeConflict(conflict, variants.filter((variant) => variant.conflictId === conflict.id)),
      ),
      pendingRevision: revisions[0] ? serializeRevision(revisions[0]) : null,
      documents: documents.map(serializeKnowledgeDocument),
      usage,
    };
  }

  private async usageFor(organizationId: string, sourceId: string) {
    const rows = await this.db
      .select({
        tenderId: tenderAnswerEvidence.tenderId,
        tenderName: tenders.name,
        citations: sql<number>`count(*)`,
        lastCitedAt: sql<Date>`max(${tenderAnswerEvidence.createdAt})`,
        flagged: sql<number>`count(*) filter (where ${tenderAnswerEvidence.citationStatus} <> 'current')`,
      })
      .from(tenderAnswerEvidence)
      .innerJoin(tenders, eq(tenderAnswerEvidence.tenderId, tenders.id))
      .where(and(eq(tenderAnswerEvidence.organizationId, organizationId), eq(tenderAnswerEvidence.sourceId, sourceId)))
      .groupBy(tenderAnswerEvidence.tenderId, tenders.name)
      .orderBy(desc(sql`max(${tenderAnswerEvidence.createdAt})`))
      .limit(20);
    return {
      tenders: rows.map((usage) => ({
        tenderId: usage.tenderId,
        tenderName: usage.tenderName,
        citations: Number(usage.citations),
        flaggedCitations: Number(usage.flagged),
        lastCitedAt: usage.lastCitedAt,
      })),
      totalCitations: rows.reduce((sum, usage) => sum + Number(usage.citations), 0),
    };
  }

  private async requireKnowledgeSource(organizationId: string, id: string) {
    if (!isUuid(id)) throw new NotFoundException("Knowledge source not found.");
    const [row] = await this.db
      .select()
      .from(knowledgeSources)
      .where(and(eq(knowledgeSources.organizationId, organizationId), eq(knowledgeSources.id, id)));
    if (!row) throw new NotFoundException("Knowledge source not found.");
    return row;
  }

  private async requirePendingRevision(organizationId: string, sourceId: string, revisionId: string): Promise<RevisionRow> {
    if (!isUuid(revisionId)) throw new NotFoundException("Knowledge revision not found.");
    const [revision] = await this.db
      .select()
      .from(knowledgeSourceRevisions)
      .where(
        and(
          eq(knowledgeSourceRevisions.organizationId, organizationId),
          eq(knowledgeSourceRevisions.sourceId, sourceId),
          eq(knowledgeSourceRevisions.id, revisionId),
        ),
      );
    if (!revision) throw new NotFoundException("Knowledge revision not found.");
    if (revision.status !== "PENDING") throw new ConflictException("This revision has already been decided.");
    return revision;
  }

  private async requireActiveMember(organizationId: string, userId: string) {
    const [row] = await this.db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.status, "active"),
        ),
      );
    if (!row) throw new BadRequestException("Knowledge owner must belong to the organization.");
    return row;
  }

  /** ACTIVE sources the shared freshness rule says need attention, as SQL. */
  private attentionWhere(): SQL {
    return and(
      eq(knowledgeSources.lifecycleStatus, "ACTIVE"),
      or(
        isNull(knowledgeSources.lastVerified),
        lt(knowledgeSources.lastVerified, knowledgeStaleCutoffIso()),
        and(isNotNull(knowledgeSources.expiresAt), sql`${knowledgeSources.expiresAt} <= ${knowledgeExpiringCutoffIso()}`),
      ),
    ) as SQL;
  }

  private knowledgeWhere(organizationId: string, filters: Partial<ListKnowledgeInput>) {
    const today = todayIso();
    const expiringCutoff = knowledgeExpiringCutoffIso();
    const staleCutoff = knowledgeStaleCutoffIso();
    const active = eq(knowledgeSources.lifecycleStatus, "ACTIVE");
    const notExpired = or(isNull(knowledgeSources.expiresAt), sql`${knowledgeSources.expiresAt} >= ${today}`);
    return and(
      eq(knowledgeSources.organizationId, organizationId),
      filters.status ? eq(knowledgeSources.lifecycleStatus, filters.status) : undefined,
      filters.category ? eq(knowledgeSources.category, filters.category) : undefined,
      filters.type ? ilike(knowledgeSources.type, `%${filters.type}%`) : undefined,
      filters.authority ? eq(knowledgeSources.authority, filters.authority) : undefined,
      filters.ownerId ? eq(knowledgeSources.ownerId, filters.ownerId) : undefined,
      filters.sourceKind ? sql`${knowledgeSources.metadata} ->> 'sourceKind' = ${filters.sourceKind}` : undefined,
      filters.expires === "expired" ? sql`${knowledgeSources.expiresAt} < ${today}` : undefined,
      filters.expires === "expiring" ? sql`${knowledgeSources.expiresAt} >= ${today} and ${knowledgeSources.expiresAt} <= ${expiringCutoff}` : undefined,
      filters.expires === "active" ? or(isNull(knowledgeSources.expiresAt), sql`${knowledgeSources.expiresAt} > ${expiringCutoff}`) : undefined,
      filters.reviewState === "draft" ? eq(knowledgeSources.lifecycleStatus, "DRAFT") : undefined,
      filters.reviewState === "unverified" ? and(active, notExpired, isNull(knowledgeSources.lastVerified)) : undefined,
      filters.reviewState === "stale" ? and(active, notExpired, lt(knowledgeSources.lastVerified, staleCutoff)) : undefined,
      filters.reviewState === "expired" ? and(active, sql`${knowledgeSources.expiresAt} < ${today}`) : undefined,
      filters.reviewState === "expiring"
        ? and(active, sql`${knowledgeSources.expiresAt} >= ${today} and ${knowledgeSources.expiresAt} <= ${expiringCutoff}`)
        : undefined,
      filters.reviewState === "healthy"
        ? and(
            active,
            isNotNull(knowledgeSources.lastVerified),
            sql`${knowledgeSources.lastVerified} >= ${staleCutoff}`,
            or(isNull(knowledgeSources.expiresAt), sql`${knowledgeSources.expiresAt} > ${expiringCutoff}`),
          )
        : undefined,
      filters.search
        ? or(
            ilike(knowledgeSources.name, `%${filters.search}%`),
            ilike(knowledgeSources.type, `%${filters.search}%`),
            ilike(knowledgeSources.summary, `%${filters.search}%`),
            ilike(sql<string>`${knowledgeSources.category}::text`, `%${filters.search}%`),
            ilike(knowledgeSources.version, `%${filters.search}%`),
          )
        : undefined,
    );
  }

  private async conflictIssues(organizationId: string, status: "OPEN" | "RESOLVED" | "ALL", search?: string) {
    const rows = await this.db
      .select({ conflict: knowledgeConflicts, source: knowledgeSources })
      .from(knowledgeConflicts)
      .innerJoin(knowledgeSources, eq(knowledgeConflicts.sourceId, knowledgeSources.id))
      .where(
        and(
          eq(knowledgeSources.organizationId, organizationId),
          status !== "ALL" ? eq(knowledgeConflicts.status, status) : undefined,
          search
            ? or(
                ilike(knowledgeConflicts.topic, `%${search}%`),
                ilike(knowledgeConflicts.recommended, `%${search}%`),
                ilike(knowledgeSources.name, `%${search}%`),
              )
            : undefined,
        ),
      )
      .orderBy(desc(knowledgeConflicts.createdAt))
      .limit(500);
    const variants = rows.length > 0
      ? await this.db
          .select()
          .from(knowledgeConflictVariants)
          .where(inArray(knowledgeConflictVariants.conflictId, rows.map((row) => row.conflict.id)))
      : [];
    return rows.map(({ conflict, source }) => ({
      id: `conflict:${conflict.id}`,
      type: "CONFLICT" as const,
      status: conflict.status === "RESOLVED" ? ("RESOLVED" as const) : ("OPEN" as const),
      title: `Conflict: ${conflict.topic}`,
      detail: conflict.recommended,
      recommendedAction: conflict.action,
      source: serializeKnowledgeSource(source),
      conflict: serializeConflict(conflict, variants.filter((variant) => variant.conflictId === conflict.id)),
      createdAt: conflict.createdAt,
    }));
  }

  private async requireConflict(organizationId: string, conflictId: string) {
    const [row] = await this.db
      .select({ conflict: knowledgeConflicts })
      .from(knowledgeConflicts)
      .innerJoin(knowledgeSources, eq(knowledgeConflicts.sourceId, knowledgeSources.id))
      .where(and(eq(knowledgeSources.organizationId, organizationId), eq(knowledgeConflicts.id, conflictId)));
    if (!row) throw new NotFoundException("Knowledge conflict not found.");
    return row.conflict;
  }

  private async requireTemplate(organizationId: string, id: string) {
    if (!isUuid(id)) throw new NotFoundException("Response template not found.");
    const [row] = await this.db
      .select()
      .from(responseTemplates)
      .where(and(eq(responseTemplates.organizationId, organizationId), eq(responseTemplates.id, id)));
    if (!row) throw new NotFoundException("Response template not found.");
    return row;
  }

  private async recordSourceEvent(
    tx: Transaction,
    auth: AuthContext,
    row: KnowledgeRow,
    action: keyof typeof KNOWLEDGE_ACTIVITY_ACTIONS & keyof typeof KNOWLEDGE_AUDIT_ACTIONS,
    summary: string,
    extra: { previousValue?: unknown; newValue?: unknown; metadata?: Record<string, unknown> } = {},
  ) {
    await this.audit.record(
      {
        organizationId: auth.organizationId,
        workspaceId: null,
        actorId: auth.userId,
        actorType: "user",
        action: KNOWLEDGE_AUDIT_ACTIONS[action],
        entityType: "knowledge_source",
        entityId: row.id,
        ...(extra.previousValue !== undefined ? { previousValue: extra.previousValue } : {}),
        ...(extra.newValue !== undefined ? { newValue: extra.newValue } : {}),
        ...(extra.metadata ? { metadata: extra.metadata } : {}),
      } as Parameters<AuditService["record"]>[0],
      tx,
    );
    await this.activity.record(
      {
        organizationId: auth.organizationId,
        workspaceId: null,
        actorId: auth.userId,
        actorType: "user",
        label: summary,
        action: KNOWLEDGE_ACTIVITY_ACTIONS[action],
        entityType: "knowledge_source",
        entityId: row.id,
        summary,
        ...(extra.metadata ? { metadata: extra.metadata } : {}),
      } as Parameters<ActivityService["record"]>[0],
      tx,
    );
  }

  private async recordTemplateEvent(
    tx: Executor,
    auth: AuthContext,
    template: ResponseTemplateRow,
    auditAction: string,
    activityAction: string,
    previous?: ResponseTemplateRow,
  ) {
    await this.audit.record(
      {
        organizationId: auth.organizationId,
        workspaceId: null,
        actorId: auth.userId,
        action: auditAction,
        entityType: "response_template",
        entityId: template.id,
        previousValue: previous ? serializeTemplate(previous) : undefined,
        newValue: serializeTemplate(template),
      },
      tx as Transaction,
    );
    await this.activity.record(
      {
        organizationId: auth.organizationId,
        workspaceId: null,
        actorId: auth.userId,
        actorType: "user",
        label: `${activityAction.replace("knowledge.template.", "")} response template ${template.name}`,
        action: activityAction,
        entityType: "response_template",
        entityId: template.id,
        summary: `Response template ${template.name}`,
      },
      tx as Transaction,
    );
  }
}

function knowledgeOrder(sort: KnowledgeSort) {
  switch (sort) {
    case "updatedAt:asc":
      return [asc(knowledgeSources.updatedAt)];
    case "name:asc":
      return [asc(knowledgeSources.name)];
    case "lastVerified:asc":
      return [sql`${knowledgeSources.lastVerified} asc nulls first`, desc(knowledgeSources.updatedAt)];
    case "lastUsed:desc":
      return [sql`${knowledgeSources.lastUsedAt} desc nulls last`, desc(knowledgeSources.updatedAt)];
    case "usage:desc":
      return [desc(knowledgeSources.usageCount), desc(knowledgeSources.updatedAt)];
    case "updatedAt:desc":
    default:
      return [desc(knowledgeSources.updatedAt)];
  }
}

function stripVersion(content: Record<string, unknown>): KnowledgeRevisionChanges {
  const { version: _version, ...rest } = content;
  return rest as KnowledgeRevisionChanges;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function serializeRevision(row: RevisionRow) {
  return {
    id: row.id,
    status: row.status,
    baseVersion: row.baseVersion,
    changes: row.changes,
    note: row.note,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function serializeKnowledgeDocument(row: typeof knowledgeDocuments.$inferSelect) {
  return {
    id: row.id,
    sourceId: row.sourceId,
    fileId: row.fileId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    version: row.version,
    status: row.status,
    failureReason: row.failureReason,
    pageCount: row.pageCount,
    chunkCount: row.chunkCount,
    processedAt: row.processedAt,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function serializeTemplate(row: ResponseTemplateRow) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    category: row.category,
    status: row.status,
    ownerId: row.ownerId,
    description: row.description,
    sections: row.sections,
    variables: row.variables,
    version: row.version,
    usageMetadata: row.usageMetadata,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function serializeConflict(row: ConflictRow, variants: Array<typeof knowledgeConflictVariants.$inferSelect>) {
  return {
    id: row.id,
    sourceId: row.sourceId,
    topic: row.topic,
    recommended: row.recommended,
    action: row.action,
    status: row.status,
    detectedBy: row.detectedBy,
    resolvedAt: row.resolvedAt,
    resolvedBy: row.resolvedBy,
    resolutionNote: row.resolutionNote,
    createdAt: row.createdAt,
    variants: variants.map((variant) => ({ id: variant.id, label: variant.label, value: variant.value })),
  };
}
