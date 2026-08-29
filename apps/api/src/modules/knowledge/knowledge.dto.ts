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

export const knowledgeClaimSchema = z
  .object({
    label: text.max(200),
    value: text.max(5_000),
    confidence: z.coerce.number().min(0).max(1).optional(),
  })
  .strict();

export const listKnowledgeSchema = z
  .object({
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
    search: z.string().trim().max(200).optional(),
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
    claims: z.array(knowledgeClaimSchema).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });
export type UpdateKnowledgeInput = z.infer<typeof updateKnowledgeSchema>;
