import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { activities, users, type Database, type Transaction } from "@rfp-os/db";

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
    const actorLabel = await this.resolveActorLabel(entry, executor);
    await executor.insert(activities).values({
      organizationId: entry.organizationId,
      workspaceId: entry.workspaceId ?? null,
      rfpId: entry.rfpId ?? null,
      requirementId: entry.requirementId ?? null,
      actorId: entry.actorId ?? null,
      actorType: entry.actorType ?? "user",
      actorLabel,
      kind: entry.kind ?? "generated",
      label: entry.label,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      summary: entry.summary ?? entry.label,
      metadata: entry.metadata ?? null,
    });
  }

  /**
   * The feed shows people, not ids. Callers often only have the actor's user id
   * to hand (and pass it as the label), so a label that is missing or is just
   * that id is resolved to the user's name, falling back to their email.
   */
  private async resolveActorLabel(entry: ActivityEntry, executor: Database | Transaction): Promise<string> {
    const label = entry.actorLabel?.trim();
    if (label && label !== entry.actorId) return label;
    if (!entry.actorId || (entry.actorType && entry.actorType !== "user")) return label || "System";

    const [actor] = await executor
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, entry.actorId))
      .limit(1);
    return actor?.name?.trim() || actor?.email || label || "Unknown user";
  }
}
