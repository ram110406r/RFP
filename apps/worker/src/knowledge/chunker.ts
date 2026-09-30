import { createHash } from "node:crypto";

import type { ExtractedBlock, ExtractedPage } from "@rfp-os/document-processing";

/**
 * Splits parsed document text into retrieval-sized passages.
 *
 * Sizes are in estimated tokens (≈4 characters each) — close enough for
 * budgeting prompts and embedding requests without shipping a tokenizer.
 * ~800 tokens keeps a chunk to one topic in most policy documents while
 * still carrying enough context to answer from; the ~100-token overlap
 * stops a fact that straddles a boundary from being lost to both sides.
 *
 * Chunks never cross a heading (DOCX) and remember the page they started on
 * (PDF), because a citation that says "p. 14" is what makes an answer
 * checkable.
 */

export interface ChunkOptions {
  targetTokens?: number;
  overlapTokens?: number;
}

export interface DocumentChunk {
  ordinal: number;
  pageNumber: number | null;
  heading: string | null;
  text: string;
  tokenCount: number;
  contentHash: string;
}

interface Unit {
  text: string;
  pageNumber: number | null;
  heading: string | null;
  /** Carried over from the previous chunk; a chunk of only these adds nothing. */
  overlap?: boolean;
}

const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function chunkDocument(
  input: { pages: ExtractedPage[]; blocks?: ExtractedBlock[] },
  options: ChunkOptions = {},
): DocumentChunk[] {
  const targetChars = (options.targetTokens ?? 800) * CHARS_PER_TOKEN;
  const overlapChars = (options.overlapTokens ?? 100) * CHARS_PER_TOKEN;
  const units = input.blocks?.length ? unitsFromBlocks(input.blocks) : unitsFromPages(input.pages);

  const chunks: DocumentChunk[] = [];
  let buffer: Unit[] = [];
  let bufferChars = 0;

  const flush = (carryOverlap: boolean) => {
    const text = buffer.map((unit) => unit.text).join("\n\n").trim();
    if (text) {
      chunks.push({
        ordinal: chunks.length,
        pageNumber: buffer.find((unit) => unit.pageNumber !== null)?.pageNumber ?? null,
        heading: buffer[0]?.heading ?? null,
        text,
        tokenCount: estimateTokens(text),
        contentHash: createHash("sha256").update(text).digest("hex"),
      });
    }
    const last = buffer.at(-1);
    buffer = [];
    bufferChars = 0;
    if (carryOverlap && last && overlapChars > 0) {
      const tail = overlapTail(text, overlapChars);
      if (tail) {
        buffer.push({ text: tail, pageNumber: last.pageNumber, heading: last.heading, overlap: true });
        bufferChars = tail.length;
      }
    }
  };

  for (const unit of units.flatMap((entry) => splitOversized(entry, targetChars))) {
    const headingChanged = buffer.length > 0 && unit.heading !== buffer[buffer.length - 1]!.heading;
    if (headingChanged) flush(false);
    if (bufferChars > 0 && bufferChars + unit.text.length > targetChars) flush(true);
    buffer.push(unit);
    bufferChars += unit.text.length + 2;
  }
  flush(false);
  return chunks;
}

function unitsFromPages(pages: ExtractedPage[]): Unit[] {
  const units: Unit[] = [];
  for (const page of pages) {
    const paragraphs = page.text.split(/\n\s*\n/).map(normalizeWhitespace).filter(Boolean);
    for (const paragraph of paragraphs) units.push({ text: paragraph, pageNumber: page.pageNumber, heading: null });
  }
  return units;
}

function unitsFromBlocks(blocks: ExtractedBlock[]): Unit[] {
  const units: Unit[] = [];
  for (const block of blocks) {
    const heading = block.headingPath.length > 0 ? block.headingPath.join(" › ") : null;
    if (block.kind === "heading") continue;
    const text = block.kind === "table"
      ? (block.cells ?? []).map((row) => row.map((cell) => cell.trim()).join(" | ")).join("\n")
      : normalizeWhitespace(block.text ?? "");
    if (text.trim()) units.push({ text, pageNumber: null, heading });
  }
  return units;
}

/** A single paragraph longer than a chunk is split at sentence boundaries, then hard-split. */
function splitOversized(unit: Unit, targetChars: number): Unit[] {
  if (unit.text.length <= targetChars) return [unit];
  const sentences = unit.text.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) ?? [unit.text];
  const parts: Unit[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (sentence.length > targetChars) {
      if (current) parts.push({ ...unit, text: current.trim() });
      current = "";
      for (let start = 0; start < sentence.length; start += targetChars) {
        parts.push({ ...unit, text: sentence.slice(start, start + targetChars).trim() });
      }
      continue;
    }
    if (current.length + sentence.length > targetChars) {
      parts.push({ ...unit, text: current.trim() });
      current = "";
    }
    current += sentence;
  }
  if (current.trim()) parts.push({ ...unit, text: current.trim() });
  return parts;
}

/** The last ~overlapChars of text, starting at a sentence or word boundary. */
function overlapTail(text: string, overlapChars: number): string {
  if (text.length <= overlapChars) return "";
  const slice = text.slice(-overlapChars);
  const sentenceStart = slice.search(/[.!?]\s+\S/);
  if (sentenceStart >= 0 && sentenceStart < slice.length / 2) return slice.slice(sentenceStart + 1).trim();
  const wordStart = slice.indexOf(" ");
  return (wordStart >= 0 ? slice.slice(wordStart + 1) : slice).trim();
}

function normalizeWhitespace(value: string): string {
  return value.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}
