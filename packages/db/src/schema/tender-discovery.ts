import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { timestamps } from "./_shared";
import { workspaces } from "./foundation";
import { users } from "./identity";
import { organizations } from "./organization";

export const tenderPortalCategoryEnum = pgEnum("tender_portal_category", [
  "CENTRAL",
  "DEFENCE",
  "RAILWAYS",
  "STATE",
  "PSU",
]);
export const tenderConnectorTypeEnum = pgEnum("tender_connector_type", [
  "GEM",
  "GEPNIC",
  "IREPS",
  "DEFPROC",
  "CUSTOM",
]);
export const tenderPortalHealthEnum = pgEnum("tender_portal_health", [
  "PENDING",
  "HEALTHY",
  "DEGRADED",
  "DISABLED",
]);
export const tenderSyncStatusEnum = pgEnum("tender_sync_status", [
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
]);
export const tenderSyncModeEnum = pgEnum("tender_sync_mode", [
  "HEAD",
  "BACKFILL",
  "FULL_REFRESH",
  "RECONCILE",
]);
export const tenderIngestionAlertStatusEnum = pgEnum("tender_ingestion_alert_status", [
  "OPEN",
  "RESOLVED",
]);
export const tenderIngestionAlertKindEnum = pgEnum("tender_ingestion_alert_kind", [
  "CONSECUTIVE_FAILURES",
  "STALE_SOURCE",
  "CURSOR_STALLED",
  "VOLUME_ANOMALY",
]);
export const tenderNoticeStatusEnum = pgEnum("tender_notice_status", [
  "ACTIVE",
  "CLOSED",
  "CANCELLED",
  "AWARDED",
  "EXPIRED",
  "UNKNOWN",
]);
export const tenderNoticeDocumentAccessEnum = pgEnum("tender_notice_document_access", [
  "DIRECT",
  "EXTERNAL",
  "AUTHENTICATED",
]);
export const tenderDocumentImportStatusEnum = pgEnum("tender_document_import_status", [
  "PENDING",
  "IMPORTED",
  "FAILED",
  "NOT_APPLICABLE",
]);
export const tenderSavedSearchCadenceEnum = pgEnum("tender_saved_search_cadence", [
  "IMMEDIATE",
  "DAILY",
]);

export const tenderPortals = pgTable(
  "tender_portals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    category: tenderPortalCategoryEnum("category").notNull(),
    state: text("state"),
    officialUrl: text("official_url").notNull(),
    connectorType: tenderConnectorTypeEnum("connector_type").notNull(),
    scheduleMinutes: integer("schedule_minutes").notNull().default(60),
    syncCursor: text("sync_cursor"),
    syncState: jsonb("sync_state").$type<Record<string, unknown>>().notNull().default({}),
    lastFullSyncAt: timestamp("last_full_sync_at", { withTimezone: true }),
    backfillCompletedAt: timestamp("backfill_completed_at", { withTimezone: true }),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    enabled: boolean("enabled").notNull().default(false),
    health: tenderPortalHealthEnum("health").notNull().default("PENDING"),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastError: text("last_error"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("tender_portals_key_uq").on(t.key),
    index("tender_portals_enabled_health_idx").on(t.enabled, t.health),
    index("tender_portals_category_idx").on(t.category),
  ],
);

export const tenderSyncRuns = pgTable(
  "tender_sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portalId: uuid("portal_id")
      .notNull()
      .references(() => tenderPortals.id, { onDelete: "cascade" }),
    status: tenderSyncStatusEnum("status").notNull().default("RUNNING"),
    mode: tenderSyncModeEnum("mode").notNull().default("HEAD"),
    scope: jsonb("scope").$type<Record<string, unknown>>().notNull().default({}),
    fullSnapshot: boolean("full_snapshot").notNull().default(false),
    cursor: text("cursor"),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }),
    discoveredCount: integer("discovered_count").notNull().default(0),
    parsedCount: integer("parsed_count").notNull().default(0),
    rejectedCount: integer("rejected_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    staleCount: integer("stale_count").notNull().default(0),
    insertedCount: integer("inserted_count").notNull().default(0),
    updatedCount: integer("updated_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    failureReason: text("failure_reason"),
    completeness: jsonb("completeness").$type<Record<string, number>>().notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index("tender_sync_runs_portal_started_idx").on(t.portalId, t.startedAt)],
);

export const tenderSourceRecords = pgTable(
  "tender_source_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portalId: uuid("portal_id")
      .notNull()
      .references(() => tenderPortals.id, { onDelete: "cascade" }),
    syncRunId: uuid("sync_run_id").references(() => tenderSyncRuns.id, { onDelete: "set null" }),
    sourceNoticeKey: text("source_notice_key").notNull(),
    payloadHash: text("payload_hash").notNull(),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull(),
    accepted: boolean("accepted").notNull().default(true),
    rejectionReason: text("rejection_reason"),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tender_source_records_version_uq").on(
      t.portalId,
      t.sourceNoticeKey,
      t.payloadHash,
    ),
    index("tender_source_records_portal_notice_idx").on(t.portalId, t.sourceNoticeKey),
  ],
);

export const tenderNotices = pgTable(
  "tender_notices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    canonicalKey: text("canonical_key").notNull(),
    title: text("title").notNull(),
    referenceNumber: text("reference_number"),
    description: text("description").notNull().default(""),
    buyerName: text("buyer_name"),
    authorityType: text("authority_type"),
    location: text("location"),
    state: text("state"),
    category: text("category"),
    procurementType: text("procurement_type"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    bidStartsAt: timestamp("bid_starts_at", { withTimezone: true }),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    opensAt: timestamp("opens_at", { withTimezone: true }),
    estimatedValue: numeric("estimated_value", { precision: 18, scale: 2 }),
    currency: text("currency").notNull().default("INR"),
    emdAmount: numeric("emd_amount", { precision: 18, scale: 2 }),
    documentFee: numeric("document_fee", { precision: 18, scale: 2 }),
    status: tenderNoticeStatusEnum("status").notNull().default("UNKNOWN"),
    sourceUrl: text("source_url").notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    missedSyncs: integer("missed_syncs").notNull().default(0),
    staleAt: timestamp("stale_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("tender_notices_canonical_key_uq").on(t.canonicalKey),
    index("tender_notices_status_deadline_idx").on(t.status, t.deadlineAt),
    index("tender_notices_state_idx").on(t.state),
    index("tender_notices_buyer_idx").on(t.buyerName),
    index("tender_notices_category_idx").on(t.category),
    index("tender_notices_value_idx").on(t.estimatedValue),
    index("tender_notices_updated_idx").on(t.updatedAt),
  ],
);

export const tenderNoticeSources = pgTable(
  "tender_notice_sources",
  {
    noticeId: uuid("notice_id")
      .notNull()
      .references(() => tenderNotices.id, { onDelete: "cascade" }),
    portalId: uuid("portal_id")
      .notNull()
      .references(() => tenderPortals.id, { onDelete: "cascade" }),
    sourceRecordId: uuid("source_record_id")
      .notNull()
      .references(() => tenderSourceRecords.id, { onDelete: "restrict" }),
    sourceNoticeKey: text("source_notice_key").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceStatus: tenderNoticeStatusEnum("source_status").notNull().default("UNKNOWN"),
    lastSeenRunId: uuid("last_seen_run_id").references(() => tenderSyncRuns.id, {
      onDelete: "set null",
    }),
    isPrimary: boolean("is_primary").notNull().default(false),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    missedSyncs: integer("missed_syncs").notNull().default(0),
    staleAt: timestamp("stale_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.noticeId, t.portalId] }),
    uniqueIndex("tender_notice_sources_portal_notice_uq").on(t.portalId, t.sourceNoticeKey),
    index("tender_notice_sources_record_idx").on(t.sourceRecordId),
    index("tender_notice_sources_freshness_idx").on(t.portalId, t.staleAt, t.lastSeenAt),
    index("tender_notice_sources_run_idx").on(t.lastSeenRunId),
  ],
);

export const platformAdministrators = pgTable("platform_administrators", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  grantedBy: uuid("granted_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tenderPortalEvents = pgTable(
  "tender_portal_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portalId: uuid("portal_id").notNull().references(() => tenderPortals.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tender_portal_events_portal_created_idx").on(t.portalId, t.createdAt)],
);

export const tenderIngestionAlerts = pgTable(
  "tender_ingestion_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portalId: uuid("portal_id").notNull().references(() => tenderPortals.id, { onDelete: "cascade" }),
    kind: tenderIngestionAlertKindEnum("kind").notNull(),
    status: tenderIngestionAlertStatusEnum("status").notNull().default("OPEN"),
    message: text("message").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tender_ingestion_alerts_open_uq")
      .on(t.portalId, t.kind)
      .where(sql`${t.status} = 'OPEN'`),
    index("tender_ingestion_alerts_status_idx").on(t.status, t.openedAt),
  ],
);

export const tenderNoticeDocuments = pgTable(
  "tender_notice_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    noticeId: uuid("notice_id")
      .notNull()
      .references(() => tenderNotices.id, { onDelete: "cascade" }),
    portalId: uuid("portal_id")
      .notNull()
      .references(() => tenderPortals.id, { onDelete: "cascade" }),
    sourceDocumentKey: text("source_document_key").notNull(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    access: tenderNoticeDocumentAccessEnum("access").notNull().default("EXTERNAL"),
    importStatus: tenderDocumentImportStatusEnum("import_status").notNull().default("PENDING"),
    importAttempts: integer("import_attempts").notNull().default(0),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    storageKey: text("storage_key"),
    lastError: text("last_error"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("tender_notice_documents_source_uq").on(t.portalId, t.sourceDocumentKey),
    index("tender_notice_documents_notice_idx").on(t.noticeId),
  ],
);

export const tenderMatchProfiles = pgTable(
  "tender_match_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    capabilityKeywords: text("capability_keywords").array().notNull().default([]),
    preferredCategories: text("preferred_categories").array().notNull().default([]),
    preferredStates: text("preferred_states").array().notNull().default([]),
    certifications: text("certifications").array().notNull().default([]),
    industry: text("industry"),
    minimumValue: numeric("minimum_value", { precision: 18, scale: 2 }),
    maximumValue: numeric("maximum_value", { precision: 18, scale: 2 }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("tender_match_profiles_org_uq").on(t.organizationId)],
);

export const tenderSavedSearches = pgTable(
  "tender_saved_searches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    query: jsonb("query").$type<Record<string, unknown>>().notNull().default({}),
    cadence: tenderSavedSearchCadenceEnum("cadence").notNull().default("DAILY"),
    enabled: boolean("enabled").notNull().default(true),
    lastEvaluatedAt: timestamp("last_evaluated_at", { withTimezone: true }),
    nextEvaluationAt: timestamp("next_evaluation_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("tender_saved_searches_due_idx").on(t.enabled, t.nextEvaluationAt),
    index("tender_saved_searches_owner_idx").on(t.organizationId, t.workspaceId, t.userId),
  ],
);

export const tenderSavedSearchMatches = pgTable(
  "tender_saved_search_matches",
  {
    searchId: uuid("search_id").notNull().references(() => tenderSavedSearches.id, { onDelete: "cascade" }),
    noticeId: uuid("notice_id").notNull().references(() => tenderNotices.id, { onDelete: "cascade" }),
    noticeVersion: text("notice_version").notNull(),
    matchedAt: timestamp("matched_at", { withTimezone: true }).notNull().defaultNow(),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.searchId, t.noticeId, t.noticeVersion] }),
    index("tender_saved_search_matches_notice_idx").on(t.noticeId),
  ],
);

export const tenderDiscoveryEvents = pgTable(
  "tender_discovery_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    noticeId: uuid("notice_id").references(() => tenderNotices.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    queryFingerprint: text("query_fingerprint"),
    filters: jsonb("filters").$type<Record<string, unknown>>().notNull().default({}),
    resultCount: integer("result_count"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tender_discovery_events_workspace_created_idx").on(t.workspaceId, t.createdAt),
    index("tender_discovery_events_type_created_idx").on(t.eventType, t.createdAt),
  ],
);

export const tenderDiscoveryDailyMetrics = pgTable(
  "tender_discovery_daily_metrics",
  {
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    day: timestamp("day", { withTimezone: true }).notNull(),
    eventType: text("event_type").notNull(),
    count: integer("count").notNull().default(0),
    zeroResultCount: integer("zero_result_count").notNull().default(0),
    averageDurationMs: real("average_duration_ms"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.day, t.eventType] })],
);

export const savedTenderNotices = pgTable(
  "saved_tender_notices",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    noticeId: uuid("notice_id")
      .notNull()
      .references(() => tenderNotices.id, { onDelete: "cascade" }),
    savedBy: uuid("saved_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.noticeId] }),
    index("saved_tender_notices_org_idx").on(t.organizationId),
    index("saved_tender_notices_notice_idx").on(t.noticeId),
  ],
);
