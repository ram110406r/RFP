import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import type { AuthContext } from "@rfp-os/types";

import { CurrentAuth, RequirePermissions } from "../../common/auth";
import { ZodBody, ZodQuery } from "../../common/decorators/zod-schema.decorator";
import { analyticsSchema, bulkTenderDiscoverySchema, compareTenderDiscoverySchema, listTenderDiscoverySchema, portalSyncSchema, savedSearchSchema, tenderDiscoveryDetailSchema, tenderDiscoveryWorkspaceSchema, tenderMatchProfileSchema, updateSavedSearchSchema, type BulkTenderDiscoveryInput, type CompareTenderDiscoveryInput, type ListTenderDiscoveryInput, type PortalSyncInput, type SavedSearchInput, type TenderAnalyticsInput, type TenderDiscoveryDetailInput, type TenderDiscoveryWorkspaceInput, type TenderMatchProfileInput, type UpdateSavedSearchInput } from "./tender-discovery.dto";
import { TenderDiscoveryService } from "./tender-discovery.service";

@Controller({ path: "tender-discovery", version: "1" })
export class TenderDiscoveryController {
  constructor(private readonly discovery: TenderDiscoveryService) {}

  @Get()
  @RequirePermissions("tender:read")
  @ZodQuery(listTenderDiscoverySchema)
  list(@CurrentAuth() auth: AuthContext, @Query() query: ListTenderDiscoveryInput) { return this.discovery.list(auth, query); }

  @Get("compare") @RequirePermissions("tender:read") @ZodQuery(compareTenderDiscoverySchema)
  compare(@CurrentAuth() auth: AuthContext, @Query() query: CompareTenderDiscoveryInput) { return this.discovery.compare(auth, query); }

  @Get("export.csv") @RequirePermissions("rfp:export") @ZodQuery(listTenderDiscoverySchema)
  async exportCsv(@CurrentAuth() auth: AuthContext, @Query() query: ListTenderDiscoveryInput, @Res({ passthrough: true }) response: Response) { response.type("text/csv").attachment("tender-search.csv"); return this.discovery.exportCsv(auth, query); }

  @Post("bulk/save") @HttpCode(HttpStatus.OK) @RequirePermissions("tender:update") @ZodBody(bulkTenderDiscoverySchema)
  bulkSave(@CurrentAuth() auth: AuthContext, @Body() body: BulkTenderDiscoveryInput) { return this.discovery.bulkSave(auth, body, true); }

  @Delete("bulk/save") @HttpCode(HttpStatus.OK) @RequirePermissions("tender:update") @ZodBody(bulkTenderDiscoverySchema)
  bulkUnsave(@CurrentAuth() auth: AuthContext, @Body() body: BulkTenderDiscoveryInput) { return this.discovery.bulkSave(auth, body, false); }

  @Post("bulk/start-applications") @HttpCode(HttpStatus.OK) @RequirePermissions("tender:create") @ZodBody(bulkTenderDiscoverySchema)
  bulkStart(@CurrentAuth() auth: AuthContext, @Body() body: BulkTenderDiscoveryInput) { return this.discovery.bulkStartApplications(auth, body); }

  @Get("saved-searches") @RequirePermissions("tender:read") @ZodQuery(tenderDiscoveryWorkspaceSchema)
  savedSearches(@CurrentAuth() auth: AuthContext, @Query() query: TenderDiscoveryWorkspaceInput) { return this.discovery.savedSearches(auth, query.workspaceId); }

  @Post("saved-searches") @RequirePermissions("tender:read") @ZodBody(savedSearchSchema)
  createSavedSearch(@CurrentAuth() auth: AuthContext, @Body() body: SavedSearchInput) { return this.discovery.createSavedSearch(auth, body); }

  @Put("saved-searches/:searchId") @RequirePermissions("tender:read") @ZodBody(updateSavedSearchSchema)
  updateSavedSearch(@CurrentAuth() auth: AuthContext, @Param("searchId") searchId: string, @Body() body: UpdateSavedSearchInput) { return this.discovery.updateSavedSearch(auth, searchId, body); }

  @Delete("saved-searches/:searchId") @HttpCode(HttpStatus.NO_CONTENT) @RequirePermissions("tender:read") @ZodBody(tenderDiscoveryWorkspaceSchema)
  deleteSavedSearch(@CurrentAuth() auth: AuthContext, @Param("searchId") searchId: string, @Body() body: TenderDiscoveryWorkspaceInput) { return this.discovery.deleteSavedSearch(auth, searchId, body.workspaceId); }

  @Get("match-profile") @RequirePermissions("tender:read")
  matchProfile(@CurrentAuth() auth: AuthContext) { return this.discovery.matchProfile(auth); }

  @Put("match-profile") @RequirePermissions("tender:match_profile:update") @ZodBody(tenderMatchProfileSchema)
  updateMatchProfile(@CurrentAuth() auth: AuthContext, @Body() body: TenderMatchProfileInput) { return this.discovery.updateMatchProfile(auth, body); }

  @Get("analytics") @RequirePermissions("tender:read") @ZodQuery(analyticsSchema)
  analytics(@CurrentAuth() auth: AuthContext, @Query() query: TenderAnalyticsInput) { return this.discovery.analytics(auth, query); }

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

  @Get(":portalKey/quality")
  qualityHistory(@CurrentAuth() auth: AuthContext, @Param("portalKey") portalKey: string) { return this.discovery.sourceQualityHistory(auth, portalKey); }

  @Post(":portalKey/enable")
  @HttpCode(HttpStatus.OK)
  enable(@CurrentAuth() auth: AuthContext, @Param("portalKey") portalKey: string) { return this.discovery.setPortalEnabled(auth, portalKey, true); }

  @Post(":portalKey/disable")
  @HttpCode(HttpStatus.OK)
  disable(@CurrentAuth() auth: AuthContext, @Param("portalKey") portalKey: string) { return this.discovery.setPortalEnabled(auth, portalKey, false); }

  @Post(":portalKey/sync")
  @HttpCode(HttpStatus.ACCEPTED)
  @ZodBody(portalSyncSchema)
  sync(@CurrentAuth() auth: AuthContext, @Param("portalKey") portalKey: string, @Body() body: PortalSyncInput) { return this.discovery.syncPortal(auth, portalKey, body.mode); }

  @Post("alerts/:alertId/resolve") @HttpCode(HttpStatus.OK)
  resolveAlert(@CurrentAuth() auth: AuthContext, @Param("alertId") alertId: string) { return this.discovery.resolvePlatformAlert(auth, alertId); }

  @Post("documents/:documentId/retry") @HttpCode(HttpStatus.ACCEPTED)
  retryDocument(@CurrentAuth() auth: AuthContext, @Param("documentId") documentId: string, @Body() body: TenderDiscoveryWorkspaceInput) { return this.discovery.retryDocumentImport(auth, documentId, body.workspaceId); }
}
