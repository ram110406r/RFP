import { createLogger } from "@rfp-os/observability";
import {
  DEFAULT_JOB_OPTIONS,
  QUEUES,
  documentJobId,
  DOCUMENT_JOBS,
  type DocumentJobName,
  type DocumentJobPayload,
  type RequirementExtractionJobPayload,
} from "@rfp-os/jobs";
import { ObjectStorage } from "@rfp-os/storage";
import { Queue, UnrecoverableError, Worker, type Job } from "bullmq";
import type IORedis from "ioredis";

import { DocumentProcessor, isPermanent } from "./document-processor";
import { ExtractionRepository } from "./extraction.repository";
import { RequirementExtractionProcessor } from "./requirement-extraction.processor";
import { RequirementExtractionRepository } from "./requirement-extraction.repository";

const logger = createLogger("worker:documents");

/**
 * Bounded because each job holds a database connection and a storage read.
 * Five is a starting point sized to the default postgres pool, not a tuned
 * value — raise it once there is a real extraction workload to measure.
 */
const CONCURRENCY = 5;

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

export function createDocumentsWorker(connection: IORedis): Worker {
  const processor = new DocumentProcessor(storageFromEnv());
  const documentExtractions = new ExtractionRepository();
  const requirementRepo = new RequirementExtractionRepository();
  const requirementProcessor = new RequirementExtractionProcessor(documentExtractions, requirementRepo);
  const queue = new Queue(QUEUES.DOCUMENTS, { connection });

  const worker = new Worker<DocumentJobPayload>(
    QUEUES.DOCUMENTS,
    async (job: Job<DocumentJobPayload>) => {
      const name = job.name as DocumentJobName;
      try {
        if (name === DOCUMENT_JOBS.REQUIREMENT_EXTRACT) {
          const result = await requirementProcessor.process(job.data as RequirementExtractionJobPayload);
          logger.info(
            {
              jobId: job.id,
              name,
              documentId: job.data.documentId,
              organizationId: job.data.organizationId,
              ...result,
            },
            result.processed
              ? "requirement extraction job complete"
              : "requirement extraction job skipped, already processed",
          );
          return result;
        }

        const result = await processor.process(name, job.data);
        logger.info(
          {
            jobId: job.id,
            name,
            documentId: job.data.documentId,
            organizationId: job.data.organizationId,
            ...result,
          },
          result.processed ? "document job complete" : "document job skipped, already processed",
        );
        if (name === DOCUMENT_JOBS.PARSE) {
          await enqueueRequirementExtractionIfReady(queue, documentExtractions, requirementRepo, job.data);
        }
        return result;
      } catch (error) {
        /*
         * A permanent failure is wrapped in UnrecoverableError, which tells
         * BullMQ to stop retrying immediately. Without it a corrupt file would
         * consume all three attempts and two backoff waits to reach a verdict
         * already known on the first read.
         */
        if (isPermanent(error)) {
          if (name === DOCUMENT_JOBS.REQUIREMENT_EXTRACT) {
            await requirementProcessor.recordFailure(
              job.data as RequirementExtractionJobPayload,
              (error as Error).message,
            );
          } else {
            await processor.recordFailure(job.data, (error as Error).message);
          }
          throw new UnrecoverableError((error as Error).message);
        }
        throw error;
      }
    },
    { connection, concurrency: CONCURRENCY, ...jobDefaults() },
  );

  /**
   * Dead-letter handling.
   *
   * BullMQ has no dead-letter queue of its own; a job that exhausts its
   * attempts simply lands in the failed set. That set is capped and is not
   * something the product can read, so the durable record has to be the
   * document row — which is also where the UI already looks. `failed` with a
   * reason is the dead letter.
   */
  worker.on("failed", (job, error) => {
    if (!job) {
      logger.error({ err: error }, "job failed before it could be loaded");
      return;
    }
    const exhausted = job.attemptsMade >= (job.opts.attempts ?? DEFAULT_JOB_OPTIONS.attempts);
    logger.error(
      {
        jobId: job.id,
        name: job.name,
        documentId: job.data?.documentId,
        attemptsMade: job.attemptsMade,
        exhausted,
        err: error,
      },
      exhausted ? "document job dead-lettered" : "document job failed, will retry",
    );

    if (!exhausted || !job.data) return;
    const record = job.name === DOCUMENT_JOBS.REQUIREMENT_EXTRACT
      ? requirementProcessor.recordFailure(job.data as RequirementExtractionJobPayload, error.message)
      : processor.recordFailure(job.data, error.message);
    void record.catch((err: unknown) =>
      logger.error({ jobId: job.id, err }, "could not record document failure"),
    );
  });

  worker.on("ready", () => logger.info(`listening on queue '${QUEUES.DOCUMENTS}'`));
  worker.on("error", (err) => logger.error({ err }, "worker connection error"));

  return worker;
}

async function enqueueRequirementExtractionIfReady(
  queue: Queue,
  documentExtractionsRepo: ExtractionRepository,
  requirementRepo: RequirementExtractionRepository,
  payload: DocumentJobPayload,
): Promise<void> {
  const extraction = await documentExtractionsRepo.find(payload.organizationId, payload.documentId, payload.version);
  if (!extraction || extraction.status !== "succeeded") return;

  const existing = await requirementRepo.findByDocumentExtraction(payload.organizationId, extraction.id);
  if (existing?.status === "succeeded") return;

  const jobId = documentJobId(DOCUMENT_JOBS.REQUIREMENT_EXTRACT, payload.documentId, payload.version);
  const existingJob = await queue.getJob(jobId);
  if (existingJob) return;

  await queue.add(
    DOCUMENT_JOBS.REQUIREMENT_EXTRACT,
    {
      ...payload,
      documentExtractionId: extraction.id,
    } satisfies RequirementExtractionJobPayload,
    { ...jobDefaults(), jobId },
  );
}

/**
 * The producer sets these per job, so they are only a fallback for jobs added
 * by another route (a manual replay, a future scheduler). Keeping the same
 * defaults in one shared package is what stops the two from drifting.
 */
function jobDefaults() {
  return {
    removeOnComplete: DEFAULT_JOB_OPTIONS.removeOnComplete,
    removeOnFail: DEFAULT_JOB_OPTIONS.removeOnFail,
  };
}
