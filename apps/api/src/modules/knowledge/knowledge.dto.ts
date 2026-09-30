import { z } from "zod";

const uuid = z.string().uuid();
const text = z.string().trim().min(1).max(10_000);
const longText = z.string().trim().max(50_000);
const knowledgeCategories = [
  "Security",
  "Commercial",
  "Compliance",
  "Product",
  "Legal",
  "Architecture",
  "Support",
] as const;

export const KNOWLEDGE_SORTS = [
  "updatedAt:desc",
  "updatedAt:asc",
  "name:asc",
  "lastVerified:asc",
  "lastUsed:desc",
  "usage:desc",
] as const;
export type KnowledgeSort = (typeof KNOWLEDGE_SORTS)[number];

export const KNOWLEDGE_ISSUE_TYPES = [
  "DRAFT",
  "REVISION",
  "UNVERIFIED",
  "STALE",
  "EXPIRED",
  "EXPIRING_SOON",
  "CONFLICT",
] as const;
export type KnowledgeIssueType = (typeof KNOWLEDGE_ISSUE_TYPES)[number];

export const knowledgeClaimSchema = z
  .object({
    /** Present when editing an existing claim; its id is kept so citations stay valid. */
    id: uuid.optional(),
    label: text.max(200),
    value: text.max(5_000),
    confidence: z.coerce.number().min(0).max(1).optional(),
  })
  .strict();

export const listKnowledgeSchema = z
  .object({
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
    category: z.enum(knowledgeCategories).optional(),
    type: z.string().trim().max(120).optional(),
    authority: z.enum(["high", "medium", "low"]).optional(),
    ownerId: uuid.optional(),
    sourceKind: z.string().trim().max(80).optional(),
    expires: z.enum(["expired", "expiring", "active", "all"]).optional(),
    reviewState: z.enum(["draft", "stale", "expired", "expiring", "unverified", "healthy", "all"]).optional(),
    search: z.string().trim().max(200).optional(),
    sort: z.enum(KNOWLEDGE_SORTS).default("updatedAt:desc"),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(25),
  })
  .strict();
export type ListKnowledgeInput = z.infer<typeof listKnowledgeSchema>;

export const createKnowledgeSchema = z
  .object({
    name: text.max(300),
    type: text.max(120),
    category: z.enum(knowledgeCategories),
    version: z.string().trim().max(40).optional(),
    authority: z.enum(["high", "medium", "low"]).optional(),
    ownerId: uuid.optional(),
    summary: longText.optional(),
    lastVerified: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    expiresAt: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    sourceKind: z.string().trim().max(80).optional(),
    metadata: z.record(z.unknown()).optional(),
    claims: z.array(knowledgeClaimSchema).optional(),
  })
  .strict();
export type CreateKnowledgeInput = z.infer<typeof createKnowledgeSchema>;

export const updateKnowledgeSchema = z
  .object({
    name: text.max(300).optional(),
    type: text.max(120).optional(),
    category: z.enum(knowledgeCategories).optional(),
    version: z.string().trim().max(40).optional(),
    authority: z.enum(["high", "medium", "low"]).optional(),
    ownerId: uuid.optional(),
    summary: longText.optional(),
    lastVerified: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    expiresAt: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    sourceKind: z.string().trim().max(80).optional(),
    metadata: z.record(z.unknown()).optional(),
    claims: z.array(knowledgeClaimSchema).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });
export type UpdateKnowledgeInput = z.infer<typeof updateKnowledgeSchema>;

export const verifyKnowledgeSchema = z
  .object({
    note: z.string().trim().max(500).optional(),
    expiresAt: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  })
  .strict();
export type VerifyKnowledgeInput = z.infer<typeof verifyKnowledgeSchema>;

export const listKnowledgeIssuesSchema = z
  .object({
    type: z.enum(KNOWLEDGE_ISSUE_TYPES).optional(),
    status: z.enum(["OPEN", "RESOLVED", "ALL"]).default("OPEN"),
    search: z.string().trim().max(200).optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(50),
  })
  .strict();
export type ListKnowledgeIssuesInput = z.infer<typeof listKnowledgeIssuesSchema>;

export const resolveKnowledgeIssueSchema = z
  .object({
    action: z.enum(["approve", "verify", "archive", "resolve_conflict", "apply_revision", "reject_revision"]),
    note: z.string().trim().max(1_000).optional(),
  })
  .strict();
export type ResolveKnowledgeIssueInput = z.infer<typeof resolveKnowledgeIssueSchema>;

export const revisionDecisionSchema = z
  .object({
    note: z.string().trim().max(1_000).optional(),
  })
  .strict();
export type RevisionDecisionInput = z.infer<typeof revisionDecisionSchema>;

export const bulkClaimDecisionSchema = z
  .object({
    claimIds: z.array(uuid).min(1).max(200),
    decision: z.enum(["accept", "reject"]),
  })
  .strict();
export type BulkClaimDecisionInput = z.infer<typeof bulkClaimDecisionSchema>;

export const knowledgeDocumentIntentSchema = z
  .object({
    filename: text.max(255),
    mimeType: z.string().trim().min(1).max(200),
    sizeBytes: z.coerce.number().int().positive(),
  })
  .strict();
export type KnowledgeDocumentIntentInput = z.infer<typeof knowledgeDocumentIntentSchema>;

export const templateSectionSchema = z
  .object({
    id: z.string().trim().max(80).optional(),
    title: text.max(200),
    body: longText,
  })
  .strict();

export const templateVariableSchema = z
  .object({
    key: z.string().trim().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/).max(80),
    label: text.max(160),
    required: z.boolean().optional(),
    defaultValue: z.string().trim().max(500).optional(),
  })
  .strict();

export const listResponseTemplatesSchema = z
  .object({
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED", "ALL"]).default("ALL"),
    category: z.enum(knowledgeCategories).optional(),
    ownerId: uuid.optional(),
    search: z.string().trim().max(200).optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(25),
  })
  .strict();
export type ListResponseTemplatesInput = z.infer<typeof listResponseTemplatesSchema>;

export const createResponseTemplateSchema = z
  .object({
    name: text.max(300),
    category: z.enum(knowledgeCategories),
    ownerId: uuid.optional(),
    description: longText.optional(),
    sections: z.array(templateSectionSchema).min(1).max(20),
    variables: z.array(templateVariableSchema).max(50).optional(),
    version: z.string().trim().max(40).optional(),
    usageMetadata: z.record(z.unknown()).optional(),
  })
  .strict();
export type CreateResponseTemplateInput = z.infer<typeof createResponseTemplateSchema>;

export const updateResponseTemplateSchema = createResponseTemplateSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });
export type UpdateResponseTemplateInput = z.infer<typeof updateResponseTemplateSchema>;
