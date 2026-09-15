import { describe, expect, test } from "bun:test";
import { unzipSync, strFromU8 } from "fflate";

import { generateSubmissionArtifacts } from "./submission-package";

const input = {
  title: "Network modernization tender",
  reference: "GEM/2026/1",
  buyer: "Example authority",
  deadline: "2026-10-01T10:00:00.000Z",
  blockers: [],
  rows: [{ requirement: "ISO certification", question: "Provide certification", answer: "Certificate attached.", mandatory: true, status: "APPROVED", evidence: ["KNOWLEDGE:cert-1"] }],
};

describe("submission package generation", () => {
  test("preserves same-named attachments and filename sanitization collisions", () => {
    const artifacts = generateSubmissionArtifacts({ ...input, attachments: [
      { filename: "cert.pdf", bytes: new Uint8Array([1]) },
      { filename: "cert.pdf", bytes: new Uint8Array([2]) },
      { filename: "a/b.pdf", bytes: new Uint8Array([3]) },
      { filename: "a_b.pdf", bytes: new Uint8Array([4]) },
    ] });
    const bundle = unzipSync(artifacts.at(-1)!.bytes);
    const attachments = Object.keys(bundle).filter((name) => name.startsWith("attachments/"));
    expect(attachments).toHaveLength(4);
    expect(attachments.map((name) => bundle[name]![0]).sort()).toEqual([1, 2, 3, 4]);
  });
  test("creates deterministic, readable Office and bundle artifacts", () => {
    const first = generateSubmissionArtifacts(input);
    const second = generateSubmissionArtifacts(input);
    expect(first.map((item) => item.kind)).toEqual(["NARRATIVE_DOCX", "COMPLIANCE_XLSX", "EVIDENCE_MANIFEST", "SUBMISSION_CHECKLIST", "PACKAGE_ZIP"]);
    expect(first.map((item) => item.bytes)).toEqual(second.map((item) => item.bytes));
    const docx = unzipSync(first[0]!.bytes);
    expect(strFromU8(docx["word/document.xml"]!)).toContain("ISO certification");
    const xlsx = unzipSync(first[1]!.bytes);
    expect(strFromU8(xlsx["xl/worksheets/sheet1.xml"]!)).toContain("Certificate attached.");
    const bundle = unzipSync(first[4]!.bytes);
    expect(Object.keys(bundle).sort()).toEqual(["compliance-matrix.xlsx", "evidence-manifest.json", "response.docx", "submission-checklist.csv"]);
  });
});
