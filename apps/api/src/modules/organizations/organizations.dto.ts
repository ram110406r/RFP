import { ORG_ROLES } from "@rfp-os/types";
import { z } from "zod";

/**
 * Request schemas. Enforced by ZodValidationInterceptor via @ZodBody, so a
 * handler never sees an unvalidated body.
 *
 * Note what is absent from every one of these: an organizationId. The tenant
 * comes from the session, so there is no field here for a client to point at
 * another organization.
 */

export const orgRoleSchema = z.enum(ORG_ROLES);

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  domain: z.string().trim().min(2).max(190),
  industry: z.string().trim().max(120).optional(),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    domain: z.string().trim().min(2).max(190).optional(),
    industry: z.string().trim().max(120).optional(),
    logoInitials: z.string().trim().max(4).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

export const inviteMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(190),
  role: orgRoleSchema,
  workspaceId: z.string().uuid().optional(),
  proposedDepartment: z.string().trim().max(80).optional(),
  proposedTeamId: z.string().uuid().optional(),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const updateMemberSchema = z.object({
  role: orgRoleSchema.optional(),
  status: z.enum(["active", "suspended"]).optional(),
});
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

export const acceptInvitationSchema = z.object({
  token: z.string().trim().min(16).max(128),
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
