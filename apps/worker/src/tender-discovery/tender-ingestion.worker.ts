import {
  DEFAULT_JOB_OPTIONS,
  QUEUES,
  TENDER_INGESTION_JOBS,
  tenderCatalogReconcileJobId,
  tenderIngestionJobId,
  type TenderIngestionJobPayload,
  type TenderPortalSyncJobPayload,
} from "@rfp-os/jobs";
import { createLogger } from "@rfp-os/observability";
import { Queue, Worker, type Job } from "bullmq";
import type IORedis from "ioredis";

import { connectorForPortal } from "./connector";
import { TenderIngestionRepository } from "./tender-ingestion.repository";
import { NoticeDocumentImporter, tenderDiscoveryStorage } from "./notice-document-importer";

const logger = createLogger("worker:tender-discovery");

export function createTenderDiscoveryWorker(connection: IORedis) {
  const repository = new TenderIngestionRepository();
  const documentImporter = new NoticeDocumentImporter(tenderDiscoveryStorage());
  return new Worker<TenderIngestionJobPayload>(
    QUEUES.TENDER_INGESTION,
    async (job: Job<TenderIngestionJobPayload>) => {
      if (job.name === TENDER_INGESTION_JOBS.IMPORT_DOCUMENT && job.data.kind === "IMPORT_DOCUMENT")
        return documentImporter.import(job.data);
      if (job.name === TENDER_INGESTION_JOBS.RECONCILE_CATALOG && job.data.kind === "RECONCILE_CATALOG") {
        await repository.reconcileCatalog();
        return { processed: true };
      }
      if (job.name !== TENDER_INGESTION_JOBS.SYNC_PORTAL || job.data.kind !== "SYNC_PORTAL")
        throw new Error(`Unsupported tender ingestion job ${job.name}.`);
      const data = job.data as TenderPortalSyncJobPayload;
      const portal = await repository.portal(data.portalId);
      if (!portal || !portal.enabled)
        return { processed: false, reason: "Portal is missing or disabled." };
      const mode = data.mode ?? "HEAD";
      const backfill = mode === "BACKFILL" ? gemBackfillScope(portal.syncState) : null;
      const scope: Record<string, unknown> = backfill ? { ...backfill } : data.scope ?? {};
      const run = await repository.beginRun(portal.id, data.windowStartedAt, data.cursor, mode, scope);
      let cursor = mode === "BACKFILL" ? backfill?.cursor ?? null : data.cursor ?? null;
      let discovered = 0;
      let inserted = 0;
      let updated = 0;
      try {
        const connector = connectorForPortal(portal);
        const maxPages = mode === "HEAD"
          ? metadataNumber(portal.metadata, "headPagesPerRun", 3, 1, 10)
          : metadataNumber(portal.metadata, "maxPagesPerRun", 25, 1, 100);
        const requestDelayMs = metadataNumber(portal.metadata, "requestDelayMs", 1_000, 0, 10_000);
        let pages = 0;
        do {
          const page = await connector.fetchPage(cursor, backfill ? {
            mode,
            deadlineFrom: backfill.deadlineFrom,
            deadlineTo: backfill.deadlineTo,
          } : { mode });
          for (const item of page.items) {
            const result = await repository.persistNotice(portal.id, run.id, item);
            discovered += 1;
            if (result.inserted) inserted += 1;
            else updated += 1;
          }
          cursor = page.nextCursor;
          pages += 1;
          await job.updateProgress({ discovered, cursor });
          if (cursor && pages < maxPages && requestDelayMs) await sleep(requestDelayMs);
        } while (cursor && pages < maxPages);
        const nextBackfill = backfill ? advanceGemBackfill(backfill, portal.syncState, cursor) : null;
        await repository.completeRun(run.id, portal.id, { discovered, inserted, updated }, mode === "BACKFILL" ? null : cursor, {
          mode,
          scope,
          fullSnapshot: nextBackfill?.complete ?? false,
          backfillComplete: nextBackfill?.complete ?? false,
          syncState: nextBackfill?.state ?? portal.syncState,
        });
        logger.info(
          { portal: portal.key, discovered, inserted, updated },
          "tender portal sync complete",
        );
        return { processed: true, discovered, inserted, updated };
      } catch (error) {
        await repository.failRun(
          run.id,
          portal.id,
          error instanceof Error ? error.message : "Tender portal sync failed.",
        );
        throw error;
      }
    },
    { connection, concurrency: 1, ...DEFAULT_JOB_OPTIONS },
  );
}

export function startTenderDiscoveryScheduler(connection: IORedis) {
  const queue = new Queue<TenderIngestionJobPayload>(QUEUES.TENDER_INGESTION, { connection });
  const repository = new TenderIngestionRepository();
  const feeds = officialFeedsFromEnv();
  const enqueueDue = async () => {
    for (const portal of await repository.duePortals()) {
      const bucket = windowBucket(new Date(), portal.scheduleMinutes);
      await queue.add(
        TENDER_INGESTION_JOBS.SYNC_PORTAL,
        {
          kind: "SYNC_PORTAL",
          portalId: portal.id,
          portalKey: portal.key,
          windowStartedAt: bucket,
          cursor: null,
          mode: "HEAD",
        },
        { ...DEFAULT_JOB_OPTIONS, jobId: tenderIngestionJobId(portal.key, bucket, "HEAD") },
      );
      if (portal.key === "gem") {
        await queue.add(
          TENDER_INGESTION_JOBS.SYNC_PORTAL,
          { kind: "SYNC_PORTAL", portalId: portal.id, portalKey: portal.key, windowStartedAt: bucket, mode: "BACKFILL" },
          { ...DEFAULT_JOB_OPTIONS, jobId: tenderIngestionJobId(portal.key, bucket, "BACKFILL") },
        );
      }
    }
    const hour = windowBucket(new Date(), 60);
    await queue.add(
      TENDER_INGESTION_JOBS.RECONCILE_CATALOG,
      { kind: "RECONCILE_CATALOG", windowStartedAt: hour },
      { ...DEFAULT_JOB_OPTIONS, jobId: tenderCatalogReconcileJobId(hour) },
    );
  };
  void repository
    .configureOfficialFeeds(feeds)
    .then(enqueueDue)
    .catch((error) => logger.error({ err: error }, "unable to configure tender portal feeds"));
  const timer = setInterval(
    () =>
      void enqueueDue().catch((error) =>
        logger.error({ err: error }, "unable to schedule tender portal syncs"),
      ),
    60_000,
  );
  return {
    queue,
    stop: async () => {
      clearInterval(timer);
      await queue.close();
    },
  };
}

function windowBucket(date: Date, minutes: number) {
  const size = Math.max(1, minutes) * 60_000;
  return new Date(Math.floor(date.getTime() / size) * size).toISOString();
}

function officialFeedsFromEnv(): Record<string, string> {
  const raw = process.env.TENDER_DISCOVERY_FEEDS_JSON;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("expected an object");
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === "string" && /^https?:\/\//i.test(entry[1]),
      ),
    );
  } catch (error) {
    logger.error({ err: error }, "TENDER_DISCOVERY_FEEDS_JSON is invalid; no portals were enabled");
    return {};
  }
}

function metadataNumber(
  metadata: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number,
) {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.floor(value)))
    : fallback;
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

interface GemBackfillScope {
  deadlineFrom: string;
  deadlineTo: string;
  snapshotStartedAt: string;
  cursor: string | null;
}

export function gemBackfillScope(state: Record<string, unknown>): GemBackfillScope {
  const today = isoDay(new Date());
  const deadlineFrom = validIsoDay(state.gemBackfillFrom) ?? today;
  const days = metadataNumber(state, "gemBackfillWindowDays", 7, 1, 31);
  return {
    deadlineFrom,
    deadlineTo: addDays(deadlineFrom, days - 1),
    snapshotStartedAt: typeof state.gemSnapshotStartedAt === "string" ? state.gemSnapshotStartedAt : new Date().toISOString(),
    cursor: typeof state.gemBackfillCursor === "string" ? state.gemBackfillCursor : null,
  };
}

export function advanceGemBackfill(scope: GemBackfillScope, prior: Record<string, unknown>, cursor: string | null) {
  if (cursor) {
    return {
      complete: false,
      state: { ...prior, gemBackfillFrom: scope.deadlineFrom, gemBackfillCursor: cursor, gemSnapshotStartedAt: scope.snapshotStartedAt },
    };
  }
  const horizon = addDays(isoDay(new Date()), metadataNumber(prior, "gemBackfillHorizonDays", 365, 30, 730));
  const complete = scope.deadlineTo >= horizon;
  return {
    complete,
    state: complete
      ? { ...prior, gemBackfillFrom: isoDay(new Date()), gemBackfillCursor: null, gemSnapshotStartedAt: new Date().toISOString(), gemLastSnapshotCompletedAt: new Date().toISOString() }
      : { ...prior, gemBackfillFrom: addDays(scope.deadlineTo, 1), gemBackfillCursor: null, gemSnapshotStartedAt: scope.snapshotStartedAt },
  };
}

function validIsoDay(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}
function isoDay(value: Date) { return value.toISOString().slice(0, 10); }
function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDay(date);
}
