import { z } from "zod";

/**
 * Shared cross-cutting validation schemas. Domain-specific schemas (RFP
 * intake, requirements, etc.) live in the domain module that owns them.
 */

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const requirementCategorySchema = z.enum([
  "Security",
  "Commercial",
  "Compliance",
  "Product",
  "Legal",
  "Architecture",
  "Support",
]);

export const requirementCandidateTypeSchema = z.enum([
  "explicit_requirement",
  "acceptance_criteria",
  "deliverable",
  "deadline",
  "constraint",
  "qualification",
  "evaluation_criterion",
  "question",
]);

export const requirementCandidateStatusSchema = z.enum([
  "extracted",
  "accepted",
  "rejected",
  "projected",
  "superseded",
]);

export const requirementSourceKindSchema = z.enum(["page", "table", "block"]);

export const requirementCandidateSourceSchema = z
  .object({
    sourceIndex: z.number().int().min(0),
    sourceKind: requirementSourceKindSchema,
    documentPageId: z.string().uuid().optional(),
    documentTableId: z.string().uuid().optional(),
    documentBlockId: z.string().uuid().optional(),
    excerpt: z.string().trim().min(1),
    rowIndex: z.number().int().min(0).nullable().optional(),
    columnIndex: z.number().int().min(0).nullable().optional(),
  })
  .refine(
    (value) =>
      [value.documentPageId, value.documentTableId, value.documentBlockId].filter(Boolean).length >=
      1,
    { message: "A candidate source must reference at least one persisted source row." },
  );

export const validatedRequirementCandidateSourceSchema = requirementCandidateSourceSchema.refine(
  (value) => {
    if (value.sourceKind === "page") return !!value.documentPageId;
    if (value.sourceKind === "table") return !!value.documentTableId;
    return !!value.documentBlockId;
  },
  { message: "sourceKind does not match the referenced source row." },
);

export const requirementCandidateSchema = z.object({
  candidateIndex: z.number().int().min(0),
  candidateType: requirementCandidateTypeSchema,
  category: requirementCategorySchema.nullable(),
  mandatory: z.boolean(),
  title: z.string().trim().min(1),
  originalText: z.string().trim().min(1),
  normalizedText: z.string().trim().min(1),
  confidence: z.number().min(0).max(1),
  extractionMethod: z.literal("deterministic"),
  status: z.literal("extracted"),
  sources: z.array(validatedRequirementCandidateSourceSchema).min(1),
});

export const requirementExtractionResultSchema = z.object({
  extractor: z.literal("deterministic@1"),
  candidates: z.array(requirementCandidateSchema),
});
