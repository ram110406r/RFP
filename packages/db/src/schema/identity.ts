import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { timestamps } from "./_shared";
import { organizations, roles } from "./organization";

export const memberRoleEnum = pgEnum("member_role", [
  "Admin",
  "Proposal Manager",
  "Contributor",
  "Reviewer",
  "Viewer",
]);

export const memberStatusEnum = pgEnum("member_status", ["active", "invited", "suspended"]);

/**
 * The identity record. `organizationId` here is the single server-side source
 * of a caller's tenant: request handlers derive it from the authenticated
 * user's row, never from a client-supplied field, so org scoping cannot be
 * spoofed. Better Auth (Phase 4) will attach its own session/account tables
 * alongside this rather than replacing it.
 *
 * Note both `roleId` (custom per-org role, RBAC) and `memberRole` (fixed
 * membership tier) exist: the former is org-configurable, the latter is the
 * coarse tier the UI renders. Phase 4 reconciles them.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    roleId: uuid("role_id").references(() => roles.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    jobTitle: text("job_title").notNull().default(""),
    team: text("team").notNull().default(""),
    memberRole: memberRoleEnum("member_role").notNull().default("Contributor"),
    status: memberStatusEnum("status").notNull().default("active"),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("users_org_email_uq").on(t.organizationId, t.email),
    index("users_org_idx").on(t.organizationId),
  ],
);
