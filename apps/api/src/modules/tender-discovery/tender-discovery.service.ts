import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  savedTenderNotices,
  tenderIngestionAlerts,
  tenderNoticeDocuments,
  tenderNotices,
  tenderNoticeSources,
  tenderPortals,
  tenderPortalEvents,
  tenderStatusHistory,
  tenders,
  workspaces,
  withTransaction,
  type Database,
} from "@rfp-os/db";
import { hasWorkspacePermission, type AuthContext } from "@rfp-os/types";
import { and, asc, desc, eq, gte, ilike, isNotNull, isNull, lte, or, sql } from "drizzle-orm";

import { DATABASE } from "../../infrastructure/database";
import { JobQueue } from "../../infrastructure/queue";
import { AuditService } from "../../infrastructure/audit";
import { ActivityService } from "../../infrastructure/activity";
import type { ListTenderDiscoveryInput } from "./tender-discovery.dto";

@Injectable()
export class TenderDiscoveryService {
  constructor(@Inject(DATABASE) private readonly db: Database, private readonly jobs: JobQueue, private readonly audit: AuditService, private readonly activity: ActivityService) {}

  async list(auth: AuthContext, input: ListTenderDiscoveryInput) {
    const workspaceId = await this.resolveWorkspace(auth, input.workspaceId);
    const q = input.q?.trim();
    const searchVector = sql`to_tsvector('english', coalesce(${tenderNotices.title}, '') || ' ' || coalesce(${tenderNotices.referenceNumber}, '') || ' ' || coalesce(${tenderNotices.description}, '') || ' ' || coalesce(${tenderNotices.buyerName}, '') || ' ' || coalesce(${tenderNotices.location}, '') || ' ' || coalesce(${tenderNotices.category}, ''))`;
    const searchQuery = q ? sql`websearch_to_tsquery('english', ${q})` : null;
    const where = this.discoveryWhere(auth, workspaceId, input, searchVector, searchQuery);
    const base = this.db.select({ notice: tenderNotices,
      savedNoticeId: sql<string | null>`(select s.notice_id from saved_tender_notices s where s.notice_id = ${tenderNotices.id} and s.organization_id = ${auth.organizationId} and s.workspace_id = ${workspaceId} limit 1)`,
      applicationTenderId: sql<string | null>`(select t.id from tenders t where t.discovery_notice_id = ${tenderNotices.id} and t.organization_id = ${auth.organizationId} and t.workspace_id = ${workspaceId} limit 1)`,
      portalKey: sql<string | null>`(select p.key from tender_notice_sources ns join tender_portals p on p.id = ns.portal_id where ns.notice_id = ${tenderNotices.id} order by ns.is_primary desc limit 1)`,
      portalName: sql<string | null>`(select p.name from tender_notice_sources ns join tender_portals p on p.id = ns.portal_id where ns.notice_id = ${tenderNotices.id} order by ns.is_primary desc limit 1)`,
    }).from(tenderNotices);
    const [count] = await this.db.select({ value: sql<number>`count(*)` }).from(tenderNotices).where(where);
    const rows = await base.where(where).orderBy(...this.orderBy(input.sort, searchVector, searchQuery)).limit(input.pageSize).offset((input.page - 1) * input.pageSize);
    const facetWhere = (omit: string) => this.discoveryWhere(auth, workspaceId, input, searchVector, searchQuery, omit);
    const [portalRows, portalCounts, states, categories, authorityTypes, procurementTypes, statuses, availability, catalog] = await Promise.all([
      this.db.select().from(tenderPortals).orderBy(desc(tenderPortals.enabled), asc(tenderPortals.name)),
      this.db.select({ key: tenderPortals.key, count: sql<number>`count(distinct ${tenderNotices.id})` }).from(tenderPortals).leftJoin(tenderNoticeSources, eq(tenderNoticeSources.portalId, tenderPortals.id)).leftJoin(tenderNotices, eq(tenderNotices.id, tenderNoticeSources.noticeId)).where(facetWhere("portal")).groupBy(tenderPortals.key),
      this.db.select({ value: tenderNotices.state, count: sql<number>`count(*)` }).from(tenderNotices).where(and(isNotNull(tenderNotices.state), facetWhere("state"))).groupBy(tenderNotices.state).orderBy(asc(tenderNotices.state)),
      this.db.select({ value: tenderNotices.category, count: sql<number>`count(*)` }).from(tenderNotices).where(and(isNotNull(tenderNotices.category), facetWhere("category"))).groupBy(tenderNotices.category).orderBy(asc(tenderNotices.category)),
      this.db.select({ value: tenderNotices.authorityType, count: sql<number>`count(*)` }).from(tenderNotices).where(and(isNotNull(tenderNotices.authorityType), facetWhere("authorityType"))).groupBy(tenderNotices.authorityType).orderBy(asc(tenderNotices.authorityType)),
      this.db.select({ value: tenderNotices.procurementType, count: sql<number>`count(*)` }).from(tenderNotices).where(and(isNotNull(tenderNotices.procurementType), facetWhere("procurementType"))).groupBy(tenderNotices.procurementType).orderBy(asc(tenderNotices.procurementType)),
      this.db.select({ value: tenderNotices.status, count: sql<number>`count(*)` }).from(tenderNotices).where(facetWhere("status")).groupBy(tenderNotices.status).orderBy(asc(tenderNotices.status)),
      this.db.select({
        buyer: sql<number>`count(${tenderNotices.buyerName})`,
        location: sql<number>`count(${tenderNotices.location})`,
        state: sql<number>`count(${tenderNotices.state})`,
        estimatedValue: sql<number>`count(${tenderNotices.estimatedValue})`,
        publishedAt: sql<number>`count(${tenderNotices.publishedAt})`,
        deadlineAt: sql<number>`count(${tenderNotices.deadlineAt})`,
      }).from(tenderNotices).where(where),
      this.db.select({ indexed: sql<number>`count(*)`, active: sql<number>`count(*) filter (where ${tenderNotices.status} = 'ACTIVE')`, expired: sql<number>`count(*) filter (where ${tenderNotices.status} = 'EXPIRED')`, stale: sql<number>`count(*) filter (where ${tenderNotices.staleAt} is not null)` }).from(tenderNotices),
    ]);
    const countByPortal = new Map(portalCounts.map((row) => [row.key, Number(row.count)]));
    const portals = portalRows.map((portal) => ({ ...portal, count: countByPortal.get(portal.key) ?? 0 }));
    const enabled = portalRows.filter((portal) => portal.enabled);
    return {
      items: rows.map((row) => serializeNotice(row.notice, { saved: Boolean(row.savedNoticeId), applicationTenderId: row.applicationTenderId, portalKey: row.portalKey, portalName: row.portalName })),
      total: Number(count?.value ?? 0), page: input.page, pageSize: input.pageSize,
      facets: {
        portals: portals.map((portal) => ({ ...portal, count: Number(portal.count) })),
        states: states.filter((row) => row.value).map((row) => ({ ...row, count: Number(row.count) })),
        categories: categories.filter((row) => row.value).map((row) => ({ ...row, count: Number(row.count) })),
        authorityTypes: authorityTypes.filter((row) => row.value).map((row) => ({ ...row, count: Number(row.count) })),
        procurementTypes: procurementTypes.filter((row) => row.value).map((row) => ({ ...row, count: Number(row.count) })),
        statuses: statuses.map((row) => ({ ...row, count: Number(row.count) })),
        availability: {
          buyer: Number(availability[0]?.buyer ?? 0),
          location: Number(availability[0]?.location ?? 0),
          state: Number(availability[0]?.state ?? 0),
          estimatedValue: Number(availability[0]?.estimatedValue ?? 0),
          publishedAt: Number(availability[0]?.publishedAt ?? 0),
          deadlineAt: Number(availability[0]?.deadlineAt ?? 0),
        },
      },
      coverage: { registeredSources: portals.length, enabledSources: enabled.length, healthySources: enabled.filter((portal) => portal.health === "HEALTHY").length, degradedSources: enabled.filter((portal) => portal.health === "DEGRADED").length, lastRefreshedAt: enabled.map((portal) => portal.lastSuccessAt).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0]?.toISOString() ?? null },
      catalog: { indexed: Number(catalog[0]?.indexed ?? 0), active: Number(catalog[0]?.active ?? 0), expired: Number(catalog[0]?.expired ?? 0), stale: Number(catalog[0]?.stale ?? 0) },
    };
  }

  async get(auth: AuthContext, noticeId: string, requestedWorkspaceId?: string) {
    const workspaceId = await this.resolveWorkspace(auth, requestedWorkspaceId);
    const notice = await this.requireNotice(noticeId);
    const [sources, documents, save, application] = await Promise.all([
      this.db.select({ source: tenderNoticeSources, portal: tenderPortals }).from(tenderNoticeSources).innerJoin(tenderPortals, eq(tenderPortals.id, tenderNoticeSources.portalId)).where(eq(tenderNoticeSources.noticeId, noticeId)),
      this.db.select().from(tenderNoticeDocuments).where(eq(tenderNoticeDocuments.noticeId, noticeId)).orderBy(asc(tenderNoticeDocuments.name)),
      this.db.select({ id: savedTenderNotices.noticeId }).from(savedTenderNotices).where(and(eq(savedTenderNotices.organizationId, auth.organizationId), eq(savedTenderNotices.workspaceId, workspaceId), eq(savedTenderNotices.noticeId, noticeId))).limit(1),
      this.db.select({ id: tenders.id }).from(tenders).where(and(eq(tenders.organizationId, auth.organizationId), eq(tenders.workspaceId, workspaceId), eq(tenders.discoveryNoticeId, noticeId))).limit(1),
    ]);
    const primary = sources.find((row) => row.source.isPrimary) ?? sources[0];
    return { ...serializeNotice(notice, { saved: Boolean(save[0]), applicationTenderId: application[0]?.id ?? null, portalKey: primary?.portal.key ?? null, portalName: primary?.portal.name ?? null }), sources: sources.map((row) => ({ ...row.source, portal: row.portal })), documents };
  }

  async save(auth: AuthContext, noticeId: string, workspaceId: string) {
    await this.requireWorkspacePermission(auth, workspaceId, "tender:update"); const notice = await this.requireNotice(noticeId);
    await withTransaction(async (tx) => {
      const inserted = await tx.insert(savedTenderNotices).values({ organizationId: auth.organizationId, workspaceId, noticeId, savedBy: auth.userId }).onConflictDoNothing({ target: [savedTenderNotices.workspaceId, savedTenderNotices.noticeId] }).returning();
      if (!inserted.length) return;
      await this.audit.record({ organizationId: auth.organizationId, workspaceId, actorId: auth.userId, action: "tender_notice.saved", entityType: "tender_notice", entityId: noticeId, newValue: { saved: true } }, tx);
      await this.activity.record({ organizationId: auth.organizationId, workspaceId, actorId: auth.userId, label: `Saved tender notice ${notice.title}`, action: "tender_notice.saved", entityType: "tender_notice", entityId: noticeId, summary: `Saved tender notice ${notice.title}` }, tx);
    });
    return { noticeId, workspaceId, saved: true };
  }

  async unsave(auth: AuthContext, noticeId: string, workspaceId: string) {
    await this.requireWorkspacePermission(auth, workspaceId, "tender:update");
    const notice = await this.requireNotice(noticeId);
    await withTransaction(async (tx) => {
      const removed = await tx.delete(savedTenderNotices).where(and(eq(savedTenderNotices.organizationId, auth.organizationId), eq(savedTenderNotices.workspaceId, workspaceId), eq(savedTenderNotices.noticeId, noticeId))).returning();
      if (!removed.length) return;
      await this.audit.record({ organizationId: auth.organizationId, workspaceId, actorId: auth.userId, action: "tender_notice.unsaved", entityType: "tender_notice", entityId: noticeId, previousValue: { saved: true }, newValue: { saved: false } }, tx);
      await this.activity.record({ organizationId: auth.organizationId, workspaceId, actorId: auth.userId, label: `Removed saved tender notice ${notice.title}`, action: "tender_notice.unsaved", entityType: "tender_notice", entityId: noticeId, summary: `Removed saved tender notice ${notice.title}` }, tx);
    });
    return { noticeId, workspaceId, saved: false };
  }

  async startApplication(auth: AuthContext, noticeId: string, workspaceId: string) {
    await this.requireWorkspacePermission(auth, workspaceId, "tender:create");
    const notice = await this.requireNotice(noticeId);
    const existing = await this.db.select({ id: tenders.id }).from(tenders).where(and(eq(tenders.organizationId, auth.organizationId), eq(tenders.workspaceId, workspaceId), eq(tenders.discoveryNoticeId, noticeId))).limit(1);
    if (existing[0]) return { tenderId: existing[0].id, created: false };
    const result = await withTransaction(async (tx) => {
      const [row] = await tx.insert(tenders).values({ organizationId: auth.organizationId, workspaceId, discoveryNoticeId: noticeId, name: notice.buyerName ?? notice.title, title: notice.title, referenceNumber: notice.referenceNumber, description: notice.description, buyerName: notice.buyerName, location: notice.location ?? notice.state, estimatedValue: notice.estimatedValue, currency: notice.currency, tenderType: "ONLINE", sourceType: "PORTAL", sourceReference: { discoveryNoticeId: notice.id }, sourceUrl: notice.sourceUrl, status: "DRAFT", ownerId: auth.userId, createdBy: auth.userId, receivedAt: notice.publishedAt, dueAt: notice.deadlineAt, timezone: "Asia/Kolkata", metadata: { discovery: true, category: notice.category, authorityType: notice.authorityType, procurementType: notice.procurementType } }).onConflictDoNothing({ target: [tenders.workspaceId, tenders.discoveryNoticeId] }).returning();
      if (!row) {
        const [winner] = await tx.select({ id: tenders.id }).from(tenders).where(and(eq(tenders.organizationId, auth.organizationId), eq(tenders.workspaceId, workspaceId), eq(tenders.discoveryNoticeId, noticeId))).limit(1);
        if (!winner) throw new BadRequestException("Unable to create tender application.");
        return { tenderId: winner.id, created: false };
      }
      await tx.insert(tenderStatusHistory).values({ organizationId: auth.organizationId, workspaceId, tenderId: row.id, fromStatus: null, toStatus: "DRAFT", actorId: auth.userId, reason: "Application started from tender discovery.", metadata: { discoveryNoticeId: notice.id } });
      await this.audit.record({ organizationId: auth.organizationId, workspaceId, actorId: auth.userId, action: "tender.created_from_discovery", entityType: "tender", entityId: row.id, newValue: { discoveryNoticeId: notice.id, title: row.title } }, tx);
      await this.activity.record({ organizationId: auth.organizationId, workspaceId, actorId: auth.userId, label: `Started application for ${row.title}`, action: "tender.created_from_discovery", entityType: "tender", entityId: row.id, summary: `Started application for ${row.title}` }, tx);
      return { tenderId: row.id, created: true };
    });
    if (result.created) {
      const documents = await this.db.select({ id: tenderNoticeDocuments.id }).from(tenderNoticeDocuments).where(and(eq(tenderNoticeDocuments.noticeId, noticeId), eq(tenderNoticeDocuments.access, "DIRECT")));
      await Promise.allSettled(documents.map((document) => this.jobs.enqueueTenderNoticeDocument({ kind: "IMPORT_DOCUMENT", organizationId: auth.organizationId, workspaceId, tenderId: result.tenderId, noticeDocumentId: document.id, actorId: auth.userId })));
    }
    return result;
  }

  async sources(auth: AuthContext) {
    if (!auth.isPlatformAdmin && auth.role !== "OWNER" && auth.role !== "ADMIN")
      throw new ForbiddenException({ code: "TENDER_SOURCE_HEALTH_FORBIDDEN", message: "Organization administrator access is required." });
    const rows = await this.db.select({
      portal: tenderPortals,
      noticeCount: sql<number>`(select count(distinct s.notice_id) from tender_notice_sources s where s.portal_id = ${tenderPortals.id})`,
      currentCount: sql<number>`(select count(distinct s.notice_id) from tender_notice_sources s where s.portal_id = ${tenderPortals.id} and s.stale_at is null)`,
      lastRunStatus: sql<string | null>`(select r.status::text from tender_sync_runs r where r.portal_id = ${tenderPortals.id} order by r.started_at desc limit 1)`,
      lastRunDiscovered: sql<number | null>`(select r.discovered_count from tender_sync_runs r where r.portal_id = ${tenderPortals.id} order by r.started_at desc limit 1)`,
      openAlerts: sql<number>`(select count(*) from tender_ingestion_alerts a where a.portal_id = ${tenderPortals.id} and a.status = 'OPEN')`,
    }).from(tenderPortals).orderBy(desc(tenderPortals.enabled), asc(tenderPortals.name));
    return { items: rows.map((row) => ({ ...row.portal, noticeCount: Number(row.noticeCount), currentCount: Number(row.currentCount), lastRunStatus: row.lastRunStatus, lastRunDiscovered: row.lastRunDiscovered === null ? null : Number(row.lastRunDiscovered), openAlerts: Number(row.openAlerts), isPlatformAdmin: Boolean(auth.isPlatformAdmin) })) };
  }

  async platformAlerts(auth: AuthContext) {
    this.requirePlatformAdmin(auth);
    return { items: await this.db.select({ alert: tenderIngestionAlerts, portalKey: tenderPortals.key, portalName: tenderPortals.name }).from(tenderIngestionAlerts).innerJoin(tenderPortals, eq(tenderPortals.id, tenderIngestionAlerts.portalId)).orderBy(sql`${tenderIngestionAlerts.status} ASC`, desc(tenderIngestionAlerts.openedAt)) };
  }

  async setPortalEnabled(auth: AuthContext, portalKey: string, enabled: boolean) {
    this.requirePlatformAdmin(auth);
    const [portal] = await this.db.select().from(tenderPortals).where(eq(tenderPortals.key, portalKey)).limit(1);
    if (!portal) throw new NotFoundException({ code: "TENDER_PORTAL_NOT_FOUND", message: "Tender portal not found." });
    if (enabled && portal.metadata.connectorVerified !== true)
      throw new BadRequestException({ code: "TENDER_CONNECTOR_NOT_VERIFIED", message: "This connector must pass its live verification gate before activation." });
    await withTransaction(async (tx) => {
      await tx.update(tenderPortals).set({ enabled, health: enabled ? "PENDING" : "DISABLED", updatedAt: new Date() }).where(eq(tenderPortals.id, portal.id));
      await tx.insert(tenderPortalEvents).values({ portalId: portal.id, actorId: auth.userId, action: enabled ? "portal.enabled" : "portal.disabled", metadata: { portalKey } });
    });
    return { portalKey, enabled };
  }

  async syncPortal(auth: AuthContext, portalKey: string) {
    this.requirePlatformAdmin(auth);
    const [portal] = await this.db.select().from(tenderPortals).where(eq(tenderPortals.key, portalKey)).limit(1);
    if (!portal) throw new NotFoundException({ code: "TENDER_PORTAL_NOT_FOUND", message: "Tender portal not found." });
    if (!portal.enabled) throw new BadRequestException({ code: "TENDER_PORTAL_DISABLED", message: "Enable this verified connector before synchronizing it." });
    const windowStartedAt = new Date().toISOString();
    const queued = await this.jobs.enqueueTenderPortalSync({ kind: "SYNC_PORTAL", portalId: portal.id, portalKey, windowStartedAt, mode: "HEAD" });
    await this.db.insert(tenderPortalEvents).values({ portalId: portal.id, actorId: auth.userId, action: "portal.sync_requested", metadata: { jobId: queued.jobId, enqueued: queued.enqueued } });
    return queued;
  }

  private discoveryWhere(auth: AuthContext, workspaceId: string, input: ListTenderDiscoveryInput, searchVector: ReturnType<typeof sql>, searchQuery: ReturnType<typeof sql> | null, omit?: string) {
    const q = input.q?.trim();
    return and(
      q ? or(sql`${searchVector} @@ ${searchQuery}`, ilike(tenderNotices.title, `%${q}%`), ilike(tenderNotices.referenceNumber, `%${q}%`)) : undefined,
      omit !== "portal" && input.portal ? sql`exists (select 1 from tender_notice_sources ns join tender_portals p on p.id = ns.portal_id where ns.notice_id = ${tenderNotices.id} and p.key = ${input.portal})` : undefined,
      omit !== "authorityType" && input.authorityType ? ilike(tenderNotices.authorityType, `%${input.authorityType}%`) : undefined,
      input.buyer ? ilike(tenderNotices.buyerName, `%${input.buyer}%`) : undefined,
      omit !== "state" && input.state ? eq(tenderNotices.state, input.state) : undefined,
      input.location ? ilike(tenderNotices.location, `%${input.location}%`) : undefined,
      omit !== "category" && input.category ? eq(tenderNotices.category, input.category) : undefined,
      omit !== "procurementType" && input.procurementType ? ilike(tenderNotices.procurementType, `%${input.procurementType}%`) : undefined,
      omit !== "status" && input.status ? eq(tenderNotices.status, input.status) : undefined,
      input.minValue !== undefined ? gte(tenderNotices.estimatedValue, String(input.minValue)) : undefined,
      input.maxValue !== undefined ? lte(tenderNotices.estimatedValue, String(input.maxValue)) : undefined,
      input.publishedFrom ? gte(tenderNotices.publishedAt, new Date(input.publishedFrom)) : undefined,
      input.publishedTo ? lte(tenderNotices.publishedAt, new Date(input.publishedTo)) : undefined,
      input.deadlineFrom ? gte(tenderNotices.deadlineAt, new Date(input.deadlineFrom)) : undefined,
      input.deadlineTo ? lte(tenderNotices.deadlineAt, new Date(input.deadlineTo)) : undefined,
      input.saved ? sql`exists (select 1 from saved_tender_notices s where s.notice_id = ${tenderNotices.id} and s.organization_id = ${auth.organizationId} and s.workspace_id = ${workspaceId})` : undefined,
      input.applied ? sql`exists (select 1 from tenders t where t.discovery_notice_id = ${tenderNotices.id} and t.organization_id = ${auth.organizationId} and t.workspace_id = ${workspaceId})` : undefined,
      input.freshness === "current" ? isNull(tenderNotices.staleAt) : input.freshness === "stale" ? isNotNull(tenderNotices.staleAt) : undefined,
    );
  }

  private requirePlatformAdmin(auth: AuthContext) {
    if (!auth.isPlatformAdmin) throw new ForbiddenException({ code: "PLATFORM_ADMIN_REQUIRED", message: "Platform administrator access is required." });
  }

  private async requireNotice(id: string) { const [notice] = await this.db.select().from(tenderNotices).where(eq(tenderNotices.id, id)).limit(1); if (!notice) throw new NotFoundException({ code: "TENDER_NOTICE_NOT_FOUND", message: "Tender notice not found." }); return notice; }
  private async resolveWorkspace(auth: AuthContext, requested?: string) { const id = requested ?? auth.workspaceIds?.[0]; if (!id) throw new BadRequestException({ code: "WORKSPACE_REQUIRED", message: "Select a workspace to use tender discovery." }); await this.requireWorkspacePermission(auth, id, "tender:read"); return id; }
  private async requireWorkspacePermission(auth: AuthContext, workspaceId: string, permission: "tender:read" | "tender:update" | "tender:create") { if (!hasWorkspacePermission(auth, workspaceId, permission)) throw new ForbiddenException({ code: "TENDER_DISCOVERY_FORBIDDEN", message: `Missing ${permission} for this workspace.` }); const [workspace] = await this.db.select({ id: workspaces.id }).from(workspaces).where(and(eq(workspaces.id, workspaceId), eq(workspaces.organizationId, auth.organizationId))).limit(1); if (!workspace) throw new NotFoundException({ code: "WORKSPACE_NOT_FOUND", message: "Workspace not found." }); }
  private orderBy(sort: ListTenderDiscoveryInput["sort"], vector: ReturnType<typeof sql>, query: ReturnType<typeof sql> | null) { if (sort === "newest") return [sql`${tenderNotices.publishedAt} DESC NULLS LAST`, desc(tenderNotices.id)]; if (sort === "deadline") return [sql`${tenderNotices.deadlineAt} ASC NULLS LAST`, desc(tenderNotices.id)]; if (sort === "value") return [sql`${tenderNotices.estimatedValue} DESC NULLS LAST`, desc(tenderNotices.id)]; if (sort === "updated") return [sql`${tenderNotices.updatedAt} DESC NULLS LAST`, desc(tenderNotices.id)]; return query ? [desc(sql`ts_rank(${vector}, ${query})`), sql`${tenderNotices.publishedAt} DESC NULLS LAST`, desc(tenderNotices.id)] : [sql`${tenderNotices.publishedAt} DESC NULLS LAST`, desc(tenderNotices.id)]; }
}

function serializeNotice(row: typeof tenderNotices.$inferSelect, extra: { saved: boolean; applicationTenderId: string | null; portalKey: string | null; portalName: string | null }) { return { ...row, estimatedValue: row.estimatedValue === null ? null : Number(row.estimatedValue), emdAmount: row.emdAmount === null ? null : Number(row.emdAmount), documentFee: row.documentFee === null ? null : Number(row.documentFee), publishedAt: row.publishedAt?.toISOString() ?? null, bidStartsAt: row.bidStartsAt?.toISOString() ?? null, deadlineAt: row.deadlineAt?.toISOString() ?? null, opensAt: row.opensAt?.toISOString() ?? null, sourceUpdatedAt: row.sourceUpdatedAt?.toISOString() ?? null, firstSeenAt: row.firstSeenAt.toISOString(), lastSeenAt: row.lastSeenAt.toISOString(), staleAt: row.staleAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), ...extra }; }
