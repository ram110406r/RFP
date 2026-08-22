import { describe, expect, test } from "bun:test";

import { documentObjectKey, sanitizeFilename } from "./object-key";

const ORG = "11111111-1111-1111-1111-111111111111";
const RFP = "22222222-2222-2222-2222-222222222222";
const FILE = "33333333-3333-3333-3333-333333333333";

describe("documentObjectKey", () => {
  test("puts the organization first, so a key prefix is a tenant boundary", () => {
    const key = documentObjectKey({
      organizationId: ORG,
      rfpId: RFP,
      fileId: FILE,
      filename: "Questionnaire.pdf",
    });
    expect(key).toBe(`org/${ORG}/rfp/${RFP}/${FILE}/Questionnaire.pdf`);
    expect(key.startsWith(`org/${ORG}/`)).toBe(true);
  });

  test("includes the file id, so identical filenames cannot collide", () => {
    const shared = { organizationId: ORG, rfpId: RFP, filename: "Pricing.xlsx" };
    const first = documentObjectKey({ ...shared, fileId: FILE });
    const second = documentObjectKey({
      ...shared,
      fileId: "44444444-4444-4444-4444-444444444444",
    });
    expect(first).not.toBe(second);
  });

  /**
   * The whole tenant-prefix guarantee rests on a filename being unable to
   * introduce path structure. If this ever regresses, one tenant can write
   * into another's prefix.
   */
  test("a traversing filename cannot escape the tenant prefix", () => {
    const key = documentObjectKey({
      organizationId: ORG,
      rfpId: RFP,
      fileId: FILE,
      filename: "../../../other-org/secrets.pdf",
    });
    expect(key).toBe(`org/${ORG}/rfp/${RFP}/${FILE}/secrets.pdf`);
    expect(key).not.toContain("..");
    expect(key.startsWith(`org/${ORG}/`)).toBe(true);
  });
});

describe("sanitizeFilename", () => {
  test("keeps ordinary names untouched", () => {
    expect(sanitizeFilename("Technical_Requirements-v2.docx")).toBe(
      "Technical_Requirements-v2.docx",
    );
  });

  test("drops directory components from both separator styles", () => {
    expect(sanitizeFilename("a/b/c.pdf")).toBe("c.pdf");
    expect(sanitizeFilename("C:\\Users\\x\\report.pdf")).toBe("report.pdf");
  });

  test("replaces characters that are awkward in a key or a header", () => {
    expect(sanitizeFilename('quarterly report "final".pdf')).toBe("quarterly_report__final_.pdf");
  });

  test("strips leading dots so no key segment becomes a relative path", () => {
    expect(sanitizeFilename("..hidden.pdf")).toBe("hidden.pdf");
    expect(sanitizeFilename("...")).toBe("file");
  });

  test("falls back to a placeholder rather than producing an empty segment", () => {
    expect(sanitizeFilename("")).toBe("file");
    expect(sanitizeFilename("/")).toBe("file");
  });

  test("bounds the length, since object keys are capped", () => {
    expect(sanitizeFilename(`${"a".repeat(400)}.pdf`).length).toBeLessThanOrEqual(200);
  });
});
