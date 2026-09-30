import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  customers,
  documentExtractions,
  documentPages,
  documentTables,
  files,
  getDb,
  organizations,
  rfpDocuments,
  rfps,
  users,
} from "@rfp-os/db";
import { eq, inArray } from "drizzle-orm";

import { ExtractionRepository, type ExtractionResult } from "./extraction.repository";

/**
 * Integration coverage against a real database. What these tests are about is
 * the replace-on-re-extract behaviour and the tenant scoping, both of which
 * are properties of the SQL and the constraints rather than of the types.
 */
const shouldRunDbTests = Boolean(process.env.DATABASE_URL && !process.env.TENDYY_ROOT_BUN_TEST);
const dbTest = shouldRunDbTests ? test : test.skip;
const describeDb = shouldRunDbTests ? describe : describe.skip;

describeDb("Extraction storage", () => {
  const db = shouldRunDbTests ? getDb() : (undefined as never);
  const repository = new ExtractionRepository();

  const suffix = randomUUID().slice(0, 8);
  const orgA = randomUUID();
  const orgB = randomUUID();
  const userId = randomUUID();
  const customerId = randomUUID();
  const rfpId = randomUUID();
  const documentIds: string[] = [];
  const fileIds: string[] = [];

  beforeAll(async () => {
    await db.insert(organizations).values([
      { id: orgA, name: `Extract Org A ${suffix}`, domain: `ea-${suffix}.invalid` },
      { id: orgB, name: `Extract Org B ${suffix}`, domain: `eb-${suffix}.invalid` },
    ]);
    await db.insert(users).values({
      id: userId,
      organizationId: orgA,
      name: "Extraction Tester",
      email: `extract-${suffix}@ea-${suffix}.invalid`,
    });
    await db
      .insert(customers)
      .values({ id: customerId, organizationId: orgA, name: `Client ${suffix}` });
    await db.insert(rfps).values({
      id: rfpId,
      organizationId: orgA,
      customerId,
      title: `Extract RFP ${suffix}`,
      ownerId: userId,
      createdBy: userId,
      deadline: "2026-12-31",
    });
  });

  afterAll(async () => {
    if (documentIds.length) {
      await db.delete(rfpDocuments).where(inArray(rfpDocuments.id, documentIds));
    }
    if (fileIds.length) await db.delete(files).where(inArray(files.id, fileIds));
    await db.delete(rfps).where(eq(rfps.id, rfpId));
    await db.delete(customers).where(eq(customers.id, customerId));
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
  });

  async function givenDocument(): Promise<string> {
    const documentId = randomUUID();
    const fileId = randomUUID();
    documentIds.push(documentId);
    fileIds.push(fileId);
    await db.insert(files).values({
      id: fileId,
      organizationId: orgA,
      bucket: "test",
      objectKey: `${orgA}/${fileId}/doc.pdf`,
      filename: "doc.pdf",
      mimeType: "application/pdf",
      sizeBytes: 512,
      uploadedBy: userId,
    });
    await db.insert(rfpDocuments).values({
      id: documentId,
      organizationId: orgA,
      rfpId,
      fileId,
      filename: "doc.pdf",
      type: "PDF",
      status: "parsed",
      uploadedBy: userId,
    });
    return documentId;
  }

  const result = (pages: string[], tables: string[][][] = []): ExtractionResult => ({
    extractor: "test-extractor@1.0",
    pages: pages.map((text, i) => ({ pageNumber: i + 1, text, label: `Page ${i + 1}` })),
    tables: tables.map((cells) => ({ cells, pageNumber: 1 })),
  });

  describe("saveSuccess", () => {
    dbTest("stores pages and derives the counts from the content", async () => {
      const documentId = await givenDocument();
      const stored = await repository.saveSuccess(
        { organizationId: orgA, documentId, version: 1 },
        result(["first page", "second page"], [[["a", "b"], ["c", "d"]]]),
      );

      expect(stored.status).toBe("succeeded");
      expect(stored.pageCount).toBe(2);
      expect(stored.tableCount).toBe(1);
      expect(stored.characterCount).toBe("first page".length + "second page".length);
    });

    dbTest("keeps pages readable in order, with their labels", async () => {
      const documentId = await givenDocument();
      const stored = await repository.saveSuccess(
        { organizationId: orgA, documentId, version: 1 },
        result(["alpha", "beta", "gamma"]),
      );

      const pages = await repository.listPages(orgA, stored.id);
      expect(pages.map((p) => p.text)).toEqual(["alpha", "beta", "gamma"]);
      expect(pages.map((p) => p.pageNumber)).toEqual([1, 2, 3]);
      expect(pages[0]?.label).toBe("Page 1");
    });

    dbTest("round-trips table cells as a grid of text", async () => {
      const documentId = await givenDocument();
      const grid = [
        ["Requirement", "Mandatory"],
        ["SSO", "Yes"],
        ["Uptime", "99.9%"],
      ];
      const stored = await repository.saveSuccess(
        { organizationId: orgA, documentId, version: 1 },
        result(["page"], [grid]),
      );

      const [table] = await repository.listTables(orgA, stored.id);
      expect(table?.cells).toEqual(grid);
      expect(table?.rowCount).toBe(3);
      expect(table?.columnCount).toBe(2);
    });
  });

  describe("re-extraction", () => {
    /**
     * A re-parse is a wholly new reading of the same bytes. Reconciling
     * page-by-page would leave stale rows whenever the new run found fewer
     * pages than the old one, so the previous content is replaced outright.
     */
    dbTest("replaces previous content rather than accumulating it", async () => {
      const documentId = await givenDocument();
      const first = await repository.saveSuccess(
        { organizationId: orgA, documentId, version: 1 },
        result(["one", "two", "three"]),
      );
      const second = await repository.saveSuccess(
        { organizationId: orgA, documentId, version: 1 },
        result(["rewritten"]),
      );

      // Same extraction row: the unique constraint makes the upsert land on it.
      expect(second.id).toBe(first.id);
      const pages = await repository.listPages(orgA, second.id);
      expect(pages.map((p) => p.text)).toEqual(["rewritten"]);
      expect(second.pageCount).toBe(1);
    });

    /**
     * Evidence cited against version 1 has to keep resolving after version 2
     * is uploaded, so each version owns a separate extraction.
     */
    dbTest("a new document version extracts alongside, not over, the old one", async () => {
      const documentId = await givenDocument();
      const v1 = await repository.saveSuccess(
        { organizationId: orgA, documentId, version: 1 },
        result(["original text"]),
      );
      const v2 = await repository.saveSuccess(
        { organizationId: orgA, documentId, version: 2 },
        result(["revised text"]),
      );

      expect(v2.id).not.toBe(v1.id);
      const v1Pages = await repository.listPages(orgA, v1.id);
      expect(v1Pages[0]?.text).toBe("original text");
    });
  });

  describe("saveFailure", () => {
    dbTest("records the reason and clears any stale content", async () => {
      const documentId = await givenDocument();
      const stored = await repository.saveSuccess(
        { organizationId: orgA, documentId, version: 1 },
        result(["text that will go stale"]),
      );

      await repository.saveFailure(
        { organizationId: orgA, documentId, version: 1 },
        "unpdf@0.12",
        "encrypted PDF",
      );

      const extraction = await repository.find(orgA, documentId, 1);
      expect(extraction?.status).toBe("failed");
      expect(extraction?.failureReason).toBe("encrypted PDF");
      // Content from the earlier success must not survive a later failure.
      expect(await repository.listPages(orgA, stored.id)).toHaveLength(0);
      expect(extraction?.pageCount).toBeNull();
    });
  });

  describe("tenant scoping", () => {
    dbTest("another organization cannot read the extraction or its content", async () => {
      const documentId = await givenDocument();
      const stored = await repository.saveSuccess(
        { organizationId: orgA, documentId, version: 1 },
        result(["confidential"], [[["secret"]]]),
      );

      expect(await repository.find(orgB, documentId, 1)).toBeNull();
      expect(await repository.listPages(orgB, stored.id)).toHaveLength(0);
      expect(await repository.listTables(orgB, stored.id)).toHaveLength(0);
    });
  });

  describe("cascade", () => {
    /**
     * Deleting a document must not strand its extracted text: those rows carry
     * the document's content, and orphaned copies would outlive the deletion
     * they were supposed to honour.
     */
    dbTest("deleting the document removes its extraction, pages and tables", async () => {
      const documentId = await givenDocument();
      const stored = await repository.saveSuccess(
        { organizationId: orgA, documentId, version: 1 },
        result(["to be deleted"], [[["x"]]]),
      );

      await db.delete(rfpDocuments).where(eq(rfpDocuments.id, documentId));

      const extractions = await db
        .select()
        .from(documentExtractions)
        .where(eq(documentExtractions.id, stored.id));
      const pages = await db
        .select()
        .from(documentPages)
        .where(eq(documentPages.extractionId, stored.id));
      const tables = await db
        .select()
        .from(documentTables)
        .where(eq(documentTables.extractionId, stored.id));

      expect(extractions).toHaveLength(0);
      expect(pages).toHaveLength(0);
      expect(tables).toHaveLength(0);
    });
  });
});
