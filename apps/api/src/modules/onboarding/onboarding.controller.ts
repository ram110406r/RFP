import { Body, Controller, Get, Post } from "@nestjs/common";

import { AllowWithoutOrg, CurrentUserId } from "../../common/auth";
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
  constructor(private readonly onboarding: OnboardingService) {}

  @Get("status")
  status(@CurrentUserId() userId: string) {
    return this.onboarding.status(userId);
  }

  @Post("start")
  @ZodBody(journeySchema)
  start(@CurrentUserId() userId: string, @Body() body: JourneyInput) {
    return this.onboarding.start(userId, body);
  }

  @Post("invitation/accept")
  @ZodBody(invitationAcceptanceSchema)
  acceptInvitation(@CurrentUserId() userId: string, @Body() body: { invitationId: string }) {
    return this.onboarding.acceptInvitation(userId, body.invitationId);
  }

  @Post("invitation/accept-token")
  @ZodBody(invitationTokenAcceptanceSchema)
  acceptInvitationToken(@CurrentUserId() userId: string, @Body() body: { token: string }) {
    return this.onboarding.acceptInvitationToken(userId, body.token);
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
