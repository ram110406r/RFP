import { relations } from "drizzle-orm";

import { users } from "../schema/identity";
import { customers, organizations } from "../schema/organization";
import { rfps } from "../schema/rfp";

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  rfps: many(rfps),
  customers: many(customers),
}));
