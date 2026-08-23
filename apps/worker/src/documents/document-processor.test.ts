import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  customers,
  files,
  getDb,
  organizations,
  rfpDocuments,
  rfps,
  users,
} from "@rfp-os/db";
import { DOCUMENT_JOBS, type DocumentJobPayload } from "@rfp-os/jobs";
import type { ObjectStorage } from "@rfp-os/storage";
import { eq, inArray } from "drizzle-orm";

import { DocumentProcessor, isPermanent } from "./document-processor";

/**
 * Integration coverage against a real database, matching the API suites: what
 * these tests are about is which rows the worker reads and writes under a
 * tenant scope, which is a property of the SQL rather than of the types.
 *
 * Storage is faked. The bytes only matter as far as the sniffer reads them,
 * and that logic has its own unit tests.
 */
const dbTest = process.env.DATABASE_URL ? test : test.skip;
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

const PDF_BYTES = new TextEncoder().encode("%PDF-1.7\ntrailer");
const HTML_BYTES = new TextEncoder().encode("<!DOCTYPE html><html></html>");

class FakeStorage {
  private readonly objects = new Map<string, Uint8Array>();
  /** When set, the next read throws — a transient outage, not a missing file. */
  failNext = false;

  put(objectKey: string, bytes: Uint8Array) {
    this.objects.set(objectKey, bytes);
  }

  async readObjectPrefix(objectKey: string, length: number): Promise<Uint8Array | null> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("connection reset");
    }
    const bytes = this.objects.get(objectKey);
    return bytes ? bytes.subarray(0, length) : null;
  }
}

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
    if (fileIds.length) await db.delete(files).where(inArray(files.id, fileIds));
    await db.delete(rfps).where(eq(rfps.id, rfpId));
    await db.delete(customers).where(eq(customers.id, customerId));
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
  });

  /** Registers a document in `queued`, with bytes in the fake storage. */
  async function givenQueuedDocument(
    content: Uint8Array | null = PDF_BYTES,
    mimeType = "application/pdf",
  ): Promise<DocumentJobPayload> {
    const documentId = randomUUID();
    const fileId = randomUUID();
    const objectKey = `${orgA}/${rfpId}/${fileId}/doc.pdf`;
    documentIds.push(documentId);
    fileIds.push(fileId);

    await db.insert(files).values({
      id: fileId,
      organizationId: orgA,
      bucket: "test-bucket",
      objectKey,
      filename: "doc.pdf",
      mimeType,
      sizeBytes: 1_024,
      uploadedBy: userId,
    });
    await db.insert(rfpDocuments).values({
      id: documentId,
      organizationId: orgA,
      rfpId,
      fileId,
      filename: "doc.pdf",
      type: "PDF",
      status: "queued",
      storageKey: objectKey,
      uploadedBy: userId,
    });
    if (content) storage.put(objectKey, content);

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

  async function statusOf(documentId: string) {
    const [row] = await db
      .select({ status: rfpDocuments.status, failureReason: rfpDocuments.failureReason })
      .from(rfpDocuments)
      .where(eq(rfpDocuments.id, documentId))
      .limit(1);
    return row;
  }

  describe("parse", () => {
    dbTest("drives a valid document to parsed", async () => {
      const payload = await givenQueuedDocument();
      const result = await processor.process(DOCUMENT_JOBS.PARSE, payload);

      expect(result).toEqual({ processed: true, status: "parsed" });
      expect((await statusOf(payload.documentId))?.status).toBe("parsed");
    });

    /**
     * `ready` is earned by requirement extraction in Phase 6C. Claiming it
     * here would tell the UI a document is usable when nothing has been read
     * out of it yet.
     */
    dbTest("stops at parsed rather than claiming ready", async () => {
      const payload = await givenQueuedDocument();
      await processor.process(DOCUMENT_JOBS.PARSE, payload);
      expect((await statusOf(payload.documentId))?.status).not.toBe("ready");
    });

    /**
     * BullMQ redelivers a job whose worker died after committing side effects,
     * so the processor must be safe to run twice — the queue's stable job id
     * only prevents duplicate *enqueues*.
     */
    dbTest("is a no-op when the document is already parsed", async () => {
      const payload = await givenQueuedDocument();
      await processor.process(DOCUMENT_JOBS.PARSE, payload);

      const second = await processor.process(DOCUMENT_JOBS.PARSE, payload);
      expect(second).toEqual({ processed: false, status: "parsed" });
    });
  });

  describe("permanent failures", () => {
    dbTest("refuses content that contradicts the declared type", async () => {
      const payload = await givenQueuedDocument(HTML_BYTES, "application/pdf");
      const error = await processor.process(DOCUMENT_JOBS.PARSE, payload).catch((e: unknown) => e);

      expect(isPermanent(error)).toBe(true);
      expect((error as Error).message).toContain("HTML");
    });

    dbTest("fails when the object is gone from storage", async () => {
      const payload = await givenQueuedDocument(null);
      const error = await processor.process(DOCUMENT_JOBS.PARSE, payload).catch((e: unknown) => e);

      expect(isPermanent(error)).toBe(true);
      expect((error as Error).message).toContain("missing from storage");
    });

    dbTest("refuses a document archived before processing ran", async () => {
      const payload = await givenQueuedDocument();
      await db
        .update(rfpDocuments)
        .set({ archivedAt: new Date() })
        .where(eq(rfpDocuments.id, payload.documentId));

      const error = await processor.process(DOCUMENT_JOBS.PARSE, payload).catch((e: unknown) => e);
      expect(isPermanent(error)).toBe(true);
    });

    dbTest("reports the unimplemented jobs as permanent, not retryable", async () => {
      const payload = await givenQueuedDocument();
      for (const job of [
        DOCUMENT_JOBS.OCR,
        DOCUMENT_JOBS.TABLE_EXTRACTION,
        DOCUMENT_JOBS.NORMALIZATION,
      ] as const) {
        const error = await processor.process(job, payload).catch((e: unknown) => e);
        expect(isPermanent(error)).toBe(true);
      }
    });
  });

  describe("transient failures", () => {
    /**
     * A storage outage must stay retryable. Marking it permanent would burn
     * the document on a blip that the next attempt would have survived.
     */
    dbTest("a storage outage is not permanent", async () => {
      const payload = await givenQueuedDocument();
      storage.failNext = true;

      const error = await processor.process(DOCUMENT_JOBS.PARSE, payload).catch((e: unknown) => e);
      expect(isPermanent(error)).toBe(false);
      // Still mid-flight, not failed: BullMQ has attempts left.
      expect((await statusOf(payload.documentId))?.status).toBe("processing");
    });

    dbTest("recordFailure is what writes the terminal state and its reason", async () => {
      const payload = await givenQueuedDocument();
      await processor.recordFailure(payload, "exhausted after 3 attempts");

      const row = await statusOf(payload.documentId);
      expect(row?.status).toBe("failed");
      expect(row?.failureReason).toBe("exhausted after 3 attempts");
    });
  });

  describe("tenant scoping", () => {
    /**
     * The worker runs with no guard above it, so the organizationId on the
     * payload is the only thing scoping these queries. A job naming the wrong
     * tenant must find nothing rather than process another org's document.
     */
    dbTest("a job carrying the wrong organization cannot touch the document", async () => {
      const payload = await givenQueuedDocument();
      const error = await processor
        .process(DOCUMENT_JOBS.PARSE, { ...payload, organizationId: orgB })
        .catch((e: unknown) => e);

      expect(isPermanent(error)).toBe(true);
      // Untouched by the cross-tenant attempt.
      expect((await statusOf(payload.documentId))?.status).toBe("queued");
    });
  });
});
