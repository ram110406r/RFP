import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { workspaces } from "./foundation";
import { users } from "./identity";
import { organizations } from "./organization";
import { rfpRequirements, rfps } from "./rfp";

export const activityKindEnum = pgEnum("activity_kind", [
  "assigned",
  "approved",
  "evidence",
  "comment",
  "risk",
  "submission",
  "generated",
  "rejected",
]);

export const activityActorTypeEnum = pgEnum("activity_actor_type", [
  "user",
  "ai_agent",
  "system",
  "integration",
]);

export const auditActorTypeEnum = pgEnum("audit_actor_type", [
  "user",
  "ai_agent",
  "system",
  "integration",
]);

/**
 * Human-facing timeline ("Priya approved REQ-14"), rendered in the product.
 * Distinct from auditLogs: activities are curated, user-readable, and scoped
 * to an RFP or requirement; audit logs are exhaustive, machine-oriented, and
 * exist for compliance.
 */
export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    rfpId: uuid("rfp_id").references(() => rfps.id, { onDelete: "cascade" }),
    requirementId: uuid("requirement_id").references(() => rfpRequirements.id, {
      onDelete: "cascade",
    }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorType: activityActorTypeEnum("actor_type").notNull().default("user"),
    actorLabel: text("actor_label").notNull().default("System"),
    kind: activityKindEnum("kind").notNull(),
    label: text("label").notNull(),
    action: text("action").notNull().default(""),
    entityType: text("entity_type").notNull().default(""),
    entityId: text("entity_id").notNull().default(""),
    summary: text("summary").notNull().default(""),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("activities_org_idx").on(t.organizationId),
    index("activities_workspace_idx").on(t.workspaceId),
    index("activities_rfp_idx").on(t.rfpId),
    index("activities_requirement_idx").on(t.requirementId),
  ],
);

/**
 * The compliance record: every important business action, with before/after
 * state. `previousValue`/`newValue` are the domain model's `before`/`after`.
 *
 * Phase 5 writes these inside the same transaction as the business change,
 * so an action and its audit row commit together or not at all. There is no
 * update or delete path — rows are append-only by convention.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorType: auditActorTypeEnum("actor_type").notNull().default("user"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    previousValue: jsonb("previous_value"),
    newValue: jsonb("new_value"),
    beforeState: jsonb("before_state"),
    afterState: jsonb("after_state"),
    metadata: jsonb("metadata"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    requestId: text("request_id"),
    correlationId: text("correlation_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_org_idx").on(t.organizationId),
    index("audit_logs_workspace_idx").on(t.workspaceId),
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    index("audit_logs_org_action_idx").on(t.organizationId, t.action),
    index("audit_logs_correlation_idx").on(t.correlationId),
  ],
);
