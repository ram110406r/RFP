import { describe, expect, test } from "bun:test";

import {
  conflictPairKey,
  parseExtractionResponse,
  heuristicClaims,
  mapExtractedClaims,
  recommendConflictSide,
  valuesConflict,
} from "./knowledge.logic";

const chunk = (id: string, text: string) => ({ id, ordinal: 0, pageNumber: 1, heading: null, text });

describe("valuesConflict", () => {
  test("different quantities conflict, restated quantities do not", () => {
    expect(valuesConflict("4 hours", "1 hour")).toBe(true);
    expect(valuesConflict("RPO of 4 hours", "A four-hour RPO (4 hours)")).toBe(false);
    expect(valuesConflict("99.9% uptime", "99.95% uptime")).toBe(true);
  });

  test("rewordings do not conflict, negations do", () => {
    expect(valuesConflict("Required for all privileged roles", "MFA required for all privileged roles")).toBe(false);
    expect(valuesConflict("SSO via SAML is supported", "SSO via SAML is not supported")).toBe(true);
    expect(valuesConflict("AES-256 per-tenant keys", "Customer data is stored in Frankfurt")).toBe(true);
  });
});

describe("claim extraction", () => {
  test("drops invented passages and values that are not in the text", () => {
    const window = [chunk("c1", "Backups run nightly and are retained for 35 days in a separate region.")];
    const parsed = parseExtractionResponse({
      claims: [
        { label: "Backup retention", value: "35 days", confidence: 0.9, passage: 1 },
        { label: "Backup region", value: "Stored in Mars orbit", confidence: 0.9, passage: 1 },
        { label: "Invented", value: "x", passage: 7 },
      ],
    });
    expect(mapExtractedClaims(window, parsed).map((claim) => claim.label)).toEqual(["Backup retention"]);
  });

  test("the heuristic reads Label: value lines", () => {
    const claims = heuristicClaims([chunk("c1", "Encryption at rest: AES-256\nThis sentence is not a claim.\nRTO: 8 hours")]);
    expect(claims.map((claim) => [claim.label, claim.value])).toEqual([
      ["Encryption at rest", "AES-256"],
      ["RTO", "8 hours"],
    ]);
  });
});

describe("conflicts", () => {
  test("pair keys are order-independent", () => {
    expect(conflictPairKey("b", "a")).toBe(conflictPairKey("a", "b"));
  });

  test("authority wins, then recency", () => {
    const base = { claimId: "1", value: "x", lastVerified: "2026-01-01" };
    expect(recommendConflictSide({ ...base, sourceName: "A", authority: "low" }, { ...base, claimId: "2", sourceName: "B", authority: "high" }).keep.sourceName).toBe("B");
    expect(
      recommendConflictSide(
        { ...base, sourceName: "Old", authority: "high", lastVerified: "2025-01-01" },
        { ...base, claimId: "2", sourceName: "New", authority: "high", lastVerified: "2026-06-01" },
      ).keep.sourceName,
    ).toBe("New");
  });
});
