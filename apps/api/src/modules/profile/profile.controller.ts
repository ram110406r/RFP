import { Body, Controller, Get, Patch } from "@nestjs/common";

import { AllowWithoutOrg, CurrentUserId } from "../../common/auth";
import { ZodBody } from "../../common/decorators/zod-schema.decorator";
import { updateProfileSchema, type UpdateProfileInput } from "./profile.dto";
import { ProfileService } from "./profile.service";

@Controller({ path: "profile", version: "1" })
@AllowWithoutOrg()
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Get()
  async current(@CurrentUserId() userId: string) {
    return this.profiles.getProfile(userId);
  }

  @Patch()
  @ZodBody(updateProfileSchema)
  async update(@CurrentUserId() userId: string, @Body() body: UpdateProfileInput) {
    return this.profiles.updateProfile(userId, body);
  }
}
