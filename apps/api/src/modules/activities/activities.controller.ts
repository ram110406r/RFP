import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import type { AuthContext } from "@rfp-os/types";
import { z } from "zod";

import { CurrentAuth, RequirePermissions } from "../../common/auth";
import { ActivitiesService } from "./activities.service";

@Controller({ path: "activities", version: "1" })
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get()
  @RequirePermissions("activity:read")
  async search(
    @CurrentAuth() auth: AuthContext,
    @Query("workspaceId") workspaceId?: string,
    @Query("q") q?: string,
    @Query("action") action?: string,
    @Query("entityType") entityType?: string,
    @Query("rfpId") rfpId?: string,
    @Query("actorId") actorId?: string,
  ) {
    if (actorId && actorId !== "me" && !z.string().uuid().safeParse(actorId).success) {
      throw new BadRequestException({ code: "INVALID_QUERY", message: "actorId must be a user UUID or 'me'." });
    }

    return {
      items: await this.activities.search(auth, {
        workspaceId,
        q,
        action,
        entityType,
        rfpId,
        actorId: actorId === "me" ? auth.userId : actorId,
      }),
    };
  }
}
