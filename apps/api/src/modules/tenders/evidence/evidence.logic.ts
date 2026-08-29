import {
  type EvidenceAuthority,
  type EvidenceFreshness,
  type EvidenceReference,
  type EvidenceRetrievalResult,
  type EvidenceType,
  clampEvidenceScore,
  evidenceConfidenceFromScores,
} from "@rfp-os/types";

const AUTHORITY_SCORE: Record<EvidenceAuthority, number> = {
  CONTRACT: 1,
  APPROVED_POLICY: 0.95,
  PRODUCT_DOCUMENTATION: 0.85,
  ARCHITECTURE: 0.8,
  COMMERCIAL_POLICY: 0.75,
  HISTORICAL_RFP: 0.45,
  ARCHIVED: 0.2,
  UNKNOWN: 0.35,
};

export interface FreshnessInput {
  verifiedAt?: string | Date | null;
  expiresAt?: string | Date | null;
  updatedAt?: string | Date | null;
  now?: Date;
}

export interface AuthorityInput {
  authority?: string | null;
  type?: string | null;
  category?: string | null;
  name?: string | null;
  summary?: string | null;
  status?: string | null;
}

export function normalizeEvidenceType(value: string): EvidenceType {
  const normalized = value.trim().toUpperCase();
  if (normalized === "TENDER_SOURCE") return "SOURCE";
  if (normalized === "TENDER_DOCUMENT") return "DOCUMENT";
  if (normalized === "KNOWLEDGE_SOURCE") return "KNOWLEDGE";
  if (normalized === "MANUAL_NOTE") return "RECORD";
  if (normalized === "URL" || normalized === "DOCUMENT" || normalized === "KNOWLEDGE" || normalized === "SOURCE" || normalized === "RECORD") {
    return normalized;
  }
  return "RECORD";
}

export function classifyEvidenceAuthority(input: AuthorityInput): EvidenceAuthority {
  const haystack = [input.authority, input.type, input.category, input.name, input.summary, input.status]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (input.authority === "high") return "APPROVED_POLICY";
  if (input.authority === "medium") return "PRODUCT_DOCUMENTATION";
  if (input.authority === "low") return "HISTORICAL_RFP";
  if (haystack.includes("contract")) return "CONTRACT";
  if (haystack.includes("archiv")) return "ARCHIVED";
  if (haystack.includes("sla") || haystack.includes("architecture")) return "ARCHITECTURE";
  if (haystack.includes("policy") && haystack.includes("commercial")) return "COMMERCIAL_POLICY";
  if (haystack.includes("policy")) return "APPROVED_POLICY";
  if (haystack.includes("playbook") || haystack.includes("pricing") || haystack.includes("commercial")) return "COMMERCIAL_POLICY";
  if (haystack.includes("report") || haystack.includes("questionnaire") || haystack.includes("rfp")) return "HISTORICAL_RFP";
  if (haystack.includes("product") || haystack.includes("manual") || haystack.includes("guide")) return "PRODUCT_DOCUMENTATION";
  return "UNKNOWN";
}

export function scoreAuthority(authority: EvidenceAuthority): number {
  return AUTHORITY_SCORE[authority] ?? AUTHORITY_SCORE.UNKNOWN;
}

export function classifyEvidenceFreshness(input: FreshnessInput): EvidenceFreshness {
  const now = input.now ?? new Date();
  const expiresAt = toDate(input.expiresAt);
  const verifiedAt = toDate(input.verifiedAt);
  const updatedAt = toDate(input.updatedAt);

  if (!verifiedAt && !expiresAt && !updatedAt) return "UNKNOWN";
  if (expiresAt && expiresAt.getTime() < now.getTime()) return "EXPIRED";

  const referenceDate = verifiedAt ?? updatedAt ?? expiresAt;
  if (!referenceDate) return "UNKNOWN";

  const ageDays = (now.getTime() - referenceDate.getTime()) / 86_400_000;
  if (ageDays <= 90) return "FRESH";
  if (ageDays <= 180) return "AGING";
  if (ageDays <= 365) return "STALE";
  return "STALE";
}

export function scoreFreshness(freshness: EvidenceFreshness): number {
  switch (freshness) {
    case "FRESH":
      return 1;
    case "AGING":
      return 0.75;
    case "STALE":
      return 0.35;
    case "EXPIRED":
      return 0;
    case "UNKNOWN":
    default:
      return 0.2;
  }
}

export function scoreRelevance(query: string, candidateText: string): number {
  const queryTokens = tokenize(query);
  const candidateTokens = tokenize(candidateText);
  if (queryTokens.length === 0 || candidateTokens.length === 0) return 0;
  const overlap = queryTokens.filter((token) => candidateTokens.includes(token));
  const overlapRatio = overlap.length / Math.max(queryTokens.length, 1);
  const phraseMatch = candidateText.toLowerCase().includes(query.trim().toLowerCase()) ? 1 : 0;
  return clampEvidenceScore(0.15 + overlapRatio * 0.7 + phraseMatch * 0.15);
}

export function scoreCandidate(candidate: EvidenceRetrievalResult): number {
  return clampEvidenceScore(
    candidate.relevanceScore * 0.5 + candidate.authorityScore * 0.3 + candidate.freshnessScore * 0.2,
  );
}

export function rankEvidenceCandidates(candidates: EvidenceRetrievalResult[]): EvidenceRetrievalResult[] {
  return [...candidates].sort((a, b) => {
    const scoreA = scoreCandidate(a);
    const scoreB = scoreCandidate(b);
    if (scoreA !== scoreB) return scoreB - scoreA;
    if (a.authorityScore !== b.authorityScore) return b.authorityScore - a.authorityScore;
    if (a.freshnessScore !== b.freshnessScore) return b.freshnessScore - a.freshnessScore;
    if (a.relevanceScore !== b.relevanceScore) return b.relevanceScore - a.relevanceScore;
    if (a.title !== b.title) return a.title.localeCompare(b.title);
    if (a.sourceId !== b.sourceId) return a.sourceId.localeCompare(b.sourceId);
    return a.evidenceId.localeCompare(b.evidenceId);
  });
}

export function selectEvidenceCandidates(
  candidates: EvidenceRetrievalResult[],
  options: { limit?: number; minFinalScore?: number; includeStale?: boolean } = {},
): EvidenceRetrievalResult[] {
  const minFinalScore = options.minFinalScore ?? 0.55;
  const limit = options.limit ?? 5;
  const includeStale = options.includeStale ?? false;
  const seen = new Set<string>();
  const selected: EvidenceRetrievalResult[] = [];

  for (const candidate of rankEvidenceCandidates(candidates)) {
    if (!candidate.sourceId || !candidate.evidenceId || !candidate.evidenceType) continue;
    const uniqueKey = [
      candidate.sourceId,
      candidate.sourceVersion ?? "",
      candidate.evidenceType,
      candidate.evidenceId,
    ].join(":");
    if (seen.has(uniqueKey)) continue;
    seen.add(uniqueKey);
    if (candidate.freshness === "EXPIRED") continue;
    if (!includeStale && candidate.freshness === "STALE") continue;
    if (scoreCandidate(candidate) < minFinalScore) continue;
    selected.push(candidate);
    if (selected.length >= limit) break;
  }

  return selected;
}

export function toEvidenceReference(answerId: string, candidate: EvidenceRetrievalResult): EvidenceReference {
  const relevance = clampEvidenceScore(candidate.relevanceScore);
  const authority = clampEvidenceScore(candidate.authorityScore);
  const freshness = clampEvidenceScore(candidate.freshnessScore);
  return {
    answerId,
    sourceId: candidate.sourceId,
    sourceVersion: candidate.sourceVersion,
    evidenceType: candidate.evidenceType,
    evidenceId: candidate.evidenceId,
    relevance,
    confidence: evidenceConfidenceFromScores(relevance, authority, freshness),
    freshness: candidate.freshness,
    verifiedAt: candidate.verifiedAt,
    metadata: candidate.metadata,
    createdAt: null,
  };
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}
