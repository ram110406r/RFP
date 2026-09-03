import { Body, Controller, Get, GoneException, Param, Patch, Post } from "@nestjs/common";
import type { AuthContext } from "@rfp-os/types";

import { CurrentAuth, RequirePermissions } from "../../common/auth";
import { ZodBody } from "../../common/decorators/zod-schema.decorator";
import {
  assignRoleSchema,
  createRoleSchema,
  updateRoleSchema,
  type AssignRoleInput,
  type CreateRoleInput,
  type UpdateRoleInput,
} from "./roles.dto";
import { RolesService } from "./roles.service";

@Controller({ path: "roles", version: "1" })
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermissions("role:read")
  async list(@CurrentAuth() auth: AuthContext) {
    return { items: await this.roles.list(auth) };
  }

  @Get("catalog")
  @RequirePermissions("role:read")
  async catalog() {
    return { items: await this.roles.permissionCatalog() };
  }

  @Get("assignments")
  @RequirePermissions("role:read")
  async assignments(@CurrentAuth() auth: AuthContext) {
    return { items: await this.roles.listAssignments(auth) };
  }

  @Post()
  @RequirePermissions("role:create")
  @ZodBody(createRoleSchema)
  async create(@CurrentAuth() auth: AuthContext, @Body() body: CreateRoleInput) {
    throw this.customRolesRetired();
  }

  @Patch(":roleId")
  @RequirePermissions("role:update")
  @ZodBody(updateRoleSchema)
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param("roleId") roleId: string,
    @Body() body: UpdateRoleInput,
  ) {
    throw this.customRolesRetired();
  }

  @Post("assignments")
  @RequirePermissions("role:assign")
  @ZodBody(assignRoleSchema)
  async assign(@CurrentAuth() auth: AuthContext, @Body() body: AssignRoleInput) {
    throw this.customRolesRetired();
  }

  @Post("assignments/revoke")
  @RequirePermissions("role:revoke")
  @ZodBody(assignRoleSchema)
  async revoke(@CurrentAuth() auth: AuthContext, @Body() body: AssignRoleInput) {
    throw this.customRolesRetired();
  }

  private customRolesRetired() {
    return new GoneException({
      code: "CUSTOM_ROLES_RETIRED",
      message: "Custom role writes are disabled. Use one of the seven fixed organization roles.",
    });
  }
}
