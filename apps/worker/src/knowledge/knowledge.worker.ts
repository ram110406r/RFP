import {
  DEFAULT_JOB_OPTIONS,
  KNOWLEDGE_JOBS,
  knowledgeDocumentJobId,
  knowledgeLifecycleSweepJobId,
  QUEUES,
  type KnowledgeConflictJobPayload,
  type KnowledgeDocumentJobPayload,
  type KnowledgeJobPayload,
  type KnowledgeLifecycleSweepPayload,
} from "@rfp-os/jobs";
import { createLogger } from "@rfp-os/observability";
import { ObjectStorage } from "@rfp-os/storage";
import { Queue, UnrecoverableError, Worker, type Job } from "bullmq";
import type IORedis from "ioredis";

import { isPermanent } from "../documents/document-processor";
import { addOrRetryJob } from "../shared/queue";
import { knowledgeAiFromEnv } from "./knowledge-ai";
import { KnowledgeProcessor } from "./knowledge.processor";
import { runKnowledgeLifecycleSweep } from "./lifecycle-sweep";

const logger = createLogger("worker:knowledge");

/** Parsing and embedding are I/O-bound; three keeps provider rate limits comfortable. */
const CONCURRENCY = 3;
const SWEEP_INTERVAL_MS = 60 * 60_000;

function storageFromEnv(): ObjectStorage {
  return new ObjectStorage({
    endpoint: process.env.STORAGE_ENDPOINT,
    region: process.env.STORAGE_REGION ?? "us-east-1",
    bucket: process.env.STORAGE_BUCKET ?? "rfp-os-documents",
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY,
    forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === "true",
  });
}

const providerLogger = {
  log: (message: string) => logger.info(message),
  warn: (message: string) => logger.warn(message),
  error: (message: string) => logger.error(message),
};

/**
 * One queue for all knowledge work. Document steps chain — INGEST enqueues
 * EMBED and EXTRACT_CLAIMS; accepted claims later trigger DETECT_CONFLICTS
 * from the API — so each document's status only advances when the previous
 * step actually committed.
 */
export function createKnowledgeWorker(connection: IORedis): { worker: Worker; queue: Queue } {
  const ai = knowledgeAiFromEnv(providerLogger);
  if (!ai.embedder) logger.warn("no VOYAGE_API_KEY: knowledge documents are chunked for keyword search but not embedded");
  if (!ai.canComplete) logger.warn("no LLM configured: knowledge claim extraction uses the Label: value heuristic");
  const processor = new KnowledgeProcessor(storageFromEnv(), ai);
  const queue = new Queue<KnowledgeJobPayload>(QUEUES.KNOWLEDGE, { connection });

  const worker = new Worker<KnowledgeJobPayload>(
    QUEUES.KNOWLEDGE,
    async (job: Job<KnowledgeJobPayload>) => {
      try {
        switch (job.name) {
          case KNOWLEDGE_JOBS.INGEST: {
            const payload = job.data as KnowledgeDocumentJobPayload;
            const result = await processor.ingest(payload);
            if (result.processed) {
              await addOrRetryJob(queue, KNOWLEDGE_JOBS.EMBED, payload, knowledgeDocumentJobId(KNOWLEDGE_JOBS.EMBED, payload.documentId, payload.version));
              await addOrRetryJob(
                queue,
                KNOWLEDGE_JOBS.EXTRACT_CLAIMS,
                payload,
                knowledgeDocumentJobId(KNOWLEDGE_JOBS.EXTRACT_CLAIMS, payload.documentId, payload.version),
              );
            }
            logger.info({ jobId: job.id, documentId: payload.documentId, ...result }, "knowledge ingest finished");
            return result;
          }
          case KNOWLEDGE_JOBS.EMBED: {
            const result = await processor.embed(job.data as KnowledgeDocumentJobPayload);
            logger.info({ jobId: job.id, ...result }, "knowledge embed finished");
            return result;
          }
          case KNOWLEDGE_JOBS.EXTRACT_CLAIMS: {
            const result = await processor.extractClaims(job.data as KnowledgeDocumentJobPayload);
            logger.info({ jobId: job.id, ...result }, "knowledge claim extraction finished");
            return result;
          }
          case KNOWLEDGE_JOBS.DETECT_CONFLICTS: {
            const result = await processor.detectConflicts(job.data as KnowledgeConflictJobPayload);
            logger.info({ jobId: job.id, ...result }, "knowledge conflict detection finished");
            return result;
          }
          case KNOWLEDGE_JOBS.LIFECYCLE_SWEEP: {
            const payload = job.data as KnowledgeLifecycleSweepPayload;
            const result = await runKnowledgeLifecycleSweep({
              organizationId: payload.organizationId,
              knowledgeQueue: queue as Queue,
              embeddingModel: ai.embedder?.vendorModel ?? null,
            });
            logger.info({ jobId: job.id, ...result }, "knowledge lifecycle sweep finished");
            return result;
          }
          default:
            throw new UnrecoverableError(`Unknown knowledge job ${job.name}.`);
        }
      } catch (error) {
        if (isPermanent(error)) {
          if (job.name === KNOWLEDGE_JOBS.INGEST) {
            await processor.recordFailure(job.data as KnowledgeDocumentJobPayload, (error as Error).message);
          }
          throw new UnrecoverableError((error as Error).message);
        }
        throw error;
      }
    },
    { connection, concurrency: CONCURRENCY },
  );

  /*
   * Dead letter: an ingest that exhausted its retries marks the document
   * failed with the reason, where the UI shows it with a Reprocess action.
   * EMBED/EXTRACT failures leave the document `parsed` — it is still
   * keyword-searchable — and the sweep re-queues embedding later.
   */
  worker.on("failed", (job, error) => {
    if (!job) return;
    const exhausted = job.attemptsMade >= (job.opts.attempts ?? DEFAULT_JOB_OPTIONS.attempts);
    logger.error({ jobId: job.id, name: job.name, attemptsMade: job.attemptsMade, exhausted, err: error }, "knowledge job failed");
    if (exhausted && job.name === KNOWLEDGE_JOBS.INGEST) {
      void processor
        .recordFailure(job.data as KnowledgeDocumentJobPayload, error.message)
        .catch((err: unknown) => logger.error({ jobId: job.id, err }, "could not record knowledge document failure"));
    }
  });
  worker.on("ready", () => logger.info(`listening on queue '${QUEUES.KNOWLEDGE}'`));
  worker.on("error", (err) => logger.error({ err }, "worker connection error"));

  return { worker, queue: queue as Queue };
}

/**
 * Hourly tick, one sweep per UTC day: the job id is keyed on the day, so the
 * hourly timer only matters for picking the sweep up promptly after a deploy
 * or an outage. Same timer-plus-windowed-id pattern as the other schedulers.
 */
export function startKnowledgeScheduler(queue: Queue) {
  const enqueue = async () => {
    const windowStartedAt = new Date().toISOString().slice(0, 10);
    const payload: KnowledgeLifecycleSweepPayload = { windowStartedAt };
    await addOrRetryJob(queue, KNOWLEDGE_JOBS.LIFECYCLE_SWEEP, payload, knowledgeLifecycleSweepJobId(windowStartedAt));
  };
  const run = () => void enqueue().catch((error) => logger.error({ err: error }, "unable to schedule knowledge lifecycle sweep"));
  run();
  const timer = setInterval(run, SWEEP_INTERVAL_MS);
  return { stop: async () => clearInterval(timer) };
}
