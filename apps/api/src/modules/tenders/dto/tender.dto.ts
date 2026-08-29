import { z } from "zod";
import {
  TENDER_ANSWER_SOURCES,
  TENDER_ANSWER_STATUSES,
  TENDER_DOCUMENT_ROLES,
  TENDER_QUESTION_STATUSES,
  TENDER_QUESTION_TYPES,
  TENDER_REQUIREMENT_STATUSES,
  TENDER_REQUIREMENT_TYPES,
  TENDER_SOURCE_TYPES,
  TENDER_STATUSES,
  TENDER_TYPES,
} from "@rfp-os/types";
import { EVIDENCE_FRESHNESS } from "@rfp-os/types";

import { TENDER_LIFECYCLE_STATUSES } from "../domain/tender-state-machine";

const uuid = z.string().uuid();
const text = z.string().trim().min(1).max(10_000);
const longText = z.string().trim().max(50_000);
const metadata = z.record(z.unknown()).optional();
const isoDateTime = z.string().datetime({ offset: true });

export const tenderTypeSchema = z.enum(TENDER_TYPES);
export const tenderSourceTypeSchema = z.enum(TENDER_SOURCE_TYPES);
export const tenderStatusSchema = z.enum(TENDER_STATUSES);
export const tenderLifecycleStatusSchema = z.enum(TENDER_LIFECYCLE_STATUSES);
export const tenderQuestionStatusSchema = z.enum(TENDER_QUESTION_STATUSES);
export const tenderQuestionTypeSchema = z.enum(TENDER_QUESTION_TYPES);
export const tenderRequirementStatusSchema = z.enum(TENDER_REQUIREMENT_STATUSES);
export const tenderRequirementTypeSchema = z.enum(TENDER_REQUIREMENT_TYPES);
export const tenderAnswerStatusSchema = z.enum(TENDER_ANSWER_STATUSES);
export const tenderAnswerSourceSchema = z.enum(TENDER_ANSWER_SOURCES);
export const tenderReviewStatusSchema = z.enum(["PENDING", "APPROVED", "CHANGES_REQUESTED", "REJECTED"]);
export const tenderDocumentRoleSchema = z.enum(TENDER_DOCUMENT_ROLES);

export const listTendersSchema = z
  .object({
    workspaceId: uuid.optional(),
    status: tenderStatusSchema.optional(),
    tenderType: tenderTypeSchema.optional(),
    search: z.string().trim().max(200).optional(),
    includeArchived: z
      .union([z.boolean(), z.enum(["true", "false"])])
      .transform((value) => value === true || value === "true")
      .optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(25),
  })
  .strict();
export type ListTendersInput = z.infer<typeof listTendersSchema>;

export const dashboardSummarySchema = z
  .object({
    pageSize: z.coerce.number().int().positive().max(25).default(6),
  })
  .strict();
export type DashboardSummaryInput = z.infer<typeof dashboardSummarySchema>;

export const createTenderSchema = z
  .object({
    workspaceId: uuid,
    name: text.max(300),
    title: text.max(500),
    referenceNumber: z.string().trim().max(120).optional(),
    description: longText.optional(),
    tenderType: tenderTypeSchema,
    sourceType: tenderSourceTypeSchema,
    sourceReference: z.record(z.unknown()).optional(),
    sourceUrl: z.string().url().optional(),
    ownerId: uuid.optional(),
    receivedAt: isoDateTime.optional(),
    dueAt: isoDateTime.optional(),
    timezone: z.string().trim().max(80).optional(),
    metadata,
  })
  .strict();
export type CreateTenderInput = z.infer<typeof createTenderSchema>;

export const updateTenderSchema = z
  .object({
    name: text.max(300).optional(),
    title: text.max(500).optional(),
    referenceNumber: z.string().trim().max(120).nullable().optional(),
    description: longText.optional(),
    tenderType: tenderTypeSchema.optional(),
    sourceType: tenderSourceTypeSchema.optional(),
    sourceReference: z.record(z.unknown()).optional(),
    sourceUrl: z.string().url().nullable().optional(),
    ownerId: uuid.optional(),
    receivedAt: isoDateTime.nullable().optional(),
    dueAt: isoDateTime.nullable().optional(),
    timezone: z.string().trim().max(80).optional(),
    metadata,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });
export type UpdateTenderInput = z.infer<typeof updateTenderSchema>;

export const transitionTenderSchema = z
  .object({
    to: tenderLifecycleStatusSchema,
    reason: z.string().trim().max(1_000).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();
export type TransitionTenderInput = z.infer<typeof transitionTenderSchema>;

export const createTenderQuestionSchema = z
  .object({
    questionNumber: z.string().trim().max(80).optional(),
    section: z.string().trim().max(200).optional(),
    questionText: text.max(10_000),
    questionType: tenderQuestionTypeSchema.optional(),
    required: z.boolean().optional(),
    status: tenderQuestionStatusSchema.optional(),
    sourceReference: z.record(z.unknown()).optional(),
    sortOrder: z.coerce.number().int().default(0),
    metadata,
    requirementIds: z.array(uuid).optional(),
  })
  .strict();
export type CreateTenderQuestionInput = z.infer<typeof createTenderQuestionSchema>;

export const updateTenderQuestionSchema = z
  .object({
    questionNumber: z.string().trim().max(80).nullable().optional(),
    section: z.string().trim().max(200).nullable().optional(),
    questionText: text.max(10_000).optional(),
    questionType: tenderQuestionTypeSchema.optional(),
    required: z.boolean().optional(),
    status: tenderQuestionStatusSchema.optional(),
    sourceReference: z.record(z.unknown()).optional(),
    sortOrder: z.coerce.number().int().optional(),
    metadata,
    requirementIds: z.array(uuid).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });
export type UpdateTenderQuestionInput = z.infer<typeof updateTenderQuestionSchema>;

export const createTenderRequirementSchema = z
  .object({
    requirementCode: z.string().trim().max(80).optional(),
    title: text.max(500),
    description: longText.optional(),
    requirementType: tenderRequirementTypeSchema.optional(),
    mandatory: z.boolean().optional(),
    status: tenderRequirementStatusSchema.optional(),
    sourceReference: z.record(z.unknown()).optional(),
    metadata,
  })
  .strict();
export type CreateTenderRequirementInput = z.infer<typeof createTenderRequirementSchema>;

export const updateTenderRequirementSchema = z
  .object({
    requirementCode: z.string().trim().max(80).nullable().optional(),
    title: text.max(500).optional(),
    description: longText.optional(),
    requirementType: tenderRequirementTypeSchema.optional(),
    mandatory: z.boolean().optional(),
    status: tenderRequirementStatusSchema.optional(),
    sourceReference: z.record(z.unknown()).optional(),
    metadata,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });
export type UpdateTenderRequirementInput = z.infer<typeof updateTenderRequirementSchema>;

export const createTenderAnswerSchema = z
  .object({
    answerText: longText.optional().default(""),
    source: tenderAnswerSourceSchema.optional(),
    confidence: z.coerce.number().min(0).max(1).optional(),
    status: tenderAnswerStatusSchema.optional(),
    metadata,
  })
  .strict();
export type CreateTenderAnswerInput = z.infer<typeof createTenderAnswerSchema>;

export const updateTenderAnswerSchema = z
  .object({
    answerText: longText.optional(),
    source: tenderAnswerSourceSchema.optional(),
    confidence: z.coerce.number().min(0).max(1).optional(),
    status: tenderAnswerStatusSchema.optional(),
    metadata,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });
export type UpdateTenderAnswerInput = z.infer<typeof updateTenderAnswerSchema>;

export const createTenderReviewSchema = z
  .object({
    reviewerId: uuid.optional(),
    status: tenderReviewStatusSchema.optional(),
    comment: z.string().trim().max(10_000).optional(),
  })
  .strict();
export type CreateTenderReviewInput = z.infer<typeof createTenderReviewSchema>;

export const updateTenderReviewSchema = z
  .object({
    status: tenderReviewStatusSchema.optional(),
    comment: z.string().trim().max(10_000).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });
export type UpdateTenderReviewInput = z.infer<typeof updateTenderReviewSchema>;

export const createTenderAnswerEvidenceSchema = z
  .object({
    evidenceType: z.string().trim().min(1).max(80),
    evidenceId: z.string().trim().min(1).max(200),
    sourceId: uuid.optional(),
    sourceVersion: z.string().trim().max(120).optional(),
    relevance: z.coerce.number().min(0).max(1).optional(),
    confidence: z.coerce.number().min(0).max(1).optional(),
    freshness: z.enum(EVIDENCE_FRESHNESS).optional(),
    verifiedAt: isoDateTime.nullable().optional(),
    metadata,
  })
  .strict();
export type CreateTenderAnswerEvidenceInput = z.infer<typeof createTenderAnswerEvidenceSchema>;

export const searchTenderRequirementEvidenceSchema = z
  .object({
    query: z.string().trim().max(500).optional(),
    limit: z.coerce.number().int().positive().max(25).default(10),
    minFinalScore: z.coerce.number().min(0).max(1).optional(),
    includeStale: z
      .union([z.boolean(), z.enum(["true", "false"])])
      .transform((value) => value === true || value === "true")
      .optional(),
  })
  .strict();
export type SearchTenderRequirementEvidenceInput = z.infer<typeof searchTenderRequirementEvidenceSchema>;

export const improveTenderAnswerSchema = z
  .object({
    transformation: z.enum(["improve", "shorten", "expand", "formal", "concise", "align_to_evidence"]),
  })
  .strict();
export type ImproveTenderAnswerInput = z.infer<typeof improveTenderAnswerSchema>;

export const analyzeTenderAnswerSchema = z.object({}).strict();
export type AnalyzeTenderAnswerInput = z.infer<typeof analyzeTenderAnswerSchema>;

export const tenderBriefSchema = z.object({}).strict();
export type TenderBriefInput = z.infer<typeof tenderBriefSchema>;
