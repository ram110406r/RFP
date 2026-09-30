import { zipSync, strToU8 } from "fflate";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function buildDocx(bodyChildren: string[], options: BuildDocxOptions = {}): Uint8Array {
  if (options.encrypted) {
    return zipSync({
      "[Content_Types].xml": strToU8(baseContentTypesXml(true)),
      "_rels/.rels": strToU8(baseRelsXml()),
      EncryptionInfo: strToU8(""),
      EncryptedPackage: strToU8(""),
    });
  }

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(baseContentTypesXml()),
    "_rels/.rels": strToU8(baseRelsXml()),
  };

  if (options.includeDocumentXml !== false) {
    files["word/document.xml"] = strToU8(options.documentXml ?? wrapDocumentXml(bodyChildren.join("")));
  }
  Object.assign(files, options.extraEntries);

  return zipSync(files);
}

export function docxParagraph(text: string): string {
  return `<w:p><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p>`;
}

export function docxHeading(level: number, text: string): string {
  return `<w:p><w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p>`;
}

export function docxListItem(text: string, options: { numId?: number; ilvl?: number } = {}): string {
  const numId = options.numId ?? 1;
  const ilvl = options.ilvl ?? 0;
  return [
    `<w:p><w:pPr><w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>`,
    `<w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p>`,
  ].join("");
}

export function docxTable(rows: string[][]): string {
  const columnCount = Math.max(0, ...rows.map((row) => row.length));
  const grid = `<w:tblGrid>${Array.from({ length: columnCount }, () => "<w:gridCol w:w=\"2400\"/>").join("")}</w:tblGrid>`;
  const tableRows = rows
    .map((row) => {
      const cells = row
        .map((cell) => `<w:tc><w:p><w:r><w:t>${escapeXml(cell)}</w:t></w:r></w:p></w:tc>`)
        .join("");
      return `<w:tr>${cells}</w:tr>`;
    })
    .join("");
  return `<w:tbl>${grid}${tableRows}</w:tbl>`;
}

export interface BuildDocxOptions {
  documentXml?: string;
  includeDocumentXml?: boolean;
  encrypted?: boolean;
  /** Additional package parts, e.g. media or padding for limit tests. */
  extraEntries?: Record<string, Uint8Array>;
}

function wrapDocumentXml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`;
}

function baseContentTypesXml(includeEncrypted = false): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>${
    includeEncrypted
      ? '<Override PartName="/EncryptedPackage" ContentType="application/vnd.openxmlformats-officedocument.encryptedPackage"/>'
      : ""
  }</Types>`;
}

function baseRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
