/**
 * Knowledge Brain background work.
 *
 * INGEST → EMBED → EXTRACT_CLAIMS → DETECT_CONFLICTS is the document path;
 * each step enqueues the next, so a failure stops the chain at a visible
 * document status rather than half-running later steps on missing input.
 * LIFECYCLE_SWEEP runs on a schedule and is what keeps knowledge from going
 * quietly stale: it recomputes review state, notifies owners, flags answers
 * whose citations changed underneath them, and re-embeds chunks whose model
 * is no longer the configured one.
 */
export const KNOWLEDGE_JOBS = {
  INGEST: "knowledge.ingest",
  EMBED: "knowledge.embed",
  EXTRACT_CLAIMS: "knowledge.extract-claims",
  DETECT_CONFLICTS: "knowledge.detect-conflicts",
  LIFECYCLE_SWEEP: "knowledge.lifecycle-sweep",
} as const;

export type KnowledgeJobName = (typeof KNOWLEDGE_JOBS)[keyof typeof KNOWLEDGE_JOBS];

export interface KnowledgeDocumentJobPayload {
  organizationId: string;
  sourceId: string;
  documentId: string;
  fileId: string;
  version: number;
  objectKey: string;
  mimeType: string;
  actorId: string | null;
}

export interface KnowledgeConflictJobPayload {
  organizationId: string;
  sourceId: string;
  /** Claims to check; empty means every ACTIVE claim of the source. */
  claimIds: string[];
}

export interface KnowledgeLifecycleSweepPayload {
  /** ISO timestamp of the scheduling window, for the idempotent job id. */
  windowStartedAt: string;
  /** Limit to one org; absent sweeps every org. */
  organizationId?: string;
}

export type KnowledgeJobPayload =
  | KnowledgeDocumentJobPayload
  | KnowledgeConflictJobPayload
  | KnowledgeLifecycleSweepPayload;

/** One job per document version and step, so a double-complete queues nothing new. */
export function knowledgeDocumentJobId(name: KnowledgeJobName, documentId: string, version: number): string {
  return `${name}:${documentId}:v${version}`;
}

/** Keyed on the claim set so repeated triggers for the same change collapse. */
export function knowledgeConflictJobId(sourceId: string, claimIds: string[]): string {
  const suffix = claimIds.length === 0 ? "all" : [...claimIds].sort().join(",").slice(0, 400);
  return `${KNOWLEDGE_JOBS.DETECT_CONFLICTS}:${sourceId}:${suffix}`;
}

export function knowledgeLifecycleSweepJobId(windowStartedAt: string, organizationId?: string): string {
  return `${KNOWLEDGE_JOBS.LIFECYCLE_SWEEP}:${organizationId ?? "all"}:${windowStartedAt}`;
}
