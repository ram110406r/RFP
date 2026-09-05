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
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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
    portalId: uuid("portal_id").notNull().references(() => tenderPortals.id, { onDelete: "cascade" }),
    status: tenderSyncStatusEnum("status").notNull().default("RUNNING"),
    cursor: text("cursor"),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }),
    discoveredCount: integer("discovered_count").notNull().default(0),
    insertedCount: integer("inserted_count").notNull().default(0),
    updatedCount: integer("updated_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    failureReason: text("failure_reason"),
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
    portalId: uuid("portal_id").notNull().references(() => tenderPortals.id, { onDelete: "cascade" }),
    syncRunId: uuid("sync_run_id").references(() => tenderSyncRuns.id, { onDelete: "set null" }),
    sourceNoticeKey: text("source_notice_key").notNull(),
    payloadHash: text("payload_hash").notNull(),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tender_source_records_version_uq").on(t.portalId, t.sourceNoticeKey, t.payloadHash),
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
    noticeId: uuid("notice_id").notNull().references(() => tenderNotices.id, { onDelete: "cascade" }),
    portalId: uuid("portal_id").notNull().references(() => tenderPortals.id, { onDelete: "cascade" }),
    sourceRecordId: uuid("source_record_id").notNull().references(() => tenderSourceRecords.id, { onDelete: "restrict" }),
    sourceNoticeKey: text("source_notice_key").notNull(),
    sourceUrl: text("source_url").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.noticeId, t.portalId] }),
    uniqueIndex("tender_notice_sources_portal_notice_uq").on(t.portalId, t.sourceNoticeKey),
    index("tender_notice_sources_record_idx").on(t.sourceRecordId),
  ],
);

export const tenderNoticeDocuments = pgTable(
  "tender_notice_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    noticeId: uuid("notice_id").notNull().references(() => tenderNotices.id, { onDelete: "cascade" }),
    portalId: uuid("portal_id").notNull().references(() => tenderPortals.id, { onDelete: "cascade" }),
    sourceDocumentKey: text("source_document_key").notNull(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    access: tenderNoticeDocumentAccessEnum("access").notNull().default("EXTERNAL"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("tender_notice_documents_source_uq").on(t.portalId, t.sourceDocumentKey),
    index("tender_notice_documents_notice_idx").on(t.noticeId),
  ],
);

export const savedTenderNotices = pgTable(
  "saved_tender_notices",
  {
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    noticeId: uuid("notice_id").notNull().references(() => tenderNotices.id, { onDelete: "cascade" }),
    savedBy: uuid("saved_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.noticeId] }),
    index("saved_tender_notices_org_idx").on(t.organizationId),
    index("saved_tender_notices_notice_idx").on(t.noticeId),
  ],
);
