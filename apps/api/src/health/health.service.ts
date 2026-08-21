import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Database } from "@rfp-os/db";
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
  ) {}

  liveness() {
    return { status: "ok" as const, timestamp: new Date().toISOString() };
  }

  async readiness(): Promise<ReadinessResult> {
    const checks: Record<string, CheckStatus> = {
      database: await this.checkDatabase(),
    };
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
}
