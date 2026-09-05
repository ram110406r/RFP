import type { DocumentJobName, DocumentJobPayload } from "./document-jobs";
import type { TenderIngestionJobName, TenderIngestionJobPayload } from "./tender-ingestion-jobs";
import type { RfpAutomationJobName, RfpAutomationJobPayload } from "./rfp-automation-jobs";

/**
 * Queue names. One queue per domain rather than one per job type: the four
 * document jobs share a worker pool and a concurrency budget, and splitting
 * them would mean four idle connections to size independently for no gain.
 */
export const QUEUES = {
  /** Scaffold/health queue from Phase 1. Not a domain queue. */
  PLATFORM: "platform",
  DOCUMENTS: "documents",
  TENDER_INGESTION: "tender-ingestion",
  RFP_AUTOMATION: "rfp-automation",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/**
 * Maps a queue to the jobs it accepts, so `enqueue` can reject a
 * document job aimed at the platform queue at compile time.
 */
export interface QueueJobMap {
  [QUEUES.DOCUMENTS]: { name: DocumentJobName; payload: DocumentJobPayload };
  [QUEUES.TENDER_INGESTION]: { name: TenderIngestionJobName; payload: TenderIngestionJobPayload };
  [QUEUES.RFP_AUTOMATION]: { name: RfpAutomationJobName; payload: RfpAutomationJobPayload };
}

export type QueueWithJobs = keyof QueueJobMap;

/**
 * Retry policy shared by producer and worker.
 *
 * Exponential backoff from 5s: parsing failures are usually either permanent
 * (a corrupt file, an unsupported format) or caused by a dependency being
 * briefly unavailable. Three attempts distinguishes the two without holding a
 * genuinely broken document in the queue for minutes.
 *
 * Completed jobs are trimmed by count rather than kept forever — the audit
 * log and the document's own status are the durable record of what happened,
 * so Redis does not need to be one too.
 */
export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5_000 },
  removeOnComplete: { count: 1_000 },
  /**
   * Failed jobs are kept far longer than completed ones. A job that exhausted
   * its attempts is the only place the original error and payload survive, and
   * that is exactly what someone debugging a stuck document needs to read.
   */
  removeOnFail: { count: 5_000 },
} as const;
