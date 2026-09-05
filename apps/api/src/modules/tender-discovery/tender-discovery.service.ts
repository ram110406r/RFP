import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  savedTenderNotices,
  tenderNoticeDocuments,
  tenderNotices,
  tenderNoticeSources,
  tenderPortals,
  tenderStatusHistory,
  tenders,
  workspaces,
  withTransaction,
  type Database,
} from "@rfp-os/db";
import { hasWorkspacePermission, type AuthContext } from "@rfp-os/types";
import { and, asc, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";

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
    const portalFilter = input.portal ? sql`exists (select 1 from tender_notice_sources ns join tender_portals p on p.id = ns.portal_id where ns.notice_id = ${tenderNotices.id} and p.key = ${input.portal})` : undefined;
    const where = and(
      q ? or(sql`${searchVector} @@ ${searchQuery}`, ilike(tenderNotices.title, `%${q}%`), ilike(tenderNotices.referenceNumber, `%${q}%`)) : undefined,
      portalFilter,
      input.authorityType ? ilike(tenderNotices.authorityType, `%${input.authorityType}%`) : undefined,
      input.buyer ? ilike(tenderNotices.buyerName, `%${input.buyer}%`) : undefined,
      input.state ? eq(tenderNotices.state, input.state) : undefined,
      input.location ? ilike(tenderNotices.location, `%${input.location}%`) : undefined,
      input.category ? eq(tenderNotices.category, input.category) : undefined,
      input.procurementType ? ilike(tenderNotices.procurementType, `%${input.procurementType}%`) : undefined,
      input.status ? eq(tenderNotices.status, input.status) : undefined,
      input.minValue !== undefined ? gte(tenderNotices.estimatedValue, String(input.minValue)) : undefined,
      input.maxValue !== undefined ? lte(tenderNotices.estimatedValue, String(input.maxValue)) : undefined,
      input.publishedFrom ? gte(tenderNotices.publishedAt, new Date(input.publishedFrom)) : undefined,
      input.publishedTo ? lte(tenderNotices.publishedAt, new Date(input.publishedTo)) : undefined,
      input.deadlineFrom ? gte(tenderNotices.deadlineAt, new Date(input.deadlineFrom)) : undefined,
      input.deadlineTo ? lte(tenderNotices.deadlineAt, new Date(input.deadlineTo)) : undefined,
      input.saved ? sql`${savedTenderNotices.noticeId} is not null` : undefined,
      input.applied ? sql`${tenders.id} is not null` : undefined,
    );
    const base = this.db.select({ notice: tenderNotices, savedNoticeId: savedTenderNotices.noticeId, applicationTenderId: tenders.id,
      portalKey: sql<string | null>`(select p.key from tender_notice_sources ns join tender_portals p on p.id = ns.portal_id where ns.notice_id = ${tenderNotices.id} order by ns.is_primary desc limit 1)`,
      portalName: sql<string | null>`(select p.name from tender_notice_sources ns join tender_portals p on p.id = ns.portal_id where ns.notice_id = ${tenderNotices.id} order by ns.is_primary desc limit 1)`,
    }).from(tenderNotices)
      .leftJoin(savedTenderNotices, and(eq(savedTenderNotices.noticeId, tenderNotices.id), eq(savedTenderNotices.organizationId, auth.organizationId), eq(savedTenderNotices.workspaceId, workspaceId)))
      .leftJoin(tenders, and(eq(tenders.discoveryNoticeId, tenderNotices.id), eq(tenders.organizationId, auth.organizationId), eq(tenders.workspaceId, workspaceId)));
    const [count] = await this.db.select({ value: sql<number>`count(distinct ${tenderNotices.id})` }).from(tenderNotices)
      .leftJoin(savedTenderNotices, and(eq(savedTenderNotices.noticeId, tenderNotices.id), eq(savedTenderNotices.organizationId, auth.organizationId), eq(savedTenderNotices.workspaceId, workspaceId)))
      .leftJoin(tenders, and(eq(tenders.discoveryNoticeId, tenderNotices.id), eq(tenders.organizationId, auth.organizationId), eq(tenders.workspaceId, workspaceId))).where(where);
    const rows = await base.where(where).orderBy(...this.orderBy(input.sort, searchVector, searchQuery)).limit(input.pageSize).offset((input.page - 1) * input.pageSize);
    const [portals, states, categories, authorityTypes, procurementTypes, statuses, availability] = await Promise.all([
      this.db.select({
        key: tenderPortals.key,
        name: tenderPortals.name,
        health: tenderPortals.health,
        enabled: tenderPortals.enabled,
        lastSuccessAt: tenderPortals.lastSuccessAt,
        count: sql<number>`count(distinct ${tenderNoticeSources.noticeId})`,
      }).from(tenderPortals)
        .leftJoin(tenderNoticeSources, eq(tenderNoticeSources.portalId, tenderPortals.id))
        .groupBy(tenderPortals.id)
        .orderBy(desc(tenderPortals.enabled), asc(tenderPortals.name)),
      this.db.select({ value: tenderNotices.state, count: sql<number>`count(*)` }).from(tenderNotices).where(sql`${tenderNotices.state} is not null`).groupBy(tenderNotices.state).orderBy(asc(tenderNotices.state)),
      this.db.select({ value: tenderNotices.category, count: sql<number>`count(*)` }).from(tenderNotices).where(sql`${tenderNotices.category} is not null`).groupBy(tenderNotices.category).orderBy(asc(tenderNotices.category)),
      this.db.select({ value: tenderNotices.authorityType, count: sql<number>`count(*)` }).from(tenderNotices).where(sql`${tenderNotices.authorityType} is not null`).groupBy(tenderNotices.authorityType).orderBy(asc(tenderNotices.authorityType)),
      this.db.select({ value: tenderNotices.procurementType, count: sql<number>`count(*)` }).from(tenderNotices).where(sql`${tenderNotices.procurementType} is not null`).groupBy(tenderNotices.procurementType).orderBy(asc(tenderNotices.procurementType)),
      this.db.select({ value: tenderNotices.status, count: sql<number>`count(*)` }).from(tenderNotices).groupBy(tenderNotices.status).orderBy(asc(tenderNotices.status)),
      this.db.select({
        buyer: sql<number>`count(${tenderNotices.buyerName})`,
        location: sql<number>`count(${tenderNotices.location})`,
        state: sql<number>`count(${tenderNotices.state})`,
        estimatedValue: sql<number>`count(${tenderNotices.estimatedValue})`,
        publishedAt: sql<number>`count(${tenderNotices.publishedAt})`,
        deadlineAt: sql<number>`count(${tenderNotices.deadlineAt})`,
      }).from(tenderNotices),
    ]);
    const enabled = portals.filter((portal) => portal.enabled);
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

  private async requireNotice(id: string) { const [notice] = await this.db.select().from(tenderNotices).where(eq(tenderNotices.id, id)).limit(1); if (!notice) throw new NotFoundException({ code: "TENDER_NOTICE_NOT_FOUND", message: "Tender notice not found." }); return notice; }
  private async resolveWorkspace(auth: AuthContext, requested?: string) { const id = requested ?? auth.workspaceIds?.[0]; if (!id) throw new BadRequestException({ code: "WORKSPACE_REQUIRED", message: "Select a workspace to use tender discovery." }); await this.requireWorkspacePermission(auth, id, "tender:read"); return id; }
  private async requireWorkspacePermission(auth: AuthContext, workspaceId: string, permission: "tender:read" | "tender:update" | "tender:create") { if (!hasWorkspacePermission(auth, workspaceId, permission)) throw new ForbiddenException({ code: "TENDER_DISCOVERY_FORBIDDEN", message: `Missing ${permission} for this workspace.` }); const [workspace] = await this.db.select({ id: workspaces.id }).from(workspaces).where(and(eq(workspaces.id, workspaceId), eq(workspaces.organizationId, auth.organizationId))).limit(1); if (!workspace) throw new NotFoundException({ code: "WORKSPACE_NOT_FOUND", message: "Workspace not found." }); }
  private orderBy(sort: ListTenderDiscoveryInput["sort"], vector: ReturnType<typeof sql>, query: ReturnType<typeof sql> | null) { if (sort === "newest") return [desc(tenderNotices.publishedAt), desc(tenderNotices.id)]; if (sort === "deadline") return [asc(tenderNotices.deadlineAt), desc(tenderNotices.id)]; if (sort === "value") return [desc(tenderNotices.estimatedValue), desc(tenderNotices.id)]; if (sort === "updated") return [desc(tenderNotices.updatedAt), desc(tenderNotices.id)]; return query ? [desc(sql`ts_rank(${vector}, ${query})`), desc(tenderNotices.publishedAt), desc(tenderNotices.id)] : [desc(tenderNotices.publishedAt), desc(tenderNotices.id)]; }
}

function serializeNotice(row: typeof tenderNotices.$inferSelect, extra: { saved: boolean; applicationTenderId: string | null; portalKey: string | null; portalName: string | null }) { return { ...row, estimatedValue: row.estimatedValue === null ? null : Number(row.estimatedValue), emdAmount: row.emdAmount === null ? null : Number(row.emdAmount), documentFee: row.documentFee === null ? null : Number(row.documentFee), publishedAt: row.publishedAt?.toISOString() ?? null, bidStartsAt: row.bidStartsAt?.toISOString() ?? null, deadlineAt: row.deadlineAt?.toISOString() ?? null, opensAt: row.opensAt?.toISOString() ?? null, sourceUpdatedAt: row.sourceUpdatedAt?.toISOString() ?? null, firstSeenAt: row.firstSeenAt.toISOString(), lastSeenAt: row.lastSeenAt.toISOString(), staleAt: row.staleAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), ...extra }; }
