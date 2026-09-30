import { createHash, randomUUID } from "node:crypto";
import { files, getDb, tenderDocuments, tenderNoticeDocuments, tenderSources, tenders, withTransaction } from "@rfp-os/db";
import { sniffFormat } from "@rfp-os/document-processing";
import { DEFAULT_JOB_OPTIONS, type TenderNoticeDocumentImportJobPayload } from "@rfp-os/jobs";
import { ObjectStorage, sanitizeFilename, tenderSourceObjectKey } from "@rfp-os/storage";
import { UnrecoverableError, type Job } from "bullmq";
import { and, eq, sql } from "drizzle-orm";

import { fetchPublicUrl, readBytesLimited, ResponseTooLargeError, UnsafeUrlError } from "../lib/http";

const MAX_REMOTE_BYTES = 50 * 1024 * 1024;
const TOO_LARGE_MESSAGE = "Official document exceeds the 50 MB import limit.";

export class NoticeDocumentImporter {
  private readonly db = getDb();
  constructor(private readonly storage: ObjectStorage) {}

  /**
   * `job` is optional so the importer can be driven directly; without it every
   * failure is treated as the final attempt.
   *
   * A failure that retrying cannot fix is rethrown as UnrecoverableError so
   * BullMQ stops at once. Anything else leaves the row PENDING with its error
   * until the last attempt, so the UI does not show FAILED for a document the
   * queue is about to import successfully.
   */
  async import(payload: TenderNoticeDocumentImportJobPayload, job?: Pick<Job, "attemptsMade" | "opts">) {
    await this.db.update(tenderNoticeDocuments).set({ importStatus: "PENDING", importAttempts: sql`${tenderNoticeDocuments.importAttempts} + 1`, lastCheckedAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(tenderNoticeDocuments.id, payload.noticeDocumentId));
    try { return await this.importDocument(payload); }
    catch (caught) {
      const error = toUnrecoverable(caught);
      // attemptsMade counts finished attempts, so this one is attemptsMade + 1.
      const finalAttempt = !job || job.attemptsMade + 1 >= (job.opts.attempts ?? DEFAULT_JOB_OPTIONS.attempts);
      const failed = error instanceof UnrecoverableError || finalAttempt;
      await this.db.update(tenderNoticeDocuments).set({ importStatus: failed ? "FAILED" : "PENDING", lastError: error instanceof Error ? error.message.slice(0, 2_000) : "Document import failed.", lastCheckedAt: new Date(), updatedAt: new Date() }).where(eq(tenderNoticeDocuments.id, payload.noticeDocumentId));
      throw error;
    }
  }

  private async importDocument(payload: TenderNoticeDocumentImportJobPayload) {
    const existing = await this.db.select({ id: tenderSources.id }).from(tenderSources).where(and(eq(tenderSources.tenderId, payload.tenderId), eq(tenderSources.discoveryNoticeDocumentId, payload.noticeDocumentId))).limit(1);
    if (existing[0]) { await this.markImported(payload.noticeDocumentId, null); return { processed: false, sourceId: existing[0].id }; }
    const [row] = await this.db.select({ document: tenderNoticeDocuments, tender: tenders }).from(tenderNoticeDocuments).innerJoin(tenders, eq(tenders.discoveryNoticeId, tenderNoticeDocuments.noticeId)).where(and(eq(tenderNoticeDocuments.id, payload.noticeDocumentId), eq(tenders.id, payload.tenderId), eq(tenders.organizationId, payload.organizationId), eq(tenders.workspaceId, payload.workspaceId))).limit(1);
    if (!row) throw new UnrecoverableError("Tender notice document is not linked to this application.");
    if (row.document.access !== "DIRECT") { await this.db.update(tenderNoticeDocuments).set({ importStatus: "NOT_APPLICABLE", lastCheckedAt: new Date(), updatedAt: new Date() }).where(eq(tenderNoticeDocuments.id, payload.noticeDocumentId)); return { processed: false, reason: "Document is not directly downloadable." }; }

    const response = await fetchPublicUrl(row.document.url, { timeoutMs: FETCH_TIMEOUT_MS });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      const message = `Official document returned HTTP ${response.status}.`;
      // 408 and 429 are the client errors that can clear up on their own.
      throw response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429 ? new UnrecoverableError(message) : new Error(message);
    }
    const bytes = await readBytesLimited(response, MAX_REMOTE_BYTES, TOO_LARGE_MESSAGE);
    if (!bytes.length) throw new Error("Official document is empty.");
    const format = sniffFormat(bytes.subarray(0, 512));
    if (format !== "PDF" && format !== "ZIP") throw new UnrecoverableError("Official document is not a supported PDF or DOCX file.");
    const mimeType = format === "PDF" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const filename = ensureExtension(sanitizeFilename(row.document.name), format === "PDF" ? ".pdf" : ".docx");
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const sourceId = randomUUID();
    const fileId = randomUUID();
    const objectKey = tenderSourceObjectKey({ organizationId: payload.organizationId, workspaceId: payload.workspaceId, tenderId: payload.tenderId, sourceId, filename });
    await this.storage.putObject({ objectKey, mimeType, bytes });
    try {
      await withTransaction(async (tx) => {
        await tx.insert(files).values({ id: fileId, organizationId: payload.organizationId, bucket: this.storage.bucket, objectKey, filename, mimeType, sizeBytes: bytes.length, checksumSha256: checksum, uploadedBy: payload.actorId });
        const [source] = await tx.insert(tenderSources).values({ id: sourceId, organizationId: payload.organizationId, workspaceId: payload.workspaceId, tenderId: payload.tenderId, discoveryNoticeDocumentId: payload.noticeDocumentId, sourceType: "DOCUMENT", name: row.document.name, externalReference: payload.noticeDocumentId, sourceUrl: row.document.url, fileId, mimeType, fileSize: bytes.length, checksumSha256: checksum, status: "READY", createdBy: payload.actorId, metadata: { importedFromDiscovery: true } }).onConflictDoNothing({ target: [tenderSources.tenderId, tenderSources.discoveryNoticeDocumentId] }).returning();
        if (!source) throw new DuplicateImportError();
        await tx.insert(tenderDocuments).values({ organizationId: payload.organizationId, workspaceId: payload.workspaceId, tenderId: payload.tenderId, tenderSourceId: source.id, documentId: fileId, documentRole: "ATTACHMENT", status: "UPLOADED", metadata: { discoveryNoticeDocumentId: payload.noticeDocumentId } });
      });
    } catch (error) {
      await this.storage.deleteObject(objectKey).catch(() => undefined);
      if (error instanceof DuplicateImportError) {
        const [winner] = await this.db.select({ id: tenderSources.id }).from(tenderSources).where(and(eq(tenderSources.tenderId, payload.tenderId), eq(tenderSources.discoveryNoticeDocumentId, payload.noticeDocumentId))).limit(1);
        if (winner) { await this.markImported(payload.noticeDocumentId, objectKey); return { processed: false, sourceId: winner.id }; }
      }
      throw error;
    }
    await this.markImported(payload.noticeDocumentId, objectKey);
    return { processed: true, sourceId };
  }

  private async markImported(documentId: string, storageKey: string | null) { await this.db.update(tenderNoticeDocuments).set({ importStatus: "IMPORTED", storageKey, lastError: null, lastCheckedAt: new Date(), updatedAt: new Date() }).where(eq(tenderNoticeDocuments.id, documentId)); }
}

export function tenderDiscoveryStorage() {
  return new ObjectStorage({ endpoint: process.env.STORAGE_ENDPOINT, region: process.env.STORAGE_REGION ?? "us-east-1", bucket: process.env.STORAGE_BUCKET ?? "rfp-os-documents", accessKeyId: process.env.STORAGE_ACCESS_KEY_ID, secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY, forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === "true" });
}

function ensureExtension(name: string, extension: string) { return name.toLowerCase().endsWith(extension) ? name : `${name}${extension}`; }

class DuplicateImportError extends Error {}

const FETCH_TIMEOUT_MS = 120_000;

/** Failures a retry cannot fix: an unsafe URL or a document over the size limit. */
function toUnrecoverable(error: unknown) {
  if (error instanceof UnsafeUrlError) return new UnrecoverableError(`Official document ${error.message}`);
  if (error instanceof ResponseTooLargeError) return new UnrecoverableError(error.message);
  return error;
}
