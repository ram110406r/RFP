import { describe, expect, test } from "bun:test";

import { PdfDocumentParser } from "./pdf-document-parser";

const parser = new PdfDocumentParser();

describe("PdfDocumentParser", () => {
  test("extracts a one-page PDF", async () => {
    const pdf = buildPdf(["Hello world"]);
    const result = await parser.parse(pdf);

    expect(result.pageCount).toBe(1);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]?.pageNumber).toBe(1);
    expect(result.pages[0]?.text).toContain("Hello world");
  });

  test("extracts a multi-page PDF in reading order", async () => {
    const pdf = buildPdf(["First page", "Second page"]);
    const result = await parser.parse(pdf);

    expect(result.pageCount).toBe(2);
    expect(result.pages.map((page) => page.pageNumber)).toEqual([1, 2]);
    expect(result.pages.map((page) => page.text)).toEqual(["First page", "Second page"]);
  });

  test("keeps blank pages as empty text", async () => {
    const pdf = buildPdf([""]);
    const result = await parser.parse(pdf);

    expect(result.pageCount).toBe(1);
    expect(result.pages[0]?.text).toBe("");
  });

  test("rejects corrupt PDFs", async () => {
    const error = await parser.parse(new TextEncoder().encode("%PDF-1.7\nnot a real pdf")).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(Error);
  });

  test("rejects password-protected PDFs", async () => {
    const error = await parser.parse(buildPdf(["Secret"], { encrypted: true })).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(Error);
  });
});

function buildPdf(
  pageTexts: string[],
  options: { encrypted?: boolean } = {},
): Uint8Array {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  const offsets: number[] = [0];
  let currentLength = 0;

  const push = (body: string, objectNumber: number) => {
    const object = `${objectNumber} 0 obj\n${body}\nendobj\n`;
    offsets[objectNumber] = currentLength;
    parts.push(object);
    currentLength += encoder.encode(object).length;
  };

  parts.push("%PDF-1.4\n");
  currentLength += encoder.encode(parts[0]).length;

  push("<< /Type /Catalog /Pages 2 0 R >>", 1);

  const pageNumbers = pageTexts.map((_, index) => 5 + index * 2);
  push(`<< /Type /Pages /Kids [${pageNumbers.map((page) => `${page} 0 R`).join(" ")}] /Count ${pageTexts.length} >>`, 2);
  push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", 3);

  pageTexts.forEach((text, index) => {
    const contentNumber = 4 + index * 2;
    const pageNumber = 5 + index * 2;
    const stream = makeTextStream(text);
    const contentBody =
      stream.length === 0
        ? "<< /Length 0 >>\nstream\n\nendstream"
        : `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`;

    push(contentBody, contentNumber);
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNumber} 0 R >>`,
      pageNumber,
    );
  });

  if (options.encrypted) {
    const encryptNumber = 4 + pageTexts.length * 2;
    push(
      "<< /Filter /Standard /V 1 /R 2 /O <00000000000000000000000000000000> /U <00000000000000000000000000000000> /P -4 >>",
      encryptNumber,
    );
  }

  const body = parts.join("");
  const size = (options.encrypted ? 5 + pageTexts.length * 2 : 4 + pageTexts.length * 2);
  const xrefOffset = encoder.encode(body).length;
  const xrefLines = [
    "xref",
    `0 ${size}`,
    "0000000000 65535 f ",
    ...Array.from({ length: size - 1 }, (_, index) => {
      const objectNumber = index + 1;
      const offset = offsets[objectNumber] ?? 0;
      return `${String(offset).padStart(10, "0")} 00000 n `;
    }),
    "trailer",
    `<< /Size ${size}${options.encrypted ? ` /Encrypt ${4 + pageTexts.length * 2} 0 R` : ""} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
  ];

  return encoder.encode(`${body}${xrefLines.join("\n")}\n`);
}

function makeTextStream(text: string): string {
  if (!text) return "";
  return `BT /F1 24 Tf 72 720 Td (${escapePdfString(text)}) Tj ET`;
}

function escapePdfString(text: string): string {
  return text.replace(/[\\()]/g, "\\$&");
}
