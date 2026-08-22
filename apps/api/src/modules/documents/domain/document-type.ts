import type { documentTypeEnum } from "@rfp-os/db";

export type DocumentType = (typeof documentTypeEnum.enumValues)[number];

interface DocumentFormat {
  type: DocumentType;
  /** Every MIME a browser or OS plausibly reports for this format. */
  mimeTypes: readonly string[];
  extensions: readonly string[];
}

/**
 * The accepted upload formats, as data rather than a switch — the same shape
 * as RFP_TRANSITIONS, so the list can be enumerated for an error message or a
 * UI hint instead of being implicit in control flow.
 *
 * This is an allowlist, not a blocklist: a MIME absent from here is rejected.
 * The alternative (reject known-bad types) fails open on anything unforeseen,
 * which for a file that a worker will later open is the wrong default.
 *
 * Note it is only the *declared* type. A presigned upload means the bytes
 * arrive without passing through the API, so this cannot confirm what was
 * actually stored — the parse worker sniffs magic bytes for that.
 */
export const DOCUMENT_FORMATS: readonly DocumentFormat[] = [
  { type: "PDF", mimeTypes: ["application/pdf"], extensions: [".pdf"] },
  {
    type: "DOCX",
    mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    extensions: [".docx"],
  },
  {
    type: "XLSX",
    mimeTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    extensions: [".xlsx"],
  },
  {
    type: "PPTX",
    mimeTypes: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    extensions: [".pptx"],
  },
  {
    type: "ZIP",
    /* Windows reports the second form; both are the same container. */
    mimeTypes: ["application/zip", "application/x-zip-compressed"],
    extensions: [".zip"],
  },
  { type: "HTML", mimeTypes: ["text/html"], extensions: [".html", ".htm"] },
];

const BY_MIME = new Map<string, DocumentType>(
  DOCUMENT_FORMATS.flatMap((format) => format.mimeTypes.map((mime) => [mime, format.type])),
);

export const ACCEPTED_MIME_TYPES: readonly string[] = [...BY_MIME.keys()];

/** The document type for a declared MIME, or null when it is not accepted. */
export function documentTypeForMime(mimeType: string): DocumentType | null {
  return BY_MIME.get(normalizeMime(mimeType)) ?? null;
}

/**
 * Strips parameters and casing: browsers send `text/html; charset=utf-8`, and
 * the parameter is irrelevant to whether we accept the format.
 */
function normalizeMime(mimeType: string): string {
  return mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
}

/** Bytes → the `size_mb` numeric column, which the prototype UI renders. */
export function bytesToSizeMb(sizeBytes: number): string {
  return (sizeBytes / 1_048_576).toFixed(2);
}
