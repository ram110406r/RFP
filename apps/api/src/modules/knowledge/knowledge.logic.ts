import type { knowledgeClaims, knowledgeSources } from "@rfp-os/db";
import {
  classifyKnowledgeReviewState,
  daysUntilKnowledgeExpiry,
  KNOWLEDGE_EXPIRING_WITHIN_DAYS,
  KNOWLEDGE_STALE_AFTER_DAYS,
  type KnowledgeReviewState,
} from "@rfp-os/types";

import type { KnowledgeIssueType, UpdateKnowledgeInput } from "./knowledge.dto";

/*
 * Pure knowledge rules, kept out of the service so they are testable without
 * a database: what a source serializes to, which issues it raises, how an
 * edit splits into immediate metadata and a reviewable content revision, and
 * how incoming claims map onto existing ones without recycling ids.
 */

export type KnowledgeRow = typeof knowledgeSources.$inferSelect;
export type ClaimRow = typeof knowledgeClaims.$inferSelect;

export interface IncomingClaim {
  id?: string;
  label: string;
  value: string;
  confidence?: number;
}

export function serializeKnowledgeSource(row: KnowledgeRow, now: Date = new Date()) {
  const reviewState = classifyKnowledgeReviewState(
    { status: row.lifecycleStatus, lastVerified: row.lastVerified, expiresAt: row.expiresAt },
    now,
  );
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    type: row.type,
    category: row.category,
    version: row.version,
    authority: row.authority,
    status: row.lifecycleStatus,
    // Computed at read time from the shared rule, so a sweep that has not run
    // yet never shows a stale answer; the stored column drives notifications.
    reviewState,
    daysUntilExpiry: daysUntilKnowledgeExpiry(row.expiresAt, now),
    ownerId: row.ownerId,
    lastVerified: row.lastVerified,
    lastUpdated: row.lastUpdated,
    expiresAt: row.expiresAt,
    summary: row.summary,
    metadata: row.metadata,
    usageCount: row.usageCount,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type SerializedKnowledgeSource = ReturnType<typeof serializeKnowledgeSource>;

export function serializeClaim(claim: ClaimRow) {
  return {
    id: claim.id,
    label: claim.label,
    value: claim.value,
    confidence: Number(claim.confidence),
    status: claim.status,
    origin: claim.origin,
    documentId: claim.documentId,
    chunkId: claim.chunkId,
    updatedAt: claim.updatedAt,
  };
}

export interface LifecycleIssue {
  id: string;
  type: Exclude<KnowledgeIssueType, "CONFLICT">;
  status: "OPEN";
  title: string;
  detail: string;
  recommendedAction: string;
  source: SerializedKnowledgeSource;
  createdAt: Date;
}

/**
 * Issues a source raises right now. Archived sources raise none — they are
 * out of circulation, and an "expired" issue on one could never be resolved
 * (archiving it again is a no-op).
 */
export function lifecycleIssuesForSource(
  source: SerializedKnowledgeSource,
  options: { pendingRevisionId?: string | null; pendingRevisionAt?: Date | null } = {},
): LifecycleIssue[] {
  if (source.status === "ARCHIVED") return [];
  const issues: LifecycleIssue[] = [];
  const base = { status: "OPEN" as const, source };
  if (source.status === "DRAFT") {
    issues.push({
      ...base,
      id: `source:${source.id}:DRAFT`,
      type: "DRAFT",
      title: "Draft source needs approval",
      detail: `${source.name} is not used in tender answers until it is approved.`,
      recommendedAction: "Review the content and approve it.",
      createdAt: source.updatedAt,
    });
  }
  if (options.pendingRevisionId) {
    issues.push({
      ...base,
      id: `revision:${options.pendingRevisionId}:REVISION`,
      type: "REVISION",
      title: "Edit waiting for review",
      detail: `A content change to ${source.name} is pending. The approved version keeps serving tenders meanwhile.`,
      recommendedAction: "Apply or reject the pending revision.",
      createdAt: options.pendingRevisionAt ?? source.updatedAt,
    });
  }
  const state = source.reviewState as KnowledgeReviewState | null;
  if (state === "unverified") {
    issues.push({
      ...base,
      id: `source:${source.id}:UNVERIFIED`,
      type: "UNVERIFIED",
      title: "Source has never been verified",
      detail: `${source.name} is live but nobody has confirmed it is accurate.`,
      recommendedAction: "Verify the source with its owner.",
      createdAt: source.updatedAt,
    });
  } else if (state === "stale") {
    issues.push({
      ...base,
      id: `source:${source.id}:STALE`,
      type: "STALE",
      title: "Source verification is stale",
      detail: `${source.name} was last verified more than ${KNOWLEDGE_STALE_AFTER_DAYS} days ago and is skipped when drafting answers.`,
      recommendedAction: "Verify the source or archive it.",
      createdAt: source.updatedAt,
    });
  } else if (state === "expired") {
    issues.push({
      ...base,
      id: `source:${source.id}:EXPIRED`,
      type: "EXPIRED",
      title: "Source has expired",
      detail: `${source.name} passed its expiration date and is skipped when drafting answers.`,
      recommendedAction: "Verify with a new expiration date or archive it.",
      createdAt: source.updatedAt,
    });
  } else if (state === "expiring") {
    issues.push({
      ...base,
      id: `source:${source.id}:EXPIRING_SOON`,
      type: "EXPIRING_SOON",
      title: "Source expires soon",
      detail: `${source.name} expires within ${KNOWLEDGE_EXPIRING_WITHIN_DAYS} days.`,
      recommendedAction: "Schedule owner verification.",
      createdAt: source.updatedAt,
    });
  }
  return issues;
}

/** Fields whose change alters what tender answers would say. */
const CONTENT_FIELDS = ["name", "type", "summary", "authority", "claims", "version"] as const;
type ContentField = (typeof CONTENT_FIELDS)[number];

export interface SplitUpdate {
  content: Partial<Pick<UpdateKnowledgeInput, ContentField>>;
  metadata: Omit<UpdateKnowledgeInput, ContentField>;
}

/**
 * An edit to an ACTIVE source splits in two: metadata (owner, category,
 * expiry, verification date, source kind) applies at once, while content is
 * held as a revision so the approved wording keeps serving tenders until the
 * change is reviewed. Unchanged content fields are dropped so saving a form
 * without touching the summary does not open a revision.
 */
export function splitKnowledgeUpdate(
  existing: KnowledgeRow,
  existingClaims: ClaimRow[],
  input: UpdateKnowledgeInput,
): SplitUpdate {
  const content: SplitUpdate["content"] = {};
  const metadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if ((CONTENT_FIELDS as readonly string[]).includes(key)) continue;
    metadata[key] = value;
  }
  if (input.name !== undefined && input.name !== existing.name) content.name = input.name;
  if (input.type !== undefined && input.type !== existing.type) content.type = input.type;
  if (input.summary !== undefined && input.summary !== existing.summary) content.summary = input.summary;
  if (input.authority !== undefined && input.authority !== existing.authority) content.authority = input.authority;
  if (input.version !== undefined && input.version !== existing.version) content.version = input.version;
  if (input.claims !== undefined && claimsDiffer(existingClaims.filter((claim) => claim.status === "ACTIVE"), input.claims)) {
    content.claims = input.claims;
  }
  return { content, metadata: metadata as SplitUpdate["metadata"] };
}

export function hasContentChanges(content: SplitUpdate["content"]): boolean {
  return Object.keys(content).length > 0;
}

function claimsDiffer(existing: ClaimRow[], incoming: IncomingClaim[]): boolean {
  if (existing.length !== incoming.length) return true;
  const byId = new Map(existing.map((claim) => [claim.id, claim]));
  return incoming.some((claim) => {
    const match = claim.id ? byId.get(claim.id) : undefined;
    if (!match) return true;
    return (
      match.label !== claim.label ||
      match.value !== claim.value ||
      (claim.confidence !== undefined && Math.abs(Number(match.confidence) - claim.confidence) > 0.0005)
    );
  });
}

export interface ClaimPlan {
  updates: Array<{ id: string; label: string; value: string; confidence: number }>;
  inserts: Array<{ label: string; value: string; confidence: number }>;
  /** Existing ACTIVE claims absent from the incoming list: soft-deleted, never removed. */
  rejectIds: string[];
}

/**
 * Maps an incoming claim list onto the source's current ACTIVE claims.
 * Matching is by id first, then by exact label — so a client that re-sends
 * claims without ids (older forms) still updates in place instead of
 * rotating every id and orphaning the tender citations that point at them.
 */
export function planClaimChanges(existing: ClaimRow[], incoming: IncomingClaim[]): ClaimPlan {
  const active = existing.filter((claim) => claim.status === "ACTIVE");
  const byId = new Map(active.map((claim) => [claim.id, claim]));
  const byLabel = new Map(active.map((claim) => [claim.label.trim().toLowerCase(), claim]));
  const used = new Set<string>();
  const plan: ClaimPlan = { updates: [], inserts: [], rejectIds: [] };

  for (const claim of incoming) {
    const confidence = clampConfidence(claim.confidence ?? 0.5);
    const match =
      (claim.id ? byId.get(claim.id) : undefined) ?? byLabel.get(claim.label.trim().toLowerCase());
    if (match && !used.has(match.id)) {
      used.add(match.id);
      plan.updates.push({ id: match.id, label: claim.label, value: claim.value, confidence });
    } else {
      plan.inserts.push({ label: claim.label, value: claim.value, confidence });
    }
  }
  for (const claim of active) {
    if (!used.has(claim.id)) plan.rejectIds.push(claim.id);
  }
  return plan;
}

/** What a knowledge version records, so history can show what a source said. */
export function buildKnowledgeSnapshot(row: KnowledgeRow, claims: ClaimRow[]) {
  return {
    name: row.name,
    type: row.type,
    category: row.category,
    authority: row.authority,
    summary: row.summary,
    expiresAt: row.expiresAt,
    claims: claims
      .filter((claim) => claim.status === "ACTIVE")
      .map((claim) => ({ id: claim.id, label: claim.label, value: claim.value, confidence: Number(claim.confidence) })),
  };
}

export function bumpVersion(version: string): string {
  const parts = version.split(".").map((part) => Number(part));
  if (parts.length === 2 && parts.every((part) => Number.isFinite(part))) {
    const [major, minor] = parts;
    return `${major}.${(minor ?? 0) + 1}`;
  }
  return `${version}.1`;
}

export function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function stringifyConfidence(value: number): string {
  return clampConfidence(value).toFixed(3);
}

export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | undefined | null): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/**
 * Issue ids are `<kind>:<uuid>[:<TYPE>]`. Returns null for anything else so a
 * malformed id is a 400, not a Postgres cast error surfacing as a 500.
 */
export function parseIssueId(issueId: string): { kind: "source" | "conflict" | "revision"; id: string } | null {
  const [kind, id] = issueId.split(":");
  if ((kind === "source" || kind === "conflict" || kind === "revision") && isUuid(id)) return { kind, id };
  return null;
}
