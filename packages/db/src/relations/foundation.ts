import { relations } from "drizzle-orm";

import { activities, auditLogs } from "../schema/audit";
import { assignments, teams, workspaces } from "../schema/foundation";
import {
  accessPolicies,
  invitations,
  teamMembers,
  workspaceMembers,
} from "../schema/membership";
import { users } from "../schema/identity";
import { organizations } from "../schema/organization";

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [workspaces.organizationId],
    references: [organizations.id],
  }),
  members: many(workspaceMembers),
  teams: many(teams),
  policies: many(accessPolicies),
  invitations: many(invitations),
  assignments: many(assignments),
  activities: many(activities),
  auditLogs: many(auditLogs),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [teams.organizationId],
    references: [organizations.id],
  }),
  workspace: one(workspaces, {
    fields: [teams.workspaceId],
    references: [workspaces.id],
  }),
  members: many(teamMembers),
}));

export const assignmentsRelations = relations(assignments, ({ one }) => ({
  organization: one(organizations, {
    fields: [assignments.organizationId],
    references: [organizations.id],
  }),
  workspace: one(workspaces, {
    fields: [assignments.workspaceId],
    references: [workspaces.id],
  }),
  assigner: one(users, {
    fields: [assignments.assignedBy],
    references: [users.id],
  }),
}));
