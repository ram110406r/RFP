import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { timestamps } from "./_shared";
import { users } from "./identity";
import { organizations } from "./organization";

export const workspaceStatusEnum = pgEnum("workspace_status", ["active", "archived"]);

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    status: workspaceStatusEnum("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("workspaces_org_slug_uq").on(t.organizationId, t.slug),
    index("workspaces_org_idx").on(t.organizationId),
  ],
);

export const teamStatusEnum = pgEnum("team_status", ["active", "archived"]);

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    status: teamStatusEnum("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    index("teams_org_idx").on(t.organizationId),
    index("teams_workspace_idx").on(t.workspaceId),
  ],
);

export const assignmentAssigneeTypeEnum = pgEnum("assignment_assignee_type", ["user", "team"]);
export const foundationAssignmentStatusEnum = pgEnum("assignment_status_v2", [
  "pending",
  "in_progress",
  "completed",
  "cancelled",
]);

export const assignments = pgTable(
  "assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    assigneeType: assignmentAssigneeTypeEnum("assignee_type").notNull(),
    assigneeId: uuid("assignee_id").notNull(),
    assignmentRole: text("assignment_role").notNull().default(""),
    assignedBy: uuid("assigned_by").references(() => users.id, { onDelete: "set null" }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    status: foundationAssignmentStatusEnum("status").notNull().default("pending"),
    ...timestamps,
  },
  (t) => [
    index("assignments_org_idx").on(t.organizationId),
    index("assignments_workspace_idx").on(t.workspaceId),
    index("assignments_resource_idx").on(t.resourceType, t.resourceId),
    index("assignments_assignee_idx").on(t.assigneeType, t.assigneeId),
  ],
);
