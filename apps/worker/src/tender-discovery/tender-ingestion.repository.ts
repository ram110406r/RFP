import {
  getDb,
  tenderNoticeDocuments,
  tenderIngestionAlerts,
  tenderNotices,
  tenderNoticeSources,
  tenderPortals,
  tenderSourceRecords,
  tenderSyncRuns,
  withTransaction,
} from "@rfp-os/db";
import { and, eq, inArray, sql } from "drizzle-orm";

import { canonicalNoticeKey, effectiveNoticeStatus, payloadHash, type ConnectorNotice } from "./connector";

export class TenderIngestionRepository {
  private readonly db = getDb();

  async portal(portalId: string) {
    const [portal] = await this.db
      .select()
      .from(tenderPortals)
      .where(eq(tenderPortals.id, portalId))
      .limit(1);
    return portal ?? null;
  }

  async beginRun(
    portalId: string,
    windowStartedAt: string,
    cursor?: string | null,
    mode: "HEAD" | "BACKFILL" | "FULL_REFRESH" | "RECONCILE" = "HEAD",
    scope: Record<string, unknown> = {},
  ) {
    const [run] = await this.db
      .insert(tenderSyncRuns)
      .values({
        portalId,
        cursor: cursor ?? null,
        windowStartedAt: new Date(windowStartedAt),
        mode,
        scope,
      })
      .returning();
    if (!run) throw new Error("Unable to create tender sync run.");
    await this.db
      .update(tenderPortals)
      .set({ lastAttemptAt: new Date(), updatedAt: new Date() })
      .where(eq(tenderPortals.id, portalId));
    return run;
  }

  async persistNotice(portalId: string, syncRunId: string, item: ConnectorNotice) {
    return withTransaction(async (tx) => {
      const hash = payloadHash(item.raw);
      const priorVersion = await tx.select({ id: tenderSourceRecords.id }).from(tenderSourceRecords).where(and(eq(tenderSourceRecords.portalId, portalId), eq(tenderSourceRecords.sourceNoticeKey, item.sourceNoticeKey), eq(tenderSourceRecords.payloadHash, hash))).limit(1);
      const [sourceRecord] = await tx
        .insert(tenderSourceRecords)
        .values({
          portalId,
          syncRunId,
          sourceNoticeKey: item.sourceNoticeKey,
          payloadHash: hash,
          rawPayload: item.raw,
          accepted: true,
          rejectionReason: null,
          sourceUpdatedAt: toDate(item.sourceUpdatedAt),
        })
        .onConflictDoUpdate({
          target: [
            tenderSourceRecords.portalId,
            tenderSourceRecords.sourceNoticeKey,
            tenderSourceRecords.payloadHash,
          ],
          set: { syncRunId, accepted: true, rejectionReason: null, lastSeenAt: new Date() },
        })
        .returning();
      if (!sourceRecord) throw new Error("Unable to persist tender source record.");

      const key = canonicalNoticeKey(item);
      const prior = await tx
        .select({ id: tenderNotices.id })
        .from(tenderNotices)
        .where(eq(tenderNotices.canonicalKey, key))
        .limit(1);
      const values = {
        canonicalKey: key,
        title: item.title,
        referenceNumber: item.referenceNumber ?? null,
        description: item.description ?? "",
        buyerName: item.buyerName ?? null,
        authorityType: item.authorityType ?? null,
        location: item.location ?? null,
        state: item.state ?? null,
        category: item.category ?? null,
        procurementType: item.procurementType ?? null,
        publishedAt: toDate(item.publishedAt),
        bidStartsAt: toDate(item.bidStartsAt),
        deadlineAt: toDate(item.deadlineAt),
        opensAt: toDate(item.opensAt),
        estimatedValue:
          item.estimatedValue === null || item.estimatedValue === undefined
            ? null
            : String(item.estimatedValue),
        currency: item.currency ?? "INR",
        emdAmount:
          item.emdAmount === null || item.emdAmount === undefined ? null : String(item.emdAmount),
        documentFee:
          item.documentFee === null || item.documentFee === undefined
            ? null
            : String(item.documentFee),
        status: effectiveNoticeStatus(item.status, item.deadlineAt),
        sourceUrl: item.sourceUrl,
        sourceUpdatedAt: toDate(item.sourceUpdatedAt),
        lastSeenAt: new Date(),
        missedSyncs: 0,
        staleAt: null,
        metadata: item.metadata ?? {},
        updatedAt: new Date(),
      };
      const [notice] = await tx
        .insert(tenderNotices)
        .values(values)
        .onConflictDoUpdate({
          target: tenderNotices.canonicalKey,
          set: values,
        })
        .returning();
      if (!notice) throw new Error("Unable to persist canonical tender notice.");

      await tx
        .insert(tenderNoticeSources)
        .values({
          noticeId: notice.id,
          portalId,
          sourceRecordId: sourceRecord.id,
          sourceNoticeKey: item.sourceNoticeKey,
          sourceUrl: item.sourceUrl,
          sourceStatus: item.status ?? "UNKNOWN",
          lastSeenRunId: syncRunId,
          isPrimary: notice.sourceUrl === item.sourceUrl,
          missedSyncs: 0,
          staleAt: null,
        })
        .onConflictDoUpdate({
          target: [tenderNoticeSources.portalId, tenderNoticeSources.sourceNoticeKey],
          set: {
            noticeId: notice.id,
            sourceRecordId: sourceRecord.id,
            sourceUrl: item.sourceUrl,
            sourceStatus: item.status ?? "UNKNOWN",
            lastSeenRunId: syncRunId,
            lastSeenAt: new Date(),
            missedSyncs: 0,
            staleAt: null,
          },
        });

      for (const document of item.documents ?? []) {
        await tx
          .insert(tenderNoticeDocuments)
          .values({
            noticeId: notice.id,
            portalId,
            sourceDocumentKey: document.key,
            name: document.name,
            url: document.url,
            mimeType: document.mimeType ?? null,
            access: document.access ?? "EXTERNAL",
            metadata: document.metadata ?? {},
          })
          .onConflictDoUpdate({
            target: [tenderNoticeDocuments.portalId, tenderNoticeDocuments.sourceDocumentKey],
            set: {
              noticeId: notice.id,
              name: document.name,
              url: document.url,
              mimeType: document.mimeType ?? null,
              access: document.access ?? "EXTERNAL",
              metadata: document.metadata ?? {},
              updatedAt: new Date(),
            },
          });
      }

      return { inserted: prior.length === 0, duplicate: prior.length > 0 && priorVersion.length > 0 };
    });
  }

  async rejectNotice(portalId: string, syncRunId: string, item: ConnectorNotice, reason: string) {
    const hash = payloadHash(item.raw);
    await this.db.insert(tenderSourceRecords).values({
      portalId,
      syncRunId,
      sourceNoticeKey: item.sourceNoticeKey,
      payloadHash: hash,
      rawPayload: item.raw,
      accepted: false,
      rejectionReason: reason.slice(0, 2_000),
      sourceUpdatedAt: toDate(item.sourceUpdatedAt),
    }).onConflictDoUpdate({
      target: [tenderSourceRecords.portalId, tenderSourceRecords.sourceNoticeKey, tenderSourceRecords.payloadHash],
      set: { syncRunId, accepted: false, rejectionReason: reason.slice(0, 2_000), lastSeenAt: new Date() },
    });
  }

  async completeRun(
    runId: string,
    portalId: string,
    counts: { discovered: number; parsed?: number; rejected?: number; duplicates?: number; inserted: number; updated: number; completeness?: Record<string, number> },
    cursor: string | null,
    options: {
      mode?: "HEAD" | "BACKFILL" | "FULL_REFRESH" | "RECONCILE";
      scope?: Record<string, unknown>;
      fullSnapshot?: boolean;
      syncState?: Record<string, unknown>;
      backfillComplete?: boolean;
    } = {},
  ) {
    const completedAt = new Date();
    const [priorPortal] = await this.db.select({ syncState: tenderPortals.syncState }).from(tenderPortals).where(eq(tenderPortals.id, portalId)).limit(1);
    await withTransaction(async (tx) => {
      await tx
        .update(tenderSyncRuns)
        .set({
          status: "SUCCEEDED",
          discoveredCount: counts.discovered,
          parsedCount: counts.parsed ?? counts.discovered,
          rejectedCount: counts.rejected ?? 0,
          duplicateCount: counts.duplicates ?? 0,
          insertedCount: counts.inserted,
          updatedCount: counts.updated,
          completeness: counts.completeness ?? {},
          cursor,
          mode: options.mode ?? "HEAD",
          scope: options.scope ?? {},
          fullSnapshot: options.fullSnapshot ?? false,
          completedAt,
        })
        .where(eq(tenderSyncRuns.id, runId));
      await tx
        .update(tenderPortals)
        .set({
          health: "HEALTHY",
          syncCursor: cursor,
          syncState: options.syncState ?? {},
          lastFullSyncAt: options.fullSnapshot ? completedAt : undefined,
          backfillCompletedAt: options.backfillComplete ? completedAt : undefined,
          consecutiveFailures: 0,
          lastSuccessAt: completedAt,
          lastError: null,
          updatedAt: completedAt,
        })
        .where(eq(tenderPortals.id, portalId));

      const priorCursor = typeof priorPortal?.syncState.gemBackfillCursor === "string" ? priorPortal.syncState.gemBackfillCursor : null;
      const nextCursor = typeof options.syncState?.gemBackfillCursor === "string" ? options.syncState.gemBackfillCursor : null;
      const priorStalls = Number(priorPortal?.syncState.gemCursorStallRuns ?? 0);
      const stalled = options.mode === "BACKFILL" && Boolean(nextCursor) && nextCursor === priorCursor;
      const stallRuns = stalled ? priorStalls + 1 : 0;
      if (options.mode === "BACKFILL") await tx.update(tenderPortals).set({ syncState: { ...(options.syncState ?? {}), gemCursorStallRuns: stallRuns } }).where(eq(tenderPortals.id, portalId));
      if (stalled && stallRuns >= 3) {
        await tx.execute(sql`
          INSERT INTO tender_ingestion_alerts (portal_id, kind, message, metadata)
          VALUES (${portalId}, 'CURSOR_STALLED', 'Backfill cursor did not advance for three runs.', jsonb_build_object('cursor', ${nextCursor}, 'runs', ${stallRuns}))
          ON CONFLICT (portal_id, kind) WHERE status = 'OPEN'
          DO UPDATE SET message = EXCLUDED.message, metadata = EXCLUDED.metadata, updated_at = now()
        `);
      } else {
        await tx.execute(sql`UPDATE tender_ingestion_alerts SET status = 'RESOLVED', resolved_at = now(), updated_at = now() WHERE portal_id = ${portalId} AND kind = 'CURSOR_STALLED' AND status = 'OPEN'`);
      }

      const volume = await tx.execute(sql`
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY discovered_count)::float8 AS median
        FROM (
          SELECT discovered_count FROM tender_sync_runs
          WHERE portal_id = ${portalId} AND status = 'SUCCEEDED' AND mode = ${options.mode ?? "HEAD"} AND id <> ${runId}
          ORDER BY completed_at DESC NULLS LAST LIMIT 7
        ) recent
      `);
      const median = Number((volume as unknown as Array<{ median: number | null }>)[0]?.median ?? 0);
      if (median >= 20 && (counts.discovered < median * 0.5 || counts.discovered > median * 1.5)) {
        await tx.execute(sql`
          INSERT INTO tender_ingestion_alerts (portal_id, kind, message, metadata)
          VALUES (${portalId}, 'VOLUME_ANOMALY', 'Discovered notice volume differs by more than 50% from the recent median.', jsonb_build_object('discovered', ${counts.discovered}, 'median', ${median}))
          ON CONFLICT (portal_id, kind) WHERE status = 'OPEN'
          DO UPDATE SET message = EXCLUDED.message, metadata = EXCLUDED.metadata, updated_at = now()
        `);
      } else {
        await tx.execute(sql`UPDATE tender_ingestion_alerts SET status = 'RESOLVED', resolved_at = now(), updated_at = now() WHERE portal_id = ${portalId} AND kind = 'VOLUME_ANOMALY' AND status = 'OPEN'`);
      }

      if (options.fullSnapshot) {
        const snapshotStartedAt = snapshotStart(options.scope, completedAt);
        await tx.execute(sql`
          UPDATE tender_notice_sources
          SET missed_syncs = missed_syncs + 1,
              stale_at = CASE WHEN missed_syncs + 1 >= 2 THEN COALESCE(stale_at, ${completedAt.toISOString()}::timestamptz) ELSE stale_at END
          WHERE portal_id = ${portalId}
            AND last_seen_at < ${snapshotStartedAt.toISOString()}::timestamptz
        `);
      }
      const stale = await tx.select({ count: sql<number>`count(*)` }).from(tenderNoticeSources).where(and(eq(tenderNoticeSources.portalId, portalId), sql`${tenderNoticeSources.staleAt} is not null`));
      await tx.update(tenderSyncRuns).set({ staleCount: Number(stale[0]?.count ?? 0) }).where(eq(tenderSyncRuns.id, runId));
    });
    await this.reconcileCatalog();
  }

  async failRun(runId: string, portalId: string, error: string) {
    const message = error.slice(0, 2_000);
    await withTransaction(async (tx) => {
      await tx
        .update(tenderSyncRuns)
        .set({ status: "FAILED", errorCount: 1, failureReason: message, completedAt: new Date() })
        .where(eq(tenderSyncRuns.id, runId));
      await tx
        .update(tenderPortals)
        .set({
          health: "DEGRADED",
          lastError: message,
          consecutiveFailures: sql`${tenderPortals.consecutiveFailures} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(tenderPortals.id, portalId));
      const [portal] = await tx.select({ failures: tenderPortals.consecutiveFailures }).from(tenderPortals).where(eq(tenderPortals.id, portalId)).limit(1);
      if ((portal?.failures ?? 0) >= 3) {
        await tx.insert(tenderIngestionAlerts).values({ portalId, kind: "CONSECUTIVE_FAILURES", message: message }).onConflictDoUpdate({
          target: [tenderIngestionAlerts.portalId, tenderIngestionAlerts.kind],
          targetWhere: sql`${tenderIngestionAlerts.status} = 'OPEN'`,
          set: { message, metadata: { failures: portal?.failures ?? 0 }, updatedAt: new Date() },
        });
      }
    });
  }

  async reconcileCatalog() {
    await withTransaction(async (tx) => {
      await tx.execute(sql`
        UPDATE tender_notices AS n
        SET status = CASE
              WHEN EXISTS (SELECT 1 FROM tender_notice_sources s WHERE s.notice_id = n.id AND s.source_status = 'AWARDED') THEN 'AWARDED'::tender_notice_status
              WHEN EXISTS (SELECT 1 FROM tender_notice_sources s WHERE s.notice_id = n.id AND s.source_status = 'CANCELLED') THEN 'CANCELLED'::tender_notice_status
              WHEN EXISTS (SELECT 1 FROM tender_notice_sources s WHERE s.notice_id = n.id AND s.source_status = 'CLOSED') THEN 'CLOSED'::tender_notice_status
              WHEN n.deadline_at IS NOT NULL AND n.deadline_at < now() THEN 'EXPIRED'::tender_notice_status
              WHEN EXISTS (SELECT 1 FROM tender_notice_sources s WHERE s.notice_id = n.id AND s.source_status = 'ACTIVE') THEN 'ACTIVE'::tender_notice_status
              ELSE 'UNKNOWN'::tender_notice_status
            END,
            missed_syncs = COALESCE((SELECT max(s.missed_syncs) FROM tender_notice_sources s WHERE s.notice_id = n.id), 0),
            stale_at = CASE
              WHEN EXISTS (SELECT 1 FROM tender_notice_sources s WHERE s.notice_id = n.id AND s.stale_at IS NULL) THEN NULL
              ELSE COALESCE(n.stale_at, now())
            END,
            updated_at = now()
      `);
      await tx.execute(sql`
        UPDATE tender_ingestion_alerts
        SET status = 'RESOLVED', resolved_at = now(), updated_at = now()
        WHERE status = 'OPEN' AND kind = 'CONSECUTIVE_FAILURES'
          AND EXISTS (
            SELECT 1 FROM tender_portals p
            WHERE p.id = tender_ingestion_alerts.portal_id AND p.consecutive_failures = 0
          )
      `);
      await tx.execute(sql`
        INSERT INTO tender_ingestion_alerts (portal_id, kind, message, metadata)
        SELECT p.id, 'STALE_SOURCE', 'Portal has not completed within two expected schedules.',
               jsonb_build_object('lastSuccessAt', p.last_success_at, 'scheduleMinutes', p.schedule_minutes)
        FROM tender_portals p
        WHERE p.enabled = true
          AND (p.last_success_at IS NULL OR p.last_success_at < now() - (p.schedule_minutes * 2 * interval '1 minute'))
        ON CONFLICT (portal_id, kind) WHERE status = 'OPEN'
        DO UPDATE SET message = EXCLUDED.message, metadata = EXCLUDED.metadata, updated_at = now()
      `);
      await tx.execute(sql`
        UPDATE tender_ingestion_alerts
        SET status = 'RESOLVED', resolved_at = now(), updated_at = now()
        WHERE status = 'OPEN' AND kind = 'STALE_SOURCE'
          AND EXISTS (
            SELECT 1 FROM tender_portals p
            WHERE p.id = tender_ingestion_alerts.portal_id
              AND p.last_success_at >= now() - (p.schedule_minutes * 2 * interval '1 minute')
          )
      `);
    });
  }

  async duePortals() {
    return this.db
      .select()
      .from(tenderPortals)
      .where(
        and(
          eq(tenderPortals.enabled, true),
          sql`${tenderPortals.lastAttemptAt} is null or ${tenderPortals.lastAttemptAt} <= now() - (${tenderPortals.scheduleMinutes} * interval '1 minute')`,
        ),
      );
  }

  async configureOfficialFeeds(feeds: Record<string, string>) {
    const keys = Object.keys(feeds);
    if (!keys.length) return;
    const portals = await this.db
      .select()
      .from(tenderPortals)
      .where(inArray(tenderPortals.key, keys));
    for (const portal of portals) {
      const feedUrl = feeds[portal.key];
      if (!feedUrl) continue;
      await this.db
        .update(tenderPortals)
        .set({
          enabled: true,
          health: "PENDING",
          metadata: { ...portal.metadata, feedUrl },
          updatedAt: new Date(),
        })
        .where(eq(tenderPortals.id, portal.id));
    }
  }
}

function snapshotStart(scope: Record<string, unknown> | undefined, fallback: Date) {
  const value = scope?.snapshotStartedAt;
  if (typeof value !== "string") return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function toDate(value: string | null | undefined) {
  return value ? new Date(value) : null;
}
