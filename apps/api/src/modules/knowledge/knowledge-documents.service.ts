import { randomUUID } from "node:crypto";

import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, desc, eq } from "drizzle-orm";
import { files, knowledgeDocuments, knowledgeSources, type Database, withTransaction } from "@rfp-os/db";
import { knowledgeDocumentObjectKey, ObjectStorage } from "@rfp-os/storage";
import type { AuthContext } from "@rfp-os/types";

import { PinoLoggerService } from "../../common/logger/pino-logger.service";
import type { Env } from "../../config/env.schema";
import { ActivityService } from "../../infrastructure/activity";
import { AuditService } from "../../infrastructure/audit";
import { DATABASE } from "../../infrastructure/database";
import { JobQueue } from "../../infrastructure/queue";
import { DocumentSizeMismatchError, DocumentTooLargeError, DocumentUploadNotFoundError, StorageNotConfiguredError } from "../documents/domain/document.errors";
import type { KnowledgeDocumentIntentInput } from "./knowledge.dto";
import { isUuid } from "./knowledge.logic";
import { serializeKnowledgeDocument } from "./knowledge.service";

/**
 * Only formats the knowledge ingest worker can turn into text. Narrower than
 * the RFP document allowlist on purpose: accepting a spreadsheet here would
 * produce a document that sits in `failed` forever.
 */
export const KNOWLEDGE_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

type DocumentRow = typeof knowledgeDocuments.$inferSelect;

/**
 * Uploads that back a knowledge source.
 *
 * Same two-phase shape as RFP documents (DocumentsService): intent registers
 * `files` + `knowledge_documents` and returns a presigned PUT; complete
 * confirms the object landed at the declared size and queues ingestion after
 * commit. Parsing, chunking, embedding and claim extraction all happen in
 * the worker (apps/worker/src/knowledge).
 */
@Injectable()
export class KnowledgeDocumentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly storage: ObjectStorage,
    private readonly jobs: JobQueue,
    private readonly audit: AuditService,
    private readonly activity: ActivityService,
    private readonly config: ConfigService<Env, true>,
    private readonly logger: PinoLoggerService,
  ) {}

  async list(auth: AuthContext, sourceId: string) {
    await this.requireSource(auth, sourceId);
    const rows = await this.db
      .select()
      .from(knowledgeDocuments)
      .where(and(eq(knowledgeDocuments.organizationId, auth.organizationId), eq(knowledgeDocuments.sourceId, sourceId)))
      .orderBy(desc(knowledgeDocuments.createdAt));
    return { items: rows.map(serializeKnowledgeDocument) };
  }

  async createUploadIntent(auth: AuthContext, sourceId: string, input: KnowledgeDocumentIntentInput) {
    this.assertStorageConfigured();
    const source = await this.requireSource(auth, sourceId);
    if (source.lifecycleStatus === "ARCHIVED") throw new ConflictException("Archived knowledge sources cannot take new documents.");
    const mimeType = input.mimeType.split(";")[0]!.trim().toLowerCase();
    if (!(KNOWLEDGE_DOCUMENT_MIME_TYPES as readonly string[]).includes(mimeType)) {
      throw new BadRequestException({
        code: "UNSUPPORTED_DOCUMENT_TYPE",
        message: "Knowledge documents must be PDF or DOCX.",
        accepted: KNOWLEDGE_DOCUMENT_MIME_TYPES,
      });
    }
    const maxBytes = this.config.get("UPLOAD_MAX_BYTES", { infer: true });
    if (input.sizeBytes > maxBytes) throw new DocumentTooLargeError(input.sizeBytes, maxBytes);

    const fileId = randomUUID();
    const objectKey = knowledgeDocumentObjectKey({
      organizationId: auth.organizationId,
      sourceId,
      fileId,
      filename: input.filename,
    });

    const document = await withTransaction(async (tx) => {
      await tx.insert(files).values({
        id: fileId,
        organizationId: auth.organizationId,
        bucket: this.storage.bucket,
        objectKey,
        filename: input.filename,
        mimeType,
        sizeBytes: input.sizeBytes,
        checksumSha256: null,
        uploadedBy: auth.userId,
      });
      const [created] = await tx
        .insert(knowledgeDocuments)
        .values({
          organizationId: auth.organizationId,
          sourceId,
          fileId,
          fileName: input.filename,
          mimeType,
          sizeBytes: input.sizeBytes,
          status: "uploaded",
          uploadedBy: auth.userId,
        })
        .returning();
      if (!created) throw new BadRequestException("Could not register the knowledge document.");
      await this.audit.record(
        {
          organizationId: auth.organizationId,
          actorId: auth.userId,
          action: "KNOWLEDGE_DOCUMENT_UPLOAD_STARTED",
          entityType: "knowledge_document",
          entityId: created.id,
          newValue: { sourceId, filename: input.filename, mimeType, sizeBytes: input.sizeBytes },
        },
        tx,
      );
      return created;
    });

    const ttl = this.config.get("UPLOAD_URL_TTL_SECONDS", { infer: true });
    const uploadUrl = await this.storage.presignPut({ objectKey, mimeType, expiresInSeconds: ttl });
    return {
      documentId: document.id,
      uploadUrl,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
      document: serializeKnowledgeDocument(document),
    };
  }

  async completeUpload(auth: AuthContext, sourceId: string, documentId: string) {
    this.assertStorageConfigured();
    const source = await this.requireSource(auth, sourceId);
    const { document, file } = await this.requireDocument(auth, sourceId, documentId);
    const head = await this.storage.headObject(file.objectKey);
    if (!head) throw new DocumentUploadNotFoundError();
    if (head.sizeBytes !== file.sizeBytes) throw new DocumentSizeMismatchError(file.sizeBytes, head.sizeBytes);

    const updated = await withTransaction(async (tx) => {
      const [next] = await tx
        .update(knowledgeDocuments)
        .set({ status: "queued", failureReason: null, updatedAt: new Date() })
        .where(eq(knowledgeDocuments.id, document.id))
        .returning();
      if (!next) throw new NotFoundException("Knowledge document not found.");
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: null,
          actorId: auth.userId,
          actorType: "user",
          label: `Uploaded ${file.filename} to ${source.name}`,
          action: "knowledge.document.uploaded",
          entityType: "knowledge_source",
          entityId: sourceId,
          summary: `Uploaded ${file.filename} to ${source.name}`,
        },
        tx,
      );
      return next;
    });

    await this.enqueueIngest(auth, updated, file.objectKey);
    return serializeKnowledgeDocument(updated);
  }

  /**
   * Re-runs ingestion for a document — after a failure, or to pick up a
   * better parser or embedding model. The version bump gives the job a fresh
   * id, so it is never swallowed by the completed job of the last run.
   */
  async reprocess(auth: AuthContext, sourceId: string, documentId: string) {
    await this.requireSource(auth, sourceId);
    const { document, file } = await this.requireDocument(auth, sourceId, documentId);
    if (document.status === "uploaded") throw new ConflictException("Finish the upload before reprocessing.");
    if (document.status === "queued" || document.status === "processing") return serializeKnowledgeDocument(document);
    const [updated] = await this.db
      .update(knowledgeDocuments)
      .set({ status: "queued", failureReason: null, version: document.version + 1, updatedAt: new Date() })
      .where(eq(knowledgeDocuments.id, document.id))
      .returning();
    if (!updated) throw new NotFoundException("Knowledge document not found.");
    await this.enqueueIngest(auth, updated, file.objectKey);
    return serializeKnowledgeDocument(updated);
  }

  /** Removes the document, its chunks (cascade) and the stored object. Claims it produced keep their text. */
  async remove(auth: AuthContext, sourceId: string, documentId: string) {
    const source = await this.requireSource(auth, sourceId);
    const { document, file } = await this.requireDocument(auth, sourceId, documentId);
    await withTransaction(async (tx) => {
      await tx.delete(knowledgeDocuments).where(eq(knowledgeDocuments.id, document.id));
      await tx.delete(files).where(eq(files.id, file.id));
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: null,
          actorId: auth.userId,
          actorType: "user",
          label: `Removed ${document.fileName} from ${source.name}`,
          action: "knowledge.document.removed",
          entityType: "knowledge_source",
          entityId: sourceId,
          summary: `Removed ${document.fileName} from ${source.name}`,
        },
        tx,
      );
    });
    try {
      await this.storage.deleteObject(file.objectKey);
    } catch (error) {
      this.logger.warn(`failed to delete knowledge object ${file.objectKey}: ${(error as Error).message}`, "KnowledgeDocumentsService");
    }
    return { deleted: true };
  }

  private async enqueueIngest(auth: AuthContext, document: DocumentRow, objectKey: string) {
    try {
      await this.jobs.enqueueKnowledgeIngest({
        organizationId: auth.organizationId,
        sourceId: document.sourceId,
        documentId: document.id,
        fileId: document.fileId,
        version: document.version,
        objectKey,
        mimeType: document.mimeType,
        actorId: auth.userId,
      });
    } catch (error) {
      // The upload succeeded; the document stays `queued` and can be reprocessed.
      this.logger.error(
        `failed to enqueue knowledge ingest for ${document.id}: ${(error as Error).message}`,
        (error as Error).stack,
        "KnowledgeDocumentsService",
      );
    }
  }

  private async requireSource(auth: AuthContext, sourceId: string) {
    if (!isUuid(sourceId)) throw new NotFoundException("Knowledge source not found.");
    const [source] = await this.db
      .select()
      .from(knowledgeSources)
      .where(and(eq(knowledgeSources.organizationId, auth.organizationId), eq(knowledgeSources.id, sourceId)));
    if (!source) throw new NotFoundException("Knowledge source not found.");
    return source;
  }

  private async requireDocument(auth: AuthContext, sourceId: string, documentId: string) {
    if (!isUuid(documentId)) throw new NotFoundException("Knowledge document not found.");
    const [row] = await this.db
      .select({ document: knowledgeDocuments, file: files })
      .from(knowledgeDocuments)
      .innerJoin(files, eq(knowledgeDocuments.fileId, files.id))
      .where(
        and(
          eq(knowledgeDocuments.organizationId, auth.organizationId),
          eq(knowledgeDocuments.sourceId, sourceId),
          eq(knowledgeDocuments.id, documentId),
        ),
      );
    if (!row) throw new NotFoundException("Knowledge document not found.");
    return row;
  }

  private assertStorageConfigured(): void {
    if (!this.config.get("STORAGE_ENDPOINT", { infer: true })) throw new StorageNotConfiguredError();
  }
}
