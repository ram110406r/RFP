/**
 * Checks BullMqJobQueue against a real Redis.
 *
 * The service-level tests stub JobQueue, so nothing else exercises the one
 * piece of behaviour that is genuinely BullMQ's: add() with a duplicate job id
 * returns the existing job instead of throwing, and telling "queued" from
 * "already queued" depends on reading that back correctly.
 *
 * Run by hand with REDIS_URL set; not part of `bun test`.
 */
import { randomUUID } from "node:crypto";

import { QUEUES, type DocumentJobPayload } from "@rfp-os/jobs";
import { Queue } from "bullmq";
import IORedis from "ioredis";

import { PinoLoggerService } from "../src/common/logger/pino-logger.service";
import { BullMqJobQueue, NoopJobQueue } from "../src/infrastructure/queue/job-queue";
import { DOCUMENT_JOBS } from "@rfp-os/jobs";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:56379";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const payload: DocumentJobPayload = {
  organizationId: randomUUID(),
  rfpId: randomUUID(),
  documentId: randomUUID(),
  fileId: randomUUID(),
  version: 1,
  objectKey: "org/rfp/file/spec.pdf",
  mimeType: "application/pdf",
  actorId: randomUUID(),
};

async function main() {
  const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  const cleaner = new Queue(QUEUES.DOCUMENTS, { connection });
  await cleaner.obliterate({ force: true }).catch(() => {});

  const logger = new PinoLoggerService();
  const queue = new BullMqJobQueue(connection, logger);

  console.log("\nJobQueue verification\n");

  const first = await queue.enqueueDocumentJob(DOCUMENT_JOBS.PARSE, payload);
  check("first enqueue reports enqueued", first.enqueued === true);
  check(
    "job id is derived from document and version",
    first.jobId === `DOCUMENT_PARSE:${payload.documentId}:v1`,
    first.jobId,
  );

  const second = await queue.enqueueDocumentJob(DOCUMENT_JOBS.PARSE, payload);
  check("duplicate enqueue reports already queued", second.enqueued === false);
  check("only one job actually exists", (await cleaner.getWaitingCount()) === 1);

  /* A new version is new work, so it must produce a second job. */
  const nextVersion = await queue.enqueueDocumentJob(DOCUMENT_JOBS.PARSE, {
    ...payload,
    version: 2,
  });
  check("a new document version enqueues separately", nextVersion.enqueued === true);
  check("two jobs now waiting", (await cleaner.getWaitingCount()) === 2);

  /* The degraded path must not throw — the API has to serve uploads without Redis. */
  const noop = new NoopJobQueue(logger);
  const dropped = await noop.enqueueDocumentJob(DOCUMENT_JOBS.PARSE, payload);
  check("NoopJobQueue drops the job without throwing", dropped.enqueued === false);

  await queue.close();
  await cleaner.obliterate({ force: true }).catch(() => {});
  await cleaner.close();
  await connection.quit();

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
