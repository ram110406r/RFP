import { z } from "zod";

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9-]+$/),
  description: z.string().trim().max(500).optional(),
});
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

export const updateWorkspaceSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9-]+$/).optional(),
    description: z.string().trim().max(500).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;

export const addWorkspaceMemberSchema = z.object({
  organizationMemberId: z.string().uuid(),
});
export type AddWorkspaceMemberInput = z.infer<typeof addWorkspaceMemberSchema>;
