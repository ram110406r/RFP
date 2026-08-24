import { PERMISSIONS } from "@rfp-os/types";
import { z } from "zod";

export const permissionSchema = z.enum(PERMISSIONS);

export const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(280).optional(),
  permissionKeys: z.array(permissionSchema).min(1).max(PERMISSIONS.length),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(280).optional(),
    permissionKeys: z.array(permissionSchema).min(1).max(PERMISSIONS.length).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

export const assignOrganizationRoleSchema = z.object({
  scopeType: z.literal("organization_member"),
  organizationMemberId: z.string().uuid(),
  roleId: z.string().uuid(),
});

export const assignWorkspaceRoleSchema = z.object({
  scopeType: z.literal("workspace_member"),
  workspaceMemberId: z.string().uuid(),
  roleId: z.string().uuid(),
});

export const assignRoleSchema = z.discriminatedUnion("scopeType", [
  assignOrganizationRoleSchema,
  assignWorkspaceRoleSchema,
]);
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;
