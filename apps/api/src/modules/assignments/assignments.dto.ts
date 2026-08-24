import { z } from "zod";

export const createAssignmentSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  resourceType: z.string().trim().min(1).max(120),
  resourceId: z.string().trim().min(1).max(190),
  assigneeType: z.enum(["user", "team"]),
  assigneeId: z.string().uuid(),
  assignmentRole: z.string().trim().max(120).optional(),
  dueAt: z.string().datetime().optional(),
});
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;

export const updateAssignmentSchema = z
  .object({
    assigneeId: z.string().uuid().optional(),
    assignmentRole: z.string().trim().max(120).optional(),
    dueAt: z.string().datetime().nullable().optional(),
    status: z.enum(["pending", "in_progress", "completed", "cancelled"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
