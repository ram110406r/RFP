import { Inject, Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { and, asc, eq, or, sql } from "drizzle-orm";
import { tenderAutomationRuns, type Database } from "@rfp-os/db";
import { DATABASE } from "../../infrastructure/database";
import { AuthService } from "../auth/auth.service";
import { ApplyAutomationService } from "./apply-automation.service";

/** PostgreSQL is the durable preparation queue; no request/session credentials are persisted. */
@Injectable()
export class ApplyRunnerService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private active?: Promise<void>;
  private stopped = false;
  private readonly logger = new Logger(ApplyRunnerService.name);

  constructor(@Inject(DATABASE) private readonly db: Database, private readonly auth: AuthService, private readonly automation: ApplyAutomationService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => this.tick(), 2000);
    this.timer.unref();
    this.tick();
  }

  async onModuleDestroy() {
    this.stopped = true;
    clearInterval(this.timer);
    await this.active;
  }

  private tick() {
    if (this.stopped || this.active) return;
    this.active = this.processNext().catch((error) => this.logger.error("Apply queue processing failed", error instanceof Error ? error.stack : undefined)).finally(() => { this.active = undefined; });
  }

  async processNext() {
    const leaseOwner = randomUUID();
    const run = await this.db.transaction(async (tx) => {
      const [next] = await tx.select().from(tenderAutomationRuns).where(or(
        eq(tenderAutomationRuns.status, "QUEUED"),
        and(eq(tenderAutomationRuns.status, "RUNNING"), sql`(${tenderAutomationRuns.leaseExpiresAt} IS NULL OR ${tenderAutomationRuns.leaseExpiresAt} < now())`),
      )).orderBy(asc(tenderAutomationRuns.createdAt)).limit(1).for("update", { skipLocked: true });
      if (!next) return null;
      const [claimed] = await tx.update(tenderAutomationRuns).set({ status: "RUNNING", leaseOwner, leaseExpiresAt: sql`now() + interval '2 minutes'`, startedAt: next.startedAt ?? new Date(), failureReason: null, updatedAt: new Date() }).where(eq(tenderAutomationRuns.id, next.id)).returning();
      return claimed;
    });
    if (!run) return;
    const fence = and(eq(tenderAutomationRuns.id, run.id), eq(tenderAutomationRuns.leaseOwner, leaseOwner), eq(tenderAutomationRuns.status, "RUNNING"), sql`${tenderAutomationRuns.leaseExpiresAt} > now()`);
    const heartbeat = setInterval(() => {
      void this.db.update(tenderAutomationRuns).set({ leaseExpiresAt: sql`now() + interval '2 minutes'`, updatedAt: new Date() }).where(fence).catch((error) => this.logger.error("Apply lease renewal failed", error instanceof Error ? error.stack : undefined));
    }, 15000);
    heartbeat.unref();
    try {
      if (!run.requestedBy) throw new Error("The requesting user no longer exists.");
      const context = await this.auth.resolveAuthContext({ userId: run.requestedBy, sessionId: `automation:${run.id}`, activeOrganizationId: run.organizationId });
      if (!context || context.organizationId !== run.organizationId) throw new Error("The requesting user no longer belongs to this organization.");
      await this.automation.executeRun(context, run);
    } catch (error) {
      await this.db.update(tenderAutomationRuns).set({ status: "FAILED", completedAt: new Date(), failureReason: error instanceof Error ? error.message.slice(0, 1000) : "Execution failed.", updatedAt: new Date() }).where(fence);
    } finally {
      clearInterval(heartbeat);
    }
  }
}
