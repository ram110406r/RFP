import { Injectable } from "@nestjs/common";
import {
  DEFAULT_JOB_OPTIONS,
  type DocumentJobName,
  type DocumentJobPayload,
  documentJobId,
  QUEUES,
  tenderNoticeDocumentImportJobId,
  tenderIngestionJobId,
  TENDER_INGESTION_JOBS,
  type TenderNoticeDocumentImportJobPayload,
  type TenderPortalSyncJobPayload,
} from "@rfp-os/jobs";
import { Queue } from "bullmq";
import type IORedis from "ioredis";

import { PinoLoggerService } from "../../common/logger/pino-logger.service";

/**
 * What domain services depend on to schedule background work.
 *
 * An abstract class rather than an interface so it doubles as the Nest DI
 * token, matching how `EventPublisher` and `ObjectStorage` are provided — a
 * test overrides it with a recording stub and never touches Redis.
 *
 * Enqueueing is deliberately NOT part of the database transaction. A job that
 * committed with the transaction would still be lost if Redis were down, and
 * one enqueued inside it can be picked up by a worker before the commit lands,
 * which reads as a document that does not exist yet. Callers enqueue after
 * commit and rely on the stable job id for idempotency instead.
 */
export abstract class JobQueue {
  abstract enqueueDocumentJob(
    name: DocumentJobName,
    payload: DocumentJobPayload,
  ): Promise<EnqueueResult>;

  async enqueueTenderNoticeDocument(_payload: TenderNoticeDocumentImportJobPayload): Promise<EnqueueResult> {
    throw new Error("Tender discovery ingestion is not configured.");
  }

  async enqueueTenderPortalSync(_payload: TenderPortalSyncJobPayload): Promise<EnqueueResult> {
    throw new Error("Tender discovery ingestion is not configured.");
  }

  /** Releases transport resources. No-op for implementations that hold none. */
  abstract close(): Promise<void>;
}

export interface EnqueueResult {
  /** False when the job id already existed, i.e. the work is already queued. */
  enqueued: boolean;
  jobId: string;
}

/**
 * The real transport.
 *
 * One `Queue` instance per queue name, held for the process lifetime: BullMQ
 * queues own a Redis connection each, so constructing one per enqueue would
 * open a connection per upload.
 */
@Injectable()
export class BullMqJobQueue extends JobQueue {
  private readonly documents: Queue;
  private readonly tenderIngestion: Queue;

  constructor(
    connection: IORedis,
    private readonly logger: PinoLoggerService,
  ) {
    super();
    this.documents = new Queue(QUEUES.DOCUMENTS, { connection });
    this.tenderIngestion = new Queue(QUEUES.TENDER_INGESTION, { connection });
  }

  override async enqueueTenderNoticeDocument(payload: TenderNoticeDocumentImportJobPayload): Promise<EnqueueResult> {
    const jobId = tenderNoticeDocumentImportJobId(payload.tenderId, payload.noticeDocumentId);
    const existing = await this.tenderIngestion.getJob(jobId);
    await this.tenderIngestion.add(TENDER_INGESTION_JOBS.IMPORT_DOCUMENT, payload, { ...DEFAULT_JOB_OPTIONS, jobId });
    return { enqueued: !existing, jobId };
  }

  override async enqueueTenderPortalSync(payload: TenderPortalSyncJobPayload): Promise<EnqueueResult> {
    const mode = payload.mode ?? "HEAD";
    const jobId = tenderIngestionJobId(payload.portalKey, payload.windowStartedAt, mode);
    const existing = await this.tenderIngestion.getJob(jobId);
    await this.tenderIngestion.add(TENDER_INGESTION_JOBS.SYNC_PORTAL, payload, { ...DEFAULT_JOB_OPTIONS, jobId });
    return { enqueued: !existing, jobId };
  }

  async enqueueDocumentJob(
    name: DocumentJobName,
    payload: DocumentJobPayload,
  ): Promise<EnqueueResult> {
    const jobId = documentJobId(name, payload.documentId, payload.version);

    /*
     * BullMQ returns the EXISTING job when the id is taken rather than
     * throwing, and the returned job is indistinguishable from a freshly added
     * one — same id, same waiting state. Asking first is the only way to tell
     * "queued" from "already queued", and the distinction matters because the
     * second case means a retry or a double-submit rather than new work.
     *
     * Two concurrent callers can both see nothing here and both report
     * enqueued. That is a reporting inaccuracy, not duplicated work: the job
     * id still collapses them to one job in Redis, which is the guarantee
     * completeUpload actually depends on.
     */
    const existing = await this.documents.getJob(jobId);
    await this.documents.add(name, payload, { ...DEFAULT_JOB_OPTIONS, jobId });
    const enqueued = !existing;
    this.logger.log(
      `document job ${name} ${enqueued ? "enqueued" : "already queued"} jobId=${jobId} org=${payload.organizationId}`,
      "JobQueue",
    );
    return { enqueued, jobId };
  }

  async close(): Promise<void> {
    await this.documents.close();
    await this.tenderIngestion.close();
  }
}

/**
 * Used when REDIS_URL is unset.
 *
 * The API must still boot and serve every read and write path without Redis —
 * only background processing is unavailable. Logging at warn rather than
 * throwing keeps local development and the test suite working, while making
 * the degraded state visible instead of silently dropping the work.
 */
@Injectable()
export class NoopJobQueue extends JobQueue {
  constructor(private readonly logger: PinoLoggerService) {
    super();
  }

  async enqueueDocumentJob(
    name: DocumentJobName,
    payload: DocumentJobPayload,
  ): Promise<EnqueueResult> {
    const jobId = documentJobId(name, payload.documentId, payload.version);
    this.logger.warn(
      `REDIS_URL is not configured; dropping document job ${name} jobId=${jobId}. ` +
        `The document will stay in its current status until it is reprocessed.`,
      "JobQueue",
    );
    return { enqueued: false, jobId };
  }

  override async enqueueTenderNoticeDocument(payload: TenderNoticeDocumentImportJobPayload): Promise<EnqueueResult> {
    const jobId = tenderNoticeDocumentImportJobId(payload.tenderId, payload.noticeDocumentId);
    this.logger.warn(`REDIS_URL is not configured; dropping tender document import job jobId=${jobId}.`, "JobQueue");
    return { enqueued: false, jobId };
  }

  override async enqueueTenderPortalSync(payload: TenderPortalSyncJobPayload): Promise<EnqueueResult> {
    const jobId = tenderIngestionJobId(payload.portalKey, payload.windowStartedAt, payload.mode ?? "HEAD");
    this.logger.warn(`REDIS_URL is not configured; dropping tender portal sync job jobId=${jobId}.`, "JobQueue");
    return { enqueued: false, jobId };
  }

  async close(): Promise<void> {
    /* nothing to release */
  }
}
