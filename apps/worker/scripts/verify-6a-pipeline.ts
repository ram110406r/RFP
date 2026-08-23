/**
 * End-to-end check for the Phase 6A queue pipeline.
 *
 * Unit and integration tests cover the producer and the processor separately,
 * with the transport stubbed on both sides. This runs the real thing: a
 * BullMQ Queue writing to Redis, the real Worker draining it, and a document
 * row moving from `queued` to `parsed` as a result.
 *
 * Not part of `bun test` — it needs Redis as well as Postgres. Run it by hand
 * with DATABASE_URL and REDIS_URL set.
 */
import { randomUUID } from "node:crypto";

import { customers, files, getDb, organizations, rfpDocuments, rfps, users } from "@rfp-os/db";
import { DOCUMENT_JOBS, documentJobId, QUEUES, type DocumentJobPayload } from "@rfp-os/jobs";
import { Queue, Worker } from "bullmq";
import { eq } from "drizzle-orm";
import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:56379";
const db = getDb();
const suffix = randomUUID().slice(0, 8);

const orgId = randomUUID();
const userId = randomUUID();
const customerId = randomUUID();
const rfpId = randomUUID();
const documentId = randomUUID();
const fileId = randomUUID();
const objectKey = `${orgId}/${rfpId}/${fileId}/spec.pdf`;

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function seed() {
  await db.insert(organizations).values({ id: orgId, name: `E2E ${suffix}`, domain: `e2e-${suffix}.invalid` });
  await db.insert(users).values({
    id: userId,
    organizationId: orgId,
    name: "Pipeline Tester",
    email: `pipeline-${suffix}@e2e-${suffix}.invalid`,
  });
  await db.insert(customers).values({ id: customerId, organizationId: orgId, name: `Client ${suffix}` });
  await db.insert(rfps).values({
    id: rfpId,
    organizationId: orgId,
    customerId,
    title: `E2E RFP ${suffix}`,
    ownerId: userId,
    createdBy: userId,
    deadline: "2026-12-31",
  });
  await db.insert(files).values({
    id: fileId,
    organizationId: orgId,
    bucket: "e2e",
    objectKey,
    filename: "spec.pdf",
    mimeType: "application/pdf",
    sizeBytes: 2_048,
    uploadedBy: userId,
  });
  await db.insert(rfpDocuments).values({
    id: documentId,
    organizationId: orgId,
    rfpId,
    fileId,
    filename: "spec.pdf",
    type: "PDF",
    status: "queued",
    storageKey: objectKey,
    uploadedBy: userId,
  });
}

async function cleanup() {
  await db.delete(rfpDocuments).where(eq(rfpDocuments.id, documentId));
  await db.delete(files).where(eq(files.id, fileId));
  await db.delete(rfps).where(eq(rfps.id, rfpId));
  await db.delete(customers).where(eq(customers.id, customerId));
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(organizations).where(eq(organizations.id, orgId));
}

async function statusOf(): Promise<string | undefined> {
  const [row] = await db
    .select({ status: rfpDocuments.status })
    .from(rfpDocuments)
    .where(eq(rfpDocuments.id, documentId))
    .limit(1);
  return row?.status;
}

const payload: DocumentJobPayload = {
  organizationId: orgId,
  rfpId,
  documentId,
  fileId,
  version: 1,
  objectKey,
  mimeType: "application/pdf",
  actorId: userId,
};

async function main() {
  const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue(QUEUES.DOCUMENTS, { connection });
  await queue.obliterate({ force: true }).catch(() => {});
  await seed();

  console.log("\nPhase 6A pipeline verification\n");

  const jobId = documentJobId(DOCUMENT_JOBS.PARSE, documentId, 1);
  await queue.add(DOCUMENT_JOBS.PARSE, payload, { jobId, attempts: 3 });
  await queue.add(DOCUMENT_JOBS.PARSE, payload, { jobId, attempts: 3 });
  check("duplicate enqueue collapses to one job", (await queue.getWaitingCount()) === 1);

  /*
   * A worker with a storage double: this script is proving the transport and
   * the state transitions, not the AWS SDK. The bytes are a real PDF header so
   * the sniffer sees what it expects.
   */
  const processed = new Promise<void>((resolve) => {
    const worker = new Worker<DocumentJobPayload>(
      QUEUES.DOCUMENTS,
      async (job) => {
        const { DocumentProcessor } = await import("../src/documents/document-processor");
        const storage = {
          readObjectPrefix: async () => new TextEncoder().encode("%PDF-1.7\ntrailer"),
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await new DocumentProcessor(storage as any).process(job.name as never, job.data);
        return result;
      },
      { connection, concurrency: 1 },
    );
    worker.on("completed", () => {
      void worker.close().then(resolve);
    });
    worker.on("failed", (_job, err) => {
      console.log(`  worker reported failure: ${err.message}`);
      void worker.close().then(resolve);
    });
  });

  await processed;

  check("document reached parsed", (await statusOf()) === "parsed", `status=${await statusOf()}`);
  check("queue drained", (await queue.getWaitingCount()) === 0);

  await cleanup();
  await queue.obliterate({ force: true }).catch(() => {});
  await queue.close();
  await connection.quit();

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
