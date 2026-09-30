/**
 * CHUNK is a passage of an uploaded knowledge document; DOCUMENT_PAGE is a
 * page of the tender's own parsed documents (context, not proof).
 */
export const EVIDENCE_TYPES = ["DOCUMENT", "KNOWLEDGE", "SOURCE", "URL", "RECORD", "CHUNK", "DOCUMENT_PAGE"] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const EVIDENCE_AUTHORITIES = [
  "CONTRACT",
  "APPROVED_POLICY",
  "PRODUCT_DOCUMENTATION",
  "ARCHITECTURE",
  "COMMERCIAL_POLICY",
  "HISTORICAL_RFP",
  "ARCHIVED",
  "UNKNOWN",
] as const;
export type EvidenceAuthority = (typeof EVIDENCE_AUTHORITIES)[number];

export const EVIDENCE_FRESHNESS = ["FRESH", "AGING", "STALE", "EXPIRED", "UNKNOWN"] as const;
export type EvidenceFreshness = (typeof EVIDENCE_FRESHNESS)[number];

export interface EvidenceSourceReference {
  id: string;
  type?: string | null;
  title?: string | null;
  version?: string | null;
  ownerId?: string | null;
  authority?: EvidenceAuthority | null;
  verifiedAt?: string | null;
  expiresAt?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown>;
}

export interface EvidenceReference {
  answerId: string;
  sourceId: string | null;
  sourceVersion: string | null;
  evidenceType: EvidenceType;
  evidenceId: string;
  relevance: number;
  confidence: number;
  freshness: EvidenceFreshness;
  verifiedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string | null;
}

export interface EvidenceRetrievalResult {
  sourceId: string;
  sourceVersion: string | null;
  evidenceId: string;
  evidenceType: EvidenceType;
  title: string;
  snippet: string;
  relevanceScore: number;
  authorityScore: number;
  freshnessScore: number;
  freshness: EvidenceFreshness;
  authority: EvidenceAuthority;
  verifiedAt: string | null;
  expiresAt: string | null;
  ownerId: string | null;
  metadata: Record<string, unknown>;
}

export interface EvidenceSelectionOptions {
  limit?: number;
  minFinalScore?: number;
  includeStale?: boolean;
}

export interface EvidenceSelection {
  results: EvidenceRetrievalResult[];
  selected: EvidenceReference[];
}

export function clampEvidenceScore(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function evidenceConfidenceFromScores(relevance: number, authority: number, freshness: number): number {
  return clampEvidenceScore(relevance * 0.5 + authority * 0.3 + freshness * 0.2);
}

