/**
 * Content sniffing for uploaded documents.
 *
 * Uploads are presigned and go straight to object storage, so the API never
 * sees the bytes and the declared MIME type is a claim by the client, not an
 * observation. DocumentsService says as much: the declaration is checked "in
 * the parse worker (magic bytes are sniffed, and a file whose content
 * contradicts its declaration fails rather than being trusted)". This is that
 * check.
 *
 * It is a sanity check, not a security boundary — a determined uploader can
 * prefix any bytes with %PDF-. What it does catch is the realistic case: a
 * file whose real format differs from its declaration, which would otherwise
 * fail deep inside an extractor with an error that says nothing useful.
 */

/** Bytes needed to identify every format below. ZIP and PDF need 8. */
export const SNIFF_LENGTH = 512;

export type SniffedFormat = "PDF" | "ZIP" | "HTML" | "UNKNOWN";

/**
 * DOCX, XLSX and PPTX are all ZIP containers, so sniffing cannot tell them
 * apart without reading the archive directory. It reports ZIP for all three;
 * distinguishing them is the extractor's job in Phase 6C, where the archive is
 * being opened anyway.
 */
const OOXML_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
]);

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, i) => bytes[i] === byte);
}

export function sniffFormat(bytes: Uint8Array): SniffedFormat {
  // %PDF-
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "PDF";

  /*
   * PK\x03\x04 is a local file header. The other two signatures are an empty
   * archive and a spanned one; neither is a document we can process, but both
   * are genuinely ZIPs, so reporting them as such produces a clearer failure
   * downstream than "unknown format".
   */
  if (
    startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWith(bytes, [0x50, 0x4b, 0x07, 0x08])
  ) {
    return "ZIP";
  }

  /*
   * HTML has no magic number. Skip a UTF-8 BOM and any leading whitespace,
   * then look for a doctype or a tag — the same heuristic browsers use, and
   * enough to separate markup from a binary that happens to start with "<".
   */
  const withoutBom =
    bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
      ? bytes.subarray(3)
      : bytes;
  const head = new TextDecoder("utf-8", { fatal: false }).decode(withoutBom).trimStart();
  if (/^<(!doctype html|html|head|body|\?xml)/i.test(head)) return "HTML";

  return "UNKNOWN";
}

/**
 * Whether sniffed content is consistent with what the client declared.
 *
 * UNKNOWN is treated as consistent rather than rejected. Sniffing sees only
 * the first bytes and the format list is not exhaustive, so failing on
 * "did not recognise this" would reject valid documents to catch a case this
 * check was never able to detect. Only a positive contradiction — content
 * that is definitely one format while declared another — is a failure.
 */
export function contradictsDeclaredType(sniffed: SniffedFormat, mimeType: string): boolean {
  if (sniffed === "UNKNOWN") return false;

  const declared = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  const expected: SniffedFormat =
    declared === "application/pdf"
      ? "PDF"
      : OOXML_TYPES.has(declared)
        ? "ZIP"
        : declared === "text/html"
          ? "HTML"
          : "UNKNOWN";

  // Declared something we cannot map: nothing to contradict.
  if (expected === "UNKNOWN") return false;
  return sniffed !== expected;
}
