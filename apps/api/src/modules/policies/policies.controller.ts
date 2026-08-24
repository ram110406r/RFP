import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthContext } from "@rfp-os/types";

import { CurrentAuth, RequirePermissions } from "../../common/auth";
import { ZodBody } from "../../common/decorators/zod-schema.decorator";
import {
  createPolicySchema,
  togglePolicySchema,
  updatePolicySchema,
  type CreatePolicyInput,
  type TogglePolicyInput,
  type UpdatePolicyInput,
} from "./policies.dto";
import { PoliciesService } from "./policies.service";

@Controller({ path: "policies", version: "1" })
export class PoliciesController {
  constructor(private readonly policies: PoliciesService) {}

  @Get()
  @RequirePermissions("policy:read")
  async list(
    @CurrentAuth() auth: AuthContext,
    @Query("workspaceId") workspaceId?: string,
  ) {
    return { items: await this.policies.list(auth, workspaceId) };
  }

  @Post()
  @RequirePermissions("policy:create")
  @ZodBody(createPolicySchema)
  async create(@CurrentAuth() auth: AuthContext, @Body() body: CreatePolicyInput) {
    return this.policies.create(auth, body);
  }

  @Patch(":policyId")
  @RequirePermissions("policy:update")
  @ZodBody(updatePolicySchema)
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param("policyId") policyId: string,
    @Body() body: UpdatePolicyInput,
  ) {
    return this.policies.update(auth, policyId, body);
  }

  @Post(":policyId/toggle")
  @RequirePermissions("policy:toggle")
  @ZodBody(togglePolicySchema)
  async toggle(
    @CurrentAuth() auth: AuthContext,
    @Param("policyId") policyId: string,
    @Body() body: TogglePolicyInput,
  ) {
    return this.policies.toggle(auth, policyId, body);
  }
}
