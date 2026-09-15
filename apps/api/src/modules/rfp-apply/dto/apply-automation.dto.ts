import { z } from "zod";

const uuid = z.string().uuid();

export const createAutomationRunSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(160).optional(),
  includePackage: z.boolean().default(false),
  requirementIds: z.array(uuid).max(500).optional(),
  limit: z.number().int().min(1).max(500).optional(),
}).strict();
export type CreateAutomationRunInput = z.infer<typeof createAutomationRunSchema>;

export const decideRequirementCandidatesSchema = z.object({
  decisions: z.array(z.object({
    candidateId: uuid,
    decision: z.enum(["ACCEPTED", "REJECTED"]),
  }).strict()).min(1).max(500),
}).strict();
export type DecideRequirementCandidatesInput = z.infer<typeof decideRequirementCandidatesSchema>;

export const createPackageSchema = z.object({}).strict();
export const approvePackageSchema = z.object({ comment: z.string().trim().max(2000).default("") }).strict();
export type ApprovePackageInput = z.infer<typeof approvePackageSchema>;

export const updateMilestonesSchema = z.object({
  milestones: z.array(z.object({
    kind: z.enum(["REVIEW", "APPROVAL", "PACKAGE", "SUBMISSION"]),
    offsetDays: z.number().int().min(0).max(365),
  }).strict()).length(4),
}).strict().refine((value) => new Set(value.milestones.map((item) => item.kind)).size === 4, {
  message: "Provide each milestone kind exactly once.",
});
export type UpdateMilestonesInput = z.infer<typeof updateMilestonesSchema>;

export const createSubmissionSchema = z.object({
  packageId: uuid,
  portal: z.string().trim().min(1).max(160),
  portalReference: z.string().trim().min(1).max(240),
  submittedAt: z.string().datetime(),
  notes: z.string().trim().max(4000).default(""),
  receiptFileIds: z.array(uuid).max(20).default([]),
}).strict();
export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;
