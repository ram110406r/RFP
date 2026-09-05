import { relations } from "drizzle-orm";

import { files } from "../schema/files";
import { users } from "../schema/identity";
import { organizations } from "../schema/organization";
import { workspaces } from "../schema/foundation";
import {
  tenderAnswerEvidence,
  tenderAnswerReviews,
  tenderAnswerVersions,
  tenderAnswers,
  tenderDocumentContent,
  tenderDocumentExtractions,
  tenderDocuments,
  savedTenders,
  tenderSources,
  tenderQuestionRequirements,
  tenderQuestions,
  tenderRequirements,
  tenderStatusHistory,
  tenders,
} from "../schema/tender";

export const tendersRelations = relations(tenders, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [tenders.organizationId],
    references: [organizations.id],
  }),
  workspace: one(workspaces, {
    fields: [tenders.workspaceId],
    references: [workspaces.id],
  }),
  owner: one(users, { fields: [tenders.ownerId], references: [users.id] }),
  createdByUser: one(users, { fields: [tenders.createdBy], references: [users.id] }),
  statusHistory: many(tenderStatusHistory),
  questions: many(tenderQuestions),
  requirements: many(tenderRequirements),
  answers: many(tenderAnswers),
  documents: many(tenderDocuments),
  sources: many(tenderSources),
  savedByWorkspaces: many(savedTenders),
}));

export const savedTendersRelations = relations(savedTenders, ({ one }) => ({
  organization: one(organizations, {
    fields: [savedTenders.organizationId],
    references: [organizations.id],
  }),
  workspace: one(workspaces, {
    fields: [savedTenders.workspaceId],
    references: [workspaces.id],
  }),
  tender: one(tenders, {
    fields: [savedTenders.tenderId],
    references: [tenders.id],
  }),
  savedByUser: one(users, { fields: [savedTenders.savedBy], references: [users.id] }),
}));

export const tenderQuestionsRelations = relations(tenderQuestions, ({ one, many }) => ({
  tender: one(tenders, { fields: [tenderQuestions.tenderId], references: [tenders.id] }),
  requirements: many(tenderQuestionRequirements),
}));

export const tenderRequirementsRelations = relations(tenderRequirements, ({ one, many }) => ({
  tender: one(tenders, { fields: [tenderRequirements.tenderId], references: [tenders.id] }),
  questions: many(tenderQuestionRequirements),
}));

export const tenderQuestionRequirementsRelations = relations(
  tenderQuestionRequirements,
  ({ one }) => ({
    question: one(tenderQuestions, {
      fields: [tenderQuestionRequirements.questionId],
      references: [tenderQuestions.id],
    }),
    requirement: one(tenderRequirements, {
      fields: [tenderQuestionRequirements.requirementId],
      references: [tenderRequirements.id],
    }),
  }),
);

export const tenderAnswersRelations = relations(tenderAnswers, ({ one, many }) => ({
  tender: one(tenders, { fields: [tenderAnswers.tenderId], references: [tenders.id] }),
  question: one(tenderQuestions, { fields: [tenderAnswers.questionId], references: [tenderQuestions.id] }),
  versions: many(tenderAnswerVersions),
  evidence: many(tenderAnswerEvidence),
  reviews: many(tenderAnswerReviews),
}));

export const tenderAnswerVersionsRelations = relations(tenderAnswerVersions, ({ one }) => ({
  answer: one(tenderAnswers, { fields: [tenderAnswerVersions.answerId], references: [tenderAnswers.id] }),
  createdByUser: one(users, { fields: [tenderAnswerVersions.createdBy], references: [users.id] }),
}));

export const tenderAnswerEvidenceRelations = relations(tenderAnswerEvidence, ({ one }) => ({
  answer: one(tenderAnswers, { fields: [tenderAnswerEvidence.answerId], references: [tenderAnswers.id] }),
}));

export const tenderAnswerReviewsRelations = relations(tenderAnswerReviews, ({ one }) => ({
  answer: one(tenderAnswers, { fields: [tenderAnswerReviews.answerId], references: [tenderAnswers.id] }),
  reviewer: one(users, { fields: [tenderAnswerReviews.reviewerId], references: [users.id] }),
}));

export const tenderDocumentsRelations = relations(tenderDocuments, ({ one }) => ({
  tender: one(tenders, { fields: [tenderDocuments.tenderId], references: [tenders.id] }),
  source: one(tenderSources, { fields: [tenderDocuments.tenderSourceId], references: [tenderSources.id] }),
  document: one(files, { fields: [tenderDocuments.documentId], references: [files.id] }),
}));

export const tenderDocumentExtractionsRelations = relations(tenderDocumentExtractions, ({ one, many }) => ({
  tender: one(tenders, { fields: [tenderDocumentExtractions.tenderId], references: [tenders.id] }),
  tenderDocument: one(tenderDocuments, {
    fields: [tenderDocumentExtractions.tenderDocumentId],
    references: [tenderDocuments.id],
  }),
  content: many(tenderDocumentContent),
}));

export const tenderDocumentContentRelations = relations(tenderDocumentContent, ({ one }) => ({
  tender: one(tenders, { fields: [tenderDocumentContent.tenderId], references: [tenders.id] }),
  tenderDocument: one(tenderDocuments, {
    fields: [tenderDocumentContent.tenderDocumentId],
    references: [tenderDocuments.id],
  }),
  extraction: one(tenderDocumentExtractions, {
    fields: [tenderDocumentContent.extractionId],
    references: [tenderDocumentExtractions.id],
  }),
}));

export const tenderSourcesRelations = relations(tenderSources, ({ one }) => ({
  tender: one(tenders, { fields: [tenderSources.tenderId], references: [tenders.id] }),
  file: one(files, { fields: [tenderSources.fileId], references: [files.id] }),
  createdByUser: one(users, { fields: [tenderSources.createdBy], references: [users.id] }),
}));
