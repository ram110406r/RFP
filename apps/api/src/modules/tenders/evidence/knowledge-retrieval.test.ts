import { describe, expect, test } from "bun:test";

import type { EvidenceRetrievalResult } from "@rfp-os/types";

import { selectPromptEvidence } from "../answer-generation/answer-generation.logic";
import { normalizeEvidenceType, reportSkippedEvidence } from "./evidence.logic";
import { buildKeywordQuery, fuseRankings } from "./knowledge-chunk-search";

function candidate(overrides: Partial<EvidenceRetrievalResult>): EvidenceRetrievalResult {
  return {
    sourceId: "s1",
    sourceVersion: "1.0",
    evidenceId: "e1",
    evidenceType: "KNOWLEDGE",
    title: "Source",
    snippet: "",
    relevanceScore: 0.9,
    authorityScore: 0.95,
    freshnessScore: 1,
    freshness: "FRESH",
    authority: "APPROVED_POLICY",
    verifiedAt: null,
    expiresAt: null,
    ownerId: null,
    metadata: {},
    ...overrides,
  };
}

describe("fuseRankings", () => {
  test("rank one in both lists scores 1 and beats a single-list hit", () => {
    const hits = fuseRankings(["a", "b", "c"], ["a", "c"]);
    expect(hits[0]).toMatchObject({ chunkId: "a", keywordRank: 1, vectorRank: 1, score: 1 });
    expect(hits.find((hit) => hit.chunkId === "c")!.score).toBeGreaterThan(hits.find((hit) => hit.chunkId === "b")!.score);
  });

  test("keyword-only search can still reach 1.0", () => {
    expect(fuseRankings(["a", "b"], [])[0]!.score).toBe(1);
  });
});

describe("buildKeywordQuery", () => {
  test("ORs distinctive terms so long requirements still match", () => {
    expect(buildKeywordQuery("Please describe how the platform encrypts data at rest and rotates keys")).toBe(
      "how or platform or encrypts or data or rest or rotates or keys",
    );
  });
});

describe("reportSkippedEvidence", () => {
  test("counts sources dropped only for freshness, once per source", () => {
    const report = reportSkippedEvidence(
      [
        candidate({ sourceId: "stale", evidenceId: "1", freshness: "STALE", freshnessScore: 0.35 }),
        candidate({ sourceId: "stale", evidenceId: "2", freshness: "STALE", freshnessScore: 0.35, evidenceType: "RECORD" }),
        candidate({ sourceId: "expired", evidenceId: "3", freshness: "EXPIRED", freshnessScore: 0 }),
        candidate({ sourceId: "irrelevant", evidenceId: "4", freshness: "STALE", relevanceScore: 0.1 }),
        candidate({ sourceId: "fresh", evidenceId: "5" }),
      ],
      { minFinalScore: 0.75 },
    );
    expect(report).toEqual({ stale: 1, expired: 1, sourceIds: ["stale", "expired"] });
  });
});

describe("new evidence types", () => {
  test("chunk and tender page evidence types survive normalisation", () => {
    expect(normalizeEvidenceType("chunk")).toBe("CHUNK");
    expect(normalizeEvidenceType("DOCUMENT_PAGE")).toBe("DOCUMENT_PAGE");
  });
});

describe("selectPromptEvidence", () => {
  test("takes up to six items and truncates long content to stay in budget", () => {
    const evidence = Array.from({ length: 8 }, (_, index) => ({
      evidenceId: `e${index}`,
      sourceId: "s",
      sourceVersion: null,
      evidenceType: "CHUNK",
      title: "t",
      content: "x".repeat(5_000),
      freshness: "FRESH",
      relevance: 1,
      authority: 1,
    }));
    const selected = selectPromptEvidence(evidence as never);
    expect(selected.length).toBeLessThanOrEqual(6);
    expect(selected.length).toBeGreaterThanOrEqual(3);
    expect(selected.reduce((sum, item) => sum + item.content.length, 0)).toBeLessThanOrEqual(6_000 + selected.length);
  });
});
