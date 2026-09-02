import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import type { AuthContext } from "@rfp-os/types";
import { z } from "zod";

import { CurrentAuth, RequirePermissions } from "../../common/auth";
import { AuditsService } from "./audits.service";

@Controller({ path: "audits", version: "1" })
export class AuditsController {
  constructor(private readonly audits: AuditsService) {}

  @Get()
  @RequirePermissions("audit:read")
  async search(
    @CurrentAuth() auth: AuthContext,
    @Query("workspaceId") workspaceId?: string,
    @Query("q") q?: string,
    @Query("action") action?: string,
    @Query("entityType") entityType?: string,
    @Query("entityId") entityId?: string,
    @Query("actorId") actorId?: string,
  ) {
    if (actorId && actorId !== "me" && !z.string().uuid().safeParse(actorId).success) {
      throw new BadRequestException({ code: "INVALID_QUERY", message: "actorId must be a user UUID or 'me'." });
    }

    return {
      items: await this.audits.search(auth, {
        workspaceId,
        q,
        action,
        entityType,
        entityId,
        actorId: actorId === "me" ? auth.userId : actorId,
      }),
    };
  }
}
