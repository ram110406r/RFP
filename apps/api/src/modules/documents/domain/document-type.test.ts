import { describe, expect, test } from "bun:test";

import {
  ACCEPTED_MIME_TYPES,
  DOCUMENT_FORMATS,
  bytesToSizeMb,
  documentTypeForMime,
} from "./document-type";

describe("documentTypeForMime", () => {
  test("maps every format the plan requires", () => {
    expect(documentTypeForMime("application/pdf")).toBe("PDF");
    expect(
      documentTypeForMime(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe("DOCX");
    expect(
      documentTypeForMime("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    ).toBe("XLSX");
    expect(
      documentTypeForMime(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ),
    ).toBe("PPTX");
    expect(documentTypeForMime("application/zip")).toBe("ZIP");
    expect(documentTypeForMime("text/html")).toBe("HTML");
  });

  test("accepts the Windows spelling of a zip", () => {
    expect(documentTypeForMime("application/x-zip-compressed")).toBe("ZIP");
  });

  test("ignores parameters and casing, as browsers send them", () => {
    expect(documentTypeForMime("text/html; charset=utf-8")).toBe("HTML");
    expect(documentTypeForMime("Application/PDF")).toBe("PDF");
    expect(documentTypeForMime("  application/pdf  ")).toBe("PDF");
  });

  /**
   * The allowlist has to fail closed: anything not named is rejected, so an
   * unforeseen type never reaches a worker that will open it.
   */
  test("rejects anything not on the allowlist", () => {
    expect(documentTypeForMime("application/x-msdownload")).toBeNull();
    expect(documentTypeForMime("image/svg+xml")).toBeNull();
    expect(documentTypeForMime("text/plain")).toBeNull();
    expect(documentTypeForMime("")).toBeNull();
  });
});

describe("DOCUMENT_FORMATS", () => {
  test("covers exactly the six supported document types", () => {
    expect(DOCUMENT_FORMATS.map((format) => format.type)).toEqual([
      "PDF",
      "DOCX",
      "XLSX",
      "PPTX",
      "ZIP",
      "HTML",
    ]);
  });

  test("no MIME is claimed by two formats", () => {
    const all = DOCUMENT_FORMATS.flatMap((format) => format.mimeTypes);
    expect(new Set(all).size).toBe(all.length);
    expect(ACCEPTED_MIME_TYPES.length).toBe(all.length);
  });
});

describe("bytesToSizeMb", () => {
  test("converts to the two-decimal string the numeric column stores", () => {
    expect(bytesToSizeMb(4_404_019)).toBe("4.20");
    expect(bytesToSizeMb(0)).toBe("0.00");
    expect(bytesToSizeMb(1_048_576)).toBe("1.00");
  });
});
