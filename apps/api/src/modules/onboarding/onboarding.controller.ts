import { Body, Controller, Get, Post, Req } from "@nestjs/common";

import { AllowUnverified, AllowWithoutOrg, CurrentUserId, type RequestWithAuth } from "../../common/auth";
import { AuthService } from "../auth/auth.service";
import { switchSessionTo } from "../organizations/organizations.controller";
import { ZodBody } from "../../common/decorators/zod-schema.decorator";
import {
  companySchema,
  completeSchema,
  invitationAcceptanceSchema,
  invitationTokenAcceptanceSchema,
  journeySchema,
  profileSchema,
  rfpContextSchema,
  teamSchema,
  workspaceSchema,
  type CompanyInput,
  type JourneyInput,
  type ProfileInput,
  type RfpContextInput,
  type TeamInput,
  type WorkspaceInput,
} from "./onboarding.dto";
import { OnboardingService } from "./onboarding.service";

@Controller({ path: "onboarding", version: "1" })
@AllowWithoutOrg()
export class OnboardingController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly authService: AuthService,
  ) {}

  @AllowUnverified()
  @Get("status")
  status(@CurrentUserId() userId: string, @Req() request: RequestWithAuth) {
    return this.onboarding.status(userId, request.auth?.organizationId ?? null);
  }

  @Post("start")
  @ZodBody(journeySchema)
  start(@CurrentUserId() userId: string, @Body() body: JourneyInput) {
    return this.onboarding.start(userId, body);
  }

  @Post("invitation/accept")
  @ZodBody(invitationAcceptanceSchema)
  async acceptInvitation(
    @CurrentUserId() userId: string,
    @Req() request: RequestWithAuth,
    @Body() body: { invitationId: string },
  ) {
    const progress = await this.onboarding.acceptInvitation(userId, body.invitationId);
    if (progress?.organizationId) await switchSessionTo(this.authService, request, userId, progress.organizationId);
    return progress;
  }

  @Post("invitation/accept-token")
  @ZodBody(invitationTokenAcceptanceSchema)
  async acceptInvitationToken(
    @CurrentUserId() userId: string,
    @Req() request: RequestWithAuth,
    @Body() body: { token: string },
  ) {
    const progress = await this.onboarding.acceptInvitationToken(userId, body.token);
    if (progress?.organizationId) await switchSessionTo(this.authService, request, userId, progress.organizationId);
    return progress;
  }

  @Post("company")
  @ZodBody(companySchema)
  company(@CurrentUserId() userId: string, @Body() body: CompanyInput) {
    return this.onboarding.saveCompany(userId, body);
  }

  @Post("workspace")
  @ZodBody(workspaceSchema)
  workspace(@CurrentUserId() userId: string, @Body() body: WorkspaceInput) {
    return this.onboarding.createWorkspace(userId, body);
  }

  @Post("profile")
  @ZodBody(profileSchema)
  profile(@CurrentUserId() userId: string, @Body() body: ProfileInput) {
    return this.onboarding.saveProfile(userId, body);
  }

  @Post("team")
  @ZodBody(teamSchema)
  team(@CurrentUserId() userId: string, @Body() body: TeamInput) {
    return this.onboarding.saveTeam(userId, body);
  }

  @Post("complete")
  @ZodBody(completeSchema)
  complete(@CurrentUserId() userId: string) {
    return this.onboarding.complete(userId);
  }

  @Post("context")
  @ZodBody(rfpContextSchema)
  context(@CurrentUserId() userId: string, @Body() body: RfpContextInput) {
    return this.onboarding.saveRfpContext(userId, body);
  }
}
