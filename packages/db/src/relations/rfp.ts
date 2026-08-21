import { relations } from "drizzle-orm";

import { users } from "../schema/identity";
import { knowledgeSources } from "../schema/knowledge";
import { customers, organizations } from "../schema/organization";
import {
  rfpAnswers,
  rfpAssignments,
  rfpCollaborators,
  rfpDocuments,
  rfpEvidence,
  rfpOutcomes,
  rfpRequirements,
  rfpReviews,
  rfpRisks,
  rfpSubmissionArtifacts,
  rfpSubmissionChecklistItems,
  rfpSubmissions,
  rfps,
} from "../schema/rfp";

export const rfpsRelations = relations(rfps, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [rfps.organizationId],
    references: [organizations.id],
  }),
  customer: one(customers, { fields: [rfps.customerId], references: [customers.id] }),
  owner: one(users, { fields: [rfps.ownerId], references: [users.id] }),
  documents: many(rfpDocuments),
  requirements: many(rfpRequirements),
  collaborators: many(rfpCollaborators),
  submissions: many(rfpSubmissions),
  outcome: one(rfpOutcomes, { fields: [rfps.id], references: [rfpOutcomes.rfpId] }),
}));

export const rfpRequirementsRelations = relations(rfpRequirements, ({ one, many }) => ({
  rfp: one(rfps, { fields: [rfpRequirements.rfpId], references: [rfps.id] }),
  reviewer: one(users, { fields: [rfpRequirements.reviewerId], references: [users.id] }),
  answers: many(rfpAnswers),
  reviews: many(rfpReviews),
  assignments: many(rfpAssignments),
  risks: many(rfpRisks),
}));

export const rfpAnswersRelations = relations(rfpAnswers, ({ one, many }) => ({
  requirement: one(rfpRequirements, {
    fields: [rfpAnswers.requirementId],
    references: [rfpRequirements.id],
  }),
  evidence: many(rfpEvidence),
}));

export const rfpEvidenceRelations = relations(rfpEvidence, ({ one }) => ({
  answer: one(rfpAnswers, { fields: [rfpEvidence.answerId], references: [rfpAnswers.id] }),
  source: one(knowledgeSources, {
    fields: [rfpEvidence.sourceId],
    references: [knowledgeSources.id],
  }),
}));

export const rfpSubmissionsRelations = relations(rfpSubmissions, ({ many, one }) => ({
  checklist: many(rfpSubmissionChecklistItems),
  artifacts: many(rfpSubmissionArtifacts),
  rfp: one(rfps, { fields: [rfpSubmissions.rfpId], references: [rfps.id] }),
}));
