import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from "@nestjs/common";
import type { AuthContext } from "@rfp-os/types";

import { CurrentAuth, RequirePermissions } from "../../common/auth";
import { ZodBody } from "../../common/decorators/zod-schema.decorator";
import { ApplyAutomationService } from "./apply-automation.service";
import {
  approvePackageSchema,
  createAutomationRunSchema,
  createPackageSchema,
  createSubmissionSchema,
  decideRequirementCandidatesSchema,
  updateMilestonesSchema,
  type ApprovePackageInput,
  type CreateAutomationRunInput,
  type CreateSubmissionInput,
  type DecideRequirementCandidatesInput,
  type UpdateMilestonesInput,
} from "./dto/apply-automation.dto";

@Controller({ path: "rfp-apply", version: "1" })
export class ApplyAutomationController {
  constructor(private readonly automation: ApplyAutomationService) {}

  @Post(":tenderId/runs") @RequirePermissions("tender:update") @ZodBody(createAutomationRunSchema)
  createRun(@CurrentAuth() auth: AuthContext, @Param("tenderId") tenderId: string, @Body() body: CreateAutomationRunInput) { return this.automation.createRun(auth, tenderId, body); }

  @Get(":tenderId/runs") @RequirePermissions("tender:read")
  listRuns(@CurrentAuth() auth: AuthContext, @Param("tenderId") tenderId: string) { return this.automation.listRuns(auth, tenderId); }

  @Get(":tenderId/runs/:runId") @RequirePermissions("tender:read")
  getRun(@CurrentAuth() auth: AuthContext, @Param("tenderId") tenderId: string, @Param("runId") runId: string) { return this.automation.getRun(auth, tenderId, runId); }

  @Post(":tenderId/runs/:runId/retry") @HttpCode(HttpStatus.OK) @RequirePermissions("tender:update")
  retryRun(@CurrentAuth() auth: AuthContext, @Param("tenderId") tenderId: string, @Param("runId") runId: string) { return this.automation.retryRun(auth, tenderId, runId); }

  @Post(":tenderId/runs/:runId/cancel") @HttpCode(HttpStatus.OK) @RequirePermissions("tender:update")
  cancelRun(@CurrentAuth() auth: AuthContext, @Param("tenderId") tenderId: string, @Param("runId") runId: string) { return this.automation.cancelRun(auth, tenderId, runId); }
}

@Controller({ path: "tenders", version: "1" })
export class TenderAutomationController {
  constructor(private readonly automation: ApplyAutomationService) {}

  @Post(":id/requirement-extraction") @HttpCode(HttpStatus.OK) @RequirePermissions("requirement:create")
  extract(@CurrentAuth() auth: AuthContext, @Param("id") id: string) { return this.automation.extractRequirements(auth, id); }

  @Get(":id/requirement-candidates") @RequirePermissions("requirement:read")
  candidates(@CurrentAuth() auth: AuthContext, @Param("id") id: string) { return this.automation.listRequirementCandidates(auth, id); }

  @Post(":id/requirement-candidates/decisions") @HttpCode(HttpStatus.OK) @RequirePermissions("requirement:create") @ZodBody(decideRequirementCandidatesSchema)
  decisions(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: DecideRequirementCandidatesInput) { return this.automation.decideRequirementCandidates(auth, id, body); }

  @Post(":id/packages") @RequirePermissions("tender:update") @ZodBody(createPackageSchema)
  createPackage(@CurrentAuth() auth: AuthContext, @Param("id") id: string) { return this.automation.createPackage(auth, id); }

  @Get(":id/packages") @RequirePermissions("tender:read")
  packages(@CurrentAuth() auth: AuthContext, @Param("id") id: string) { return this.automation.listPackages(auth, id); }

  @Get(":id/packages/:packageId/download") @RequirePermissions("tender:read")
  download(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Param("packageId") packageId: string) { return this.automation.packageDownload(auth, id, packageId); }

  @Post(":id/packages/:packageId/approve") @HttpCode(HttpStatus.OK) @RequirePermissions("tender:approve") @ZodBody(approvePackageSchema)
  approve(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Param("packageId") packageId: string, @Body() body: ApprovePackageInput) { return this.automation.approvePackage(auth, id, packageId, body); }

  @Get(":id/milestones") @RequirePermissions("tender:read")
  milestones(@CurrentAuth() auth: AuthContext, @Param("id") id: string) { return this.automation.listMilestones(auth, id); }

  @Put(":id/milestones") @RequirePermissions("tender:update") @ZodBody(updateMilestonesSchema)
  updateMilestones(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: UpdateMilestonesInput) { return this.automation.updateMilestones(auth, id, body); }

  @Post(":id/submissions") @RequirePermissions("tender:submit") @ZodBody(createSubmissionSchema)
  submit(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: CreateSubmissionInput) { return this.automation.createSubmission(auth, id, body); }

  @Get(":id/submissions") @RequirePermissions("tender:read")
  submissions(@CurrentAuth() auth: AuthContext, @Param("id") id: string) { return this.automation.listSubmissions(auth, id); }
}
