import { describe, expect, test } from "bun:test";

import { DocxDocumentParser } from "@rfp-os/document-processing";
import {
  buildDocx,
  docxHeading,
  docxListItem,
  docxParagraph,
  docxTable,
} from "./docx-test-fixtures";

const parser = new DocxDocumentParser();

describe("DocxDocumentParser", () => {
  test("extracts a simple paragraph", async () => {
    const result = await parser.parse(buildDocx([docxParagraph("Hello DOCX")]));

    expect(result.pageCount).toBe(1);
    expect(result.blocks).toHaveLength(1);
    const [firstBlock] = result.blocks;
    expect(firstBlock?.kind).toBe("paragraph");
    if (firstBlock?.kind === "paragraph") {
      expect(firstBlock.text).toBe("Hello DOCX");
    }
    expect(result.pages[0]?.pageNumber).toBe(1);
    expect(result.pages[0]?.text).toBe("Hello DOCX");
  });

  test("preserves multiple paragraphs in order", async () => {
    const result = await parser.parse(
      buildDocx([docxParagraph("First paragraph"), docxParagraph("Second paragraph")]),
    );

    expect(result.blocks.map((block) => block.kind)).toEqual(["paragraph", "paragraph"]);
    expect(result.pages.map((page) => page.text)).toEqual(["First paragraph", "Second paragraph"]);
  });

  test("tracks heading hierarchy", async () => {
    const result = await parser.parse(
      buildDocx([
        docxHeading(1, "Parent"),
        docxParagraph("Intro"),
        docxHeading(2, "Child"),
        docxParagraph("Body"),
      ]),
    );

    expect(result.blocks.map((block) => block.kind)).toEqual([
      "heading",
      "paragraph",
      "heading",
      "paragraph",
    ]);
    expect(result.blocks[0]?.headingPath).toEqual(["Parent"]);
    expect(result.blocks[1]?.headingPath).toEqual(["Parent"]);
    expect(result.blocks[2]?.headingPath).toEqual(["Parent", "Child"]);
    expect(result.blocks[3]?.headingPath).toEqual(["Parent", "Child"]);
  });

  test("recognizes list items in order", async () => {
    const result = await parser.parse(
      buildDocx([
        docxListItem("First bullet"),
        docxListItem("Second bullet", { numId: 2 }),
      ]),
    );

    expect(result.blocks.map((block) => block.kind)).toEqual(["listItem", "listItem"]);
    expect(result.blocks.map((block) => ("text" in block ? block.text : ""))).toEqual([
      "First bullet",
      "Second bullet",
    ]);
  });

  test("preserves table order and cell order", async () => {
    const result = await parser.parse(buildDocx([docxTable([["A", "B"], ["C", "D"]])]));

    expect(result.blocks).toHaveLength(1);
    const [table] = result.blocks;
    expect(table?.kind).toBe("table");
    if (table?.kind === "table") {
      expect(table.cells).toEqual([
        ["A", "B"],
        ["C", "D"],
      ]);
      expect(table.sourceRef).toEqual({ xmlKind: "w:tbl", index: 1 });
    }
    expect(result.pages[0]?.text).toBe("A\tB\nC\tD");
  });

  test("preserves mixed block order", async () => {
    const result = await parser.parse(
      buildDocx([
        docxHeading(1, "Section"),
        docxParagraph("Intro"),
        docxTable([["T1"]]),
        docxParagraph("After table"),
        docxListItem("Checklist item"),
        docxTable([["T2"]]),
      ]),
    );

    expect(result.blocks.map((block) => block.kind)).toEqual([
      "heading",
      "paragraph",
      "table",
      "paragraph",
      "listItem",
      "table",
    ]);
    expect(result.pages.map((page) => page.pageNumber)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test("handles an empty document", async () => {
    const result = await parser.parse(buildDocx([]));

    expect(result.pageCount).toBe(0);
    expect(result.blocks).toHaveLength(0);
    expect(result.pages).toHaveLength(0);
    expect(result.tables).toHaveLength(0);
  });

  test("rejects invalid ZIP bytes", async () => {
    const error = await parser.parse(new TextEncoder().encode("not a zip")).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
  });

  test("rejects packages missing word/document.xml", async () => {
    const error = await parser.parse(buildDocx([], { includeDocumentXml: false })).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(Error);
  });

  test("rejects malformed document.xml", async () => {
    const error = await parser
      .parse(buildDocx([], { documentXml: "<w:document><w:body><w:p></w:body></w:document>" }))
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
  });

  test("rejects encrypted packages", async () => {
    const error = await parser.parse(buildDocx([], { encrypted: true })).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(Error);
  });
});
