import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthContext } from "@rfp-os/types";

import { CurrentAuth, RequirePermissions } from "../../common/auth";
import { ZodBody } from "../../common/decorators/zod-schema.decorator";
import {
  addWorkspaceMemberSchema,
  createWorkspaceSchema,
  updateWorkspaceSchema,
  type AddWorkspaceMemberInput,
  type CreateWorkspaceInput,
  type UpdateWorkspaceInput,
} from "./workspaces.dto";
import { WorkspacesService } from "./workspaces.service";

@Controller({ path: "workspaces", version: "1" })
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  @RequirePermissions("workspace:read")
  async list(@CurrentAuth() auth: AuthContext, @Query("status") status?: string) {
    return { items: await this.workspaces.list(auth, status) };
  }

  @Post()
  @RequirePermissions("workspace:create")
  @ZodBody(createWorkspaceSchema)
  async create(@CurrentAuth() auth: AuthContext, @Body() body: CreateWorkspaceInput) {
    return this.workspaces.create(auth, body);
  }

  @Get(":workspaceId")
  @RequirePermissions("workspace:read")
  async get(@CurrentAuth() auth: AuthContext, @Param("workspaceId") workspaceId: string) {
    return this.workspaces.get(auth, workspaceId);
  }

  @Patch(":workspaceId")
  @RequirePermissions("workspace:update")
  @ZodBody(updateWorkspaceSchema)
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param("workspaceId") workspaceId: string,
    @Body() body: UpdateWorkspaceInput,
  ) {
    return this.workspaces.update(auth, workspaceId, body);
  }

  @Post(":workspaceId/archive")
  @RequirePermissions("workspace:archive")
  async archive(@CurrentAuth() auth: AuthContext, @Param("workspaceId") workspaceId: string) {
    return this.workspaces.archive(auth, workspaceId);
  }

  @Post(":workspaceId/unarchive")
  @RequirePermissions("workspace:archive")
  async unarchive(@CurrentAuth() auth: AuthContext, @Param("workspaceId") workspaceId: string) {
    return this.workspaces.unarchive(auth, workspaceId);
  }

  @Get(":workspaceId/members")
  @RequirePermissions("workspace:member:read")
  async listMembers(@CurrentAuth() auth: AuthContext, @Param("workspaceId") workspaceId: string) {
    return { items: await this.workspaces.listMembers(auth, workspaceId) };
  }

  @Post(":workspaceId/members")
  @RequirePermissions("workspace:member:manage")
  @ZodBody(addWorkspaceMemberSchema)
  async addMember(
    @CurrentAuth() auth: AuthContext,
    @Param("workspaceId") workspaceId: string,
    @Body() body: AddWorkspaceMemberInput,
  ) {
    return this.workspaces.addMember(auth, workspaceId, body);
  }

  @Delete(":workspaceId/members/:organizationMemberId")
  @RequirePermissions("workspace:member:manage")
  async removeMember(
    @CurrentAuth() auth: AuthContext,
    @Param("workspaceId") workspaceId: string,
    @Param("organizationMemberId") organizationMemberId: string,
  ) {
    return this.workspaces.removeMember(auth, workspaceId, organizationMemberId);
  }
}
