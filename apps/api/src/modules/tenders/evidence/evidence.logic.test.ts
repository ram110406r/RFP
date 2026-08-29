import { describe, expect, test } from "bun:test";

import { type EvidenceRetrievalResult } from "@rfp-os/types";

import {
  classifyEvidenceAuthority,
  classifyEvidenceFreshness,
  normalizeEvidenceType,
  rankEvidenceCandidates,
  scoreFreshness,
  scoreRelevance,
  selectEvidenceCandidates,
  toEvidenceReference,
} from "./evidence.logic";

describe("evidence logic", () => {
  test("normalizes legacy evidence types", () => {
    expect(normalizeEvidenceType("tender_source")).toBe("SOURCE");
    expect(normalizeEvidenceType("knowledge_source")).toBe("KNOWLEDGE");
    expect(normalizeEvidenceType("manual_note")).toBe("RECORD");
  });

  test("keeps explicit low authority below policy-name heuristics", () => {
    expect(
      classifyEvidenceAuthority({
        authority: "low",
        type: "Policy",
        category: "Architecture",
        name: "Zebra maintenance memo",
        summary: "General operational memo without any checksum commitments.",
      }),
    ).toBe("HISTORICAL_RFP");
  });

  test("classifies freshness from timestamps", () => {
    expect(classifyEvidenceFreshness({ verifiedAt: "2026-08-20T00:00:00.000Z", now: new Date("2026-08-26T00:00:00.000Z") })).toBe("FRESH");
    expect(classifyEvidenceFreshness({ updatedAt: "2026-05-01T00:00:00.000Z", now: new Date("2026-08-26T00:00:00.000Z") })).toBe("AGING");
    expect(classifyEvidenceFreshness({ updatedAt: "2025-09-01T00:00:00.000Z", now: new Date("2026-08-26T00:00:00.000Z") })).toBe("STALE");
    expect(classifyEvidenceFreshness({ expiresAt: "2026-08-01T00:00:00.000Z", now: new Date("2026-08-26T00:00:00.000Z") })).toBe("EXPIRED");
    expect(classifyEvidenceFreshness({})).toBe("UNKNOWN");
  });

  test("ranks higher authority and freshness ahead of weaker evidence", () => {
    const candidates: EvidenceRetrievalResult[] = [
      buildCandidate({
        evidenceId: "low",
        title: "Low authority",
        relevanceScore: 0.9,
        authorityScore: 0.2,
        freshnessScore: 0.2,
      }),
      buildCandidate({
        evidenceId: "high",
        title: "High authority",
        relevanceScore: 0.6,
        authorityScore: 0.95,
        freshnessScore: 1,
      }),
    ];

    expect(rankEvidenceCandidates(candidates).map((candidate) => candidate.evidenceId)).toEqual(["high", "low"]);
  });

  test("selects unique non-expired candidates and preserves deterministic references", () => {
    const candidates: EvidenceRetrievalResult[] = [
      buildCandidate({
        evidenceId: "duplicate-a",
        sourceId: "source-a",
        sourceVersion: "1",
        title: "Duplicate A",
        relevanceScore: 0.9,
        authorityScore: 0.8,
        freshness: "FRESH",
        freshnessScore: 1,
      }),
      buildCandidate({
        evidenceId: "duplicate-a",
        sourceId: "source-a",
        sourceVersion: "1",
        title: "Duplicate A copy",
        relevanceScore: 0.95,
        authorityScore: 0.9,
        freshness: "FRESH",
        freshnessScore: 1,
      }),
      buildCandidate({
        evidenceId: "stale",
        sourceId: "source-b",
        sourceVersion: null,
        title: "Stale evidence",
        relevanceScore: 1,
        authorityScore: 1,
        freshness: "STALE",
        freshnessScore: scoreFreshness("STALE"),
      }),
      buildCandidate({
        evidenceId: "expired",
        sourceId: "source-c",
        sourceVersion: null,
        title: "Expired evidence",
        relevanceScore: 1,
        authorityScore: 1,
        freshness: "EXPIRED",
        freshnessScore: scoreFreshness("EXPIRED"),
      }),
    ];

    const selected = selectEvidenceCandidates(candidates, { limit: 5, minFinalScore: 0.1, includeStale: false });
    expect(selected).toHaveLength(1);
    expect(selected[0]?.evidenceId).toBe("duplicate-a");

    const reference = toEvidenceReference("answer-1", selected[0]!);
    expect(reference.answerId).toBe("answer-1");
    expect(reference.sourceId).toBe("source-a");
    expect(reference.sourceVersion).toBe("1");
    expect(reference.evidenceType).toBe("KNOWLEDGE");
    expect(reference.freshness).toBe("FRESH");
  });

  test("filters out weak evidence below the minimum final score", () => {
    const candidates: EvidenceRetrievalResult[] = [
      buildCandidate({
        evidenceId: "weak",
        sourceId: "source-weak",
        title: "Weak evidence",
        relevanceScore: 0.2,
        authorityScore: 0.2,
        freshnessScore: 0.2,
      }),
      buildCandidate({
        evidenceId: "strong",
        sourceId: "source-strong",
        title: "Strong evidence",
        relevanceScore: 0.9,
        authorityScore: 0.9,
        freshnessScore: 1,
      }),
    ];

    const selected = selectEvidenceCandidates(candidates, { limit: 5, minFinalScore: 0.55, includeStale: false });
    expect(selected.map((candidate) => candidate.evidenceId)).toEqual(["strong"]);
  });

  test("scores relevance from token overlap and phrase matches", () => {
    const score = scoreRelevance("SCIM support", "This policy covers SCIM support for the tenant.");
    expect(score).toBeGreaterThan(0.7);
  });
});

function buildCandidate(overrides: Partial<EvidenceRetrievalResult> & Pick<EvidenceRetrievalResult, "evidenceId" | "title" | "relevanceScore" | "authorityScore" | "freshnessScore">): EvidenceRetrievalResult {
  return {
    sourceId: overrides.sourceId ?? "source-default",
    sourceVersion: overrides.sourceVersion ?? null,
    evidenceId: overrides.evidenceId,
    evidenceType: overrides.evidenceType ?? "KNOWLEDGE",
    title: overrides.title,
    snippet: overrides.snippet ?? "Snippet",
    relevanceScore: overrides.relevanceScore,
    authorityScore: overrides.authorityScore,
    freshnessScore: overrides.freshnessScore,
    freshness: overrides.freshness ?? "FRESH",
    authority: overrides.authority ?? "APPROVED_POLICY",
    verifiedAt: overrides.verifiedAt ?? "2026-08-20T00:00:00.000Z",
    expiresAt: overrides.expiresAt ?? null,
    ownerId: overrides.ownerId ?? "owner-1",
    metadata: overrides.metadata ?? {},
  };
}
