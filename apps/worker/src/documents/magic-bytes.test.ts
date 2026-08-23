import { describe, expect, test } from "bun:test";

import { contradictsDeclaredType, sniffFormat } from "./magic-bytes";

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => new TextEncoder().encode(value);

const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

describe("sniffFormat", () => {
  test("recognises a PDF by its header", () => {
    expect(sniffFormat(text("%PDF-1.7\n%âãÏÓ"))).toBe("PDF");
  });

  test("recognises the three ZIP local-header variants", () => {
    expect(sniffFormat(bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0x00))).toBe("ZIP");
    // Empty and spanned archives: not processable, but genuinely ZIPs, so
    // reporting them as such produces a clearer downstream failure.
    expect(sniffFormat(bytes(0x50, 0x4b, 0x05, 0x06))).toBe("ZIP");
    expect(sniffFormat(bytes(0x50, 0x4b, 0x07, 0x08))).toBe("ZIP");
  });

  test("recognises HTML with a doctype, a bare tag, or leading whitespace", () => {
    expect(sniffFormat(text("<!DOCTYPE html><html>"))).toBe("HTML");
    expect(sniffFormat(text("<html lang=\"en\">"))).toBe("HTML");
    expect(sniffFormat(text("\n\n   <head>"))).toBe("HTML");
  });

  test("sees through a UTF-8 BOM", () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...text("<!doctype html>")]);
    expect(sniffFormat(withBom)).toBe("HTML");
  });

  test("reports UNKNOWN rather than guessing at unrecognised bytes", () => {
    expect(sniffFormat(bytes(0x00, 0x01, 0x02, 0x03))).toBe("UNKNOWN");
    expect(sniffFormat(text("just some prose"))).toBe("UNKNOWN");
    expect(sniffFormat(new Uint8Array())).toBe("UNKNOWN");
  });

  test("does not mistake a binary starting with < for markup", () => {
    expect(sniffFormat(bytes(0x3c, 0x00, 0xff, 0xfe))).toBe("UNKNOWN");
  });
});

describe("contradictsDeclaredType", () => {
  test("accepts content that matches the declaration", () => {
    expect(contradictsDeclaredType("PDF", PDF)).toBe(false);
    expect(contradictsDeclaredType("ZIP", DOCX)).toBe(false);
    expect(contradictsDeclaredType("HTML", "text/html")).toBe(false);
  });

  test("rejects a positive contradiction", () => {
    expect(contradictsDeclaredType("HTML", PDF)).toBe(true);
    expect(contradictsDeclaredType("PDF", DOCX)).toBe(true);
    expect(contradictsDeclaredType("ZIP", PDF)).toBe(true);
  });

  /**
   * The whole OOXML family is a ZIP container, so sniffing cannot separate a
   * DOCX from an XLSX. Treating that as a contradiction would reject every
   * valid Office upload.
   */
  test("does not police which OOXML type a ZIP claims to be", () => {
    expect(contradictsDeclaredType("ZIP", DOCX)).toBe(false);
    expect(contradictsDeclaredType("ZIP", XLSX)).toBe(false);
  });

  /**
   * Sniffing reads only a prefix and knows a handful of formats. Failing on
   * "unrecognised" would reject valid documents to catch a case this check
   * cannot detect anyway.
   */
  test("treats unrecognised content as consistent", () => {
    expect(contradictsDeclaredType("UNKNOWN", PDF)).toBe(false);
  });

  test("ignores charset parameters and case in the declared type", () => {
    expect(contradictsDeclaredType("HTML", "text/html; charset=utf-8")).toBe(false);
    expect(contradictsDeclaredType("PDF", "APPLICATION/PDF")).toBe(false);
  });

  test("has nothing to contradict when the declared type is unmapped", () => {
    expect(contradictsDeclaredType("PDF", "application/octet-stream")).toBe(false);
  });
});
