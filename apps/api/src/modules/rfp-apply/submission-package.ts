import { zipSync, strToU8 } from "fflate";

export interface PackageAnswerRow {
  requirement: string;
  question: string;
  answer: string;
  mandatory: boolean;
  status: string;
  evidence: string[];
}

export interface SubmissionPackageInput {
  title: string;
  reference: string;
  buyer: string;
  deadline: string;
  rows: PackageAnswerRow[];
  blockers: string[];
  attachments?: Array<{ filename: string; bytes: Uint8Array }>;
}

export interface GeneratedArtifact {
  kind: "NARRATIVE_DOCX" | "COMPLIANCE_XLSX" | "EVIDENCE_MANIFEST" | "SUBMISSION_CHECKLIST" | "PACKAGE_ZIP";
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}

export function generateSubmissionArtifacts(input: SubmissionPackageInput): GeneratedArtifact[] {
  const narrative = docx(input);
  const matrix = xlsx(input);
  const evidence = strToU8(JSON.stringify({ tender: input.reference, items: input.rows.map((row) => ({ requirement: row.requirement, evidence: row.evidence })) }, null, 2));
  const checklist = strToU8([
    "Item,Status",
    `Required answers reviewed,${input.rows.every((row) => !row.mandatory || ["APPROVED", "FINAL"].includes(row.status)) ? "Complete" : "Incomplete"}`,
    `Validation blockers,${input.blockers.length === 0 ? "None" : input.blockers.length}`,
    "Buyer-provided forms,Verify and attach manually",
    "Portal submission receipt,Required after submission",
  ].join("\r\n"));
  const base: GeneratedArtifact[] = [
    { kind: "NARRATIVE_DOCX", filename: "response.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: narrative },
    { kind: "COMPLIANCE_XLSX", filename: "compliance-matrix.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes: matrix },
    { kind: "EVIDENCE_MANIFEST", filename: "evidence-manifest.json", mimeType: "application/json", bytes: evidence },
    { kind: "SUBMISSION_CHECKLIST", filename: "submission-checklist.csv", mimeType: "text/csv", bytes: checklist },
  ];
  const archive = zipSync(Object.fromEntries([
    ...base.map((item) => [item.filename, item.bytes] as const),
    ...(input.attachments ?? []).map((item, index) => [`attachments/${index + 1}-${safeFilename(item.filename)}`, item.bytes] as const),
  ]), { level: 6 });
  return [...base, { kind: "PACKAGE_ZIP", filename: "submission-package.zip", mimeType: "application/zip", bytes: archive }];
}

function docx(input: SubmissionPackageInput) {
  const paragraphs = [input.title, `Reference: ${input.reference}`, `Buyer: ${input.buyer}`, `Deadline: ${input.deadline}`,
    ...input.rows.flatMap((row, index) => [`${index + 1}. ${row.requirement}`, row.question, row.answer || "Response pending.", `Evidence: ${row.evidence.join(", ") || "None"}`])];
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map((value) => `<w:p><w:r><w:t xml:space="preserve">${xml(value)}</w:t></w:r></w:p>`).join("")}<w:sectPr/></w:body></w:document>`;
  return zipSync({
    "[Content_Types].xml": strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    "_rels/.rels": strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    "word/document.xml": strToU8(document),
  });
}

function xlsx(input: SubmissionPackageInput) {
  const data = [["Requirement", "Question", "Mandatory", "Status", "Answer", "Evidence"], ...input.rows.map((row) => [row.requirement, row.question, row.mandatory ? "Yes" : "No", row.status, row.answer, row.evidence.join("; ")])];
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${data.map((row, ri) => `<row r="${ri + 1}">${row.map((value, ci) => `<c r="${column(ci)}${ri + 1}" t="inlineStr"><is><t>${xml(String(value))}</t></is></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`;
  return zipSync({
    "[Content_Types].xml": strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    "_rels/.rels": strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    "xl/workbook.xml": strToU8('<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Compliance" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  });
}

function safeFilename(value: string) { return value.replace(/[\\/:*?"<>|]+/g, "_").replace(/^\.+/, "") || "attachment"; }

function xml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function column(index: number) { let value = ""; for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) value = String.fromCharCode(65 + ((n - 1) % 26)) + value; return value; }
