import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  customers,
  documentExtractions,
  documentPages,
  documentVersions,
  files,
  getDb,
  organizations,
  rfpDocuments,
  rfps,
  users,
} from "@rfp-os/db";
import { DOCUMENT_JOBS, type DocumentJobPayload } from "@rfp-os/jobs";
import type { ObjectStorage } from "@rfp-os/storage";
import { asc, eq, inArray, and } from "drizzle-orm";

import { DocumentProcessor, isOcrRequired, isPermanent } from "./document-processor";
import { DocxDocumentParser } from "./docx-document-parser";
import {
  DOCX_MIME,
  buildDocx,
  docxHeading,
  docxParagraph,
  docxTable,
} from "./docx-test-fixtures";

/**
 * Integration coverage against a real database.
 *
 * The worker has to preserve tenant scope, version scope and idempotency even
 * when the same document is processed twice or a newer version exists while
 * an older job is still running.
 */
const dbTest = process.env.DATABASE_URL ? test : test.skip;
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb("Document processing", () => {
  const db = getDb();
  const storage = new FakeStorage();
  const processor = new DocumentProcessor(storage as unknown as ObjectStorage);

  const suffix = randomUUID().slice(0, 8);
  const orgA = randomUUID();
  const orgB = randomUUID();
  const userId = randomUUID();
  const customerId = randomUUID();
  const rfpId = randomUUID();
  const documentIds: string[] = [];
  const fileIds: string[] = [];
  const versionIds: string[] = [];

  beforeAll(async () => {
    await db.insert(organizations).values([
      { id: orgA, name: `Worker Org A ${suffix}`, domain: `wa-${suffix}.invalid` },
      { id: orgB, name: `Worker Org B ${suffix}`, domain: `wb-${suffix}.invalid` },
    ]);
    await db.insert(users).values({
      id: userId,
      organizationId: orgA,
      name: "Parser Tester",
      email: `parser-${suffix}@wa-${suffix}.invalid`,
    });
    await db
      .insert(customers)
      .values({ id: customerId, organizationId: orgA, name: `Client ${suffix}` });
    await db.insert(rfps).values({
      id: rfpId,
      organizationId: orgA,
      customerId,
      title: `Worker RFP ${suffix}`,
      ownerId: userId,
      createdBy: userId,
      deadline: "2026-12-31",
    });
  });

  afterAll(async () => {
    if (documentIds.length) {
      await db.delete(rfpDocuments).where(inArray(rfpDocuments.id, documentIds));
    }
    if (versionIds.length) {
      await db.delete(documentVersions).where(inArray(documentVersions.id, versionIds));
    }
    if (fileIds.length) await db.delete(files).where(inArray(files.id, fileIds));
    await db.delete(rfps).where(eq(rfps.id, rfpId));
    await db.delete(customers).where(eq(customers.id, customerId));
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
  });

  async function givenQueuedDocument(
    content: Uint8Array = buildPdf(["Current document"]),
    options: { mimeType?: string; documentType?: "PDF" | "DOCX"; filename?: string } = {},
  ): Promise<DocumentJobPayload> {
    const documentType = options.documentType ?? "PDF";
    const mimeType = options.mimeType ?? (documentType === "DOCX" ? DOCX_MIME : "application/pdf");
    const filename = options.filename ?? (documentType === "DOCX" ? "doc.docx" : "doc.pdf");
    const documentId = randomUUID();
    const fileId = randomUUID();
    const versionId = randomUUID();
    const objectKey = `${orgA}/${rfpId}/${fileId}/${filename}`;
    documentIds.push(documentId);
    fileIds.push(fileId);
    versionIds.push(versionId);

    await db.insert(files).values({
      id: fileId,
      organizationId: orgA,
      bucket: "test-bucket",
      objectKey,
      filename,
      mimeType,
      sizeBytes: content.length,
      uploadedBy: userId,
    });
    await db.insert(rfpDocuments).values({
      id: documentId,
      organizationId: orgA,
      rfpId,
      fileId,
      filename,
      type: documentType,
      status: "queued",
      currentVersion: 1,
      storageKey: objectKey,
      uploadedBy: userId,
    });
    await db.insert(documentVersions).values({
      id: versionId,
      organizationId: orgA,
      documentId,
      fileId,
      version: 1,
      note: "Initial upload.",
      createdBy: userId,
    });
    storage.put(objectKey, content);

    return {
      organizationId: orgA,
      rfpId,
      documentId,
      fileId,
      version: 1,
      objectKey,
      mimeType,
      actorId: userId,
    };
  }

  async function givenQueuedDocxDocument(
    content: Uint8Array = buildDocx([docxParagraph("Current document")]),
  ): Promise<DocumentJobPayload> {
    return givenQueuedDocument(content, {
      documentType: "DOCX",
      mimeType: DOCX_MIME,
      filename: "doc.docx",
    });
  }

  async function addVersion(
    documentId: string,
    version: number,
    content: Uint8Array,
    options: { documentType?: "PDF" | "DOCX"; filename?: string; mimeType?: string } = {},
  ): Promise<DocumentJobPayload> {
    const documentType = options.documentType ?? "PDF";
    const filename = options.filename ?? `doc-v${version}.${documentType === "DOCX" ? "docx" : "pdf"}`;
    const mimeType = options.mimeType ?? (documentType === "DOCX" ? DOCX_MIME : "application/pdf");
    const fileId = randomUUID();
    const versionId = randomUUID();
    const objectKey = `${orgA}/${rfpId}/${fileId}/${filename}`;
    fileIds.push(fileId);
    versionIds.push(versionId);

    await db.insert(files).values({
      id: fileId,
      organizationId: orgA,
      bucket: "test-bucket",
      objectKey,
      filename,
      mimeType,
      sizeBytes: content.length,
      uploadedBy: userId,
    });
    await db.insert(documentVersions).values({
      id: versionId,
      organizationId: orgA,
      documentId,
      fileId,
      version,
      note: `Version ${version}.`,
      createdBy: userId,
    });
    storage.put(objectKey, content);

    return {
      organizationId: orgA,
      rfpId,
      documentId,
      fileId,
      version,
      objectKey,
      mimeType,
      actorId: userId,
    };
  }

  async function promoteToCurrentVersion(
    documentId: string,
    payload: DocumentJobPayload,
    filename = "doc-v2.pdf",
  ): Promise<void> {
    await db
      .update(rfpDocuments)
      .set({
        fileId: payload.fileId,
        filename,
        status: "queued",
        currentVersion: payload.version,
        pageCount: null,
        failureReason: null,
        storageKey: payload.objectKey,
        updatedAt: new Date(),
      })
      .where(eq(rfpDocuments.id, documentId));
  }

  async function statusOf(documentId: string) {
    const [row] = await db
      .select({
        status: rfpDocuments.status,
        failureReason: rfpDocuments.failureReason,
        currentVersion: rfpDocuments.currentVersion,
        fileId: rfpDocuments.fileId,
        pageCount: rfpDocuments.pageCount,
        archivedAt: rfpDocuments.archivedAt,
      })
      .from(rfpDocuments)
      .where(eq(rfpDocuments.id, documentId))
      .limit(1);
    return row;
  }

  async function extractionOf(documentId: string, version: number) {
    const [row] = await db
      .select()
      .from(documentExtractions)
      .where(
        and(
          eq(documentExtractions.documentId, documentId),
          eq(documentExtractions.version, version),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  describe("parse", () => {
    dbTest("drives a valid document to parsed and stores the extraction", async () => {
      const payload = await givenQueuedDocument(buildPdf(["First page text", "Second page text"]));
      const result = await processor.process(DOCUMENT_JOBS.PARSE, payload);

      expect(result).toEqual({ processed: true, status: "parsed" });
      expect((await statusOf(payload.documentId))?.status).toBe("parsed");

      const extraction = await extractionOf(payload.documentId, 1);
      expect(extraction?.status).toBe("succeeded");
      expect(extraction?.pageCount).toBe(2);
      const pages = await db
        .select()
        .from(documentPages)
        .where(eq(documentPages.extractionId, extraction?.id ?? ""))
        .orderBy(asc(documentPages.pageNumber));
      expect(pages.map((page) => page.text)).toEqual(["First page text", "Second page text"]);
    });

    dbTest("keeps page ordering stable", async () => {
      const payload = await givenQueuedDocument(buildPdf(["alpha", "beta", "gamma"]));
      await processor.process(DOCUMENT_JOBS.PARSE, payload);

      const extraction = await extractionOf(payload.documentId, 1);
      const pages = await db
        .select()
        .from(documentPages)
        .where(eq(documentPages.extractionId, extraction?.id ?? ""))
        .orderBy(asc(documentPages.pageNumber));
      expect(pages.map((page) => page.pageNumber)).toEqual([1, 2, 3]);
      expect(pages.map((page) => page.text)).toEqual(["alpha", "beta", "gamma"]);
    });

    dbTest("stops at parsed rather than claiming ready", async () => {
      const payload = await givenQueuedDocument(buildPdf(["Current document"]));
      await processor.process(DOCUMENT_JOBS.PARSE, payload);
      expect((await statusOf(payload.documentId))?.status).not.toBe("ready");
    });

    dbTest("is a no-op when the current document is already parsed", async () => {
      const payload = await givenQueuedDocument(buildPdf(["Current document"]));
      await processor.process(DOCUMENT_JOBS.PARSE, payload);

      const second = await processor.process(DOCUMENT_JOBS.PARSE, payload);
      expect(second).toEqual({ processed: false, status: "parsed" });
    });

    dbTest("drives a DOCX document to parsed and stores the extraction", async () => {
      const payload = await givenQueuedDocxDocument(
        buildDocx([docxHeading(1, "DOCX Section"), docxParagraph("Paragraph"), docxTable([["A", "B"]])]),
      );
      const result = await processor.process(DOCUMENT_JOBS.PARSE, payload);

      expect(result).toEqual({ processed: true, status: "parsed" });
      expect((await statusOf(payload.documentId))?.status).toBe("parsed");

      const extraction = await extractionOf(payload.documentId, 1);
      expect(extraction?.status).toBe("succeeded");
      expect(extraction?.pageCount).toBe(3);
      const pages = await db
        .select()
        .from(documentPages)
        .where(eq(documentPages.extractionId, extraction?.id ?? ""))
        .orderBy(asc(documentPages.pageNumber));
      expect(pages.map((page) => page.text)).toEqual(["DOCX Section", "Paragraph", "A\tB"]);
    });

    dbTest("routes a textless PDF to OCR instead of silently storing an empty extraction", async () => {
      const payload = await givenQueuedDocument(buildPdf([""]));
      const error = await processor.process(DOCUMENT_JOBS.PARSE, payload).catch(
        (caught: unknown) => caught,
      );

      expect(isOcrRequired(error)).toBe(true);
      expect(await extractionOf(payload.documentId, 1)).toBeNull();
      expect((await statusOf(payload.documentId))?.status).toBe("processing");
    });

    dbTest("stores OCR sidecar text in the normal extraction model", async () => {
      const payload = await givenQueuedDocument(buildPdf([""]));
      storage.put(`${payload.objectKey}.ocr.txt`, new TextEncoder().encode("Vendor shall provide support.\fBidder must submit references."));

      const result = await processor.process(DOCUMENT_JOBS.OCR, payload);

      expect(result).toEqual({ processed: true, status: "parsed" });
      expect((await statusOf(payload.documentId))?.status).toBe("parsed");
      const extraction = await extractionOf(payload.documentId, 1);
      expect(extraction?.extractor).toBe("sidecar-ocr-text@1");
      expect(extraction?.pageCount).toBe(2);
      const pages = await db
        .select()
        .from(documentPages)
        .where(eq(documentPages.extractionId, extraction?.id ?? ""))
        .orderBy(asc(documentPages.pageNumber));
      expect(pages.map((page) => page.text)).toEqual([
        "Vendor shall provide support.",
        "Bidder must submit references.",
      ]);
    });
  });

  describe("persistence", () => {
    dbTest("does not mark parsed until extraction persistence succeeds", async () => {
      const payload = await givenQueuedDocument(buildPdf(["Pending persistence"]));
      const failingProcessor = new DocumentProcessor(
        storage as unknown as ObjectStorage,
        {
          parse: async () => ({
            extractor: "stub@1.0",
            pageCount: 1,
            pages: [{ pageNumber: 1, text: "Pending persistence" }],
            tables: [],
          }),
        } as never,
        new DocxDocumentParser(),
        {
          saveSuccess: async () => {
            throw new Error("database unavailable");
          },
          saveFailure: async () => {},
          find: async () => null,
          listPages: async () => [],
          listTables: async () => [],
        } as never,
      );

      const error = await failingProcessor.process(DOCUMENT_JOBS.PARSE, payload).catch(
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(Error);
      expect(isPermanent(error)).toBe(false);
      expect((await statusOf(payload.documentId))?.status).toBe("processing");
      expect(await extractionOf(payload.documentId, 1)).toBeNull();
    });
  });

  describe("permanent failures", () => {
    dbTest("rejects corrupt PDFs as permanent failures", async () => {
      const payload = await givenQueuedDocument(new TextEncoder().encode("%PDF-1.7\nnot a pdf"));
      const error = await processor.process(DOCUMENT_JOBS.PARSE, payload).catch(
        (caught: unknown) => caught,
      );

      expect(isPermanent(error)).toBe(true);
      expect((await statusOf(payload.documentId))?.status).toBe("processing");
    });

    dbTest("rejects password-protected PDFs as permanent failures", async () => {
      const payload = await givenQueuedDocument(buildPdf(["Secret"], { encrypted: true }));
      const error = await processor.process(DOCUMENT_JOBS.PARSE, payload).catch(
        (caught: unknown) => caught,
      );

      expect(isPermanent(error)).toBe(true);
    });

    dbTest("fails when the object is gone from storage", async () => {
      const payload = await givenQueuedDocument();
      storage.delete(payload.objectKey);

      const error = await processor.process(DOCUMENT_JOBS.PARSE, payload).catch(
        (caught: unknown) => caught,
      );

      expect(isPermanent(error)).toBe(true);
      expect((await statusOf(payload.documentId))?.status).toBe("processing");
    });

    dbTest("refuses a document archived before processing ran", async () => {
      const payload = await givenQueuedDocument();
      await db
        .update(rfpDocuments)
        .set({ archivedAt: new Date(), status: "archived" })
        .where(eq(rfpDocuments.id, payload.documentId));

      const error = await processor.process(DOCUMENT_JOBS.PARSE, payload).catch(
        (caught: unknown) => caught,
      );
      expect(isPermanent(error)).toBe(true);
    });

    dbTest("fails OCR loudly when the OCR sidecar text is missing", async () => {
      const payload = await givenQueuedDocument(buildPdf([""]));
      const error = await processor.process(DOCUMENT_JOBS.OCR, payload).catch(
        (caught: unknown) => caught,
      );

      expect(isPermanent(error)).toBe(true);
      expect((error as Error).message).toContain("OCR text is missing");
    });

    dbTest("reports the remaining unimplemented jobs as permanent, not retryable", async () => {
      const payload = await givenQueuedDocument();
      for (const job of [
        DOCUMENT_JOBS.TABLE_EXTRACTION,
        DOCUMENT_JOBS.NORMALIZATION,
      ] as const) {
        const error = await processor.process(job, payload).catch((caught: unknown) => caught);
        expect(isPermanent(error)).toBe(true);
      }
    });
  });

  describe("transient failures", () => {
    dbTest("a storage outage is not permanent", async () => {
      const payload = await givenQueuedDocument();
      storage.failNext = true;

      const error = await processor.process(DOCUMENT_JOBS.PARSE, payload).catch(
        (caught: unknown) => caught,
      );
      expect(isPermanent(error)).toBe(false);
      expect((await statusOf(payload.documentId))?.status).toBe("processing");
    });

    dbTest("recordFailure writes the terminal state and its reason", async () => {
      const payload = await givenQueuedDocument();
      await processor.recordFailure(payload, "exhausted after 3 attempts");

      const row = await statusOf(payload.documentId);
      expect(row?.status).toBe("failed");
      expect(row?.failureReason).toBe("exhausted after 3 attempts");
    });
  });

  describe("version safety", () => {
    dbTest("an older version does not overwrite the current document state", async () => {
      const v1 = buildPdf(["Version 1"]);
      const current = await givenQueuedDocument(v1);
      const v2 = await addVersion(current.documentId, 2, buildPdf(["Version 2"]));
      await promoteToCurrentVersion(current.documentId, v2);

      const staleResult = await processor.process(DOCUMENT_JOBS.PARSE, current);
      expect(staleResult).toEqual({ processed: true, status: "parsed" });
      expect((await statusOf(current.documentId))?.status).toBe("queued");
      expect((await statusOf(current.documentId))?.currentVersion).toBe(2);

      const staleExtraction = await extractionOf(current.documentId, 1);
      expect(staleExtraction?.status).toBe("succeeded");

      const liveResult = await processor.process(DOCUMENT_JOBS.PARSE, v2);
      expect(liveResult).toEqual({ processed: true, status: "parsed" });
      expect((await statusOf(current.documentId))?.status).toBe("parsed");
      expect((await statusOf(current.documentId))?.pageCount).toBe(1);
      expect((await extractionOf(current.documentId, 2))?.status).toBe("succeeded");
    });

    dbTest("an older DOCX version does not overwrite the current document state", async () => {
      const v1 = buildDocx([docxHeading(1, "Version 1"), docxParagraph("Body 1")]);
      const current = await givenQueuedDocxDocument(v1);
      const v2 = await addVersion(current.documentId, 2, buildDocx([docxHeading(1, "Version 2")]), {
        documentType: "DOCX",
        filename: "doc-v2.docx",
        mimeType: DOCX_MIME,
      });
      await promoteToCurrentVersion(current.documentId, v2, "doc-v2.docx");

      const staleResult = await processor.process(DOCUMENT_JOBS.PARSE, current);
      expect(staleResult).toEqual({ processed: true, status: "parsed" });
      expect((await statusOf(current.documentId))?.status).toBe("queued");
      expect((await statusOf(current.documentId))?.currentVersion).toBe(2);

      const liveResult = await processor.process(DOCUMENT_JOBS.PARSE, v2);
      expect(liveResult).toEqual({ processed: true, status: "parsed" });
      expect((await statusOf(current.documentId))?.status).toBe("parsed");
      expect((await statusOf(current.documentId))?.pageCount).toBeGreaterThan(0);
      expect((await extractionOf(current.documentId, 2))?.status).toBe("succeeded");
    });

    dbTest("a job carrying the wrong organization cannot touch the document", async () => {
      const payload = await givenQueuedDocument();
      const error = await processor
        .process(DOCUMENT_JOBS.PARSE, { ...payload, organizationId: orgB })
        .catch((caught: unknown) => caught);

      expect(isPermanent(error)).toBe(true);
      expect((await statusOf(payload.documentId))?.status).toBe("queued");
    });

    dbTest("a job carrying the wrong organization cannot touch a DOCX document", async () => {
      const payload = await givenQueuedDocxDocument();
      const error = await processor
        .process(DOCUMENT_JOBS.PARSE, { ...payload, organizationId: orgB })
        .catch((caught: unknown) => caught);

      expect(isPermanent(error)).toBe(true);
      expect((await statusOf(payload.documentId))?.status).toBe("queued");
    });
  });

  describe("archive safety", () => {
    dbTest("an archived document cannot be changed back to parsed", async () => {
      const payload = await givenQueuedDocument(buildPdf(["Archive race"]));
      const archivingProcessor = new DocumentProcessor(
        storage as unknown as ObjectStorage,
        {
          parse: async () => {
            await db
              .update(rfpDocuments)
              .set({ archivedAt: new Date(), status: "archived" })
              .where(eq(rfpDocuments.id, payload.documentId));
            return {
              extractor: "stub@1.0",
              pageCount: 1,
              pages: [{ pageNumber: 1, text: "Archive race" }],
              tables: [],
            };
          },
        } as never,
        new DocxDocumentParser(),
        {
          saveSuccess: async () => ({
            id: randomUUID(),
            status: "succeeded",
            pageCount: 1,
            characterCount: 12,
            tableCount: 0,
          }),
          saveFailure: async () => {},
          find: async () => null,
          listPages: async () => [],
          listTables: async () => [],
        } as never,
      );

      const result = await archivingProcessor.process(DOCUMENT_JOBS.PARSE, payload);
      expect(result).toEqual({ processed: true, status: "parsed" });

      const row = await statusOf(payload.documentId);
      expect(row?.status).toBe("archived");
      expect(row?.archivedAt).not.toBeNull();
      expect(row?.pageCount).toBeNull();
    });

    dbTest("an archived document cannot be changed back to failed", async () => {
      const payload = await givenQueuedDocument();
      await db
        .update(rfpDocuments)
        .set({ archivedAt: new Date(), status: "archived" })
        .where(eq(rfpDocuments.id, payload.documentId));

      await processor.recordFailure(payload, "parser failed");

      const row = await statusOf(payload.documentId);
      expect(row?.status).toBe("archived");
      expect(row?.archivedAt).not.toBeNull();
      expect(row?.failureReason).toBeNull();
    });

    dbTest("an archived DOCX document cannot be changed back to parsed", async () => {
      const payload = await givenQueuedDocxDocument(buildDocx([docxParagraph("Archive race")]));
      await db
        .update(rfpDocuments)
        .set({ archivedAt: new Date(), status: "archived" })
        .where(eq(rfpDocuments.id, payload.documentId));

      await processor.recordFailure(payload, "parser failed");

      const row = await statusOf(payload.documentId);
      expect(row?.status).toBe("archived");
      expect(row?.archivedAt).not.toBeNull();
      expect(row?.failureReason).toBeNull();
    });
  });
});

class FakeStorage {
  private readonly objects = new Map<string, Uint8Array>();
  failNext = false;

  put(objectKey: string, bytes: Uint8Array) {
    this.objects.set(objectKey, bytes);
  }

  delete(objectKey: string) {
    this.objects.delete(objectKey);
  }

  async readObjectPrefix(objectKey: string, length: number): Promise<Uint8Array | null> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("connection reset");
    }
    const bytes = this.objects.get(objectKey);
    return bytes ? bytes.subarray(0, length) : null;
  }

  async readObject(objectKey: string): Promise<Uint8Array | null> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("connection reset");
    }
    const bytes = this.objects.get(objectKey);
    return bytes ?? null;
  }
}

function buildPdf(
  pageTexts: string[],
  options: { encrypted?: boolean } = {},
): Uint8Array {
  const encoder = new TextEncoder();
  const parts: string[] = ["%PDF-1.4\n"];
  const offsets: number[] = [0];
  let currentLength = encoder.encode(parts[0]).length;

  const push = (body: string, objectNumber: number) => {
    const object = `${objectNumber} 0 obj\n${body}\nendobj\n`;
    offsets[objectNumber] = currentLength;
    parts.push(object);
    currentLength += encoder.encode(object).length;
  };

  push("<< /Type /Catalog /Pages 2 0 R >>", 1);

  const pageNumbers = pageTexts.map((_, index) => 5 + index * 2);
  push(`<< /Type /Pages /Kids [${pageNumbers.map((page) => `${page} 0 R`).join(" ")}] /Count ${pageTexts.length} >>`, 2);
  push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", 3);

  pageTexts.forEach((text, index) => {
    const contentNumber = 4 + index * 2;
    const pageNumber = 5 + index * 2;
    const stream = makeTextStream(text);
    const contentBody =
      stream.length === 0
        ? "<< /Length 0 >>\nstream\n\nendstream"
        : `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`;

    push(contentBody, contentNumber);
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNumber} 0 R >>`,
      pageNumber,
    );
  });

  const encryptNumber = 4 + pageTexts.length * 2;
  if (options.encrypted) {
    push(
      "<< /Filter /Standard /V 1 /R 2 /O <00000000000000000000000000000000> /U <00000000000000000000000000000000> /P -4 >>",
      encryptNumber,
    );
  }

  const body = parts.join("");
  const size = options.encrypted ? encryptNumber + 1 : encryptNumber;
  const xrefOffset = encoder.encode(body).length;
  const xrefLines = [
    "xref",
    `0 ${size}`,
    "0000000000 65535 f ",
    ...Array.from({ length: size - 1 }, (_, index) => {
      const objectNumber = index + 1;
      const offset = offsets[objectNumber] ?? 0;
      return `${String(offset).padStart(10, "0")} 00000 n `;
    }),
    "trailer",
    `<< /Size ${size}${options.encrypted ? ` /Encrypt ${encryptNumber} 0 R` : ""} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
  ];

  return encoder.encode(`${body}${xrefLines.join("\n")}\n`);
}

function makeTextStream(text: string): string {
  if (!text) return "";
  return `BT /F1 24 Tf 72 720 Td (${escapePdfString(text)}) Tj ET`;
}

function escapePdfString(text: string): string {
  return text.replace(/[\\()]/g, "\\$&");
}
