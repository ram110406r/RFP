import { describe, expect, test } from "bun:test";

import { classifyKnowledgeReviewState, daysUntilKnowledgeExpiry } from "./knowledge-freshness";

const now = new Date("2026-09-30T12:00:00Z");

describe("classifyKnowledgeReviewState", () => {
  test("drafts and archived sources have no review state", () => {
    expect(classifyKnowledgeReviewState({ status: "DRAFT", lastVerified: null, expiresAt: "2020-01-01" }, now)).toBeNull();
    expect(classifyKnowledgeReviewState({ status: "ARCHIVED", lastVerified: null, expiresAt: "2020-01-01" }, now)).toBeNull();
  });

  test("an active source never verified is unverified, not healthy", () => {
    expect(classifyKnowledgeReviewState({ status: "ACTIVE", lastVerified: null, expiresAt: null }, now)).toBe("unverified");
  });

  test("stale after 180 days", () => {
    expect(classifyKnowledgeReviewState({ status: "ACTIVE", lastVerified: "2026-04-03", expiresAt: null }, now)).toBe("fresh");
    expect(classifyKnowledgeReviewState({ status: "ACTIVE", lastVerified: "2026-04-01", expiresAt: null }, now)).toBe("stale");
  });

  test("expiry wins over staleness and expiring is within 30 days", () => {
    expect(classifyKnowledgeReviewState({ status: "ACTIVE", lastVerified: "2025-01-01", expiresAt: "2026-09-29" }, now)).toBe("expired");
    expect(classifyKnowledgeReviewState({ status: "ACTIVE", lastVerified: "2026-09-01", expiresAt: "2026-09-30" }, now)).toBe("expiring");
    expect(classifyKnowledgeReviewState({ status: "ACTIVE", lastVerified: "2026-09-01", expiresAt: "2026-10-30" }, now)).toBe("expiring");
    expect(classifyKnowledgeReviewState({ status: "ACTIVE", lastVerified: "2026-09-01", expiresAt: "2026-11-15" }, now)).toBe("fresh");
  });
});

describe("daysUntilKnowledgeExpiry", () => {
  test("counts whole days from the start of today", () => {
    expect(daysUntilKnowledgeExpiry("2026-09-30", now)).toBe(0);
    expect(daysUntilKnowledgeExpiry("2026-10-07", now)).toBe(7);
    expect(daysUntilKnowledgeExpiry("2026-09-29", now)).toBe(-1);
    expect(daysUntilKnowledgeExpiry(null, now)).toBeNull();
  });
});
