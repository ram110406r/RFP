import { unzipSync } from "fflate";
import * as sax from "sax";

import type { ExtractedPage, ExtractedTable } from "./extraction.repository";

export interface DocxSourceRef {
  xmlKind: "w:p" | "w:tbl";
  index: number;
}

export interface DocxHeadingBlock {
  blockNumber: number;
  kind: "heading";
  text: string;
  headingPath: string[];
  sourceRef: DocxSourceRef;
}

export interface DocxParagraphBlock {
  blockNumber: number;
  kind: "paragraph";
  text: string;
  headingPath: string[];
  sourceRef: DocxSourceRef;
}

export interface DocxListItemBlock {
  blockNumber: number;
  kind: "listItem";
  text: string;
  headingPath: string[];
  sourceRef: DocxSourceRef;
}

export interface DocxTableBlock {
  blockNumber: number;
  kind: "table";
  cells: string[][];
  caption?: string;
  headingPath: string[];
  sourceRef: DocxSourceRef;
}

export type DocxBlock = DocxHeadingBlock | DocxParagraphBlock | DocxListItemBlock | DocxTableBlock;

export interface DocxExtractionResult {
  extractor: string;
  pageCount: number;
  pages: ExtractedPage[];
  tables: ExtractedTable[];
  blocks: DocxBlock[];
}

const EXTRACTOR = "docx-ooxml@1";

export class DocxDocumentParser {
  async parse(bytes: Uint8Array): Promise<DocxExtractionResult> {
    const entries = this.unzip(bytes);
    const documentXml = this.requireEntry(entries, "word/document.xml");
    const documentRoot = parseXml(documentXml, "word/document.xml");
    const body = findDirectChild(documentRoot, "w:body");

    if (!body) {
      throw new DocxParseError("Malformed DOCX: missing w:body in word/document.xml.");
    }

    const blocks = walkBody(body);
    const { pages, tables } = projectBlocks(blocks);

    return {
      extractor: EXTRACTOR,
      pageCount: pages.length,
      pages,
      tables,
      blocks,
    };
  }

  private unzip(bytes: Uint8Array): Record<string, Uint8Array> {
    try {
      return unzipSync(bytes);
    } catch (error) {
      throw new DocxParseError(`Invalid DOCX ZIP: ${(error as Error).message}`);
    }
  }

  private requireEntry(entries: Record<string, Uint8Array>, path: string): string {
    const file = entries[path];
    if (file) {
      return new TextDecoder().decode(file);
    }

    if (isEncryptedPackage(entries)) {
      throw new DocxParseError("Encrypted or password-protected DOCX packages are not supported.");
    }

    throw new DocxParseError(`Missing ${path} in DOCX package.`);
  }
}

export class DocxParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocxParseError";
  }
}

function projectBlocks(blocks: DocxBlock[]): { pages: ExtractedPage[]; tables: ExtractedTable[] } {
  const pages: ExtractedPage[] = [];
  const tables: ExtractedTable[] = [];

  for (const block of blocks) {
    pages.push({
      pageNumber: block.blockNumber,
      label: block.kind === "table" ? `DOCX table ${block.blockNumber}` : `DOCX ${block.kind} ${block.blockNumber}`,
      text: block.kind === "table" ? serializeTable(block.cells) : block.text,
    });

    if (block.kind === "table") {
      tables.push({
        pageNumber: block.blockNumber,
        caption: block.caption,
        cells: block.cells,
      });
    }
  }

  return { pages, tables };
}

function serializeTable(cells: string[][]): string {
  return cells.map((row) => row.join("\t")).join("\n");
}

function walkBody(body: XmlNode): DocxBlock[] {
  const blocks: DocxBlock[] = [];
  const headingStack: string[] = [];
  let blockNumber = 0;
  let paragraphIndex = 0;
  let tableIndex = 0;

  visitFlowChildren(body, (child) => {
    if (child.name === "w:p") {
      paragraphIndex += 1;
      blockNumber += 1;
      const { block, headingLevel } = parseParagraph(child, blockNumber, paragraphIndex, headingStack);
      if (block.kind === "heading") {
        const level = headingLevel ?? 1;
        headingStack.length = Math.max(0, level - 1);
        headingStack.push(block.text);
      }
      blocks.push(block);
      return;
    }

    if (child.name === "w:tbl") {
      tableIndex += 1;
      blockNumber += 1;
      blocks.push(parseTable(child, blockNumber, tableIndex, headingStack));
    }
  });

  return blocks;
}

function parseParagraph(
  node: XmlNode,
  blockNumber: number,
  index: number,
  headingStack: string[],
): { block: DocxBlock; headingLevel: number | null } {
  const pPr = findDirectChild(node, "w:pPr");
  const styleId = getAttribute(findDirectChild(pPr, "w:pStyle"), "w:val");
  const outlineLevel = getAttribute(findDirectChild(pPr, "w:outlineLvl"), "w:val");
  const numPr = findDirectChild(pPr, "w:numPr");
  const text = collectInlineText(node).replace(/\r\n/g, "\n");
  const headingLevelValue = parseHeadingLevel(styleId) ?? parseOutlineLevel(outlineLevel);
  const headingPath = [...headingStack];
  const sourceRef: DocxSourceRef = { xmlKind: "w:p", index };

  if (headingLevelValue) {
    return {
      headingLevel: headingLevelValue,
      block: {
        blockNumber,
        kind: "heading",
        text,
        headingPath: [...headingStack, text],
        sourceRef,
      },
    };
  }

  if (numPr) {
    return {
      headingLevel: null,
      block: {
        blockNumber,
        kind: "listItem",
        text,
        headingPath,
        sourceRef,
      },
    };
  }

  return {
    headingLevel: null,
    block: {
      blockNumber,
      kind: "paragraph",
      text,
      headingPath,
      sourceRef,
    },
  };
}

function parseTable(node: XmlNode, blockNumber: number, index: number, headingStack: string[]): DocxTableBlock {
  const rows = findDirectChildren(node, "w:tr");
  const parsedRows: string[][] = [];
  const activeVerticalMergeValues = new Map<number, string>();

  for (const row of rows) {
    const rowCells: string[] = [];
    let columnIndex = 0;

    for (const cell of findDirectChildren(row, "w:tc")) {
      const cellPr = findDirectChild(cell, "w:tcPr");
      const gridSpan = parseInteger(getAttribute(findDirectChild(cellPr, "w:gridSpan"), "w:val")) ?? 1;
      const vMergeNode = findDirectChild(cellPr, "w:vMerge");
      const verticalMerge = vMergeNode ? getAttribute(vMergeNode, "w:val") ?? "continue" : null;
      const text = extractCellText(cell);
      const mergedText =
        verticalMerge && verticalMerge !== "restart"
          ? activeVerticalMergeValues.get(columnIndex) ?? text
          : text;

      if (!verticalMerge || verticalMerge === "restart") {
        activeVerticalMergeValues.set(columnIndex, text);
      }

      rowCells.push(mergedText);
      for (let i = 1; i < gridSpan; i += 1) {
        rowCells.push("");
      }
      columnIndex += gridSpan;
    }

    parsedRows.push(rowCells);
  }

  const columnCount = Math.max(0, ...parsedRows.map((row) => row.length));
  const cells = parsedRows.map((row) => row.concat(Array.from({ length: columnCount - row.length }, () => "")));

  return {
    blockNumber,
    kind: "table",
    cells,
    headingPath: [...headingStack],
    sourceRef: { xmlKind: "w:tbl", index },
  };
}

function extractCellText(cell: XmlNode): string {
  const paragraphs = findDirectChildren(cell, "w:p").map((paragraph) => collectInlineText(paragraph).replace(/\r\n/g, "\n"));
  if (paragraphs.length) {
    return paragraphs.join("\n");
  }
  return collectInlineText(cell).replace(/\r\n/g, "\n");
}

function parseHeadingLevel(styleId: string | null): number | null {
  if (!styleId) return null;
  const normalized = styleId.replace(/\s+/g, "");
  const match = normalized.match(/^Heading(\d+)$/i);
  if (!match) return null;
  return Number(match[1]) || null;
}

function parseOutlineLevel(level: string | null): number | null {
  if (level == null || level === "") return null;
  const parsed = Number(level);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed + 1;
}

function parseInteger(value: string | null): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isEncryptedPackage(entries: Record<string, Uint8Array>): boolean {
  return Object.keys(entries).some((entry) =>
    entry === "EncryptedPackage" ||
    entry === "EncryptionInfo" ||
    entry.endsWith("/EncryptedPackage") ||
    entry.endsWith("/EncryptionInfo"),
  );
}

interface XmlNode {
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  text: string;
}

function parseXml(xml: string, sourceName: string): XmlNode {
  const parser = sax.parser(true, {
    trim: false,
    normalize: false,
    lowercase: false,
    xmlns: false,
  });

  const root: XmlNode = { name: "#document", attributes: {}, children: [], text: "" };
  const stack: XmlNode[] = [root];
  let parseError: Error | null = null;

  parser.onopentag = (node: { name: string; attributes: Record<string, unknown> }) => {
    const child: XmlNode = {
      name: node.name,
      attributes: normalizeAttributes(node.attributes),
      children: [],
      text: "",
    };
    stack[stack.length - 1]?.children.push(child);
    stack.push(child);
  };

  parser.ontext = (text: string) => {
    const current = stack[stack.length - 1];
    if (current) current.text += text;
  };

  parser.oncdata = (text: string) => {
    const current = stack[stack.length - 1];
    if (current) current.text += text;
  };

  parser.onclosetag = () => {
    if (stack.length > 1) stack.pop();
  };

  parser.onerror = (error: Error) => {
    parseError = new DocxParseError(`Malformed XML in ${sourceName}: ${(error as Error).message}`);
    parser.error = null;
    parser.resume();
  };

  parser.write(xml).close();

  if (parseError) {
    throw parseError;
  }

  const documentElement = root.children[0];
  if (!documentElement) {
    throw new DocxParseError(`Malformed XML in ${sourceName}: document is empty.`);
  }
  return documentElement;
}

function normalizeAttributes(attributes: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (typeof value === "string") {
      normalized[key] = value;
      continue;
    }
    if (value && typeof value === "object" && "value" in value) {
      normalized[key] = String((value as { value?: unknown }).value ?? "");
      continue;
    }
    normalized[key] = String(value ?? "");
  }
  return normalized;
}

function findDirectChild(node: XmlNode | undefined, name: string): XmlNode | undefined {
  return node?.children.find((child) => child.name === name);
}

function findDirectChildren(node: XmlNode | undefined, name: string): XmlNode[] {
  return node?.children.filter((child) => child.name === name) ?? [];
}

function getAttribute(node: XmlNode | undefined, name: string): string | null {
  if (!node) return null;
  const value = node.attributes[name];
  return typeof value === "string" ? value : null;
}

function collectInlineText(node: XmlNode): string {
  let text = "";

  for (const child of node.children) {
    if (child.name === "w:t") {
      text += child.text;
      continue;
    }

    if (child.name === "w:tab") {
      text += "\t";
      continue;
    }

    if (child.name === "w:br" || child.name === "w:cr") {
      text += "\n";
      continue;
    }

    text += collectInlineText(child);
  }

  return text;
}

function visitFlowChildren(node: XmlNode, visit: (child: XmlNode) => void): void {
  for (const child of node.children) {
    if (child.name === "w:p" || child.name === "w:tbl") {
      visit(child);
      continue;
    }

    if (child.name === "w:sdt") {
      const content = findDirectChild(child, "w:sdtContent");
      if (content) {
        visitFlowChildren(content, visit);
      }
    }
  }
}
