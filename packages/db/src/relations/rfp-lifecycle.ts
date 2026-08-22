import { relations } from "drizzle-orm";

import { users } from "../schema/identity";
import { organizations } from "../schema/organization";
import { rfps } from "../schema/rfp";
import { rfpStatusHistory, rfpTeamAssignments } from "../schema/rfp-lifecycle";

export const rfpTeamAssignmentsRelations = relations(rfpTeamAssignments, ({ one }) => ({
  organization: one(organizations, {
    fields: [rfpTeamAssignments.organizationId],
    references: [organizations.id],
  }),
  rfp: one(rfps, { fields: [rfpTeamAssignments.rfpId], references: [rfps.id] }),
  user: one(users, { fields: [rfpTeamAssignments.userId], references: [users.id] }),
  assigner: one(users, { fields: [rfpTeamAssignments.assignedBy], references: [users.id] }),
}));

export const rfpStatusHistoryRelations = relations(rfpStatusHistory, ({ one }) => ({
  organization: one(organizations, {
    fields: [rfpStatusHistory.organizationId],
    references: [organizations.id],
  }),
  rfp: one(rfps, { fields: [rfpStatusHistory.rfpId], references: [rfps.id] }),
  actor: one(users, { fields: [rfpStatusHistory.actorId], references: [users.id] }),
}));
