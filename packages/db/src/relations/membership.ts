import { relations } from "drizzle-orm";

import { accounts, sessions } from "../schema/auth";
import { users } from "../schema/identity";
import { accessPolicies, invitations, organizationMembers } from "../schema/membership";
import { organizations } from "../schema/organization";

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMembers.organizationId],
    references: [organizations.id],
  }),
  user: one(users, { fields: [organizationMembers.userId], references: [users.id] }),
  inviter: one(users, { fields: [organizationMembers.invitedBy], references: [users.id] }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  organization: one(organizations, {
    fields: [invitations.organizationId],
    references: [organizations.id],
  }),
  inviter: one(users, { fields: [invitations.invitedBy], references: [users.id] }),
}));

export const accessPoliciesRelations = relations(accessPolicies, ({ one }) => ({
  organization: one(organizations, {
    fields: [accessPolicies.organizationId],
    references: [organizations.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));
