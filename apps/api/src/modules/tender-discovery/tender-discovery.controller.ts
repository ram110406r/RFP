import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";
import type { AuthContext } from "@rfp-os/types";

import { CurrentAuth, RequirePermissions } from "../../common/auth";
import { ZodBody, ZodQuery } from "../../common/decorators/zod-schema.decorator";
import { listTenderDiscoverySchema, tenderDiscoveryDetailSchema, tenderDiscoveryWorkspaceSchema, type ListTenderDiscoveryInput, type TenderDiscoveryDetailInput, type TenderDiscoveryWorkspaceInput } from "./tender-discovery.dto";
import { TenderDiscoveryService } from "./tender-discovery.service";

@Controller({ path: "tender-discovery", version: "1" })
export class TenderDiscoveryController {
  constructor(private readonly discovery: TenderDiscoveryService) {}

  @Get()
  @RequirePermissions("tender:read")
  @ZodQuery(listTenderDiscoverySchema)
  list(@CurrentAuth() auth: AuthContext, @Query() query: ListTenderDiscoveryInput) { return this.discovery.list(auth, query); }

  @Get("sources")
  sources(@CurrentAuth() auth: AuthContext) { return this.discovery.sources(auth); }

  @Get(":noticeId")
  @RequirePermissions("tender:read")
  @ZodQuery(tenderDiscoveryDetailSchema)
  get(@CurrentAuth() auth: AuthContext, @Param("noticeId") noticeId: string, @Query() query: TenderDiscoveryDetailInput) { return this.discovery.get(auth, noticeId, query.workspaceId); }

  @Post(":noticeId/save")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions("tender:update")
  @ZodBody(tenderDiscoveryWorkspaceSchema)
  save(@CurrentAuth() auth: AuthContext, @Param("noticeId") noticeId: string, @Body() body: TenderDiscoveryWorkspaceInput) { return this.discovery.save(auth, noticeId, body.workspaceId); }

  @Delete(":noticeId/save")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions("tender:update")
  @ZodBody(tenderDiscoveryWorkspaceSchema)
  unsave(@CurrentAuth() auth: AuthContext, @Param("noticeId") noticeId: string, @Body() body: TenderDiscoveryWorkspaceInput) { return this.discovery.unsave(auth, noticeId, body.workspaceId); }

  @Post(":noticeId/start-application")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions("tender:create")
  @ZodBody(tenderDiscoveryWorkspaceSchema)
  startApplication(@CurrentAuth() auth: AuthContext, @Param("noticeId") noticeId: string, @Body() body: TenderDiscoveryWorkspaceInput) { return this.discovery.startApplication(auth, noticeId, body.workspaceId); }
}

@Controller({ path: "platform/tender-sources", version: "1" })
export class PlatformTenderSourcesController {
  constructor(private readonly discovery: TenderDiscoveryService) {}

  @Get("alerts")
  platformAlerts(@CurrentAuth() auth: AuthContext) { return this.discovery.platformAlerts(auth); }

  @Post(":portalKey/enable")
  @HttpCode(HttpStatus.OK)
  enable(@CurrentAuth() auth: AuthContext, @Param("portalKey") portalKey: string) { return this.discovery.setPortalEnabled(auth, portalKey, true); }

  @Post(":portalKey/disable")
  @HttpCode(HttpStatus.OK)
  disable(@CurrentAuth() auth: AuthContext, @Param("portalKey") portalKey: string) { return this.discovery.setPortalEnabled(auth, portalKey, false); }

  @Post(":portalKey/sync")
  @HttpCode(HttpStatus.ACCEPTED)
  sync(@CurrentAuth() auth: AuthContext, @Param("portalKey") portalKey: string) { return this.discovery.syncPortal(auth, portalKey); }
}
