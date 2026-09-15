import { z } from "zod";

const uuid = z.string().uuid();
const date = z.string().datetime({ offset: true });
const booleanQuery = z.union([z.boolean(), z.enum(["true", "false"])]).transform((value) => value === true || value === "true");

const listTenderDiscoveryObject = z.object({
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
  sort: z.enum(["relevance", "companyFit", "newest", "deadline", "value", "updated"]).default("relevance"),
  cursor: z.string().trim().max(1000).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
}).strict();
export const listTenderDiscoverySchema = listTenderDiscoveryObject.refine((value) => value.minValue === undefined || value.maxValue === undefined || value.minValue <= value.maxValue, { message: "minValue must not exceed maxValue." });

export type ListTenderDiscoveryInput = z.infer<typeof listTenderDiscoverySchema>;

export const tenderDiscoveryWorkspaceSchema = z.object({ workspaceId: uuid }).strict();
export type TenderDiscoveryWorkspaceInput = z.infer<typeof tenderDiscoveryWorkspaceSchema>;

export const tenderDiscoveryDetailSchema = z.object({ workspaceId: uuid.optional() }).strict();
export type TenderDiscoveryDetailInput = z.infer<typeof tenderDiscoveryDetailSchema>;

export const compareTenderDiscoverySchema = z.object({ workspaceId: uuid, noticeIds: z.union([z.array(uuid), z.string().transform((value) => value.split(","))]).pipe(z.array(uuid).min(2).max(4)) }).strict();
export type CompareTenderDiscoveryInput = z.infer<typeof compareTenderDiscoverySchema>;

export const bulkTenderDiscoverySchema = z.object({ workspaceId: uuid, noticeIds: z.array(uuid).min(1).max(100) }).strict();
export type BulkTenderDiscoveryInput = z.infer<typeof bulkTenderDiscoverySchema>;

export const savedSearchSchema = z.object({
  workspaceId: uuid,
  name: z.string().trim().min(1).max(120),
  query: listTenderDiscoveryObject.omit({ workspaceId: true, page: true, pageSize: true, cursor: true }),
  cadence: z.enum(["IMMEDIATE", "DAILY"]).default("DAILY"),
  enabled: z.boolean().default(true),
}).strict();
export const updateSavedSearchSchema = savedSearchSchema.partial().omit({ workspaceId: true }).extend({ workspaceId: uuid }).strict();
export type SavedSearchInput = z.infer<typeof savedSearchSchema>;
export type UpdateSavedSearchInput = z.infer<typeof updateSavedSearchSchema>;

const stringList = z.array(z.string().trim().min(1).max(120)).max(50).default([]);
export const tenderMatchProfileSchema = z.object({
  capabilityKeywords: stringList,
  preferredCategories: stringList,
  preferredStates: stringList,
  certifications: stringList,
  industry: z.string().trim().max(120).nullable().default(null),
  minimumValue: z.number().nonnegative().nullable().default(null),
  maximumValue: z.number().nonnegative().nullable().default(null),
}).strict().refine((value) => value.minimumValue === null || value.maximumValue === null || value.minimumValue <= value.maximumValue, { message: "minimumValue must not exceed maximumValue." });
export type TenderMatchProfileInput = z.infer<typeof tenderMatchProfileSchema>;

export const analyticsSchema = z.object({ workspaceId: uuid, days: z.coerce.number().int().min(1).max(90).default(30) }).strict();
export type TenderAnalyticsInput = z.infer<typeof analyticsSchema>;

export const portalSyncSchema = z.object({ mode: z.enum(["HEAD", "BACKFILL", "FULL_REFRESH", "RECONCILE"]).default("HEAD") }).strict();
export type PortalSyncInput = z.infer<typeof portalSyncSchema>;
