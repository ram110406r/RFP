import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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
    /**
     * The user's default organization, and nullable since Phase 4.
     *
     * Identity is global (one row per human, unique email) while membership is
     * per-organization — so a freshly signed-up user legitimately belongs to no
     * organization yet, until they create one or accept an invitation. Keeping
     * this NOT NULL would have forced sign-up to name a tenant, and a tenant id
     * accepted from an unauthenticated request is exactly the cross-org hole
     * this phase exists to close.
     *
     * Authorization never reads this column — it reads `organization_members`.
     * It remains only as the default tenant to activate at login, and because
     * apps/legacy-api still resolves its dev session through it.
     */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    roleId: uuid("role_id").references(() => roles.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    preferredName: text("preferred_name").notNull().default(""),
    accountType: text("account_type"),
    jobTitle: text("job_title").notNull().default(""),
    department: text("department").notNull().default(""),
    timezone: text("timezone").notNull().default("UTC"),
    phone: text("phone").notNull().default(""),
    team: text("team").notNull().default(""),
    memberRole: memberRoleEnum("member_role").notNull().default("Contributor"),
    status: memberStatusEnum("status").notNull().default("active"),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    /**
     * Owned by Better Auth (Phase 4). Kept on this table rather than a
     * parallel auth-user table, so there is exactly one identity record.
     */
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    ...timestamps,
  },
  (t) => [
    /**
     * Email is globally unique, not just unique per organization: it is the
     * sign-in identifier, so two rows sharing one address would make
     * authentication ambiguous. Multi-org membership is expressed by
     * `organization_members` rows against a single user, never by duplicating
     * the user.
     */
    uniqueIndex("users_email_uq").on(t.email),
    uniqueIndex("users_org_email_uq").on(t.organizationId, t.email),
    index("users_org_idx").on(t.organizationId),
  ],
);
