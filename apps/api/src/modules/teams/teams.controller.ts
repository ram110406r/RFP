import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import type { AuthContext } from "@rfp-os/types";

import { CurrentAuth, RequirePermissions } from "../../common/auth";
import { ZodBody } from "../../common/decorators/zod-schema.decorator";
import {
  addTeamMemberSchema,
  createTeamSchema,
  updateTeamSchema,
  type AddTeamMemberInput,
  type CreateTeamInput,
  type UpdateTeamInput,
} from "./teams.dto";
import { TeamsService } from "./teams.service";

@Controller({ path: "teams", version: "1" })
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Get()
  @RequirePermissions("team:read")
  async list(@CurrentAuth() auth: AuthContext) {
    return { items: await this.teams.list(auth) };
  }

  @Post()
  @RequirePermissions("team:create")
  @ZodBody(createTeamSchema)
  async create(@CurrentAuth() auth: AuthContext, @Body() body: CreateTeamInput) {
    return this.teams.create(auth, body);
  }

  @Patch(":teamId")
  @RequirePermissions("team:update")
  @ZodBody(updateTeamSchema)
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param("teamId") teamId: string,
    @Body() body: UpdateTeamInput,
  ) {
    return this.teams.update(auth, teamId, body);
  }

  @Post(":teamId/archive")
  @RequirePermissions("team:archive")
  async archive(@CurrentAuth() auth: AuthContext, @Param("teamId") teamId: string) {
    return this.teams.archive(auth, teamId);
  }

  @Get(":teamId/members")
  @RequirePermissions("team:read")
  async listMembers(@CurrentAuth() auth: AuthContext, @Param("teamId") teamId: string) {
    return { items: await this.teams.listMembers(auth, teamId) };
  }

  @Post(":teamId/members")
  @RequirePermissions("team:member:manage")
  @ZodBody(addTeamMemberSchema)
  async addMember(
    @CurrentAuth() auth: AuthContext,
    @Param("teamId") teamId: string,
    @Body() body: AddTeamMemberInput,
  ) {
    return this.teams.addMember(auth, teamId, body);
  }

  @Delete(":teamId/members/:organizationMemberId")
  @RequirePermissions("team:member:manage")
  async removeMember(
    @CurrentAuth() auth: AuthContext,
    @Param("teamId") teamId: string,
    @Param("organizationMemberId") organizationMemberId: string,
  ) {
    return this.teams.removeMember(auth, teamId, organizationMemberId);
  }
}
