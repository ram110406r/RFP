import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

import type { ExtractedPage, ExtractedTable, ExtractionResult } from "./extraction-types";

export interface PdfExtractionResult extends ExtractionResult {
  pageCount: number;
}

const EXTRACTOR = "pdfjs-dist@6.2.108";

export class PdfDocumentParser {
  async parse(bytes: Uint8Array): Promise<PdfExtractionResult> {
    const loadingTask = getDocument({ data: bytes, stopAtErrors: true });

    try {
      const pdf = await loadingTask.promise;
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
