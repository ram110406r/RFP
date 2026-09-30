import { Inject, Injectable, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Database } from "@rfp-os/db";
import { ObjectStorage } from "@rfp-os/storage";
import { sql } from "drizzle-orm";
import IORedis from "ioredis";

import type { Env } from "../config/env.schema";
import { DATABASE } from "../infrastructure/database";
import { MailService } from "../infrastructure/mail";

export type CheckStatus = "ok" | "error" | "skipped";

export interface ReadinessResult {
  status: "ok" | "degraded";
  checks: Record<string, CheckStatus>;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly config: ConfigService<Env, true>,
    @Inject(DATABASE) private readonly db: Database,
    private readonly storage: ObjectStorage,
    @Optional() private readonly mail?: MailService,
  ) {}

  liveness() {
    return {
      status: "ok" as const,
      timestamp: new Date().toISOString(),
      version: this.config.get("APP_COMMIT_SHA", { infer: true }) ?? "unknown",
      buildTime: this.config.get("APP_BUILD_TIME", { infer: true }) ?? null,
    };
  }

  /**
   * Checks run concurrently: readiness is polled frequently, and running two
   * independent network probes in series would make the endpoint's latency
   * their sum for no benefit.
   *
   * A dependency that is not configured reports "skipped" rather than "error"
   * — developers run the API without MinIO, and a probe that fails the whole
   * deployment for an optional dependency teaches people to ignore it.
   */
  async readiness(): Promise<ReadinessResult> {
    const [database, redis, storage, opensearch, mail] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkStorage(),
      this.checkOpenSearch(),
      this.checkMail(),
    ]);
    const checks: Record<string, CheckStatus> = { database, redis, storage, opensearch, mail };
    const status = Object.values(checks).includes("error") ? "degraded" : "ok";
    return { status, checks };
  }

  private async checkDatabase(): Promise<CheckStatus> {
    if (this.config.get("NODE_ENV", { infer: true }) !== "production" && !this.config.get("DATABASE_URL", { infer: true })) {
      return "skipped";
    }
    try {
      await this.db.execute(sql`select 1`);
      return "ok";
    } catch {
      return "error";
    }
  }

  /**
   * Not optional in practice: without a reachable SMTP server nobody can verify
   * their email, so nobody can sign up, create a company or accept an
   * invitation. Better Auth sends verification mail in the background and only
   * logs a failure, so this probe is where a broken transport becomes visible.
   */
  private async checkMail(): Promise<CheckStatus> {
    if (!this.mail) return "skipped";
    return (await this.mail.verifyTransport()) ? "ok" : "error";
  }

  private async checkStorage(): Promise<CheckStatus> {
    if (!this.config.get("STORAGE_ENDPOINT", { infer: true })) {
      return "skipped";
    }
    return (await this.storage.bucketReachable()) ? "ok" : "error";
  }

  private async checkRedis(): Promise<CheckStatus> {
    const url = this.config.get("REDIS_URL", { infer: true });
    if (!url) {
      return this.config.get("NODE_ENV", { infer: true }) === "production" ? "error" : "skipped";
    }

    const redis = new IORedis(url, { maxRetriesPerRequest: null });
    try {
      const pong = await redis.ping();
      return pong === "PONG" ? "ok" : "error";
    } catch {
      return "error";
    } finally {
      await redis.quit().catch(() => undefined);
    }
  }

  private async checkOpenSearch(): Promise<CheckStatus> {
    const url = this.config.get("OPENSEARCH_URL", { infer: true });
    if (!url) {
      return "skipped";
    }

    try {
      const response = await fetch(`${url.replace(/\/$/, "")}/_cluster/health`);
      return response.ok ? "ok" : "error";
    } catch {
      return "error";
    }
  }
}
