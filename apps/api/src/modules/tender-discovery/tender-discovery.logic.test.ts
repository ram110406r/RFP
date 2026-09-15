import { describe, expect, test } from "bun:test";
import { csvCell, decodeCursor, encodeCursor, scoreTenderMatch } from "./tender-discovery.logic";

describe("tender discovery logic", () => {
  const notice = { title: "Cloud security services", description: "ISO 27001 managed security", buyerName: "State IT Department", category: "IT Services", state: "Karnataka", location: "Bengaluru", estimatedValue: 5_000_000 };
  test("produces an explainable weighted company-fit score", () => {
    const result = scoreTenderMatch(notice, { capabilityKeywords: ["cloud"], preferredCategories: ["IT Services"], preferredStates: ["Karnataka"], certifications: ["ISO 27001"], industry: "technology", minimumValue: 1_000_000, maximumValue: 10_000_000 });
    expect(result.score).toBe(100);
    expect(result.components).toEqual({ capabilities: 35, industry: 20, region: 15, certifications: 15, value: 15 });
    expect(result.reasons.length).toBeGreaterThan(3);
  });
  test("does not reject a tender when profile information is missing", () => expect(scoreTenderMatch(notice, null)).toMatchObject({ score: 0, reasons: ["Profile information missing"] }));
  test("round trips opaque cursors and rejects malformed values", () => { const cursor = encodeCursor({ id: "notice-1", value: 12 }); expect(decodeCursor(cursor)).toEqual({ id: "notice-1", value: 12 }); expect(() => decodeCursor("broken")).toThrow(); });
  test("escapes formulas, quotes and newlines as CSV text", () => { expect(csvCell("buyer, ltd")).toBe('"buyer, ltd"'); expect(csvCell('a"b')).toBe('"a""b"'); expect(csvCell("=1+1")).toBe("'=1+1"); expect(csvCell("plain")).toBe("plain"); });
});
