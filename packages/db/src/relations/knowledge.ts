import { relations } from "drizzle-orm";

import { users } from "../schema/identity";
import {
  knowledgeClaims,
  knowledgeConflictVariants,
  knowledgeConflicts,
  knowledgeSources,
  knowledgeVersions,
} from "../schema/knowledge";

export const knowledgeSourcesRelations = relations(knowledgeSources, ({ many, one }) => ({
  claims: many(knowledgeClaims),
  versions: many(knowledgeVersions),
  conflicts: many(knowledgeConflicts),
  owner: one(users, { fields: [knowledgeSources.ownerId], references: [users.id] }),
}));

export const knowledgeConflictsRelations = relations(knowledgeConflicts, ({ many, one }) => ({
  variants: many(knowledgeConflictVariants),
  source: one(knowledgeSources, {
    fields: [knowledgeConflicts.sourceId],
    references: [knowledgeSources.id],
  }),
}));
