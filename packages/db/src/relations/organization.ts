import { relations } from "drizzle-orm";

import { users } from "../schema/identity";
import { assignments, teams, workspaces } from "../schema/foundation";
import { accessPolicies, invitations, organizationMembers } from "../schema/membership";
import { customers, organizations } from "../schema/organization";
import { rfps } from "../schema/rfp";

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  organizationMembers: many(organizationMembers),
  workspaces: many(workspaces),
  teams: many(teams),
  invitations: many(invitations),
  accessPolicies: many(accessPolicies),
  assignments: many(assignments),
  rfps: many(rfps),
  customers: many(customers),
}));
