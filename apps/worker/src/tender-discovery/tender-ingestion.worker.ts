import { DEFAULT_JOB_OPTIONS, QUEUES, TENDER_INGESTION_JOBS, tenderIngestionJobId, type TenderIngestionJobPayload, type TenderPortalSyncJobPayload } from "@rfp-os/jobs";
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
  return new Worker<TenderIngestionJobPayload>(QUEUES.TENDER_INGESTION, async (job: Job<TenderIngestionJobPayload>) => {
    if (job.name === TENDER_INGESTION_JOBS.IMPORT_DOCUMENT && job.data.kind === "IMPORT_DOCUMENT") return documentImporter.import(job.data);
    if (job.name !== TENDER_INGESTION_JOBS.SYNC_PORTAL || job.data.kind !== "SYNC_PORTAL") throw new Error(`Unsupported tender ingestion job ${job.name}.`);
    const data = job.data as TenderPortalSyncJobPayload;
    const portal = await repository.portal(data.portalId);
    if (!portal || !portal.enabled) return { processed: false, reason: "Portal is missing or disabled." };
    const run = await repository.beginRun(portal.id, data.windowStartedAt, data.cursor);
    let cursor = data.cursor ?? null;
    let discovered = 0;
    let inserted = 0;
    let updated = 0;
    try {
      const connector = connectorForPortal(portal.metadata);
      do {
        const page = await connector.fetchPage(cursor);
        for (const item of page.items) {
          const result = await repository.persistNotice(portal.id, run.id, item);
          discovered += 1;
          if (result.inserted) inserted += 1; else updated += 1;
        }
        cursor = page.nextCursor;
        await job.updateProgress({ discovered, cursor });
      } while (cursor);
      await repository.completeRun(run.id, portal.id, { discovered, inserted, updated }, cursor);
      logger.info({ portal: portal.key, discovered, inserted, updated }, "tender portal sync complete");
      return { processed: true, discovered, inserted, updated };
    } catch (error) {
      await repository.failRun(run.id, portal.id, error instanceof Error ? error.message : "Tender portal sync failed.");
      throw error;
    }
  }, { connection, concurrency: 2, ...DEFAULT_JOB_OPTIONS });
}

export function startTenderDiscoveryScheduler(connection: IORedis) {
  const queue = new Queue<TenderIngestionJobPayload>(QUEUES.TENDER_INGESTION, { connection });
  const repository = new TenderIngestionRepository();
  const feeds = officialFeedsFromEnv();
  const enqueueDue = async () => {
    for (const portal of await repository.duePortals()) {
      const bucket = windowBucket(new Date(), portal.scheduleMinutes);
      await queue.add(TENDER_INGESTION_JOBS.SYNC_PORTAL, { kind: "SYNC_PORTAL", portalId: portal.id, portalKey: portal.key, windowStartedAt: bucket }, { ...DEFAULT_JOB_OPTIONS, jobId: tenderIngestionJobId(portal.key, bucket) });
    }
  };
  void repository.configureOfficialFeeds(feeds).then(enqueueDue).catch((error) => logger.error({ err: error }, "unable to configure tender portal feeds"));
  const timer = setInterval(() => void enqueueDue().catch((error) => logger.error({ err: error }, "unable to schedule tender portal syncs")), 60_000);
  return { queue, stop: async () => { clearInterval(timer); await queue.close(); } };
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
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("expected an object");
    return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string" && /^https?:\/\//i.test(entry[1])));
  } catch (error) {
    logger.error({ err: error }, "TENDER_DISCOVERY_FEEDS_JSON is invalid; no portals were enabled");
    return {};
  }
}
