import { relations } from "drizzle-orm";

import { documentExtractions, documentPages, documentTables } from "../schema/extraction";
import { organizations } from "../schema/organization";
import { rfpDocuments } from "../schema/rfp";

export const documentExtractionsRelations = relations(documentExtractions, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [documentExtractions.organizationId],
    references: [organizations.id],
  }),
  document: one(rfpDocuments, {
    fields: [documentExtractions.documentId],
    references: [rfpDocuments.id],
  }),
  pages: many(documentPages),
  tables: many(documentTables),
}));

export const documentPagesRelations = relations(documentPages, ({ one }) => ({
  extraction: one(documentExtractions, {
    fields: [documentPages.extractionId],
    references: [documentExtractions.id],
  }),
  document: one(rfpDocuments, {
    fields: [documentPages.documentId],
    references: [rfpDocuments.id],
  }),
}));

export const documentTablesRelations = relations(documentTables, ({ one }) => ({
  extraction: one(documentExtractions, {
    fields: [documentTables.extractionId],
    references: [documentExtractions.id],
  }),
  document: one(rfpDocuments, {
    fields: [documentTables.documentId],
    references: [rfpDocuments.id],
  }),
}));
