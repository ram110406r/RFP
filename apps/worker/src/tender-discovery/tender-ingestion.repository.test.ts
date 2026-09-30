import { describe, expect, test } from "bun:test";
import { getDb, tenderNotices, tenderNoticeSources, tenderPortals, tenderSourceRecords } from "@rfp-os/db";
import { eq } from "drizzle-orm";

import { TenderIngestionRepository } from "./tender-ingestion.repository";
import { advanceGemBackfill, gemBackfillScope } from "./tender-ingestion.worker";

const databaseConfigured = Boolean((process.env.DATABASE_URL || process.env.POSTGRES_HOST) && !process.env.TENDYY_ROOT_BUN_TEST);
const databaseTest = databaseConfigured ? test : test.skip;

describe("tender discovery operations", () => {
  databaseTest("marks a source stale only after two completed full snapshots omit it", async () => {
    const db = databaseConfigured ? getDb() : (undefined as never);
    const suffix = crypto.randomUUID();
    const [portal] = await db.insert(tenderPortals).values({ key: `test-${suffix}`, name: "Lifecycle fixture", category: "CENTRAL", officialUrl: "https://example.gov.in", connectorType: "CUSTOM", enabled: false }).returning();
    const [notice] = await db.insert(tenderNotices).values({ canonicalKey: `notice-${suffix}`, title: "Lifecycle fixture", sourceUrl: "https://example.gov.in/tender" }).returning();
    if (!portal || !notice) throw new Error("Unable to create lifecycle fixture.");
    try {
      const [record] = await db.insert(tenderSourceRecords).values({ portalId: portal.id, sourceNoticeKey: `source-${suffix}`, payloadHash: suffix, rawPayload: {} }).returning();
      if (!record) throw new Error("Unable to create source fixture.");
      await db.insert(tenderNoticeSources).values({ noticeId: notice.id, portalId: portal.id, sourceRecordId: record.id, sourceNoticeKey: record.sourceNoticeKey, sourceUrl: notice.sourceUrl, sourceStatus: "ACTIVE", lastSeenAt: new Date("2026-01-01T00:00:00.000Z") });
      const repository = new TenderIngestionRepository();
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const started = new Date(Date.now() + attempt * 1_000).toISOString();
        const run = await repository.beginRun(portal.id, started, null, "FULL_REFRESH", { snapshotStartedAt: started });
        await repository.completeRun(run.id, portal.id, { discovered: 0, inserted: 0, updated: 0 }, null, { mode: "FULL_REFRESH", scope: { snapshotStartedAt: started }, fullSnapshot: true });
        const [source] = await db.select().from(tenderNoticeSources).where(eq(tenderNoticeSources.noticeId, notice.id));
        expect(source?.missedSyncs).toBe(attempt);
        expect(Boolean(source?.staleAt)).toBe(attempt === 2);
      }
      const [canonical] = await db.select().from(tenderNotices).where(eq(tenderNotices.id, notice.id));
      expect(canonical?.staleAt).not.toBeNull();
    } finally {
      await db.delete(tenderPortals).where(eq(tenderPortals.id, portal.id));
      await db.delete(tenderNotices).where(eq(tenderNotices.id, notice.id));
    }
  });

  test("keeps a bounded GeM window on its cursor and advances only when exhausted", () => {
    const scope = gemBackfillScope({ gemBackfillFrom: "2026-09-06", gemBackfillWindowDays: 7, gemSnapshotStartedAt: "2026-09-06T00:00:00.000Z" });
    const partial = advanceGemBackfill(scope, {}, "4");
    expect(partial.state.gemBackfillFrom).toBe("2026-09-06");
    expect(partial.state.gemBackfillCursor).toBe("4");
    const completeWindow = advanceGemBackfill(scope, { gemBackfillHorizonDays: 365 }, null);
    expect(completeWindow.state.gemBackfillFrom).toBe("2026-09-13");
  });
});
