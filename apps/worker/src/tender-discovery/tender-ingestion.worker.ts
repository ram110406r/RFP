import {
  DEFAULT_JOB_OPTIONS,
  QUEUES,
  TENDER_INGESTION_JOBS,
  tenderCatalogReconcileJobId,
  tenderDiscoveryMaintenanceJobId,
  tenderIngestionJobId,
  type TenderIngestionJobPayload,
  type TenderPortalSyncJobPayload,
} from "@rfp-os/jobs";
import { createLogger } from "@rfp-os/observability";
import { Queue, Worker, type Job } from "bullmq";
import type IORedis from "ioredis";

import { connectorForPortal, normalizeNoticeFields } from "./connector";
import { TenderIngestionRepository } from "./tender-ingestion.repository";
import { NoticeDocumentImporter, tenderDiscoveryStorage } from "./notice-document-importer";
import { SavedSearchEvaluator } from "./saved-search-evaluator";

const logger = createLogger("worker:tender-discovery");

/**
 * Document imports are independent downloads and run in parallel, so a slow
 * portal file no longer holds up every sync behind it. Everything else (portal
 * syncs and catalog maintenance) still runs one at a time in this process
 * through `serial`: a GeM HEAD and BACKFILL sync for the same window have
 * different job ids, and both write the portal's syncState from a copy read at
 * the start of the run, so letting them overlap would lose backfill progress.
 */
const CONCURRENCY = 3;

export function createTenderDiscoveryWorker(connection: IORedis) {
  const repository = new TenderIngestionRepository();
  const documentImporter = new NoticeDocumentImporter(tenderDiscoveryStorage());
  const savedSearches = new SavedSearchEvaluator();
  const serial = createSerialRunner();
  return new Worker<TenderIngestionJobPayload>(
    QUEUES.TENDER_INGESTION,
    async (job: Job<TenderIngestionJobPayload>) => {
      if (job.name === TENDER_INGESTION_JOBS.IMPORT_DOCUMENT && job.data.kind === "IMPORT_DOCUMENT")
        return documentImporter.import(job.data, job);
      return serial(() => processSerialJob(job));
    },
    { connection, concurrency: CONCURRENCY },
  );

  async function processSerialJob(job: Job<TenderIngestionJobPayload>) {
    if (job.name === TENDER_INGESTION_JOBS.RECONCILE_CATALOG && job.data.kind === "RECONCILE_CATALOG") {
      await repository.reconcileCatalog();
      return { processed: true };
    }
    if (job.name === TENDER_INGESTION_JOBS.EVALUATE_SAVED_SEARCHES && job.data.kind === "EVALUATE_SAVED_SEARCHES")
      return { processed: true, evaluated: await savedSearches.evaluateDue() };
    if (job.name === TENDER_INGESTION_JOBS.MAINTAIN_DISCOVERY_ANALYTICS && job.data.kind === "MAINTAIN_DISCOVERY_ANALYTICS") {
      await savedSearches.maintainAnalytics();
      return { processed: true };
    }
    if (job.name !== TENDER_INGESTION_JOBS.SYNC_PORTAL || job.data.kind !== "SYNC_PORTAL")
      throw new Error(`Unsupported tender ingestion job ${job.name}.`);
    const data = job.data as TenderPortalSyncJobPayload;
    const portal = await repository.portal(data.portalId);
    const smoke = job.data.kind === "SYNC_PORTAL" && job.data.scope?.smoke === true;
    if (!portal || (!portal.enabled && !(smoke && portal.metadata.connectorVerified === true)))
      return { processed: false, reason: "Portal is missing or disabled." };
    const mode = data.mode ?? "HEAD";
    const backfill = mode === "BACKFILL" ? gemBackfillScope(portal.syncState) : null;
    const scope: Record<string, unknown> = backfill ? { ...backfill } : mode === "FULL_REFRESH" || mode === "RECONCILE" ? { ...(data.scope ?? {}), snapshotStartedAt: data.windowStartedAt } : data.scope ?? {};
    const run = await repository.beginRun(portal.id, data.windowStartedAt, data.cursor, mode, scope);
    let cursor = mode === "BACKFILL" ? backfill?.cursor ?? null : data.cursor ?? null;
    let discovered = 0;
    let inserted = 0;
    let updated = 0;
    let duplicates = 0;
    let parsed = 0;
    let rejected = 0;
    const complete = { referenceNumber: 0, buyer: 0, deadline: 0, category: 0, state: 0, estimatedValue: 0, documents: 0 };
    try {
      const connector = connectorForPortal(portal);
      const fetchMode = mode === "RECONCILE" ? "FULL_REFRESH" : mode;
      const maxPages = mode === "HEAD"
        ? metadataNumber(portal.metadata, "headPagesPerRun", 3, 1, 10)
        : metadataNumber(portal.metadata, "maxPagesPerRun", 25, 1, 100);
      const requestDelayMs = metadataNumber(portal.metadata, "requestDelayMs", 1_000, 0, 10_000);
      let pages = 0;
      do {
        const page = await connector.fetchPage(cursor, backfill ? {
          mode: fetchMode,
          deadlineFrom: backfill.deadlineFrom,
          deadlineTo: backfill.deadlineTo,
        } : { mode: fetchMode });
        discovered += page.items.length;
        for (const sourceItem of page.items) {
          let item;
          try {
            item = normalizeNoticeFields(sourceItem);
          } catch (error) {
            rejected += 1;
            await repository.rejectNotice(portal.id, run.id, sourceItem, error instanceof Error ? error.message : "Notice normalization failed.");
            continue;
          }
          const result = await repository.persistNotice(portal.id, run.id, item);
          parsed += 1;
          if (result.inserted) inserted += 1;
          else if (result.duplicate) duplicates += 1;
          else updated += 1;
          if (item.referenceNumber) complete.referenceNumber += 1;
          if (item.buyerName) complete.buyer += 1;
          if (item.deadlineAt) complete.deadline += 1;
          if (item.category) complete.category += 1;
          if (item.state) complete.state += 1;
          if (item.estimatedValue !== null && item.estimatedValue !== undefined) complete.estimatedValue += 1;
          if (item.documents?.length) complete.documents += 1;
        }
        cursor = page.nextCursor;
        pages += 1;
        await job.updateProgress({ discovered, cursor });
        if (cursor && pages < maxPages && requestDelayMs) await sleep(requestDelayMs);
      } while (cursor && pages < maxPages);
      const nextBackfill = backfill ? advanceGemBackfill(backfill, portal.syncState, cursor) : null;
      const completeness = Object.fromEntries(Object.entries(complete).map(([key, value]) => [key, discovered ? Math.round(value * 10_000 / discovered) / 100 : 0]));
      await repository.completeRun(run.id, portal.id, { discovered, parsed, rejected, duplicates, inserted, updated, completeness }, mode === "BACKFILL" ? null : cursor, {
        mode,
        scope,
        fullSnapshot: mode === "FULL_REFRESH" || mode === "RECONCILE" || (nextBackfill?.complete ?? false),
        backfillComplete: nextBackfill?.complete ?? false,
        syncState: nextBackfill?.state ?? portal.syncState,
      });
      logger.info(
        { portal: portal.key, discovered, parsed, rejected, inserted, updated, duplicates, completeness },
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
  }
}

/** Runs tasks one after another, in the order they were submitted. */
function createSerialRunner() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };
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
    const minute = windowBucket(new Date(), 1);
    await queue.add(
      TENDER_INGESTION_JOBS.EVALUATE_SAVED_SEARCHES,
      { kind: "EVALUATE_SAVED_SEARCHES", windowStartedAt: minute },
      { ...DEFAULT_JOB_OPTIONS, jobId: tenderDiscoveryMaintenanceJobId("EVALUATE_SAVED_SEARCHES", minute) },
    );
    await queue.add(
      TENDER_INGESTION_JOBS.MAINTAIN_DISCOVERY_ANALYTICS,
      { kind: "MAINTAIN_DISCOVERY_ANALYTICS", windowStartedAt: hour },
      { ...DEFAULT_JOB_OPTIONS, jobId: tenderDiscoveryMaintenanceJobId("MAINTAIN_DISCOVERY_ANALYTICS", hour) },
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
