export interface ExtractedPage {
  pageNumber: number;
  label?: string;
  text: string;
}

export interface ExtractedTable {
  pageNumber?: number | null;
  caption?: string;
  cells: string[][];
}

export interface ExtractedBlock {
  kind: "heading" | "paragraph" | "listItem" | "table";
  text?: string;
  cells?: string[][];
  headingPath: string[];
  sourceRef: { xmlKind: "w:p" | "w:tbl"; index: number };
}

export interface ExtractionResult {
  extractor: string;
  pages: ExtractedPage[];
  tables: ExtractedTable[];
  blocks?: ExtractedBlock[];
}
