import { DEFAULT_JOB_OPTIONS } from "@rfp-os/jobs";
import type { Queue } from "bullmq";

/**
 * Adds a job under a stable id, retrying it when that id is held by a FAILED
 * job instead of treating it as "already queued".
 *
 * BullMQ keeps failed jobs (removeOnFail) and silently ignores an add whose id
 * is taken. The old `if (!await queue.getJob(id)) add()` pattern therefore
 * turned one failure into a permanent stall: the follow-up job could never be
 * queued again for that document version, and the row sat in `processing`.
 *
 * Completed jobs are removed and re-added so an explicit re-run works too.
 */
export async function addOrRetryJob<T>(queue: Queue<T>, name: string, data: T, jobId: string): Promise<"added" | "retried" | "pending"> {
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "failed") {
      await existing.retry("failed");
      return "retried";
    }
    if (state !== "completed") return "pending";
    await existing.remove();
  }
  await (queue as Queue).add(name, data, { ...DEFAULT_JOB_OPTIONS, jobId });
  return "added";
}
