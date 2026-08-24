import { ORG_ROLES } from "@rfp-os/types";
import { z } from "zod";

const conditionOperatorSchema = z.enum(["eq", "neq", "in", "not_in", "exists", "not_exists"]);

export const policyConditionInputSchema = z.object({
  attribute: z.string().trim().min(1).max(120),
  operator: conditionOperatorSchema,
  value: z.unknown().optional(),
  logicalGroup: z.string().trim().min(1).max(60).optional(),
});

export const createPolicySchema = z.object({
  workspaceId: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(280).optional(),
  role: z.enum(ORG_ROLES).optional(),
  resource: z.string().trim().min(1).max(120),
  action: z.string().trim().min(1).max(120),
  effect: z.enum(["allow", "deny"]),
  priority: z.number().int().min(-10_000).max(10_000).optional(),
  conditions: z.array(policyConditionInputSchema).max(25).optional(),
});
export type CreatePolicyInput = z.infer<typeof createPolicySchema>;

export const updatePolicySchema = z
  .object({
    workspaceId: z.string().uuid().nullable().optional(),
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(280).optional(),
    role: z.enum(ORG_ROLES).nullable().optional(),
    resource: z.string().trim().min(1).max(120).optional(),
    action: z.string().trim().min(1).max(120).optional(),
    effect: z.enum(["allow", "deny"]).optional(),
    priority: z.number().int().min(-10_000).max(10_000).optional(),
    conditions: z.array(policyConditionInputSchema).max(25).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });
export type UpdatePolicyInput = z.infer<typeof updatePolicySchema>;

export const togglePolicySchema = z.object({
  status: z.enum(["active", "disabled"]),
});
export type TogglePolicyInput = z.infer<typeof togglePolicySchema>;
