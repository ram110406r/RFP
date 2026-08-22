import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";

import { ACCEPTED_MIME_TYPES } from "./document-type";

/**
 * Document domain errors, following the same rule as rfp.errors.ts: a document
 * in another organization is reported as NOT FOUND, never forbidden, so status
 * codes cannot be used to enumerate another tenant's document ids.
 */

export class DocumentNotFoundError extends NotFoundException {
  constructor() {
    super({ code: "DOCUMENT_NOT_FOUND", message: "No document with that id." });
  }
}

export class UnsupportedDocumentTypeError extends BadRequestException {
  constructor(mimeType: string) {
    super({
      code: "UNSUPPORTED_DOCUMENT_TYPE",
      message: `${mimeType} is not an accepted document type.`,
      accepted: ACCEPTED_MIME_TYPES,
    });
  }
}

export class DocumentTooLargeError extends BadRequestException {
  constructor(sizeBytes: number, maxBytes: number) {
    super({
      code: "DOCUMENT_TOO_LARGE",
      message: `That file is ${formatMb(sizeBytes)} MB; the limit is ${formatMb(maxBytes)} MB.`,
      sizeBytes,
      maxBytes,
    });
  }
}

/**
 * The client called `complete` but the object is not in storage. Usually the
 * PUT failed or the presigned URL expired before it ran; either way the right
 * move is to request a new intent rather than retry the completion.
 */
export class DocumentUploadNotFoundError extends ConflictException {
  constructor() {
    super({
      code: "DOCUMENT_UPLOAD_INCOMPLETE",
      message: "No uploaded object found for that document. Start a new upload.",
    });
  }
}

/**
 * The stored object's size contradicts what the intent declared. Treated as an
 * error rather than silently corrected: the declared size is what passed the
 * limit check, so accepting a larger object would make that check bypassable.
 */
export class DocumentSizeMismatchError extends BadRequestException {
  constructor(declaredBytes: number, actualBytes: number) {
    super({
      code: "DOCUMENT_SIZE_MISMATCH",
      message: `The uploaded object is ${actualBytes} bytes; the upload declared ${declaredBytes}.`,
      declaredBytes,
      actualBytes,
    });
  }
}

export class DocumentAlreadyArchivedError extends ConflictException {
  constructor() {
    super({ code: "DOCUMENT_ALREADY_ARCHIVED", message: "That document is already archived." });
  }
}

export class ArchivedDocumentNotEditableError extends ConflictException {
  constructor() {
    super({
      code: "DOCUMENT_ARCHIVED",
      message: "That document is archived and cannot be modified.",
    });
  }
}

/**
 * Raised when no object storage is configured. A 503 rather than a 500: the
 * request is well-formed and will work once the deployment is complete, which
 * is what distinguishes "not wired up yet" from "this broke".
 */
export class StorageNotConfiguredError extends ServiceUnavailableException {
  constructor() {
    super({
      code: "STORAGE_NOT_CONFIGURED",
      message: "Document storage is not configured on this environment.",
    });
  }
}

function formatMb(bytes: number): string {
  return (bytes / 1_048_576).toFixed(1);
}
