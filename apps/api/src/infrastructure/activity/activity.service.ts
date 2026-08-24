import { Inject, Injectable } from "@nestjs/common";
import { activities, type Database, type Transaction } from "@rfp-os/db";

import { DATABASE } from "../database";

export interface ActivityEntry {
  organizationId: string;
  workspaceId?: string | null;
  rfpId?: string | null;
  requirementId?: string | null;
  actorId?: string | null;
  actorType?: "user" | "ai_agent" | "system" | "integration";
  actorLabel?: string | null;
  kind?: "assigned" | "approved" | "evidence" | "comment" | "risk" | "submission" | "generated" | "rejected";
  label: string;
  action: string;
  entityType: string;
  entityId: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class ActivityService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async record(entry: ActivityEntry, tx?: Transaction): Promise<void> {
    const executor = tx ?? this.db;
    await executor.insert(activities).values({
      organizationId: entry.organizationId,
      workspaceId: entry.workspaceId ?? null,
      rfpId: entry.rfpId ?? null,
      requirementId: entry.requirementId ?? null,
      actorId: entry.actorId ?? null,
      actorType: entry.actorType ?? "user",
      actorLabel: entry.actorLabel ?? "System",
      kind: entry.kind ?? "generated",
      label: entry.label,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      summary: entry.summary ?? entry.label,
      metadata: entry.metadata ?? null,
    });
  }
}
