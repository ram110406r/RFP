import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { rfpLifecycleStatusEnum, timestamps } from "./_shared";
import { users } from "./identity";
import { organizations } from "./organization";
import { rfps } from "./rfp";

/**
 * The RFP lifecycle from the implementation plan.
 *
 * Deliberately a NEW enum on a NEW column (`rfps.lifecycle_status`) rather
 * than an expansion of `rfp_status`. That existing enum carries the
 * prototype's eight display states ("draft", "in_progress", "needs_attention",
 * ...) and is keyed off by apps/legacy-web's filters, badges and saved views
 * and by apps/legacy-api's queries. Widening it in place would either break
 * those consumers or force the state machine to treat display states as
 * lifecycle states.
 *
 * `status` therefore stays the prototype's presentation field, and
 * `lifecycle_status` is the one the state machine owns and Phase 6+ reads.
 * Collapsing the two is a frontend migration (Phase 7 per schema/rfp.ts), not
 * something to smuggle into this phase.
 */

/** Who does what on a specific RFP. Distinct from the org-wide role. */
export const rfpTeamRoleEnum = pgEnum("rfp_team_role", ["OWNER", "CONTRIBUTOR", "REVIEWER", "SME"]);

/**
 * Per-RFP team assignments.
 *
 * Three things already in the schema are adjacent but none of them fit:
 *  - `rfp_collaborators` is (rfp_id, user_id) with no role, no organization
 *    and no record of who assigned whom;
 *  - `rfp_assignments` is scoped to a *requirement*, not an RFP;
 *  - `organization_members` is org-wide membership, which is a prerequisite
 *    for being assigned but says nothing about a given deal.
 *
 * Hence a new table rather than overloading any of them. It carries
 * `organization_id` directly — denormalised from the RFP — so that tenant
 * scoping is a predicate on this table rather than a join every caller has to
 * remember to write.
 *
 * Removal is a soft `unassigned_at` stamp, matching organization_members, so
 * audit rows and history keep resolving to a real assignment.
 */
export const rfpTeamAssignments = pgTable(
  "rfp_team_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    rfpId: uuid("rfp_id")
      .notNull()
      .references(() => rfps.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: rfpTeamRoleEnum("role").notNull().default("CONTRIBUTOR"),
    assignedBy: uuid("assigned_by").references(() => users.id, { onDelete: "set null" }),
    unassignedAt: timestamp("unassigned_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    /**
     * One assignment per person per role per RFP. A partial index would be
     * needed to allow re-assignment after removal; instead the service
     * reactivates the existing row, which keeps the original assignment
     * history intact.
     */
    uniqueIndex("rfp_team_assignments_rfp_user_role_uq").on(t.rfpId, t.userId, t.role),
    index("rfp_team_assignments_org_idx").on(t.organizationId),
    index("rfp_team_assignments_rfp_idx").on(t.rfpId),
    index("rfp_team_assignments_user_idx").on(t.userId),
  ],
);

/**
 * Append-only lifecycle history, kept separate from `rfps.lifecycle_status`.
 *
 * The column answers "where is this RFP now" cheaply for lists and filters;
 * this table answers "how did it get here, when, and who moved it", which the
 * column cannot because it is overwritten. Written inside the same transaction
 * as the status update, so a transition and its history entry commit together
 * or not at all.
 */
export const rfpStatusHistory = pgTable(
  "rfp_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    rfpId: uuid("rfp_id")
      .notNull()
      .references(() => rfps.id, { onDelete: "cascade" }),
    /** Null for the row recorded at creation, which has no prior state. */
    fromStatus: rfpLifecycleStatusEnum("from_status"),
    toStatus: rfpLifecycleStatusEnum("to_status").notNull(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("rfp_status_history_rfp_idx").on(t.rfpId),
    index("rfp_status_history_org_idx").on(t.organizationId),
    index("rfp_status_history_rfp_created_idx").on(t.rfpId, t.createdAt),
  ],
);
