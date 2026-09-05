/**
 * Background job contracts shared by the API (producer) and worker (consumer).
 *
 * This package deliberately contains no BullMQ or Redis code. Each side owns
 * its own transport wiring — the API behind a `JobQueue` interface it can stub
 * in tests, the worker as concrete BullMQ Workers — and shares only the names,
 * payload shapes and retry policy that both must agree on.
 */

export { DOCUMENT_JOBS, documentJobId } from "./document-jobs";
export type {
  DocumentJobName,
  DocumentJobPayload,
  RequirementExtractionJobPayload,
} from "./document-jobs";

export { DEFAULT_JOB_OPTIONS, QUEUES } from "./queues";
export type { QueueJobMap, QueueName, QueueWithJobs } from "./queues";
export { TENDER_INGESTION_JOBS, tenderIngestionJobId, tenderNoticeDocumentImportJobId } from "./tender-ingestion-jobs";
export type { TenderIngestionJobName, TenderIngestionJobPayload, TenderPortalSyncJobPayload, TenderNoticeDocumentImportJobPayload } from "./tender-ingestion-jobs";
