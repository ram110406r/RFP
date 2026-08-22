import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Database } from "@rfp-os/db";
import { ObjectStorage } from "@rfp-os/storage";
import { sql } from "drizzle-orm";

import type { Env } from "../config/env.schema";
import { DATABASE } from "../infrastructure/database";

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
  ) {}

  liveness() {
    return { status: "ok" as const, timestamp: new Date().toISOString() };
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
    const [database, storage] = await Promise.all([this.checkDatabase(), this.checkStorage()]);
    const checks: Record<string, CheckStatus> = { database, storage };
    const status = Object.values(checks).includes("error") ? "degraded" : "ok";
    return { status, checks };
  }

  private async checkDatabase(): Promise<CheckStatus> {
    if (!this.config.get("DATABASE_URL", { infer: true })) {
      return "skipped";
    }
    try {
      await this.db.execute(sql`select 1`);
      return "ok";
    } catch {
      return "error";
    }
  }

  private async checkStorage(): Promise<CheckStatus> {
    if (!this.config.get("STORAGE_ENDPOINT", { infer: true })) {
      return "skipped";
    }
    return (await this.storage.bucketReachable()) ? "ok" : "error";
  }
}
