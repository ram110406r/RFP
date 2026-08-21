import { Worker } from "bullmq";

import { createLogger } from "@rfp-os/observability";

import { createRedisConnection } from "./redis";

const logger = createLogger("worker");

/**
 * Platform queue, used for scaffold/health verification. Domain queues
 * (document processing, answer generation, etc.) are registered here by
 * later phases — one BullMQ Worker per queue, all sharing this connection.
 */
const worker = new Worker(
  "platform",
  async (job) => {
    logger.info({ jobId: job.id, name: job.name }, "processing job");
    return { ok: true };
  },
  { connection: createRedisConnection() },
);

worker.on("ready", () => logger.info("worker connected to redis, listening on queue 'platform'"));
worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "job failed"));
worker.on("error", (err) => logger.error({ err }, "worker connection error"));

process.on("SIGTERM", async () => {
  await worker.close();
  process.exit(0);
});
