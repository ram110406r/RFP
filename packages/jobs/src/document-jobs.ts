/**
 * Document processing job contracts.
 *
 * These live in a shared package rather than in either app because the API
 * produces them and the worker consumes them: if the two sides each declared
 * their own shape, a payload change would typecheck on both sides and only
 * fail in Redis at runtime, where the failure surfaces as a job that quietly
 * does the wrong thing.
 */

export const DOCUMENT_JOBS = {
  PARSE: "DOCUMENT_PARSE",
  OCR: "DOCUMENT_OCR",
  TABLE_EXTRACTION: "TABLE_EXTRACTION",
  NORMALIZATION: "DOCUMENT_NORMALIZATION",
} as const;

export type DocumentJobName = (typeof DOCUMENT_JOBS)[keyof typeof DOCUMENT_JOBS];

/**
 * What every document job carries.
 *
 * `organizationId` travels on the payload for the same reason it sits on the
 * domain event envelope: the worker runs outside any request context, so a
 * job that did not name its tenant could only discover one by trusting a
 * lookup it has no way to authorize.
 *
 * `objectKey` and `mimeType` are denormalized onto the payload so a processor
 * can fetch and dispatch on the bytes without a second query. They are
 * immutable for a given document version, so there is no staleness risk.
 */
export interface DocumentJobPayload {
  organizationId: string;
  rfpId: string;
  documentId: string;
  fileId: string;
  /** The document version these bytes belong to. Part of the idempotency key. */
  version: number;
  objectKey: string;
  mimeType: string;
  /** Who caused the work. Null for system-initiated reprocessing. */
  actorId: string | null;
}

/**
 * A stable job id, which is what makes enqueueing idempotent: BullMQ ignores
 * an add() whose job id already exists. Keyed by document AND version so
 * uploading a new version re-parses, while a duplicate completeUpload call
 * for the same version does not queue the work twice.
 *
 * Colons are BullMQ's own key separator and the ids are uuids, so no
 * escaping is needed for the segments to stay unambiguous.
 */
export function documentJobId(name: DocumentJobName, documentId: string, version: number): string {
  return `${name}:${documentId}:v${version}`;
}
