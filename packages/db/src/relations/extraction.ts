import { relations } from "drizzle-orm";

import {
  documentBlocks,
  documentExtractions,
  documentPages,
  documentTables,
  requirementCandidateSources,
  requirementCandidates,
  requirementExtractions,
} from "../schema/extraction";
import { organizations } from "../schema/organization";
import { rfpDocuments, rfpRequirements, rfps } from "../schema/rfp";

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
  blocks: many(documentBlocks),
  requirementExtractions: many(requirementExtractions),
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

export const documentBlocksRelations = relations(documentBlocks, ({ one }) => ({
  extraction: one(documentExtractions, {
    fields: [documentBlocks.extractionId],
    references: [documentExtractions.id],
  }),
  document: one(rfpDocuments, {
    fields: [documentBlocks.documentId],
    references: [rfpDocuments.id],
  }),
}));

export const requirementExtractionsRelations = relations(requirementExtractions, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [requirementExtractions.organizationId],
    references: [organizations.id],
  }),
  rfp: one(rfps, {
    fields: [requirementExtractions.rfpId],
    references: [rfps.id],
  }),
  document: one(rfpDocuments, {
    fields: [requirementExtractions.documentId],
    references: [rfpDocuments.id],
  }),
  documentExtraction: one(documentExtractions, {
    fields: [requirementExtractions.documentExtractionId],
    references: [documentExtractions.id],
  }),
  candidates: many(requirementCandidates),
}));

export const requirementCandidatesRelations = relations(requirementCandidates, ({ one, many }) => ({
  extraction: one(requirementExtractions, {
    fields: [requirementCandidates.extractionId],
    references: [requirementExtractions.id],
  }),
  rfp: one(rfps, {
    fields: [requirementCandidates.rfpId],
    references: [rfps.id],
  }),
  document: one(rfpDocuments, {
    fields: [requirementCandidates.documentId],
    references: [rfpDocuments.id],
  }),
  projectedRequirement: one(rfpRequirements, {
    fields: [requirementCandidates.projectedRequirementId],
    references: [rfpRequirements.id],
  }),
  sources: many(requirementCandidateSources),
}));

export const requirementCandidateSourcesRelations = relations(requirementCandidateSources, ({ one }) => ({
  candidate: one(requirementCandidates, {
    fields: [requirementCandidateSources.candidateId],
    references: [requirementCandidates.id],
  }),
  page: one(documentPages, {
    fields: [requirementCandidateSources.documentPageId],
    references: [documentPages.id],
  }),
  table: one(documentTables, {
    fields: [requirementCandidateSources.documentTableId],
    references: [documentTables.id],
  }),
  block: one(documentBlocks, {
    fields: [requirementCandidateSources.documentBlockId],
    references: [documentBlocks.id],
  }),
}));
