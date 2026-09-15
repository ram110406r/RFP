import { getDb, notificationPreferences, notifications, savedTenderNotices, tenderNoticeSources, tenderNotices, tenderPortals, tenderSavedSearchMatches, tenderSavedSearches, tenders, users } from "@rfp-os/db";
import { and, eq, gte, ilike, isNotNull, isNull, lte, or, sql } from "drizzle-orm";

export class SavedSearchEvaluator {
  private readonly db = getDb();

  async evaluateDue(now = new Date()) {
    const searches = await this.db.select({ search: tenderSavedSearches, timezone: users.timezone }).from(tenderSavedSearches).innerJoin(users, eq(users.id, tenderSavedSearches.userId)).where(and(eq(tenderSavedSearches.enabled, true), or(isNull(tenderSavedSearches.nextEvaluationAt), lte(tenderSavedSearches.nextEvaluationAt, now)))).limit(100);
    for (const row of searches) await this.evaluate(row.search, row.timezone, now);
    return searches.length;
  }

  async maintainAnalytics() {
    await this.db.execute(sql`
      INSERT INTO tender_discovery_daily_metrics (organization_id, workspace_id, day, event_type, count, zero_result_count, average_duration_ms, metadata)
      SELECT organization_id, workspace_id, date_trunc('day', created_at), event_type, count(*), count(*) filter (where result_count = 0), avg(duration_ms), '{}'::jsonb
      FROM tender_discovery_events WHERE created_at >= date_trunc('day', now()) - interval '1 day'
      GROUP BY organization_id, workspace_id, date_trunc('day', created_at), event_type
      ON CONFLICT (workspace_id, day, event_type) DO UPDATE SET count = EXCLUDED.count, zero_result_count = EXCLUDED.zero_result_count, average_duration_ms = EXCLUDED.average_duration_ms
    `);
    await this.db.execute(sql`DELETE FROM tender_discovery_events WHERE created_at < now() - interval '90 days'`);
  }

  private async evaluate(search: typeof tenderSavedSearches.$inferSelect, timezone: string, now: Date) {
    const query = search.query as Record<string, unknown>;
    const since = search.lastEvaluatedAt ?? search.createdAt;
    const q = string(query.q);
    const vector = sql`"tender_notices"."search_vector"`;
    const conditions = and(
      gte(tenderNotices.updatedAt, since),
      q ? or(sql`${vector} @@ websearch_to_tsquery('english', ${q})`, ilike(tenderNotices.title, `%${q}%`), ilike(tenderNotices.referenceNumber, `%${q}%`)) : undefined,
      string(query.state) ? eq(tenderNotices.state, string(query.state)!) : undefined,
      string(query.category) ? eq(tenderNotices.category, string(query.category)!) : undefined,
      string(query.status) ? sql`${tenderNotices.status}::text = ${string(query.status)}` : undefined,
      string(query.buyer) ? ilike(tenderNotices.buyerName, `%${string(query.buyer)}%`) : undefined,
      string(query.authorityType) ? ilike(tenderNotices.authorityType, `%${string(query.authorityType)}%`) : undefined,
      string(query.location) ? ilike(tenderNotices.location, `%${string(query.location)}%`) : undefined,
      string(query.procurementType) ? ilike(tenderNotices.procurementType, `%${string(query.procurementType)}%`) : undefined,
      string(query.portal) ? sql`exists (select 1 from ${tenderNoticeSources} ns join ${tenderPortals} p on p.id = ns.portal_id where ns.notice_id = ${tenderNotices.id} and p.key = ${string(query.portal)})` : undefined,
      number(query.minValue) !== null ? gte(tenderNotices.estimatedValue, String(number(query.minValue))) : undefined,
      number(query.maxValue) !== null ? lte(tenderNotices.estimatedValue, String(number(query.maxValue))) : undefined,
      date(query.publishedFrom) ? gte(tenderNotices.publishedAt, date(query.publishedFrom)!) : undefined,
      date(query.publishedTo) ? lte(tenderNotices.publishedAt, date(query.publishedTo)!) : undefined,
      date(query.deadlineFrom) ? gte(tenderNotices.deadlineAt, date(query.deadlineFrom)!) : undefined,
      date(query.deadlineTo) ? lte(tenderNotices.deadlineAt, date(query.deadlineTo)!) : undefined,
      query.saved === true ? sql`exists (select 1 from ${savedTenderNotices} s where s.notice_id = ${tenderNotices.id} and s.organization_id = ${search.organizationId} and s.workspace_id = ${search.workspaceId})` : undefined,
      query.applied === true ? sql`exists (select 1 from ${tenders} t where t.discovery_notice_id = ${tenderNotices.id} and t.organization_id = ${search.organizationId} and t.workspace_id = ${search.workspaceId})` : undefined,
      query.freshness === "all" ? undefined : query.freshness === "stale" ? isNotNull(tenderNotices.staleAt) : isNull(tenderNotices.staleAt),
    );
    const notices = await this.db.select().from(tenderNotices).where(conditions).orderBy(tenderNotices.updatedAt).limit(500);
    const inserted: typeof notices = [];
    for (const notice of notices) {
      const version = notice.sourceUpdatedAt?.toISOString() ?? notice.updatedAt.toISOString();
      const match = await this.db.insert(tenderSavedSearchMatches).values({ searchId: search.id, noticeId: notice.id, noticeVersion: version }).onConflictDoNothing().returning();
      if (match.length) inserted.push(notice);
    }
    const [preference] = await this.db.select({ inApp: notificationPreferences.inApp }).from(notificationPreferences).where(and(eq(notificationPreferences.organizationId, search.organizationId), eq(notificationPreferences.category, "Tenders"))).limit(1);
    if (inserted.length && preference?.inApp !== false) {
      if (search.cadence === "IMMEDIATE") {
        for (const notice of inserted) await this.db.insert(notifications).values({ organizationId: search.organizationId, userId: search.userId, category: "Tenders", title: `New tender: ${notice.title}`, detail: `${search.name} matched ${notice.buyerName ?? "a new buyer"}.`, relatedEntityType: "tender_notice", relatedEntityId: notice.id });
      } else await this.db.insert(notifications).values({ organizationId: search.organizationId, userId: search.userId, category: "Tenders", title: `${inserted.length} new tender match${inserted.length === 1 ? "" : "es"}`, detail: `${search.name} has new results.`, relatedEntityType: "tender_saved_search", relatedEntityId: search.id });
      await this.db.update(tenderSavedSearchMatches).set({ notifiedAt: now }).where(and(eq(tenderSavedSearchMatches.searchId, search.id), isNull(tenderSavedSearchMatches.notifiedAt)));
    }
    await this.db.update(tenderSavedSearches).set({ lastEvaluatedAt: now, nextEvaluationAt: search.cadence === "IMMEDIATE" ? new Date(now.getTime() + 60_000) : nextLocalMorning(now, timezone), updatedAt: now }).where(eq(tenderSavedSearches.id, search.id));
  }
}

function string(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function number(value: unknown) { const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN; return Number.isFinite(parsed) ? parsed : null; }
function date(value: unknown) { if (typeof value !== "string") return null; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? null : parsed; }
export function nextLocalMorning(now: Date, timezone: string) {
  let parts: Intl.DateTimeFormatPart[];
  try { parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone || "UTC", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now); }
  catch { parts = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now); }
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const delta = (8 * 60 - (hour * 60 + minute) + 1440) % 1440 || 1440;
  return new Date(now.getTime() + delta * 60_000);
}
