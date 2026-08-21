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
