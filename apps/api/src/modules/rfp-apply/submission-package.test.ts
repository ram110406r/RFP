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

