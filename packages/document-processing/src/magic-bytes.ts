export const SNIFF_LENGTH = 512;

export type SniffedFormat = "PDF" | "ZIP" | "HTML" | "UNKNOWN";

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
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "PDF";

  if (
    startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWith(bytes, [0x50, 0x4b, 0x07, 0x08])
  ) {
    return "ZIP";
  }

  const withoutBom =
    bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
      ? bytes.subarray(3)
      : bytes;
  const head = new TextDecoder("utf-8", { fatal: false }).decode(withoutBom).trimStart();
  if (/^<(!doctype html|html|head|body|\?xml)/i.test(head)) return "HTML";

  return "UNKNOWN";
}

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

  if (expected === "UNKNOWN") return false;
  return sniffed !== expected;
}
