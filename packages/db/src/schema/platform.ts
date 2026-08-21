import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./identity";
import { organizations } from "./organization";

/**
 * Platform-level, org-scoped configuration and messaging: the tables that
 * back notifications and the Settings surface. Kept out of the six core
 * domains (identity/organization/audit/files/knowledge/rfp) because none of
 * them owns this data — it is about operating the product, not the RFP
 * business model.
 */

export const notificationCategoryEnum = pgEnum("notification_category", [
  "Reviews",
  "Assignments",
  "Risks",
  "Deadlines",
  "Knowledge",
  "Submissions",
]);

export const notificationSeverityEnum = pgEnum("notification_severity", [
  "info",
  "warning",
  "danger",
]);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: notificationCategoryEnum("category").notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    severity: notificationSeverityEnum("severity").notNull().default("info"),
    relatedEntityType: text("related_entity_type"),
    relatedEntityId: uuid("related_entity_id"),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_org_idx").on(t.organizationId),
    index("notifications_user_idx").on(t.userId),
    index("notifications_user_read_idx").on(t.userId, t.read),
  ],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    prefix: text("prefix").notNull(),
    scopes: jsonb("scopes").notNull().default([]),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("api_keys_org_idx").on(t.organizationId)],
);

export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category").notNull(),
    connected: boolean("connected").notNull().default(false),
    description: text("description").notNull().default(""),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  },
  (t) => [index("integrations_org_idx").on(t.organizationId)],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    label: text("label").notNull(),
    email: boolean("email").notNull().default(true),
    inApp: boolean("in_app").notNull().default(true),
    digest: boolean("digest").notNull().default(false),
  },
  (t) => [index("notification_preferences_org_idx").on(t.organizationId)],
);

export const mcpConnections = pgTable(
  "mcp_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    transport: text("transport").notNull(),
    status: text("status").notNull().default("disconnected"),
    toolsExposed: integer("tools_exposed").notNull().default(0),
    description: text("description").notNull().default(""),
  },
  (t) => [index("mcp_connections_org_idx").on(t.organizationId)],
);

export const settingToggleKindEnum = pgEnum("setting_toggle_kind", ["toggle", "select", "slider"]);

/**
 * Backs both the Settings > AI tab and Settings > Knowledge tab — same shape
 * (label/description/value/kind), distinguished by the `group` column, so one
 * table and one pair of endpoints cover both instead of duplicating either.
 */
export const configToggles = pgTable(
  "config_toggles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    group: text("group").notNull(), // "ai" | "knowledge"
    sortOrder: integer("sort_order").notNull().default(0),
    label: text("label").notNull(),
    description: text("description").notNull().default(""),
    kind: settingToggleKindEnum("kind").notNull(),
    value: jsonb("value").notNull(),
    options: jsonb("options"),
    max: integer("max"),
  },
  (t) => [index("config_toggles_org_group_idx").on(t.organizationId, t.group)],
);
