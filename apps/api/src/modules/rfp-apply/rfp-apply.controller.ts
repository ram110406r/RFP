import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import type { AuthContext } from "@rfp-os/types";

import { CurrentAuth, RequirePermissions } from "../../common/auth";
import { ZodBody } from "../../common/decorators/zod-schema.decorator";
import { runRfpApplySchema, type RunRfpApplyInput } from "./dto/rfp-apply.dto";
import { RfpApplyService } from "./rfp-apply.service";

@Controller({ path: "rfp-apply", version: "1" })
export class RfpApplyController {
  constructor(private readonly apply: RfpApplyService) {}

  @Get(":tenderId/progress")
  @RequirePermissions("tender:read")
  async progress(@CurrentAuth() auth: AuthContext, @Param("tenderId") tenderId: string) {
    return this.apply.getProgress(auth, tenderId);
  }

  @Post(":tenderId/run")
  @RequirePermissions("tender:update")
  @ZodBody(runRfpApplySchema)
  async run(
    @CurrentAuth() auth: AuthContext,
    @Param("tenderId") tenderId: string,
    @Body() body: RunRfpApplyInput,
  ) {
    return this.apply.run(auth, tenderId, body);
  }
}
