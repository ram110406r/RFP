import { Controller, Get, Query } from "@nestjs/common";
import type { AuthContext } from "@rfp-os/types";

import { CurrentAuth, RequirePermissions } from "../../common/auth";
import { ZodQuery } from "../../common/decorators/zod-schema.decorator";
import { dashboardSummarySchema, type DashboardSummaryInput } from "../tenders/dto/tender.dto";
import { TendersService } from "../tenders/tenders.service";

@Controller({ path: "dashboard", version: "1" })
export class DashboardController {
  constructor(private readonly tenders: TendersService) {}

  @Get("summary")
  @RequirePermissions("tender:read")
  @ZodQuery(dashboardSummarySchema)
  async summary(@CurrentAuth() auth: AuthContext, @Query() query: DashboardSummaryInput) {
    return this.tenders.getDashboard(auth, query);
  }
}
