import { z } from "zod";

import { RFP_LIFECYCLE_STATUSES } from "../domain/rfp-state-machine";

/**
 * Request schemas, enforced by ZodValidationInterceptor via @ZodBody/@ZodQuery.
 *
 * Two absences are deliberate and load-bearing:
 *  - no `organizationId` anywhere — the tenant comes from the session, so
 *    there is no field for a client to point at another organization;
 *  - no `status` on update — `.strict()` makes an attempt to set it a 400
 *    rather than a silently ignored field, so the transition endpoint is the
 *    only way status ever changes.
 */

export const rfpLifecycleStatusSchema = z.enum(RFP_LIFECYCLE_STATUSES);
export const rfpTeamRoleSchema = z.enum(["OWNER", "CONTRIBUTOR", "REVIEWER", "SME"]);

/** ISO date (YYYY-MM-DD); the column is a DATE, not a timestamp. */
const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO date (YYYY-MM-DD)")
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: "must be a valid date" });

const money = z
  .number()
  .nonnegative("must not be negative")
  .finite()
  .max(1_000_000_000_000, "is implausibly large");

export const createRfpSchema = z
  .object({
    title: z.string().trim().min(1, "is required").max(300),
    /**
     * Required, unlike the phase brief's "optional", because `rfps.client_id`
     * is an existing NOT NULL column with a foreign key — an RFP in this
     * schema is always from a client. Relaxing that column would break
     * apps/legacy-api, which inner-joins customers on every read.
     */
    clientId: z.string().uuid(),
    projectId: z.string().uuid().optional(),
    description: z.string().trim().max(10_000).optional(),
    opportunity: z.string().trim().max(2_000).optional(),
    /** Also required for the same reason: `rfps.deadline` is NOT NULL. */
    deadline: dateOnly,
    estimatedValue: money.optional(),
    /** Defaults to the creator when omitted; `rfps.owner_id` is NOT NULL. */
    ownerId: z.string().uuid().optional(),
  })
  .strict();
export type CreateRfpInput = z.infer<typeof createRfpSchema>;

export const updateRfpSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    clientId: z.string().uuid().optional(),
    projectId: z.string().uuid().nullable().optional(),
    description: z.string().trim().max(10_000).optional(),
    opportunity: z.string().trim().max(2_000).optional(),
    deadline: dateOnly.optional(),
    estimatedValue: money.optional(),
    ownerId: z.string().uuid().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });
export type UpdateRfpInput = z.infer<typeof updateRfpSchema>;

export const listRfpsSchema = z
  .object({
    status: rfpLifecycleStatusSchema.optional(),
    ownerId: z.string().uuid().optional(),
    search: z.string().trim().max(200).optional(),
    /** Archived RFPs are excluded unless explicitly requested. */
    includeArchived: z
      .union([z.boolean(), z.enum(["true", "false"])])
      .transform((value) => value === true || value === "true")
      .optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(25),
    sort: z.enum(["deadline", "createdAt", "title", "estimatedValue"]).default("deadline"),
    direction: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict();
export type ListRfpsInput = z.infer<typeof listRfpsSchema>;

export const transitionRfpSchema = z
  .object({
    to: rfpLifecycleStatusSchema,
    reason: z.string().trim().max(1_000).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();
export type TransitionRfpInput = z.infer<typeof transitionRfpSchema>;

export const assignRfpSchema = z
  .object({
    userId: z.string().uuid(),
    role: rfpTeamRoleSchema,
  })
  .strict();
export type AssignRfpInput = z.infer<typeof assignRfpSchema>;

export const listAssignmentsSchema = z
  .object({
    includeUnassigned: z
      .union([z.boolean(), z.enum(["true", "false"])])
      .transform((value) => value === true || value === "true")
      .optional(),
  })
  .strict();
export type ListAssignmentsInput = z.infer<typeof listAssignmentsSchema>;

export const removeAssignmentSchema = z.object({ role: rfpTeamRoleSchema.optional() }).strict();
export type RemoveAssignmentInput = z.infer<typeof removeAssignmentSchema>;
