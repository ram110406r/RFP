import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthContext } from "@rfp-os/types";

import { CurrentAuth, RequirePermissions } from "../../common/auth";
import { ZodBody } from "../../common/decorators/zod-schema.decorator";
import {
  createAssignmentSchema,
  updateAssignmentSchema,
  type CreateAssignmentInput,
  type UpdateAssignmentInput,
} from "./assignments.dto";
import { AssignmentsService } from "./assignments.service";

@Controller({ path: "assignments", version: "1" })
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get()
  @RequirePermissions("assignment:read")
  async list(
    @CurrentAuth() auth: AuthContext,
    @Query("workspaceId") workspaceId?: string,
    @Query("resourceType") resourceType?: string,
    @Query("resourceId") resourceId?: string,
    @Query("status") status?: "pending" | "in_progress" | "completed" | "cancelled",
  ) {
    return {
      items: await this.assignments.list(auth, {
        workspaceId,
        resourceType,
        resourceId,
        status,
      }),
    };
  }

  @Post()
  @RequirePermissions("assignment:create")
  @ZodBody(createAssignmentSchema)
  async create(@CurrentAuth() auth: AuthContext, @Body() body: CreateAssignmentInput) {
    return this.assignments.create(auth, body);
  }

  @Patch(":assignmentId")
  @RequirePermissions("assignment:update")
  @ZodBody(updateAssignmentSchema)
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param("assignmentId") assignmentId: string,
    @Body() body: UpdateAssignmentInput,
  ) {
    return this.assignments.update(auth, assignmentId, body);
  }

  @Post(":assignmentId/complete")
  @RequirePermissions("assignment:complete")
  async complete(
    @CurrentAuth() auth: AuthContext,
    @Param("assignmentId") assignmentId: string,
  ) {
    return this.assignments.complete(auth, assignmentId);
  }

  @Post(":assignmentId/cancel")
  @RequirePermissions("assignment:cancel")
  async cancel(@CurrentAuth() auth: AuthContext, @Param("assignmentId") assignmentId: string) {
    return this.assignments.cancel(auth, assignmentId);
  }
}
