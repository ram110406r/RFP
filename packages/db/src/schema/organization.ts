import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { timestamps } from "./_shared";

export const organizationStatusEnum = pgEnum("organization_status", [
  "active",
  "suspended",
  "archived",
]);

/**
 * Tenancy root. Every org-scoped table carries `organization_id` with a
 * cascading FK back to here, which is what makes the "every query is scoped
 * to organization_id" rule enforceable rather than aspirational.
 */
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  legalName: text("legal_name").notNull().default(""),
  slug: text("slug"),
  status: organizationStatusEnum("status").notNull().default("active"),
  domain: text("domain").notNull(),
  plan: text("plan").notNull().default("Starter"),
  seats: integer("seats").notNull().default(10),
  industry: text("industry"),
  country: text("country").notNull().default(""),
  operatingRegion: text("operating_region").notNull().default(""),
  profile: jsonb("profile").notNull().default({}),
  logoInitials: text("logo_initials"),
  ...timestamps,
});

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    isSystem: boolean("is_system").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("roles_org_name_uq").on(t.organizationId, t.name)],
);

/** Global permission catalogue — keys are org-independent (e.g. "rfps.create"). */
export const permissions = pgTable("permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  description: text("description").notNull().default(""),
  resource: text("resource").notNull().default(""),
  action: text("action").notNull().default(""),
  ...timestamps,
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

// ---------------------------------------------------------------------------
// Customers / projects
// ---------------------------------------------------------------------------

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    industry: text("industry"),
    ...timestamps,
  },
  (t) => [index("customers_org_idx").on(t.organizationId)],
);

/**
 * Present per the domain model, but not yet surfaced anywhere in the
 * frontend — the current product treats each RFP as its own unit of work
 * with no separate "project" concept. Left minimal rather than inventing
 * UI for it.
 */
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    ...timestamps,
  },
  (t) => [index("projects_org_idx").on(t.organizationId)],
);
