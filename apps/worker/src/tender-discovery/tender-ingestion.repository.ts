import {
  getDb,
  tenderNoticeDocuments,
  tenderNotices,
  tenderNoticeSources,
  tenderPortals,
  tenderSourceRecords,
  tenderSyncRuns,
  withTransaction,
} from "@rfp-os/db";
import { and, eq, inArray, sql } from "drizzle-orm";

import { canonicalNoticeKey, payloadHash, type ConnectorNotice } from "./connector";

export class TenderIngestionRepository {
  private readonly db = getDb();

  async portal(portalId: string) {
    const [portal] = await this.db.select().from(tenderPortals).where(eq(tenderPortals.id, portalId)).limit(1);
    return portal ?? null;
  }

  async beginRun(portalId: string, windowStartedAt: string, cursor?: string | null) {
    const [run] = await this.db.insert(tenderSyncRuns).values({
      portalId,
      cursor: cursor ?? null,
      windowStartedAt: new Date(windowStartedAt),
    }).returning();
    if (!run) throw new Error("Unable to create tender sync run.");
    await this.db.update(tenderPortals).set({ lastAttemptAt: new Date(), updatedAt: new Date() }).where(eq(tenderPortals.id, portalId));
    return run;
  }

  async persistNotice(portalId: string, syncRunId: string, item: ConnectorNotice) {
    return withTransaction(async (tx) => {
      const hash = payloadHash(item.raw);
      const [sourceRecord] = await tx.insert(tenderSourceRecords).values({
        portalId,
        syncRunId,
        sourceNoticeKey: item.sourceNoticeKey,
        payloadHash: hash,
        rawPayload: item.raw,
        sourceUpdatedAt: toDate(item.sourceUpdatedAt),
      }).onConflictDoUpdate({
        target: [tenderSourceRecords.portalId, tenderSourceRecords.sourceNoticeKey, tenderSourceRecords.payloadHash],
        set: { syncRunId, lastSeenAt: new Date() },
      }).returning();
      if (!sourceRecord) throw new Error("Unable to persist tender source record.");

      const key = canonicalNoticeKey(item);
      const prior = await tx.select({ id: tenderNotices.id }).from(tenderNotices).where(eq(tenderNotices.canonicalKey, key)).limit(1);
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
        estimatedValue: item.estimatedValue === null || item.estimatedValue === undefined ? null : String(item.estimatedValue),
        currency: item.currency ?? "INR",
        emdAmount: item.emdAmount === null || item.emdAmount === undefined ? null : String(item.emdAmount),
        documentFee: item.documentFee === null || item.documentFee === undefined ? null : String(item.documentFee),
        status: item.status ?? "UNKNOWN" as const,
        sourceUrl: item.sourceUrl,
        sourceUpdatedAt: toDate(item.sourceUpdatedAt),
        lastSeenAt: new Date(),
        missedSyncs: 0,
        staleAt: null,
        metadata: item.metadata ?? {},
        updatedAt: new Date(),
      };
      const [notice] = await tx.insert(tenderNotices).values(values).onConflictDoUpdate({
        target: tenderNotices.canonicalKey,
        set: values,
      }).returning();
      if (!notice) throw new Error("Unable to persist canonical tender notice.");

      await tx.insert(tenderNoticeSources).values({
        noticeId: notice.id,
        portalId,
        sourceRecordId: sourceRecord.id,
        sourceNoticeKey: item.sourceNoticeKey,
        sourceUrl: item.sourceUrl,
        isPrimary: notice.sourceUrl === item.sourceUrl,
      }).onConflictDoUpdate({
        target: [tenderNoticeSources.portalId, tenderNoticeSources.sourceNoticeKey],
        set: { noticeId: notice.id, sourceRecordId: sourceRecord.id, sourceUrl: item.sourceUrl, lastSeenAt: new Date() },
      });

      for (const document of item.documents ?? []) {
        await tx.insert(tenderNoticeDocuments).values({
          noticeId: notice.id,
          portalId,
          sourceDocumentKey: document.key,
          name: document.name,
          url: document.url,
          mimeType: document.mimeType ?? null,
          access: document.access ?? "EXTERNAL",
          metadata: document.metadata ?? {},
        }).onConflictDoUpdate({
          target: [tenderNoticeDocuments.portalId, tenderNoticeDocuments.sourceDocumentKey],
          set: { noticeId: notice.id, name: document.name, url: document.url, mimeType: document.mimeType ?? null, access: document.access ?? "EXTERNAL", metadata: document.metadata ?? {}, updatedAt: new Date() },
        });
      }

      return { inserted: prior.length === 0 };
    });
  }

  async completeRun(runId: string, portalId: string, counts: { discovered: number; inserted: number; updated: number }, cursor: string | null) {
    const completedAt = new Date();
    await withTransaction(async (tx) => {
      await tx.update(tenderSyncRuns).set({ status: "SUCCEEDED", discoveredCount: counts.discovered, insertedCount: counts.inserted, updatedCount: counts.updated, cursor, completedAt }).where(eq(tenderSyncRuns.id, runId));
      await tx.update(tenderPortals).set({ health: "HEALTHY", lastSuccessAt: completedAt, lastError: null, updatedAt: completedAt }).where(eq(tenderPortals.id, portalId));
    });
  }

  async failRun(runId: string, portalId: string, error: string) {
    const message = error.slice(0, 2_000);
    await withTransaction(async (tx) => {
      await tx.update(tenderSyncRuns).set({ status: "FAILED", errorCount: 1, failureReason: message, completedAt: new Date() }).where(eq(tenderSyncRuns.id, runId));
      await tx.update(tenderPortals).set({ health: "DEGRADED", lastError: message, updatedAt: new Date() }).where(eq(tenderPortals.id, portalId));
    });
  }

  async duePortals() {
    return this.db.select().from(tenderPortals).where(and(
      eq(tenderPortals.enabled, true),
      sql`${tenderPortals.lastAttemptAt} is null or ${tenderPortals.lastAttemptAt} <= now() - (${tenderPortals.scheduleMinutes} * interval '1 minute')`,
    ));
  }

  async configureOfficialFeeds(feeds: Record<string, string>) {
    const keys = Object.keys(feeds);
    if (!keys.length) return;
    const portals = await this.db.select().from(tenderPortals).where(inArray(tenderPortals.key, keys));
    for (const portal of portals) {
      const feedUrl = feeds[portal.key];
      if (!feedUrl) continue;
      await this.db.update(tenderPortals).set({ enabled: true, health: "PENDING", metadata: { ...portal.metadata, feedUrl }, updatedAt: new Date() }).where(eq(tenderPortals.id, portal.id));
    }
  }
}

function toDate(value: string | null | undefined) { return value ? new Date(value) : null; }
