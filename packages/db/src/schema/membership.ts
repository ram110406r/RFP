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
import { teams, workspaces } from "./foundation";
import { users } from "./identity";
import { organizations } from "./organization";
import { roles } from "./organization";

/**
 * The seven platform roles from the implementation plan.
 *
 * Distinct from the pre-existing `member_role` enum on `users`, which carries
 * the prototype's five display tiers ("Admin", "Proposal Manager", ...).
 * That column stays put; this enum is the one
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

export const membershipStatusEnum = pgEnum("membership_status", [
  "invited",
  "active",
  "suspended",
  "removed",
]);

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
 *
 * Only a SHA-256 hash of the token is stored (`token_hash`); the plaintext
 * exists in the emailed link and nowhere else, so a database read does not
 * yield working join links. `token` is the retired plaintext column, kept
 * nullable for one release so a rollback still boots; it is always null now.
 */
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    role: orgRoleEnum("role").notNull().default("VIEWER"),
    proposedDepartment: text("proposed_department"),
    proposedTeamId: uuid("proposed_team_id").references(() => teams.id, { onDelete: "set null" }),
    /** @deprecated Always null. Dropped in a follow-up migration. */
    token: text("token"),
    tokenHash: text("token_hash").notNull(),
    status: invitationStatusEnum("status").notNull().default("pending"),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedBy: uuid("accepted_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("invitations_token_uq").on(t.token),
    uniqueIndex("invitations_token_hash_uq").on(t.tokenHash),
    index("invitations_org_idx").on(t.organizationId),
    index("invitations_workspace_idx").on(t.workspaceId),
    index("invitations_team_idx").on(t.proposedTeamId),
    index("invitations_email_idx").on(t.email),
    index("invitations_org_status_idx").on(t.organizationId, t.status),
  ],
);

export const workspaceMembershipStatusEnum = pgEnum("workspace_membership_status", [
  "active",
  "removed",
]);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    organizationMemberId: uuid("organization_member_id")
      .notNull()
      .references(() => organizationMembers.id, { onDelete: "cascade" }),
    status: workspaceMembershipStatusEnum("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("workspace_members_workspace_member_uq").on(
      t.workspaceId,
      t.organizationMemberId,
    ),
    index("workspace_members_workspace_idx").on(t.workspaceId),
    index("workspace_members_org_member_idx").on(t.organizationMemberId),
  ],
);

export const teamMembers = pgTable(
  "team_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    organizationMemberId: uuid("organization_member_id")
      .notNull()
      .references(() => organizationMembers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("team_members_team_member_uq").on(t.teamId, t.organizationMemberId),
    index("team_members_team_idx").on(t.teamId),
    index("team_members_org_member_idx").on(t.organizationMemberId),
  ],
);

export const organizationMemberRoles = pgTable(
  "organization_member_roles",
  {
    organizationMemberId: uuid("organization_member_id")
      .notNull()
      .references(() => organizationMembers.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("organization_member_roles_uq").on(t.organizationMemberId, t.roleId)],
);

export const workspaceMemberRoles = pgTable(
  "workspace_member_roles",
  {
    workspaceMemberId: uuid("workspace_member_id")
      .notNull()
      .references(() => workspaceMembers.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("workspace_member_roles_uq").on(t.workspaceMemberId, t.roleId)],
);

export const policyEffectEnum = pgEnum("policy_effect", ["allow", "deny"]);
export const policyStatusEnum = pgEnum("policy_status", ["active", "disabled"]);

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
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    name: text("name").notNull().default(""),
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
    status: policyStatusEnum("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    index("access_policies_org_idx").on(t.organizationId),
    index("access_policies_lookup_idx").on(t.organizationId, t.workspaceId, t.resource, t.action),
  ],
);

export const policyConditionOperatorEnum = pgEnum("policy_condition_operator", [
  "eq",
  "neq",
  "in",
  "not_in",
  "exists",
  "not_exists",
]);

export const policyConditions = pgTable(
  "policy_conditions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    policyId: uuid("policy_id")
      .notNull()
      .references(() => accessPolicies.id, { onDelete: "cascade" }),
    attribute: text("attribute").notNull(),
    operator: policyConditionOperatorEnum("operator").notNull(),
    value: jsonb("value"),
    logicalGroup: text("logical_group").notNull().default("default"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("policy_conditions_policy_idx").on(t.policyId)],
);
