import { QUEUES } from "@rfp-os/jobs";
import { createLogger } from "@rfp-os/observability";
import { Worker } from "bullmq";

import { createDocumentsWorker } from "./documents/documents.worker";
import { createTenderDiscoveryWorker, startTenderDiscoveryScheduler } from "./tender-discovery/tender-ingestion.worker";
import { createRedisConnection } from "./redis";

const logger = createLogger("worker");

/**
 * One Redis connection shared by every worker in this process. BullMQ holds a
 * blocking connection per Worker, so sharing the client keeps the count
 * proportional to queues rather than to workers.
 */
const connection = createRedisConnection();

/**
 * Platform queue, used for scaffold/health verification.
 */
const platformWorker = new Worker(
  QUEUES.PLATFORM,
  async (job) => {
    logger.info({ jobId: job.id, name: job.name }, "processing job");
    return { ok: true };
  },
  { connection },
);

platformWorker.on("ready", () =>
  logger.info(`worker connected to redis, listening on queue '${QUEUES.PLATFORM}'`),
);
platformWorker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "job failed"));
platformWorker.on("error", (err) => logger.error({ err }, "worker connection error"));

const documentsWorker = createDocumentsWorker(connection);
const tenderDiscoveryWorker = createTenderDiscoveryWorker(connection);
const tenderDiscoveryScheduler = startTenderDiscoveryScheduler(connection);

const workers = [platformWorker, documentsWorker, tenderDiscoveryWorker];

/**
 * Graceful shutdown.
 *
 * `close()` waits for in-flight jobs to finish rather than killing them, which
 * matters because a job interrupted mid-way has already written some of its
 * status transitions — it would be redelivered and re-run against a document
 * in a partially advanced state.
 *
 * SIGINT is handled alongside SIGTERM so a local Ctrl-C drains the same way a
 * container stop does, instead of leaving jobs stalled until BullMQ's lock
 * expiry reclaims them.
 */
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "shutting down, waiting for in-flight jobs");
  await Promise.allSettled(workers.map((w) => w.close()));
  await tenderDiscoveryScheduler.stop();
  await connection.quit();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
