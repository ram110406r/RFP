/**
 * The single definition of when knowledge needs attention.
 *
 * Before this lived in four places (web, knowledge API, dashboard, evidence
 * scoring) with slightly different rules — archived rows counted as stale in
 * one, unverified rows counted as healthy in another — so the overview, the
 * issue queue and drafting disagreed about the same source. Everything that
 * classifies a knowledge source now calls this.
 */

export const KNOWLEDGE_STALE_AFTER_DAYS = 180;
export const KNOWLEDGE_EXPIRING_WITHIN_DAYS = 30;

const DAY_MS = 86_400_000;

export type KnowledgeLifecycleStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

/**
 * Only meaningful for ACTIVE sources: a draft is awaiting approval and an
 * archived source is out of circulation, so neither has a review state.
 * `unverified` is an ACTIVE source nobody has ever verified — it is surfaced,
 * not silently treated as healthy.
 */
export type KnowledgeReviewState = "fresh" | "stale" | "expiring" | "expired" | "unverified";

export interface KnowledgeFreshnessInput {
  status: string;
  lastVerified: string | Date | null | undefined;
  expiresAt: string | Date | null | undefined;
}

export function classifyKnowledgeReviewState(
  source: KnowledgeFreshnessInput,
  now: Date = new Date(),
): KnowledgeReviewState | null {
  if (source.status !== "ACTIVE") return null;
  const expiresAt = toDate(source.expiresAt);
  if (expiresAt && expiresAt.getTime() < startOfDay(now).getTime()) return "expired";
  const lastVerified = toDate(source.lastVerified);
  if (!lastVerified) return "unverified";
  if (daysBetween(lastVerified, now) > KNOWLEDGE_STALE_AFTER_DAYS) return "stale";
  if (expiresAt && daysBetween(now, expiresAt) <= KNOWLEDGE_EXPIRING_WITHIN_DAYS) return "expiring";
  return "fresh";
}

export function knowledgeNeedsAttention(state: KnowledgeReviewState | null): boolean {
  return state !== null && state !== "fresh";
}

/** Whole days until `expiresAt`; negative once expired, null when unset. */
export function daysUntilKnowledgeExpiry(expiresAt: string | Date | null | undefined, now: Date = new Date()): number | null {
  const date = toDate(expiresAt);
  if (!date) return null;
  return Math.ceil((date.getTime() - startOfDay(now).getTime()) / DAY_MS);
}

/** ISO date (YYYY-MM-DD) `days` before `now`, for SQL comparisons against date columns. */
export function knowledgeStaleCutoffIso(now: Date = new Date()): string {
  return new Date(now.getTime() - KNOWLEDGE_STALE_AFTER_DAYS * DAY_MS).toISOString().slice(0, 10);
}

export function knowledgeExpiringCutoffIso(now: Date = new Date()): string {
  return new Date(now.getTime() + KNOWLEDGE_EXPIRING_WITHIN_DAYS * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
