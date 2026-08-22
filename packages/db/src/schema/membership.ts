import {
  index,
  integer,
  jsonb,
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

/**
 * The seven platform roles from the implementation plan.
 *
 * Distinct from the pre-existing `member_role` enum on `users`, which carries
 * the prototype's five display tiers ("Admin", "Proposal Manager", ...) and is
 * still read by apps/legacy-web. That column stays put; this enum is the one
 * authorization actually decides on. Reconciling the prototype's vocabulary is
 * a frontend migration, not a reason to hold up the permission model.
 */
export const orgRoleEnum = pgEnum("org_role", [
  "OWNER",
  "ADMIN",
  "RFP_MANAGER",
  "CONTRIBUTOR",
  "REVIEWER",
  "SME",
  "VIEWER",
]);

export const membershipStatusEnum = pgEnum("membership_status", ["active", "suspended", "removed"]);

/**
 * The authoritative answer to "may this user act in this organization, and as
 * what". Every authorization decision resolves through a row here.
 *
 * `users.organization_id` still exists and still points at the user's primary
 * organization — the prototype API depends on it — but it is a default, not a
 * grant. Membership is what the guards read, which is what makes a user able
 * to belong to more than one tenant.
 *
 * Removal is a status change rather than a delete, so that audit rows and
 * historical assignments keep resolving to a real membership.
 */
export const organizationMembers = pgTable(
  "organization_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: orgRoleEnum("role").notNull().default("VIEWER"),
    status: membershipStatusEnum("status").notNull().default("active"),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("organization_members_org_user_uq").on(t.organizationId, t.userId),
    index("organization_members_org_idx").on(t.organizationId),
    index("organization_members_user_idx").on(t.userId),
    index("organization_members_org_role_idx").on(t.organizationId, t.role),
  ],
);

export const invitationStatusEnum = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "revoked",
  "expired",
]);

/**
 * A pending grant of membership, addressed to an email rather than a user —
 * the invitee may not have an account yet.
 *
 * The token is the capability: it is random, single-use, and carries the
 * organization and role, so accepting never trusts an organization id sent by
 * the client. Status is checked alongside `expiresAt` on every acceptance,
 * because an expired row is only lazily marked.
 */
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: orgRoleEnum("role").notNull().default("VIEWER"),
    token: text("token").notNull(),
    status: invitationStatusEnum("status").notNull().default("pending"),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedBy: uuid("accepted_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("invitations_token_uq").on(t.token),
    index("invitations_org_idx").on(t.organizationId),
    index("invitations_email_idx").on(t.email),
    index("invitations_org_status_idx").on(t.organizationId, t.status),
  ],
);

export const policyEffectEnum = pgEnum("policy_effect", ["allow", "deny"]);

/**
 * ABAC foundation.
 *
 * RBAC answers "may a REVIEWER review answers at all"; it cannot answer "may
 * this reviewer review *this* answer". That second question depends on
 * attributes of the subject and the resource together — ownership, assignment,
 * risk level, category — and this table is where those rules live.
 *
 * `condition` holds an attribute predicate evaluated against the request's
 * resource attributes (see PolicyService in apps/api). Deny wins over allow,
 * and higher `priority` is evaluated first, so a narrow deny can carve an
 * exception out of a broad role grant without editing the role matrix.
 *
 * Rows are optional: with no policies for a resource, RBAC alone decides.
 */
export const accessPolicies = pgTable(
  "access_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    description: text("description").notNull().default(""),
    /** Null means the policy applies to every role in the organization. */
    role: orgRoleEnum("role"),
    /** Resource type, e.g. "rfp" or "requirement". */
    resource: text("resource").notNull(),
    /** Action within the resource, e.g. "approve". "*" matches any action. */
    action: text("action").notNull(),
    effect: policyEffectEnum("effect").notNull().default("allow"),
    condition: jsonb("condition"),
    priority: integer("priority").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("access_policies_org_idx").on(t.organizationId),
    index("access_policies_lookup_idx").on(t.organizationId, t.resource, t.action),
  ],
);
