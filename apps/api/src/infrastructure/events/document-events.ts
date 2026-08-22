import type { DomainEventEnvelope } from "./domain-events";

/**
 * Document lifecycle events.
 *
 * A separate file per domain, mirroring the split in packages/db/src/schema:
 * a reader working on documents should not have to scroll past the RFP
 * contracts, and the union in domain-events.ts stays the one place the whole
 * event surface is visible.
 */

export const DOCUMENT_EVENTS = {
  UPLOADED: "DOCUMENT_UPLOADED",
  PARSED: "DOCUMENT_PARSED",
  PARSE_FAILED: "DOCUMENT_PARSE_FAILED",
  ARCHIVED: "DOCUMENT_ARCHIVED",
} as const;

export type DocumentEventName = (typeof DOCUMENT_EVENTS)[keyof typeof DOCUMENT_EVENTS];

/**
 * Emitted once the bytes are known to exist in object storage — never at
 * upload-intent, which only reserves a row and a URL. A consumer that queued
 * parsing off the intent would be parsing an object that may never arrive.
 */
export type DocumentUploadedEvent = DomainEventEnvelope<
  typeof DOCUMENT_EVENTS.UPLOADED,
  {
    documentId: string;
    rfpId: string;
    fileId: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    version: number;
  }
>;

export type DocumentParsedEvent = DomainEventEnvelope<
  typeof DOCUMENT_EVENTS.PARSED,
  { documentId: string; rfpId: string; version: number; pageCount: number | null }
>;

export type DocumentParseFailedEvent = DomainEventEnvelope<
  typeof DOCUMENT_EVENTS.PARSE_FAILED,
  { documentId: string; rfpId: string; version: number; reason: string }
>;

export type DocumentArchivedEvent = DomainEventEnvelope<
  typeof DOCUMENT_EVENTS.ARCHIVED,
  { documentId: string; rfpId: string }
>;

export type DocumentDomainEvent =
  | DocumentUploadedEvent
  | DocumentParsedEvent
  | DocumentParseFailedEvent
  | DocumentArchivedEvent;
