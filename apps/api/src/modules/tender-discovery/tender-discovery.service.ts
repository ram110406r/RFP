import { createHash } from "node:crypto";
import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import type IORedis from "ioredis";
import {
  organizations,
  savedTenderNotices,
  tenderDiscoveryEvents,
  tenderMatchProfiles,
  tenderSavedSearches,
  tenderIngestionAlerts,
  tenderNoticeDocuments,
  tenderNotices,
  tenderNoticeSources,
  tenderPortals,
  tenderPortalEvents,
  tenderStatusHistory,
  tenderSyncRuns,
  tenders,
  workspaces,
  withTransaction,
  type Database,
} from "@rfp-os/db";
import { hasWorkspacePermission, type AuthContext } from "@rfp-os/types";
import { and, asc, desc, eq, gte, ilike, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";

import { DATABASE } from "../../infrastructure/database";
import { JobQueue } from "../../infrastructure/queue";
import { QUEUE_REDIS } from "../../infrastructure/queue";
import { AuditService } from "../../infrastructure/audit";
import { ActivityService } from "../../infrastructure/activity";
import type { BulkTenderDiscoveryInput, CompareTenderDiscoveryInput, ListTenderDiscoveryInput, SavedSearchInput, TenderAnalyticsInput, TenderMatchProfileInput, UpdateSavedSearchInput } from "./tender-discovery.dto";
import { csvCell, decodeCursor, encodeCursor, scoreTenderMatch, type TenderMatchProfileInput as MatchProfile } from "./tender-discovery.logic";

@Injectable()
export class TenderDiscoveryService {
  private readonly logger = new Logger(TenderDiscoveryService.name);

  constructor(@Inject(DATABASE) private readonly db: Database, private readonly jobs: JobQueue, private readonly audit: AuditService, private readonly activity: ActivityService, @Optional() @Inject(QUEUE_REDIS) private readonly redis: IORedis | null = null) {}

  async list(auth: AuthContext, input: ListTenderDiscoveryInput) {
    const startedAt = Date.now();
    const workspaceId = await this.resolveWorkspace(auth, input.workspaceId);
    const q = input.q?.trim();
    const searchVector = sql`"tender_notices"."search_vector"`;
    const searchQuery = q ? sql`websearch_to_tsquery('english', ${q})` : null;
    const prefix = q ? q.match(/[\p{L}\p{N}]+/gu)?.slice(0, 8).map((term) => `${term}:*`).join(" & ") : null;
    const prefixQuery = prefix ? sql`to_tsquery('simple', ${prefix})` : null;
    const profile = await this.getMatchProfile(auth.organizationId);
    const rank = q && searchQuery ? sql<number>`least(1, ts_rank_cd(${searchVector}, ${searchQuery}) + greatest(similarity(${tenderNotices.title}, ${q}), similarity(coalesce(${tenderNotices.referenceNumber}, ''), ${q})) * 0.25)` : sql<number>`0`;
    const matchScore = this.matchScoreSql(profile);
    const baseWhere = this.discoveryWhere(auth, workspaceId, input, searchVector, searchQuery, undefined, prefixQuery);
    const cursor = decodeCursor(input.cursor);
    const where = and(baseWhere, this.cursorWhere(input.sort, cursor, rank, matchScore));
    const base = this.db.select({ notice: tenderNotices,
      relevanceScore: rank,
      savedNoticeId: sql<string | null>`(select s.notice_id from saved_tender_notices s where s.notice_id = ${tenderNotices.id} and s.organization_id = ${auth.organizationId} and s.workspace_id = ${workspaceId} limit 1)`,
      applicationTenderId: sql<string | null>`(select t.id from tenders t where t.discovery_notice_id = ${tenderNotices.id} and t.organization_id = ${auth.organizationId} and t.workspace_id = ${workspaceId} limit 1)`,
      portalKey: sql<string | null>`(select p.key from tender_notice_sources ns join tender_portals p on p.id = ns.portal_id where ns.notice_id = ${tenderNotices.id} order by ns.is_primary desc limit 1)`,
      portalName: sql<string | null>`(select p.name from tender_notice_sources ns join tender_portals p on p.id = ns.portal_id where ns.notice_id = ${tenderNotices.id} order by ns.is_primary desc limit 1)`,
    }).from(tenderNotices);
    const [count] = await this.db.select({ value: sql<number>`count(*)` }).from(tenderNotices).where(baseWhere);
    const fetched = await base.where(where).orderBy(...this.orderBy(input.sort, rank, matchScore)).limit(input.pageSize + (input.cursor ? 1 : 0)).offset(input.cursor ? 0 : (input.page - 1) * input.pageSize);
    const hasMore = input.cursor ? fetched.length > input.pageSize : input.page * input.pageSize < Number(count?.value ?? 0);
    const rows = fetched.slice(0, input.pageSize);
    const discoveryMeta = await this.discoveryFacets(auth, workspaceId, input, searchVector, searchQuery, prefixQuery, baseWhere);
    const result = {
      items: rows.map((row) => { const fit = scoreTenderMatch(row.notice, profile); return { ...serializeNotice(row.notice, { saved: Boolean(row.savedNoticeId), applicationTenderId: row.applicationTenderId, portalKey: row.portalKey, portalName: row.portalName }), relevanceScore: Math.min(100, Math.round(Number(row.relevanceScore) * 100)), matchScore: fit.score, matchReasons: fit.reasons, matchComponents: fit.components, quality: noticeQuality(row.notice), matchedTerms: q ? matchedTerms(q, row.notice) : [] }; }),
      total: Number(count?.value ?? 0), page: input.page, pageSize: input.pageSize,
      hasMore,
      nextCursor: hasMore && rows.length ? encodeCursor({ id: rows.at(-1)!.notice.id, value: this.cursorValue(input.sort, rows.at(-1)!.notice, Number(rows.at(-1)!.relevanceScore), scoreTenderMatch(rows.at(-1)!.notice, profile).score) }) : null,
      ...discoveryMeta,
    };
    await this.recordEvent(auth, workspaceId, "SEARCH", { query: q, filters: analyticsFilters(input), resultCount: Number(count?.value ?? 0), durationMs: Date.now() - startedAt });
    await this.recordEvent(auth, workspaceId, "RESULT_VIEW", { resultCount: rows.length, filters: analyticsFilters(input) });
    return result;
  }

  async get(auth: AuthContext, noticeId: string, requestedWorkspaceId?: string, recordView = true) {
    const workspaceId = await this.resolveWorkspace(auth, requestedWorkspaceId);
    const notice = await this.requireNotice(noticeId);
    const [sources, documents, save, application] = await Promise.all([
      this.db.select({ source: tenderNoticeSources, portal: tenderPortals }).from(tenderNoticeSources).innerJoin(tenderPortals, eq(tenderPortals.id, tenderNoticeSources.portalId)).where(eq(tenderNoticeSources.noticeId, noticeId)),
      this.db.select().from(tenderNoticeDocuments).where(eq(tenderNoticeDocuments.noticeId, noticeId)).orderBy(asc(tenderNoticeDocuments.name)),
      this.db.select({ id: savedTenderNotices.noticeId }).from(savedTenderNotices).where(and(eq(savedTenderNotices.organizationId, auth.organizationId), eq(savedTenderNotices.workspaceId, workspaceId), eq(savedTenderNotices.noticeId, noticeId))).limit(1),
      this.db.select({ id: tenders.id }).from(tenders).where(and(eq(tenders.organizationId, auth.organizationId), eq(tenders.workspaceId, workspaceId), eq(tenders.discoveryNoticeId, noticeId))).limit(1),
    ]);
    const primary = sources.find((row) => row.source.isPrimary) ?? sources[0];
    const fit = scoreTenderMatch(notice, await this.getMatchProfile(auth.organizationId));
    if (recordView) await this.recordEvent(auth, workspaceId, "DETAIL_VIEW", { noticeId });
    return { ...serializeNotice(notice, { saved: Boolean(save[0]), applicationTenderId: application[0]?.id ?? null, portalKey: primary?.portal.key ?? null, portalName: primary?.portal.name ?? null }), matchScore: fit.score, matchReasons: fit.reasons, matchComponents: fit.components, quality: noticeQuality(notice), sources: sources.map((row) => ({ ...row.source, portal: row.portal })), documents };
  }

  async save(auth: AuthContext, noticeId: string, workspaceId: string) {
    await this.requireWorkspacePermission(auth, workspaceId, "tender:update"); const notice = await this.requireNotice(noticeId);
    const created = await withTransaction(async (tx) => {
      const inserted = await tx.insert(savedTenderNotices).values({ organizationId: auth.organizationId, workspaceId, noticeId, savedBy: auth.userId }).onConflictDoNothing({ target: [savedTenderNotices.workspaceId, savedTenderNotices.noticeId] }).returning();
      if (!inserted.length) return false;
      await this.audit.record({ organizationId: auth.organizationId, workspaceId, actorId: auth.userId, action: "tender_notice.saved", entityType: "tender_notice", entityId: noticeId, newValue: { saved: true } }, tx);
      await this.activity.record({ organizationId: auth.organizationId, workspaceId, actorId: auth.userId, label: `Saved tender notice ${notice.title}`, action: "tender_notice.saved", entityType: "tender_notice", entityId: noticeId, summary: `Saved tender notice ${notice.title}` }, tx);
      return true;
    });
    await this.recordEvent(auth, workspaceId, "SAVE", { noticeId });
    return { noticeId, workspaceId, saved: true, created };
  }

  async unsave(auth: AuthContext, noticeId: string, workspaceId: string) {
    await this.requireWorkspacePermission(auth, workspaceId, "tender:update");
    const notice = await this.requireNotice(noticeId);
    const removed = await withTransaction(async (tx) => {
      const removed = await tx.delete(savedTenderNotices).where(and(eq(savedTenderNotices.organizationId, auth.organizationId), eq(savedTenderNotices.workspaceId, workspaceId), eq(savedTenderNotices.noticeId, noticeId))).returning();
      if (!removed.length) return false;
      await this.audit.record({ organizationId: auth.organizationId, workspaceId, actorId: auth.userId, action: "tender_notice.unsaved", entityType: "tender_notice", entityId: noticeId, previousValue: { saved: true }, newValue: { saved: false } }, tx);
      await this.activity.record({ organizationId: auth.organizationId, workspaceId, actorId: auth.userId, label: `Removed saved tender notice ${notice.title}`, action: "tender_notice.unsaved", entityType: "tender_notice", entityId: noticeId, summary: `Removed saved tender notice ${notice.title}` }, tx);
      return true;
    });
    await this.recordEvent(auth, workspaceId, "UNSAVE", { noticeId });
    return { noticeId, workspaceId, saved: false, removed };
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
    await this.recordEvent(auth, workspaceId, "APPLICATION_CREATE", { noticeId });
    return result;
  }

  async compare(auth: AuthContext, input: CompareTenderDiscoveryInput) {
    await this.requireWorkspacePermission(auth, input.workspaceId, "tender:read");
    const items = await Promise.all(input.noticeIds.map((id) => this.get(auth, id, input.workspaceId, false)));
    await this.recordEvent(auth, input.workspaceId, "COMPARE", { filters: { count: items.length } });
    return { items };
  }

  async bulkSave(auth: AuthContext, input: BulkTenderDiscoveryInput, saved: boolean) {
    await this.requireWorkspacePermission(auth, input.workspaceId, "tender:update");
    const results = await Promise.all(input.noticeIds.map(async (noticeId) => {
      try {
        const changed = saved
          ? (await this.save(auth, noticeId, input.workspaceId)).created
          : (await this.unsave(auth, noticeId, input.workspaceId)).removed;
        return { noticeId, ok: true, saved, status: changed ? "success" : "duplicate" };
      } catch (error) { return { noticeId, ok: false, status: error instanceof ForbiddenException ? "permission" : "failure", error: error instanceof Error ? error.message : "Action failed" }; }
    }));
    return { results };
  }

  async bulkStartApplications(auth: AuthContext, input: BulkTenderDiscoveryInput) {
    await this.requireWorkspacePermission(auth, input.workspaceId, "tender:create");
    const results = await Promise.all(input.noticeIds.map(async (noticeId) => {
      try { const result = await this.startApplication(auth, noticeId, input.workspaceId); return { noticeId, ok: true, status: result.created ? "success" : "duplicate", ...result }; }
      catch (error) { return { noticeId, ok: false, status: error instanceof ForbiddenException ? "permission" : "failure", error: error instanceof Error ? error.message : "Application could not be created" }; }
    }));
    return { results };
  }

  async exportCsv(auth: AuthContext, input: ListTenderDiscoveryInput) {
    const workspaceId = await this.resolveWorkspace(auth, input.workspaceId);
    const q = input.q?.trim();
    const vector = sql`"tender_notices"."search_vector"`;
    const query = q ? sql`websearch_to_tsquery('english', ${q})` : null;
    const prefix = q ? q.match(/[\p{L}\p{N}]+/gu)?.slice(0, 8).map((term) => `${term}:*`).join(" & ") : null;
    const rows = await this.db.select().from(tenderNotices).where(this.discoveryWhere(auth, workspaceId, input, vector, query, undefined, prefix ? sql`to_tsquery('simple', ${prefix})` : null)).orderBy(desc(tenderNotices.publishedAt), desc(tenderNotices.id)).limit(10_000);
    const headers = ["Reference", "Title", "Buyer", "Category", "State", "Value", "Currency", "Published", "Deadline", "Status", "Source URL"];
    const lines = rows.map((row) => [row.referenceNumber, row.title, row.buyerName, row.category, row.state, row.estimatedValue, row.currency, row.publishedAt?.toISOString(), row.deadlineAt?.toISOString(), row.status, row.sourceUrl].map(csvCell).join(","));
    await this.recordEvent(auth, workspaceId, "EXPORT", { resultCount: rows.length, filters: analyticsFilters(input) });
    return `\uFEFF${headers.join(",")}\r\n${lines.join("\r\n")}`;
  }

  async savedSearches(auth: AuthContext, workspaceId: string) {
    await this.requireWorkspacePermission(auth, workspaceId, "tender:read");
    return { items: await this.db.select().from(tenderSavedSearches).where(and(eq(tenderSavedSearches.organizationId, auth.organizationId), eq(tenderSavedSearches.workspaceId, workspaceId), eq(tenderSavedSearches.userId, auth.userId))).orderBy(desc(tenderSavedSearches.updatedAt)) };
  }

  async createSavedSearch(auth: AuthContext, input: SavedSearchInput) {
    await this.requireWorkspacePermission(auth, input.workspaceId, "tender:read");
    const [row] = await this.db.insert(tenderSavedSearches).values({ organizationId: auth.organizationId, workspaceId: input.workspaceId, userId: auth.userId, name: input.name, query: input.query, cadence: input.cadence, enabled: input.enabled, nextEvaluationAt: new Date() }).returning();
    return row;
  }

  async updateSavedSearch(auth: AuthContext, id: string, input: UpdateSavedSearchInput) {
    await this.requireWorkspacePermission(auth, input.workspaceId, "tender:read");
    const [row] = await this.db.update(tenderSavedSearches).set({ ...(input.name === undefined ? {} : { name: input.name }), ...(input.query === undefined ? {} : { query: input.query }), ...(input.cadence === undefined ? {} : { cadence: input.cadence }), ...(input.enabled === undefined ? {} : { enabled: input.enabled }), nextEvaluationAt: new Date(), updatedAt: new Date() }).where(and(eq(tenderSavedSearches.id, id), eq(tenderSavedSearches.organizationId, auth.organizationId), eq(tenderSavedSearches.workspaceId, input.workspaceId), eq(tenderSavedSearches.userId, auth.userId))).returning();
    if (!row) throw new NotFoundException({ code: "SAVED_SEARCH_NOT_FOUND", message: "Saved search not found." });
    return row;
  }

  async deleteSavedSearch(auth: AuthContext, id: string, workspaceId: string) {
    await this.requireWorkspacePermission(auth, workspaceId, "tender:read");
    const removed = await this.db.delete(tenderSavedSearches).where(and(eq(tenderSavedSearches.id, id), eq(tenderSavedSearches.organizationId, auth.organizationId), eq(tenderSavedSearches.workspaceId, workspaceId), eq(tenderSavedSearches.userId, auth.userId))).returning({ id: tenderSavedSearches.id });
    if (!removed.length) throw new NotFoundException({ code: "SAVED_SEARCH_NOT_FOUND", message: "Saved search not found." });
  }

  async matchProfile(auth: AuthContext) { return this.getMatchProfile(auth.organizationId); }

  async updateMatchProfile(auth: AuthContext, input: TenderMatchProfileInput) {
    const values = { organizationId: auth.organizationId, capabilityKeywords: input.capabilityKeywords, preferredCategories: input.preferredCategories, preferredStates: input.preferredStates, certifications: input.certifications, industry: input.industry, minimumValue: input.minimumValue === null ? null : String(input.minimumValue), maximumValue: input.maximumValue === null ? null : String(input.maximumValue), updatedBy: auth.userId, updatedAt: new Date() };
    const [row] = await this.db.insert(tenderMatchProfiles).values(values).onConflictDoUpdate({ target: tenderMatchProfiles.organizationId, set: values }).returning();
    if (!row) throw new BadRequestException("Unable to save the tender match profile.");
    return this.serializeMatchProfile(row);
  }

  async analytics(auth: AuthContext, input: TenderAnalyticsInput) {
    await this.requireWorkspacePermission(auth, input.workspaceId, "tender:read");
    const since = new Date(Date.now() - input.days * 86_400_000);
    const events = await this.db.select({ eventType: tenderDiscoveryEvents.eventType, count: sql<number>`count(*)`, zeroResults: sql<number>`count(*) filter (where ${tenderDiscoveryEvents.resultCount} = 0)`, averageDurationMs: sql<number | null>`avg(${tenderDiscoveryEvents.durationMs})`, p95DurationMs: sql<number | null>`percentile_cont(0.95) within group (order by ${tenderDiscoveryEvents.durationMs})` }).from(tenderDiscoveryEvents).where(and(eq(tenderDiscoveryEvents.organizationId, auth.organizationId), eq(tenderDiscoveryEvents.workspaceId, input.workspaceId), gte(tenderDiscoveryEvents.createdAt, since))).groupBy(tenderDiscoveryEvents.eventType);
    const topFilters = await this.db.execute(sql`select key, count(*)::int as count from tender_discovery_events e cross join lateral jsonb_object_keys(e.filters) key where e.organization_id = ${auth.organizationId} and e.workspace_id = ${input.workspaceId} and e.created_at >= ${since.toISOString()}::timestamptz and e.event_type = 'SEARCH' group by key order by count(*) desc limit 10`);
    const [coverage] = await this.db.select({
      registeredSources: sql<number>`count(*)`,
      enabledSources: sql<number>`count(*) filter (where ${tenderPortals.enabled})`,
      healthySources: sql<number>`count(*) filter (where ${tenderPortals.enabled} and ${tenderPortals.health} = 'HEALTHY')`,
      staleSources: sql<number>`count(*) filter (where ${tenderPortals.enabled} and (${tenderPortals.lastSuccessAt} is null or ${tenderPortals.lastSuccessAt} < now() - (${tenderPortals.scheduleMinutes} * 2 * interval '1 minute')))`,
      freshestAt: sql<Date | null>`max(${tenderPortals.lastSuccessAt})`,
    }).from(tenderPortals);
    const count = (type: string) => Number(events.find((row) => row.eventType === type)?.count ?? 0);
    const searches = count("SEARCH"); const details = count("DETAIL_VIEW"); const saves = count("SAVE"); const applications = count("APPLICATION_CREATE");
    return { days: input.days, events: events.map((row) => ({ ...row, count: Number(row.count), zeroResults: Number(row.zeroResults), averageDurationMs: row.averageDurationMs === null ? null : Number(row.averageDurationMs), p95DurationMs: row.p95DurationMs === null ? null : Number(row.p95DurationMs) })), topFilters: (topFilters as unknown as Array<{ key: string; count: number }>).map((row) => ({ key: row.key, count: Number(row.count) })), funnel: { searches, details, saves, applications, resultToDetail: searches ? details / searches : 0, detailToSave: details ? saves / details : 0, saveToApplication: saves ? applications / saves : 0 }, sourceCoverage: { registeredSources: Number(coverage?.registeredSources ?? 0), enabledSources: Number(coverage?.enabledSources ?? 0), healthySources: Number(coverage?.healthySources ?? 0), staleSources: Number(coverage?.staleSources ?? 0), freshestAt: coverage?.freshestAt?.toISOString() ?? null } };
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
      lastRunQuality: sql<Record<string, number>>`coalesce((select r.completeness from tender_sync_runs r where r.portal_id = ${tenderPortals.id} order by r.started_at desc limit 1), '{}'::jsonb)`,
      lastRunRejected: sql<number>`coalesce((select r.rejected_count from tender_sync_runs r where r.portal_id = ${tenderPortals.id} order by r.started_at desc limit 1), 0)`,
      lastRunDuplicates: sql<number>`coalesce((select r.duplicate_count from tender_sync_runs r where r.portal_id = ${tenderPortals.id} order by r.started_at desc limit 1), 0)`,
      lastRunInserted: sql<number>`coalesce((select r.inserted_count from tender_sync_runs r where r.portal_id = ${tenderPortals.id} order by r.started_at desc limit 1), 0)`,
      lastRunUpdated: sql<number>`coalesce((select r.updated_count from tender_sync_runs r where r.portal_id = ${tenderPortals.id} order by r.started_at desc limit 1), 0)`,
      lastRunStale: sql<number>`coalesce((select r.stale_count from tender_sync_runs r where r.portal_id = ${tenderPortals.id} order by r.started_at desc limit 1), 0)`,
      openAlerts: sql<number>`(select count(*) from tender_ingestion_alerts a where a.portal_id = ${tenderPortals.id} and a.status = 'OPEN')`,
    }).from(tenderPortals).orderBy(desc(tenderPortals.enabled), asc(tenderPortals.name));
    return { items: rows.map((row) => ({ ...row.portal, noticeCount: Number(row.noticeCount), currentCount: Number(row.currentCount), lastRunStatus: row.lastRunStatus, lastRunDiscovered: row.lastRunDiscovered === null ? null : Number(row.lastRunDiscovered), lastRunQuality: row.lastRunQuality, lastRunRejected: Number(row.lastRunRejected), lastRunDuplicates: Number(row.lastRunDuplicates), lastRunInserted: Number(row.lastRunInserted), lastRunUpdated: Number(row.lastRunUpdated), lastRunStale: Number(row.lastRunStale), readinessReason: row.portal.metadata.connectorVerified === true ? row.portal.enabled ? null : "Verified and ready for platform activation" : "Connector verification or licensed feed required", openAlerts: Number(row.openAlerts), isPlatformAdmin: Boolean(auth.isPlatformAdmin) })) };
  }

  async sourceQualityHistory(auth: AuthContext, portalKey: string) {
    if (!auth.isPlatformAdmin && auth.role !== "OWNER" && auth.role !== "ADMIN")
      throw new ForbiddenException({ code: "TENDER_SOURCE_HEALTH_FORBIDDEN", message: "Organization administrator access is required." });
    const [portal] = await this.db.select({ id: tenderPortals.id }).from(tenderPortals).where(eq(tenderPortals.key, portalKey)).limit(1);
    if (!portal) throw new NotFoundException({ code: "TENDER_PORTAL_NOT_FOUND", message: "Tender portal not found." });
    return { items: await this.db.select().from(tenderSyncRuns).where(eq(tenderSyncRuns.portalId, portal.id)).orderBy(desc(tenderSyncRuns.startedAt)).limit(50) };
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
    if (enabled && !portal.lastSuccessAt)
      throw new BadRequestException({ code: "TENDER_CONNECTOR_SMOKE_SYNC_REQUIRED", message: "Run a successful smoke sync before activating this connector." });
    await withTransaction(async (tx) => {
      await tx.update(tenderPortals).set({ enabled, health: enabled ? "PENDING" : "DISABLED", updatedAt: new Date() }).where(eq(tenderPortals.id, portal.id));
      await tx.insert(tenderPortalEvents).values({ portalId: portal.id, actorId: auth.userId, action: enabled ? "portal.enabled" : "portal.disabled", metadata: { portalKey } });
    });
    return { portalKey, enabled };
  }

  async syncPortal(auth: AuthContext, portalKey: string, mode: "HEAD" | "BACKFILL" | "FULL_REFRESH" | "RECONCILE" = "HEAD") {
    this.requirePlatformAdmin(auth);
    const [portal] = await this.db.select().from(tenderPortals).where(eq(tenderPortals.key, portalKey)).limit(1);
    if (!portal) throw new NotFoundException({ code: "TENDER_PORTAL_NOT_FOUND", message: "Tender portal not found." });
    const smoke = !portal.enabled;
    if (smoke && portal.metadata.connectorVerified !== true) throw new BadRequestException({ code: "TENDER_CONNECTOR_NOT_VERIFIED", message: "Only verified connectors can run a pre-activation smoke sync." });
    const windowStartedAt = new Date().toISOString();
    const queued = await this.jobs.enqueueTenderPortalSync({ kind: "SYNC_PORTAL", portalId: portal.id, portalKey, windowStartedAt, mode, scope: smoke ? { smoke: true } : undefined });
    await this.db.insert(tenderPortalEvents).values({ portalId: portal.id, actorId: auth.userId, action: "portal.sync_requested", metadata: { jobId: queued.jobId, enqueued: queued.enqueued, mode } });
    return queued;
  }

  async resolvePlatformAlert(auth: AuthContext, alertId: string) {
    this.requirePlatformAdmin(auth);
    const [alert] = await this.db.update(tenderIngestionAlerts).set({ status: "RESOLVED", resolvedAt: new Date(), updatedAt: new Date() }).where(eq(tenderIngestionAlerts.id, alertId)).returning();
    if (!alert) throw new NotFoundException({ code: "TENDER_INGESTION_ALERT_NOT_FOUND", message: "Ingestion alert not found." });
    await this.db.insert(tenderPortalEvents).values({ portalId: alert.portalId, actorId: auth.userId, action: "alert.resolved", metadata: { alertId } });
    return alert;
  }

  async retryDocumentImport(auth: AuthContext, documentId: string, workspaceId: string) {
    await this.requireWorkspacePermission(auth, workspaceId, "tender:update");
    const [row] = await this.db.select({ document: tenderNoticeDocuments, tenderId: tenders.id }).from(tenderNoticeDocuments).innerJoin(tenders, and(eq(tenders.discoveryNoticeId, tenderNoticeDocuments.noticeId), eq(tenders.organizationId, auth.organizationId), eq(tenders.workspaceId, workspaceId))).where(eq(tenderNoticeDocuments.id, documentId)).limit(1);
    if (!row) throw new NotFoundException({ code: "TENDER_NOTICE_DOCUMENT_NOT_FOUND", message: "Document or draft application not found." });
    if (row.document.access !== "DIRECT") throw new BadRequestException({ code: "DOCUMENT_NOT_DIRECT", message: "This document must be opened on the source portal." });
    await this.db.update(tenderNoticeDocuments).set({ importStatus: "PENDING", lastError: null, updatedAt: new Date() }).where(eq(tenderNoticeDocuments.id, documentId));
    return this.jobs.enqueueTenderNoticeDocument({ kind: "IMPORT_DOCUMENT", organizationId: auth.organizationId, workspaceId, tenderId: row.tenderId, noticeDocumentId: documentId, actorId: auth.userId });
  }

  private discoveryWhere(auth: AuthContext, workspaceId: string, input: ListTenderDiscoveryInput, searchVector: ReturnType<typeof sql>, searchQuery: ReturnType<typeof sql> | null, omit?: string, prefixQuery?: ReturnType<typeof sql> | null) {
    const q = input.q?.trim();
    return and(
      q ? or(sql`${searchVector} @@ ${searchQuery}`, prefixQuery ? sql`${searchVector} @@ ${prefixQuery}` : undefined, sql`similarity(${tenderNotices.title}, ${q}) > 0.2`, sql`similarity(coalesce(${tenderNotices.referenceNumber}, ''), ${q}) > 0.25`, ilike(tenderNotices.title, `%${q}%`), ilike(tenderNotices.referenceNumber, `%${q}%`)) : undefined,
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

  private async discoveryFacets(auth: AuthContext, workspaceId: string, input: ListTenderDiscoveryInput, searchVector: ReturnType<typeof sql>, searchQuery: ReturnType<typeof sql> | null, prefixQuery: ReturnType<typeof sql> | null, baseWhere: ReturnType<typeof and>) {
    const [version] = await this.db.select({ value: sql<string>`greatest(coalesce(max(${tenderNotices.updatedAt}), 'epoch'), coalesce((select max(last_success_at) from tender_portals), 'epoch'))::text` }).from(tenderNotices);
    const key = `tender-facets:${createHash("sha256").update(JSON.stringify({ workspaceId, filters: analyticsFilters(input), version: version?.value })).digest("hex")}`;
    if (this.redis) {
      try {
        const cached = await this.redis.get(key);
        if (cached) return JSON.parse(cached) as { facets: unknown; coverage: unknown; catalog: unknown };
      } catch (error) {
        this.logger.warn(`Tender facet cache read failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const facetWhere = (omit: string) => this.discoveryWhere(auth, workspaceId, input, searchVector, searchQuery, omit, prefixQuery);
    const [portalRows, portalCounts, states, categories, authorityTypes, procurementTypes, statuses, availability, catalog] = await Promise.all([
      this.db.select().from(tenderPortals).orderBy(desc(tenderPortals.enabled), asc(tenderPortals.name)),
      this.db.select({ key: tenderPortals.key, count: sql<number>`count(distinct ${tenderNotices.id})` }).from(tenderPortals).leftJoin(tenderNoticeSources, eq(tenderNoticeSources.portalId, tenderPortals.id)).leftJoin(tenderNotices, eq(tenderNotices.id, tenderNoticeSources.noticeId)).where(facetWhere("portal")).groupBy(tenderPortals.key),
      this.db.select({ value: tenderNotices.state, count: sql<number>`count(*)` }).from(tenderNotices).where(and(isNotNull(tenderNotices.state), facetWhere("state"))).groupBy(tenderNotices.state).orderBy(asc(tenderNotices.state)),
      this.db.select({ value: tenderNotices.category, count: sql<number>`count(*)` }).from(tenderNotices).where(and(isNotNull(tenderNotices.category), facetWhere("category"))).groupBy(tenderNotices.category).orderBy(asc(tenderNotices.category)),
      this.db.select({ value: tenderNotices.authorityType, count: sql<number>`count(*)` }).from(tenderNotices).where(and(isNotNull(tenderNotices.authorityType), facetWhere("authorityType"))).groupBy(tenderNotices.authorityType).orderBy(asc(tenderNotices.authorityType)),
      this.db.select({ value: tenderNotices.procurementType, count: sql<number>`count(*)` }).from(tenderNotices).where(and(isNotNull(tenderNotices.procurementType), facetWhere("procurementType"))).groupBy(tenderNotices.procurementType).orderBy(asc(tenderNotices.procurementType)),
      this.db.select({ value: tenderNotices.status, count: sql<number>`count(*)` }).from(tenderNotices).where(facetWhere("status")).groupBy(tenderNotices.status).orderBy(asc(tenderNotices.status)),
      this.db.select({ buyer: sql<number>`count(${tenderNotices.buyerName})`, location: sql<number>`count(${tenderNotices.location})`, state: sql<number>`count(${tenderNotices.state})`, estimatedValue: sql<number>`count(${tenderNotices.estimatedValue})`, publishedAt: sql<number>`count(${tenderNotices.publishedAt})`, deadlineAt: sql<number>`count(${tenderNotices.deadlineAt})` }).from(tenderNotices).where(baseWhere),
      this.db.select({ indexed: sql<number>`count(*)`, active: sql<number>`count(*) filter (where ${tenderNotices.status} = 'ACTIVE')`, expired: sql<number>`count(*) filter (where ${tenderNotices.status} = 'EXPIRED')`, stale: sql<number>`count(*) filter (where ${tenderNotices.staleAt} is not null)` }).from(tenderNotices),
    ]);
    const countByPortal = new Map(portalCounts.map((row) => [row.key, Number(row.count)]));
    const portals = portalRows.map((portal) => ({ ...portal, count: countByPortal.get(portal.key) ?? 0 })); const enabled = portalRows.filter((portal) => portal.enabled);
    const result = { facets: { portals: portals.map((portal) => ({ ...portal, count: Number(portal.count) })), states: states.filter((row) => row.value).map((row) => ({ ...row, count: Number(row.count) })), categories: categories.filter((row) => row.value).map((row) => ({ ...row, count: Number(row.count) })), authorityTypes: authorityTypes.filter((row) => row.value).map((row) => ({ ...row, count: Number(row.count) })), procurementTypes: procurementTypes.filter((row) => row.value).map((row) => ({ ...row, count: Number(row.count) })), statuses: statuses.map((row) => ({ ...row, count: Number(row.count) })), availability: { buyer: Number(availability[0]?.buyer ?? 0), location: Number(availability[0]?.location ?? 0), state: Number(availability[0]?.state ?? 0), estimatedValue: Number(availability[0]?.estimatedValue ?? 0), publishedAt: Number(availability[0]?.publishedAt ?? 0), deadlineAt: Number(availability[0]?.deadlineAt ?? 0) } }, coverage: { registeredSources: portals.length, enabledSources: enabled.length, healthySources: enabled.filter((portal) => portal.health === "HEALTHY").length, degradedSources: enabled.filter((portal) => portal.health === "DEGRADED").length, lastRefreshedAt: enabled.map((portal) => portal.lastSuccessAt).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0]?.toISOString() ?? null }, catalog: { indexed: Number(catalog[0]?.indexed ?? 0), active: Number(catalog[0]?.active ?? 0), expired: Number(catalog[0]?.expired ?? 0), stale: Number(catalog[0]?.stale ?? 0) } };
    if (this.redis) {
      try { await this.redis.set(key, JSON.stringify(result), "EX", 300); }
      catch (error) { this.logger.warn(`Tender facet cache write failed: ${error instanceof Error ? error.message : String(error)}`); }
    }
    return result;
  }

  private requirePlatformAdmin(auth: AuthContext) {
    if (!auth.isPlatformAdmin) throw new ForbiddenException({ code: "PLATFORM_ADMIN_REQUIRED", message: "Platform administrator access is required." });
  }

  private async getMatchProfile(organizationId: string): Promise<MatchProfile | null> {
    const [profile, organization] = await Promise.all([
      this.db.select().from(tenderMatchProfiles).where(eq(tenderMatchProfiles.organizationId, organizationId)).limit(1),
      this.db.select({ industry: organizations.industry, operatingRegion: organizations.operatingRegion, profile: organizations.profile }).from(organizations).where(eq(organizations.id, organizationId)).limit(1),
    ]);
    if (profile[0]) return this.serializeMatchProfile(profile[0]);
    const org = organization[0]; if (!org) return null;
    const details = (org.profile ?? {}) as Record<string, unknown>;
    return { capabilityKeywords: stringArray(details.coreProducts), preferredCategories: [], preferredStates: org.operatingRegion ? [org.operatingRegion] : [], certifications: stringArray(details.certifications), industry: org.industry ?? null, minimumValue: null, maximumValue: null };
  }

  private serializeMatchProfile(row: typeof tenderMatchProfiles.$inferSelect): MatchProfile { return { capabilityKeywords: row.capabilityKeywords, preferredCategories: row.preferredCategories, preferredStates: row.preferredStates, certifications: row.certifications, industry: row.industry, minimumValue: row.minimumValue === null ? null : Number(row.minimumValue), maximumValue: row.maximumValue === null ? null : Number(row.maximumValue) }; }

  private async recordEvent(auth: AuthContext, workspaceId: string, eventType: string, input: { noticeId?: string; filters?: Record<string, unknown>; resultCount?: number; durationMs?: number; query?: string } = {}) {
    try {
      await this.db.insert(tenderDiscoveryEvents).values({ organizationId: auth.organizationId, workspaceId, userId: auth.userId, noticeId: input.noticeId, eventType, queryFingerprint: input.query ? createHash("sha256").update(input.query.trim().toLocaleLowerCase("en-IN")).digest("hex") : null, filters: input.filters ?? {}, resultCount: input.resultCount, durationMs: input.durationMs });
    } catch (error) {
      this.logger.warn(`Tender discovery event write failed (${eventType}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async requireNotice(id: string) { const [notice] = await this.db.select().from(tenderNotices).where(eq(tenderNotices.id, id)).limit(1); if (!notice) throw new NotFoundException({ code: "TENDER_NOTICE_NOT_FOUND", message: "Tender notice not found." }); return notice; }
  private async resolveWorkspace(auth: AuthContext, requested?: string) { const id = requested ?? auth.workspaceIds?.[0]; if (!id) throw new BadRequestException({ code: "WORKSPACE_REQUIRED", message: "Select a workspace to use tender discovery." }); await this.requireWorkspacePermission(auth, id, "tender:read"); return id; }
  private async requireWorkspacePermission(auth: AuthContext, workspaceId: string, permission: "tender:read" | "tender:update" | "tender:create") { if (!hasWorkspacePermission(auth, workspaceId, permission)) throw new ForbiddenException({ code: "TENDER_DISCOVERY_FORBIDDEN", message: `Missing ${permission} for this workspace.` }); const [workspace] = await this.db.select({ id: workspaces.id }).from(workspaces).where(and(eq(workspaces.id, workspaceId), eq(workspaces.organizationId, auth.organizationId))).limit(1); if (!workspace) throw new NotFoundException({ code: "WORKSPACE_NOT_FOUND", message: "Workspace not found." }); }
  private orderBy(sort: ListTenderDiscoveryInput["sort"], rank: ReturnType<typeof sql>, matchScore: ReturnType<typeof sql>) { if (sort === "newest") return [sql`${tenderNotices.publishedAt} DESC NULLS LAST`, desc(tenderNotices.id)]; if (sort === "deadline") return [sql`${tenderNotices.deadlineAt} ASC NULLS LAST`, desc(tenderNotices.id)]; if (sort === "value") return [sql`${tenderNotices.estimatedValue} DESC NULLS LAST`, desc(tenderNotices.id)]; if (sort === "updated") return [sql`${tenderNotices.updatedAt} DESC NULLS LAST`, desc(tenderNotices.id)]; if (sort === "companyFit") return [desc(matchScore), desc(tenderNotices.id)]; return [desc(rank), desc(tenderNotices.id)]; }

  private matchScoreSql(profile: MatchProfile | null) {
    if (!profile) return sql<number>`0`;
    const searchable = sql`lower(coalesce(${tenderNotices.title}, '') || ' ' || coalesce(${tenderNotices.description}, '') || ' ' || coalesce(${tenderNotices.buyerName}, '') || ' ' || coalesce(${tenderNotices.category}, ''))`;
    const located = sql`lower(coalesce(${tenderNotices.state}, '') || ' ' || coalesce(${tenderNotices.location}, ''))`;
    const any = (values: string[], target: ReturnType<typeof sql>) => values.length ? or(...values.map((value) => sql`${target} like ${`%${value.toLocaleLowerCase("en-IN")}%`}`)) : sql`false`;
    const category = any(profile.preferredCategories, searchable);
    const industry = profile.industry ? sql`${searchable} like ${`%${profile.industry.toLocaleLowerCase("en-IN")}%`}` : sql`false`;
    const value = profile.minimumValue !== null || profile.maximumValue !== null ? and(isNotNull(tenderNotices.estimatedValue), profile.minimumValue === null ? undefined : gte(tenderNotices.estimatedValue, String(profile.minimumValue)), profile.maximumValue === null ? undefined : lte(tenderNotices.estimatedValue, String(profile.maximumValue))) : sql`false`;
    return sql<number>`((case when ${any(profile.capabilityKeywords, searchable)} then 35 else 0 end) + (case when ${or(industry, category)} then 20 else 0 end) + (case when ${any(profile.preferredStates, located)} then 15 else 0 end) + (case when ${any(profile.certifications, searchable)} then 15 else 0 end) + (case when ${value} then 15 else 0 end))`;
  }

  private cursorWhere(sort: ListTenderDiscoveryInput["sort"], cursor: { id: string; value: string | number | null } | null, rank: ReturnType<typeof sql>, matchScore: ReturnType<typeof sql>) {
    if (!cursor) return undefined;
    const descending = (column: ReturnType<typeof sql>, value: unknown) => value === null ? lt(tenderNotices.id, cursor.id) : or(sql`${column} < ${value}`, and(sql`${column} = ${value}`, lt(tenderNotices.id, cursor.id)), isNull(column));
    if (sort === "deadline") return cursor.value === null ? lt(tenderNotices.id, cursor.id) : or(sql`${tenderNotices.deadlineAt} > ${new Date(String(cursor.value))}`, and(eq(tenderNotices.deadlineAt, new Date(String(cursor.value))), lt(tenderNotices.id, cursor.id)), isNull(tenderNotices.deadlineAt));
    if (sort === "newest") return descending(sql`${tenderNotices.publishedAt}`, cursor.value === null ? null : new Date(String(cursor.value)));
    if (sort === "updated") return descending(sql`${tenderNotices.updatedAt}`, new Date(String(cursor.value)));
    if (sort === "value") return descending(sql`${tenderNotices.estimatedValue}`, cursor.value);
    return descending(sort === "companyFit" ? matchScore : rank, cursor.value);
  }

  private cursorValue(sort: ListTenderDiscoveryInput["sort"], notice: typeof tenderNotices.$inferSelect, rank: number, fit: number) { if (sort === "deadline") return notice.deadlineAt?.toISOString() ?? null; if (sort === "newest") return notice.publishedAt?.toISOString() ?? null; if (sort === "updated") return notice.updatedAt.toISOString(); if (sort === "value") return notice.estimatedValue === null ? null : Number(notice.estimatedValue); return sort === "companyFit" ? fit : rank; }
}

function serializeNotice(row: typeof tenderNotices.$inferSelect, extra: { saved: boolean; applicationTenderId: string | null; portalKey: string | null; portalName: string | null }) { return { ...row, estimatedValue: row.estimatedValue === null ? null : Number(row.estimatedValue), emdAmount: row.emdAmount === null ? null : Number(row.emdAmount), documentFee: row.documentFee === null ? null : Number(row.documentFee), publishedAt: row.publishedAt?.toISOString() ?? null, bidStartsAt: row.bidStartsAt?.toISOString() ?? null, deadlineAt: row.deadlineAt?.toISOString() ?? null, opensAt: row.opensAt?.toISOString() ?? null, sourceUpdatedAt: row.sourceUpdatedAt?.toISOString() ?? null, firstSeenAt: row.firstSeenAt.toISOString(), lastSeenAt: row.lastSeenAt.toISOString(), staleAt: row.staleAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), ...extra }; }

function noticeQuality(row: typeof tenderNotices.$inferSelect) { const fields = [row.referenceNumber, row.buyerName, row.deadlineAt, row.category, row.state, row.estimatedValue]; const complete = fields.filter((value) => value !== null && value !== "").length; return { score: Math.round((complete / fields.length) * 100), missing: [!row.referenceNumber && "referenceNumber", !row.buyerName && "buyer", !row.deadlineAt && "deadline", !row.category && "category", !row.state && "state", row.estimatedValue === null && "estimatedValue"].filter(Boolean) }; }
function matchedTerms(query: string, row: typeof tenderNotices.$inferSelect) { const text = [row.title, row.referenceNumber, row.description, row.buyerName, row.category].filter(Boolean).join(" ").toLocaleLowerCase("en-IN"); return [...new Set(query.match(/[\p{L}\p{N}]+/gu)?.map((term) => term.toLocaleLowerCase("en-IN")).filter((term) => term.length > 1 && text.includes(term)) ?? [])].slice(0, 10); }
function stringArray(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : []; }
function analyticsFilters(input: ListTenderDiscoveryInput) { const { q: _q, cursor: _cursor, page: _page, pageSize: _pageSize, ...filters } = input; return Object.fromEntries(Object.entries(filters).filter(([key, value]) => value !== undefined && value !== null && value !== "" && !(key === "sort" && value === "relevance") && !(key === "freshness" && value === "current"))) as Record<string, unknown>; }
