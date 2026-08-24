import { relations } from "drizzle-orm";

import { accounts, sessions } from "../schema/auth";
import { teams, workspaces } from "../schema/foundation";
import { users } from "../schema/identity";
import {
  accessPolicies,
  invitations,
  organizationMemberRoles,
  organizationMembers,
  policyConditions,
  teamMembers,
  workspaceMemberRoles,
  workspaceMembers,
} from "../schema/membership";
import { organizations } from "../schema/organization";
import { roles } from "../schema/organization";

export const organizationMembersRelations = relations(organizationMembers, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [organizationMembers.organizationId],
    references: [organizations.id],
  }),
  user: one(users, { fields: [organizationMembers.userId], references: [users.id] }),
  inviter: one(users, { fields: [organizationMembers.invitedBy], references: [users.id] }),
  workspaceMemberships: many(workspaceMembers),
  teamMemberships: many(teamMembers),
  roleAssignments: many(organizationMemberRoles),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  organization: one(organizations, {
    fields: [invitations.organizationId],
    references: [organizations.id],
  }),
  workspace: one(workspaces, {
    fields: [invitations.workspaceId],
    references: [workspaces.id],
  }),
  inviter: one(users, { fields: [invitations.invitedBy], references: [users.id] }),
}));

export const accessPoliciesRelations = relations(accessPolicies, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [accessPolicies.organizationId],
    references: [organizations.id],
  }),
  workspace: one(workspaces, {
    fields: [accessPolicies.workspaceId],
    references: [workspaces.id],
  }),
  conditions: many(policyConditions),
}));

export const policyConditionsRelations = relations(policyConditions, ({ one }) => ({
  policy: one(accessPolicies, {
    fields: [policyConditions.policyId],
    references: [accessPolicies.id],
  }),
}));

export const workspaceMembersRelations = relations(workspaceMembers, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [workspaceMembers.workspaceId],
    references: [workspaces.id],
  }),
  organizationMember: one(organizationMembers, {
    fields: [workspaceMembers.organizationMemberId],
    references: [organizationMembers.id],
  }),
  roleAssignments: many(workspaceMemberRoles),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, { fields: [teamMembers.teamId], references: [teams.id] }),
  organizationMember: one(organizationMembers, {
    fields: [teamMembers.organizationMemberId],
    references: [organizationMembers.id],
  }),
}));

export const organizationMemberRolesRelations = relations(organizationMemberRoles, ({ one }) => ({
  organizationMember: one(organizationMembers, {
    fields: [organizationMemberRoles.organizationMemberId],
    references: [organizationMembers.id],
  }),
  role: one(roles, { fields: [organizationMemberRoles.roleId], references: [roles.id] }),
}));

export const workspaceMemberRolesRelations = relations(workspaceMemberRoles, ({ one }) => ({
  workspaceMember: one(workspaceMembers, {
    fields: [workspaceMemberRoles.workspaceMemberId],
    references: [workspaceMembers.id],
  }),
  role: one(roles, { fields: [workspaceMemberRoles.roleId], references: [roles.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));
