import { relations } from "drizzle-orm";

import { users } from "../schema/identity";
import { organizations, roles } from "../schema/organization";
import { rfps } from "../schema/rfp";

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
  ownedRfps: many(rfps),
}));
