import { z } from "zod";

const uuid = z.string().uuid();
const date = z.string().datetime({ offset: true });
const booleanQuery = z.union([z.boolean(), z.enum(["true", "false"])]).transform((value) => value === true || value === "true");

export const listTenderDiscoverySchema = z.object({
  workspaceId: uuid.optional(),
  q: z.string().trim().max(200).optional(),
  portal: z.string().trim().max(80).optional(),
  authorityType: z.string().trim().max(120).optional(),
  buyer: z.string().trim().max(200).optional(),
  state: z.string().trim().max(120).optional(),
  location: z.string().trim().max(200).optional(),
  category: z.string().trim().max(160).optional(),
  procurementType: z.string().trim().max(160).optional(),
  status: z.enum(["ACTIVE", "CLOSED", "CANCELLED", "AWARDED", "EXPIRED", "UNKNOWN"]).optional(),
  minValue: z.coerce.number().nonnegative().optional(),
  maxValue: z.coerce.number().nonnegative().optional(),
  publishedFrom: date.optional(),
  publishedTo: date.optional(),
  deadlineFrom: date.optional(),
  deadlineTo: date.optional(),
  saved: booleanQuery.optional(),
  applied: booleanQuery.optional(),
  freshness: z.enum(["current", "stale", "all"]).default("current"),
  sort: z.enum(["relevance", "newest", "deadline", "value", "updated"]).default("relevance"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
}).strict().refine((value) => value.minValue === undefined || value.maxValue === undefined || value.minValue <= value.maxValue, { message: "minValue must not exceed maxValue." });

export type ListTenderDiscoveryInput = z.infer<typeof listTenderDiscoverySchema>;

export const tenderDiscoveryWorkspaceSchema = z.object({ workspaceId: uuid }).strict();
export type TenderDiscoveryWorkspaceInput = z.infer<typeof tenderDiscoveryWorkspaceSchema>;

export const tenderDiscoveryDetailSchema = z.object({ workspaceId: uuid.optional() }).strict();
export type TenderDiscoveryDetailInput = z.infer<typeof tenderDiscoveryDetailSchema>;
