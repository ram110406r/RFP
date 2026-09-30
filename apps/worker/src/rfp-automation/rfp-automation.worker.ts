import { getDb, notifications, tenderMilestones, tenders } from "@rfp-os/db";
import { DEFAULT_JOB_OPTIONS, QUEUES, RFP_AUTOMATION_JOBS, rfpAutomationJobId, type RfpAutomationJobPayload } from "@rfp-os/jobs";
import { createLogger } from "@rfp-os/observability";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { Queue, Worker, type Job } from "bullmq";
import type IORedis from "ioredis";

/**
 * Legacy queue name, canonical tender data.
 *
 * The active product domain is `tenders`; the RFP automation queue name is
 * retained for compatibility with existing producers and deployments.
 */
const logger = createLogger("worker:rfp-automation");

export function createRfpAutomationWorker(connection: IORedis) {
  return new Worker<RfpAutomationJobPayload>(QUEUES.RFP_AUTOMATION, async (job: Job<RfpAutomationJobPayload>) => {
    if (job.name !== RFP_AUTOMATION_JOBS.REMINDER_RECONCILIATION || !job.data.milestoneId) {
      throw new Error(`Automation job ${job.name} must be coordinated by the application service.`);
    }
    const db = getDb();
    const [row] = await db.select({ milestone: tenderMilestones, tender: tenders }).from(tenderMilestones).innerJoin(tenders, eq(tenders.id, tenderMilestones.tenderId)).where(and(
      eq(tenderMilestones.id, job.data.milestoneId), eq(tenderMilestones.organizationId, job.data.organizationId), eq(tenderMilestones.workspaceId, job.data.workspaceId),
    )).limit(1);
    if (!row || ["SUBMITTED", "CLOSED", "CANCELLED", "ARCHIVED"].includes(row.tender.status) || !row.tender.dueAt || row.milestone.dueAt.getTime() > Date.now() + 86_400_000 || row.milestone.status === "COMPLETE" || row.milestone.status === "CANCELLED") return { processed: false };
    const overdue = row.milestone.dueAt.getTime() < Date.now();
    if (overdue) await db.update(tenderMilestones).set({ status: "OVERDUE", updatedAt: new Date() }).where(eq(tenderMilestones.id, row.milestone.id));
    const title = `${format(row.milestone.kind)} milestone ${overdue ? "overdue" : "due soon"}`;
    const detail = `${row.tender.title} is due ${row.milestone.dueAt.toISOString()}.`;
    const [existing] = await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.organizationId, row.tender.organizationId), eq(notifications.userId, row.tender.ownerId), eq(notifications.relatedEntityType, "tender_milestone"), eq(notifications.relatedEntityId, row.milestone.id), eq(notifications.title, title), eq(notifications.detail, detail))).limit(1);
    if (!existing) await db.insert(notifications).values({ organizationId: row.tender.organizationId, userId: row.tender.ownerId, category: "Deadlines", title, detail, severity: overdue ? "danger" : "warning", relatedEntityType: "tender_milestone", relatedEntityId: row.milestone.id });
    return { processed: true, overdue };
  }, { connection, concurrency: 2 });
}

/**
 * Milestones overdue by more than this are left alone. There is no
 * reminder-sent marker on the row, so without a lower bound every OVERDUE
 * milestone would be re-enqueued every fifteen minutes forever.
 */
const OVERDUE_LOOKBACK_MS = 7 * 86_400_000;
const MAX_MILESTONES_PER_RUN = 500;

export function startRfpAutomationScheduler(connection: IORedis) {
  const queue = new Queue<RfpAutomationJobPayload>(QUEUES.RFP_AUTOMATION, { connection });
  const enqueue = async () => {
    const db = getDb();
    const now = Date.now();
    const horizon = new Date(now + 86_400_000);
    const lookback = new Date(now - OVERDUE_LOOKBACK_MS);
    const due = await db
      .select({ id: tenderMilestones.id, organizationId: tenderMilestones.organizationId, workspaceId: tenderMilestones.workspaceId, tenderId: tenderMilestones.tenderId })
      .from(tenderMilestones)
      .where(and(inArray(tenderMilestones.status, ["PENDING", "OVERDUE"]), lte(tenderMilestones.dueAt, horizon), gte(tenderMilestones.dueAt, lookback)))
      .orderBy(asc(tenderMilestones.dueAt))
      .limit(MAX_MILESTONES_PER_RUN);
    const window = Math.floor(now / 900_000);
    await queue.addBulk(due.map((milestone) => {
      const payload: RfpAutomationJobPayload = { organizationId: milestone.organizationId, workspaceId: milestone.workspaceId, tenderId: milestone.tenderId, runId: null, step: RFP_AUTOMATION_JOBS.REMINDER_RECONCILIATION, actorId: null, milestoneId: milestone.id };
      return { name: payload.step, data: payload, opts: { ...DEFAULT_JOB_OPTIONS, jobId: `${rfpAutomationJobId(payload).replace(/:/g, "-")}-${window}` } };
    }));
  };
  void enqueue().catch((error) => logger.error({ err: error }, "unable to schedule application reminders"));
  const timer = setInterval(() => void enqueue().catch((error) => logger.error({ err: error }, "unable to schedule application reminders")), 15 * 60_000);
  return { stop: async () => { clearInterval(timer); await queue.close(); } };
}

function format(value: string) { return value.toLowerCase().replace(/_/g, " ").replace(/^./, (character) => character.toUpperCase()); }
