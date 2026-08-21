import { db } from "../db/client";
import { activities, auditLogs, type activityKindEnum } from "../db/schema";

interface LogActivityInput {
  organizationId: string;
  rfpId?: string | undefined;
  requirementId?: string | undefined;
  actorId?: string | undefined;
  actorLabel?: string | undefined;
  kind: (typeof activityKindEnum.enumValues)[number];
  label: string;
}

/** Human-readable feed entry, shown in RFP/requirement activity timelines. */
export async function logActivity(input: LogActivityInput): Promise<void> {
  await db.insert(activities).values({
    organizationId: input.organizationId,
    rfpId: input.rfpId,
    requirementId: input.requirementId,
    actorId: input.actorId,
    actorLabel: input.actorLabel ?? "System",
    kind: input.kind,
    label: input.label,
  });
}

interface LogAuditInput {
  organizationId: string;
  actorId?: string | undefined;
  action: string;
  entityType: string;
  entityId: string;
  previousValue?: unknown;
  newValue?: unknown;
}

/** Structured before/after change record for compliance — not shown in the normal UI. */
export async function logAudit(input: LogAuditInput): Promise<void> {
  await db.insert(auditLogs).values({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    previousValue: input.previousValue,
    newValue: input.newValue,
  });
}
