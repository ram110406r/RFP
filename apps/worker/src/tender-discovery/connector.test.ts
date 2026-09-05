import { describe, expect, test } from "bun:test";

import { canonicalNoticeKey, normalizeOfficialFeedItem, payloadHash } from "./connector";

describe("official tender feed normalization", () => {
  test("normalizes Indian values, dates, statuses, and document links", () => {
    const item = normalizeOfficialFeedItem({
      sourceNoticeKey: "GEM/2026/B/123",
      title: "Supply of networking equipment",
      referenceNumber: "GEM/2026/B/123",
      buyerName: "Department of Telecommunications",
      estimatedValue: "₹ 12,50,000",
      deadlineAt: "2026-10-12T15:00:00+05:30",
      status: "active",
      sourceUrl: "https://example.gov.in/tender/123",
      documents: [{ key: "nit", name: "NIT", url: "https://example.gov.in/nit.pdf", access: "DIRECT" }],
    });
    expect(item.estimatedValue).toBe(1_250_000);
    expect(item.status).toBe("ACTIVE");
    expect(item.deadlineAt).toBe("2026-10-12T09:30:00.000Z");
    expect(item.documents?.[0]?.access).toBe("DIRECT");
  });

  test("uses buyer and reference as the stable cross-source identity", () => {
    const base = normalizeOfficialFeedItem({ sourceNoticeKey: "one", title: "First title", referenceNumber: "ABC-10", buyerName: "Bharat Electronics", sourceUrl: "https://one.gov.in/a" });
    const mirror = normalizeOfficialFeedItem({ sourceNoticeKey: "two", title: "Changed title", referenceNumber: "abc 10", buyerName: "Bharat Electronics Ltd.", sourceUrl: "https://two.gov.in/b" });
    expect(canonicalNoticeKey(base)).toBe(canonicalNoticeKey(mirror));
    expect(canonicalNoticeKey(base)).toBe(canonicalNoticeKey({ ...base, sourceNoticeKey: "mirror", sourceUrl: mirror.sourceUrl }));
  });

  test("hashes object payloads independently of property order", () => {
    expect(payloadHash({ a: 1, b: { c: true } })).toBe(payloadHash({ b: { c: true }, a: 1 }));
  });

  test("rejects malformed source records", () => {
    expect(() => normalizeOfficialFeedItem({ title: "Missing identity", sourceUrl: "https://example.gov.in" })).toThrow("sourceNoticeKey");
    expect(() => normalizeOfficialFeedItem({ sourceNoticeKey: "1", title: "Bad URL", sourceUrl: "javascript:alert(1)" })).toThrow("absolute URL");
  });
});
