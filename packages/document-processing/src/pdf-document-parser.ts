import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

import type { ExtractedPage, ExtractedTable, ExtractionResult } from "./extraction-types";

export interface PdfExtractionResult extends ExtractionResult {
  pageCount: number;
}

const EXTRACTOR = "pdfjs-dist@6.2.108";

/**
 * Upper bound on pages walked per document. Text extraction is linear in page
 * count and every page's text is held in memory until the extraction is saved,
 * so a PDF declaring a huge page tree must be refused rather than walked.
 */
export const DEFAULT_MAX_PDF_PAGES = 2_000;

export interface PdfDocumentParserOptions {
  maxPages?: number;
}

export class PdfParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfParseError";
  }
}

export class PdfDocumentParser {
  private readonly maxPages: number;

  constructor(options: PdfDocumentParserOptions = {}) {
    this.maxPages = options.maxPages ?? DEFAULT_MAX_PDF_PAGES;
  }

  async parse(bytes: Uint8Array): Promise<PdfExtractionResult> {
    const loadingTask = getDocument({ data: bytes, stopAtErrors: true });

    try {
      const pdf = await loadingTask.promise;
      if (pdf.numPages > this.maxPages) {
        throw new PdfParseError(`PDF has ${pdf.numPages} pages; the limit is ${this.maxPages}.`);
      }
      const pages: ExtractedPage[] = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        pages.push({
          pageNumber,
          text: extractPageText(textContent.items),
        });
        page.cleanup?.();
      }

      return {
        extractor: EXTRACTOR,
        pageCount: pdf.numPages,
        pages,
        tables: [] satisfies ExtractedTable[],
      };
    } finally {
      await loadingTask.destroy?.();
    }
  }
}

function extractPageText(items: unknown[]): string {
  return items
    .map((item) => {
      if (typeof item !== "object" || item === null) return "";
      const candidate = item as { str?: unknown };
      return typeof candidate.str === "string" ? candidate.str : "";
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
