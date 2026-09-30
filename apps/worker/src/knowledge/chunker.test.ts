import { describe, expect, test } from "bun:test";

import { chunkDocument } from "./chunker";

function sentences(count: number, prefix: string) {
  return Array.from({ length: count }, (_, index) => `${prefix} sentence number ${index} explains a control in detail.`).join(" ");
}

describe("chunkDocument", () => {
  test("keeps short pages as one chunk with their page number", () => {
    const chunks = chunkDocument({ pages: [{ pageNumber: 3, text: "Encryption at rest uses AES-256." }] });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ ordinal: 0, pageNumber: 3, text: "Encryption at rest uses AES-256." });
    expect(chunks[0]!.contentHash).toHaveLength(64);
  });

  test("splits long text near the target size with overlap between neighbours", () => {
    const text = [sentences(40, "Alpha"), sentences(40, "Beta"), sentences(40, "Gamma")].join("\n\n");
    const chunks = chunkDocument({ pages: [{ pageNumber: 1, text }] }, { targetTokens: 200, overlapTokens: 30 });
    expect(chunks.length).toBeGreaterThan(3);
    for (const chunk of chunks) expect(chunk.tokenCount).toBeLessThanOrEqual(260);
    // The start of each later chunk repeats the end of the previous one.
    const tail = chunks[0]!.text.slice(-60);
    expect(chunks[1]!.text).toContain(tail.split(" ").slice(-4).join(" "));
    expect(chunks.map((chunk) => chunk.ordinal)).toEqual(chunks.map((_, index) => index));
  });

  test("never merges text across DOCX headings", () => {
    const chunks = chunkDocument({
      pages: [],
      blocks: [
        { kind: "heading", text: "Security", headingPath: ["Security"], sourceRef: { xmlKind: "w:p", index: 0 } },
        { kind: "paragraph", text: "MFA is enforced.", headingPath: ["Security"], sourceRef: { xmlKind: "w:p", index: 1 } },
        { kind: "heading", text: "Pricing", headingPath: ["Pricing"], sourceRef: { xmlKind: "w:p", index: 2 } },
        { kind: "paragraph", text: "Annual billing.", headingPath: ["Pricing"], sourceRef: { xmlKind: "w:p", index: 3 } },
      ],
    });
    expect(chunks.map((chunk) => [chunk.heading, chunk.text])).toEqual([
      ["Security", "MFA is enforced."],
      ["Pricing", "Annual billing."],
    ]);
  });
});
