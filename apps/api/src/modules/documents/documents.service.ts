import { randomUUID } from "node:crypto";

import { ForbiddenException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { withTransaction, type rfpDocuments } from "@rfp-os/db";
import { ObjectStorage, documentObjectKey } from "@rfp-os/storage";
import type { AuthContext } from "@rfp-os/types";

import { PolicyService } from "../../common/auth";
import type { Env } from "../../config/env.schema";
import { AuditService, DOCUMENT_AUDIT_ACTIONS } from "../../infrastructure/audit";
import { DOCUMENT_EVENTS, EventPublisher } from "../../infrastructure/events";
import { RfpNotFoundError } from "../rfp/domain/rfp.errors";
import { DocumentsRepository } from "./documents.repository";
import { bytesToSizeMb, documentTypeForMime } from "./domain/document-type";
import {
  ArchivedDocumentNotEditableError,
  DocumentAlreadyArchivedError,
  DocumentNotFoundError,
  DocumentSizeMismatchError,
  DocumentTooLargeError,
  DocumentUploadNotFoundError,
  StorageNotConfiguredError,
  UnsupportedDocumentTypeError,
} from "./domain/document.errors";
import type {
  CreateUploadIntentInput,
  CreateVersionIntentInput,
  ListDocumentsInput,
} from "./dto/document.dto";

type DocumentRow = typeof rfpDocuments.$inferSelect;

/**
 * Document ingestion.
 *
 * Uploads are two-phase, and the split is the load-bearing design decision:
 *
 *   intent   → validate, register `files` + `rfp_documents`, return a
 *              presigned PUT the client sends the bytes to directly
 *   complete → confirm the object really is in storage at the declared size,
 *              then move the document into the processing queue
 *
 * The API never handles the payload. Buffering documents through the request
 * pipeline would put them under the global TimeoutInterceptor and make upload
 * throughput a property of the API's memory; more to the point, `files`
 * already models bucket/object_key/checksum with a uniqueness constraint — it
 * is a registration record for an object written by someone else.
 *
 * The cost of that choice is that a client can PUT bytes which contradict the
 * declared type. That is closed on completion (size is checked against the
 * stored object) and in the parse worker (magic bytes are sniffed, and a file
 * whose content contradicts its declaration fails rather than being trusted) —
 * a stronger guarantee than believing a multipart Content-Type header.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly repository: DocumentsRepository,
    private readonly storage: ObjectStorage,
    private readonly audit: AuditService,
    private readonly events: EventPublisher,
    private readonly policy: PolicyService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async list(auth: AuthContext, rfpId: string, filters: ListDocumentsInput) {
    await this.requireRfp(auth, rfpId);
    const { items, total } = await this.repository.listForRfp(auth.organizationId, rfpId, filters);
    return {
      items: items.map((row) => serialize(row.document, row.uploadedByName)),
      total,
      page: filters.page,
      pageSize: filters.pageSize,
    };
  }

  async getById(auth: AuthContext, rfpId: string, documentId: string) {
    const document = await this.requireDocument(auth, rfpId, documentId);
    await this.assertPolicyAllows(auth, "read", document);
    const versions = await this.repository.listVersions(auth.organizationId, documentId);
    return { ...serialize(document), versions };
  }

  /**
   * Phase one of an upload: reserve the rows and hand back a URL.
   *
   * The file id is minted here rather than by the database default, because
   * the object key contains it — computing the key up front means the `files`
   * row is written once, in its final form, instead of inserted and patched.
   *
   * The document row exists from this moment in `uploaded` status, so an
   * upload that is started and abandoned is visible rather than invisible,
   * which is what makes orphaned intents findable later.
   */
  async createUploadIntent(auth: AuthContext, rfpId: string, input: CreateUploadIntentInput) {
    this.assertStorageConfigured();
    await this.requireRfp(auth, rfpId);

    const documentType = this.validateUpload(input.mimeType, input.sizeBytes);
    const fileId = randomUUID();
    const objectKey = documentObjectKey({
      organizationId: auth.organizationId,
      rfpId,
      fileId,
      filename: input.filename,
    });

    const document = await withTransaction(async (tx) => {
      await this.repository.insertFile(
        {
          id: fileId,
          organizationId: auth.organizationId,
          bucket: this.storage.bucket,
          objectKey,
          filename: input.filename,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          checksumSha256: input.checksumSha256 ?? null,
          uploadedBy: auth.userId,
        },
        tx,
      );

      const created = await this.repository.insertDocument(
        {
          organizationId: auth.organizationId,
          rfpId,
          filename: input.filename,
          type: documentType,
          sizeMb: bytesToSizeMb(input.sizeBytes),
          status: "uploaded",
          fileId,
          uploadedBy: auth.userId,
          currentVersion: 1,
        },
        tx,
      );
      if (!created) throw new DocumentNotFoundError();

      await this.repository.insertVersion(
        {
          organizationId: auth.organizationId,
          documentId: created.id,
          fileId,
          version: 1,
          note: "Initial upload.",
          createdBy: auth.userId,
        },
        tx,
      );

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          actorId: auth.userId,
          action: DOCUMENT_AUDIT_ACTIONS.UPLOAD_STARTED,
          entityType: "document",
          entityId: created.id,
          newValue: {
            rfpId,
            filename: input.filename,
            mimeType: input.mimeType,
            sizeBytes: input.sizeBytes,
          },
        },
        tx,
      );

      return created;
    });

    const ttl = this.config.get("UPLOAD_URL_TTL_SECONDS", { infer: true });
    const uploadUrl = await this.storage.presignPut({
      objectKey,
      mimeType: input.mimeType,
      expiresInSeconds: ttl,
    });

    return {
      documentId: document.id,
      fileId,
      uploadUrl,
      objectKey,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
      document: serialize(document),
    };
  }

  /**
   * Phase two: confirm the bytes landed, then queue the document.
   *
   * `headObject` is the only evidence the API has that an upload actually
   * happened — without it a client could register a document, never PUT
   * anything, and leave the pipeline to fail on a missing object much later
   * and much further from the cause.
   */
  async completeUpload(auth: AuthContext, rfpId: string, documentId: string) {
    this.assertStorageConfigured();
    const { document, file } = await this.requireDocumentWithFile(auth, rfpId, documentId);
    if (document.archivedAt) throw new ArchivedDocumentNotEditableError();
    await this.assertPolicyAllows(auth, "upload", document);
    if (!file) throw new DocumentUploadNotFoundError();

    const head = await this.storage.headObject(file.objectKey);
    if (!head) throw new DocumentUploadNotFoundError();
    /*
     * The declared size is what passed the limit check at intent, so accepting
     * a larger object here would make that limit bypassable in one request.
     */
    if (head.sizeBytes !== file.sizeBytes) {
      throw new DocumentSizeMismatchError(file.sizeBytes, head.sizeBytes);
    }

    const updated = await withTransaction(async (tx) => {
      const next = await this.repository.updateDocument(
        auth.organizationId,
        documentId,
        { status: "queued", failureReason: null },
        tx,
      );
      if (!next) throw new DocumentNotFoundError();

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          actorId: auth.userId,
          action: DOCUMENT_AUDIT_ACTIONS.UPLOADED,
          entityType: "document",
          entityId: documentId,
          previousValue: { status: document.status },
          newValue: { status: next.status, sizeBytes: head.sizeBytes },
        },
        tx,
      );
      return next;
    });

    /*
     * Published after commit, and only here — never at intent. A consumer that
     * queued parsing off the intent would be working on an object that may
     * never arrive.
     */
    await this.events.publish({
      name: DOCUMENT_EVENTS.UPLOADED,
      organizationId: auth.organizationId,
      actorId: auth.userId,
      entityId: documentId,
      occurredAt: new Date(),
      payload: {
        documentId,
        rfpId,
        fileId: file.id,
        filename: file.filename,
        mimeType: file.mimeType,
        sizeBytes: head.sizeBytes,
        version: updated.currentVersion,
      },
    });

    return serialize(updated);
  }

  /** A short-lived presigned GET. The URL is itself the grant, so it is audited. */
  async createDownloadUrl(auth: AuthContext, rfpId: string, documentId: string) {
    this.assertStorageConfigured();
    const { document, file } = await this.requireDocumentWithFile(auth, rfpId, documentId);
    await this.assertPolicyAllows(auth, "read", document);
    if (!file) throw new DocumentUploadNotFoundError();

    const ttl = this.config.get("DOWNLOAD_URL_TTL_SECONDS", { infer: true });
    const url = await this.storage.presignGet({
      objectKey: file.objectKey,
      expiresInSeconds: ttl,
      downloadFilename: file.filename,
    });

    await this.audit.record({
      organizationId: auth.organizationId,
      actorId: auth.userId,
      action: DOCUMENT_AUDIT_ACTIONS.DOWNLOADED,
      entityType: "document",
      entityId: documentId,
      metadata: { rfpId, filename: file.filename, ttlSeconds: ttl },
    });

    return { url, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() };
  }

  /**
   * Archive, not delete.
   *
   * The `files` row and the stored object both stay: evidence cites a document
   * version as the provenance of an answer, so removing the bytes would break
   * the chain from a claim back to its source. Archiving hides the document
   * from listings and leaves that chain intact.
   */
  async archive(auth: AuthContext, rfpId: string, documentId: string) {
    const document = await this.requireDocument(auth, rfpId, documentId);
    if (document.archivedAt) throw new DocumentAlreadyArchivedError();
    await this.assertPolicyAllows(auth, "delete", document);

    const archived = await withTransaction(async (tx) => {
      const next = await this.repository.updateDocument(
        auth.organizationId,
        documentId,
        { archivedAt: new Date(), status: "archived" },
        tx,
      );
      if (!next) throw new DocumentNotFoundError();

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          actorId: auth.userId,
          action: DOCUMENT_AUDIT_ACTIONS.ARCHIVED,
          entityType: "document",
          entityId: documentId,
          previousValue: { status: document.status, archivedAt: null },
          newValue: { status: next.status, archivedAt: next.archivedAt },
        },
        tx,
      );
      return next;
    });

    await this.events.publish({
      name: DOCUMENT_EVENTS.ARCHIVED,
      organizationId: auth.organizationId,
      actorId: auth.userId,
      entityId: documentId,
      occurredAt: new Date(),
      payload: { documentId, rfpId },
    });

    return serialize(archived);
  }

  /**
   * A new version of an existing document.
   *
   * The `document_versions` row for the previous file is never touched, so an
   * answer whose evidence cites version 1 still resolves to the bytes that
   * were actually read — replacing a document does not rewrite history.
   */
  async createVersionIntent(
    auth: AuthContext,
    rfpId: string,
    documentId: string,
    input: CreateVersionIntentInput,
  ) {
    this.assertStorageConfigured();
    const document = await this.requireDocument(auth, rfpId, documentId);
    if (document.archivedAt) throw new ArchivedDocumentNotEditableError();
    await this.assertPolicyAllows(auth, "upload", document);

    const documentType = this.validateUpload(input.mimeType, input.sizeBytes);
    const fileId = randomUUID();
    const objectKey = documentObjectKey({
      organizationId: auth.organizationId,
      rfpId,
      fileId,
      filename: input.filename,
    });

    const result = await withTransaction(async (tx) => {
      /*
       * Read inside the transaction, and backed by the unique index on
       * (document_id, version): two concurrent version uploads become a
       * constraint violation rather than two rows claiming the same number.
       */
      const version = await this.repository.nextVersionNumber(
        auth.organizationId,
        documentId,
        tx,
      );

      await this.repository.insertFile(
        {
          id: fileId,
          organizationId: auth.organizationId,
          bucket: this.storage.bucket,
          objectKey,
          filename: input.filename,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          checksumSha256: input.checksumSha256 ?? null,
          uploadedBy: auth.userId,
        },
        tx,
      );

      await this.repository.insertVersion(
        {
          organizationId: auth.organizationId,
          documentId,
          fileId,
          version,
          note: input.note ?? `Version ${version}.`,
          createdBy: auth.userId,
        },
        tx,
      );

      const next = await this.repository.updateDocument(
        auth.organizationId,
        documentId,
        {
          fileId,
          filename: input.filename,
          type: documentType,
          sizeMb: bytesToSizeMb(input.sizeBytes),
          status: "uploaded",
          currentVersion: version,
          failureReason: null,
        },
        tx,
      );
      if (!next) throw new DocumentNotFoundError();

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          actorId: auth.userId,
          action: DOCUMENT_AUDIT_ACTIONS.VERSION_ADDED,
          entityType: "document",
          entityId: documentId,
          previousValue: { version: document.currentVersion, fileId: document.fileId },
          newValue: { version, fileId },
        },
        tx,
      );

      return { document: next, version };
    });

    const ttl = this.config.get("UPLOAD_URL_TTL_SECONDS", { infer: true });
    const uploadUrl = await this.storage.presignPut({
      objectKey,
      mimeType: input.mimeType,
      expiresInSeconds: ttl,
    });

    return {
      documentId,
      fileId,
      version: result.version,
      uploadUrl,
      objectKey,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
      document: serialize(result.document),
    };
  }

  // --- shared guards -------------------------------------------------------

  private validateUpload(mimeType: string, sizeBytes: number) {
    const documentType = documentTypeForMime(mimeType);
    if (!documentType) throw new UnsupportedDocumentTypeError(mimeType);

    const maxBytes = this.config.get("UPLOAD_MAX_BYTES", { infer: true });
    if (sizeBytes > maxBytes) throw new DocumentTooLargeError(sizeBytes, maxBytes);

    return documentType;
  }

  /**
   * Storage is optional in development, so every endpoint that needs it says
   * so explicitly rather than failing deep inside the SDK with a message about
   * credentials.
   */
  private assertStorageConfigured(): void {
    if (!this.config.get("STORAGE_ENDPOINT", { infer: true })) {
      throw new StorageNotConfiguredError();
    }
  }

  private async requireRfp(auth: AuthContext, rfpId: string): Promise<void> {
    if (!(await this.repository.rfpExists(auth.organizationId, rfpId))) {
      throw new RfpNotFoundError();
    }
  }

  /**
   * Loads a document and checks it belongs to the RFP named in the route.
   *
   * A mismatched pair must not resolve: otherwise a caller could read any
   * document in their tenant through any RFP they can see, and the route's
   * scoping would be decorative.
   */
  private async requireDocument(
    auth: AuthContext,
    rfpId: string,
    documentId: string,
  ): Promise<DocumentRow> {
    const document = await this.repository.findById(auth.organizationId, documentId);
    if (!document || document.rfpId !== rfpId) throw new DocumentNotFoundError();
    return document;
  }

  private async requireDocumentWithFile(auth: AuthContext, rfpId: string, documentId: string) {
    const row = await this.repository.findWithFile(auth.organizationId, documentId);
    if (!row || row.document.rfpId !== rfpId) throw new DocumentNotFoundError();
    return row;
  }

  /** ABAC after RBAC, matching RfpService.assertPolicyAllows. */
  private async assertPolicyAllows(
    auth: AuthContext,
    action: string,
    document: DocumentRow,
  ): Promise<void> {
    const decision = await this.policy.evaluate(auth, "document", action, {
      documentId: document.id,
      rfpId: document.rfpId,
      uploadedBy: document.uploadedBy,
      status: document.status,
      archived: document.archivedAt !== null,
    });
    if (!decision.allowed) {
      throw new ForbiddenException({
        code: "DOCUMENT_ACCESS_DENIED",
        message: decision.reason ?? "You do not have access to this document.",
      });
    }
  }
}

function serialize(document: DocumentRow, uploadedByName?: string | null) {
  return {
    id: document.id,
    organizationId: document.organizationId,
    rfpId: document.rfpId,
    filename: document.filename,
    type: document.type,
    sizeMb: Number(document.sizeMb),
    status: document.status,
    fileId: document.fileId,
    currentVersion: document.currentVersion,
    pageCount: document.pageCount,
    failureReason: document.failureReason,
    uploadedBy: document.uploadedBy,
    ...(uploadedByName !== undefined ? { uploadedByName } : {}),
    archivedAt: document.archivedAt,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}
