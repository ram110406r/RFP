import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthContext } from "@rfp-os/types";

import { CurrentAuth, RequirePermissions } from "../../common/auth";
import { ZodBody, ZodQuery } from "../../common/decorators/zod-schema.decorator";
import {
  assignRfpSchema,
  createRfpSchema,
  listAssignmentsSchema,
  listRfpsSchema,
  removeAssignmentSchema,
  transitionRfpSchema,
  updateRfpSchema,
  type AssignRfpInput,
  type CreateRfpInput,
  type ListAssignmentsInput,
  type ListRfpsInput,
  type RemoveAssignmentInput,
  type TransitionRfpInput,
  type UpdateRfpInput,
} from "./dto/rfp.dto";
import { RfpAssignmentService } from "./rfp-assignment.service";
import { RfpLifecycleService } from "./rfp-lifecycle.service";
import { RfpService } from "./rfp.service";

/**
 * RFP CRUD.
 *
 * Every handler takes the tenant from @CurrentAuth, never from a param or
 * body, so there is no request shape that can address another organization's
 * RFPs. Permissions are declared per route and enforced by PermissionsGuard
 * before the handler runs.
 */
@Controller({ path: "rfps", version: "1" })
export class RfpController {
  constructor(private readonly rfps: RfpService) {}

  @Get()
  @RequirePermissions("rfp:read")
  @ZodQuery(listRfpsSchema)
  async list(@CurrentAuth() auth: AuthContext, @Query() query: ListRfpsInput) {
    return this.rfps.list(auth, query);
  }

  @Post()
  @RequirePermissions("rfp:create")
  @ZodBody(createRfpSchema)
  async create(@CurrentAuth() auth: AuthContext, @Body() body: CreateRfpInput) {
    return this.rfps.create(auth, body);
  }

  @Get(":id")
  @RequirePermissions("rfp:read")
  async get(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.rfps.getById(auth, id);
  }

  @Patch(":id")
  @RequirePermissions("rfp:update")
  @ZodBody(updateRfpSchema)
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body() body: UpdateRfpInput,
  ) {
    return this.rfps.update(auth, id, body);
  }

  /** Archives rather than deletes — see RfpService.archive. */
  @Delete(":id")
  @RequirePermissions("rfp:delete")
  async archive(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.rfps.archive(auth, id);
  }

  @Post(":id/restore")
  @RequirePermissions("rfp:delete")
  async restore(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.rfps.restore(auth, id);
  }
}

@Controller({ path: "rfps", version: "1" })
export class RfpAssignmentController {
  constructor(private readonly assignments: RfpAssignmentService) {}

  @Get(":id/assignments")
  @RequirePermissions("rfp:read")
  @ZodQuery(listAssignmentsSchema)
  async list(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Query() query: ListAssignmentsInput,
  ) {
    return this.assignments.list(auth, id, query.includeUnassigned ?? false);
  }

  @Post(":id/assignments")
  @RequirePermissions("rfp:assign")
  @ZodBody(assignRfpSchema)
  async assign(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body() body: AssignRfpInput,
  ) {
    return this.assignments.assign(auth, id, body);
  }

  @Delete(":id/assignments/:userId")
  @RequirePermissions("rfp:assign")
  @ZodQuery(removeAssignmentSchema)
  async unassign(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("userId") userId: string,
    @Query() query: RemoveAssignmentInput,
  ) {
    return this.assignments.unassign(auth, id, userId, query.role);
  }
}

/**
 * Lifecycle. Separate from CRUD because status is not editable data — it moves
 * only through validated transitions.
 */
@Controller({ path: "rfps", version: "1" })
export class RfpLifecycleController {
  constructor(private readonly lifecycle: RfpLifecycleService) {}

  @Post(":id/transitions")
  @RequirePermissions("rfp:update")
  @ZodBody(transitionRfpSchema)
  async transition(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body() body: TransitionRfpInput,
  ) {
    return this.lifecycle.transition(auth, id, body);
  }

  @Get(":id/transitions")
  @RequirePermissions("rfp:read")
  async available(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.lifecycle.getAvailableTransitions(auth, id);
  }

  @Get(":id/history")
  @RequirePermissions("rfp:read")
  async history(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.lifecycle.getHistory(auth, id);
  }
}
