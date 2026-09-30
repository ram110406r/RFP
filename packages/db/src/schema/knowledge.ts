import { sql } from "drizzle-orm";
import {
  bigint,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

import { requirementCategoryEnum, timestamps } from "./_shared";
import { files } from "./files";
import { users } from "./identity";
import { organizations } from "./organization";

/**
 * Fixed by migration 0038. Changing embedding models is a re-embed (chunks
 * record their model); changing dimension is a migration.
 */
export const KNOWLEDGE_EMBEDDING_DIMENSIONS = 1024;

/**
 * How much weight a source carries when two sources disagree — the seed of
 * the authority hierarchy the conflict engine enforces.
 */
export const authorityEnum = pgEnum("authority", ["high", "medium", "low"]);
export const responseTemplateStatusEnum = pgEnum("response_template_status", ["DRAFT", "ACTIVE", "ARCHIVED"]);
export const knowledgeLifecycleStatusEnum = pgEnum("knowledge_lifecycle_status", ["DRAFT", "ACTIVE", "ARCHIVED"]);
export const knowledgeDocumentStatusEnum = pgEnum("knowledge_document_status", [
  "uploaded",
  "queued",
  "processing",
  "parsed",
  "embedded",
  "failed",
]);
export const knowledgeRevisionStatusEnum = pgEnum("knowledge_revision_status", ["PENDING", "APPLIED", "REJECTED"]);
export const knowledgeClaimStatusEnum = pgEnum("knowledge_claim_status", ["ACTIVE", "SUGGESTED", "REJECTED"]);

export type KnowledgeReviewStateValue = "fresh" | "stale" | "expiring" | "expired" | "unverified";

/**
 * The organization's shared knowledge layer. Deliberately NOT an RFP-specific
 * knowledge base: RFP answers cite these sources through rfp_evidence, so the
 * same source powers every RFP rather than being copied per deal.
 *
 * A source is either hand-written (summary + claims) or document-backed:
 * uploads land in knowledge_documents and are chunked into knowledge_chunks
 * with a full-text vector and an embedding for hybrid retrieval.
 *
 * `lifecycle_status` is the approval state; `review_state` is maintained by
 * the worker's lifecycle sweep from the shared freshness rule in
 * @rfp-os/types (knowledge-freshness.ts). The API still mirrors the lifecycle
 * into `metadata.lifecycleStatus` for older readers.
 */
export const knowledgeSources = pgTable(
  "knowledge_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull(),
    category: requirementCategoryEnum("category").notNull(),
    version: text("version").notNull().default("1.0"),
    authority: authorityEnum("authority").notNull().default("medium"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    lastVerified: date("last_verified"),
    lastUpdated: date("last_updated"),
    expiresAt: date("expires_at"),
    summary: text("summary").notNull().default(""),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    lifecycleStatus: knowledgeLifecycleStatusEnum("lifecycle_status").notNull().default("ACTIVE"),
    reviewState: text("review_state").$type<KnowledgeReviewStateValue>(),
    reviewStateChangedAt: timestamp("review_state_changed_at", { withTimezone: true }),
    usageCount: integer("usage_count").notNull().default(0),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("knowledge_sources_org_idx").on(t.organizationId),
    index("knowledge_sources_org_status_idx").on(t.organizationId, t.lifecycleStatus),
    index("knowledge_sources_expires_idx").on(t.expiresAt),
    index("knowledge_sources_last_verified_idx").on(t.lastVerified),
  ],
);

/** An uploaded file backing a knowledge source. */
export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    version: integer("version").notNull().default(1),
    checksumSha256: text("checksum_sha256"),
    status: knowledgeDocumentStatusEnum("status").notNull().default("uploaded"),
    failureReason: text("failure_reason"),
    pageCount: integer("page_count"),
    chunkCount: integer("chunk_count").notNull().default(0),
    processingStartedAt: timestamp("processing_started_at", { withTimezone: true }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("knowledge_documents_org_idx").on(t.organizationId),
    index("knowledge_documents_source_idx").on(t.sourceId),
    index("knowledge_documents_status_idx").on(t.status),
    uniqueIndex("knowledge_documents_source_checksum_uq")
      .on(t.sourceId, t.checksumSha256)
      .where(sql`${t.checksumSha256} IS NOT NULL`),
  ],
);

/**
 * A retrievable passage of a knowledge document. The generated
 * `search_vector` tsvector column exists in the database (migration 0038)
 * but is not modelled here — it is only ever read through raw SQL.
 */
export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    pageNumber: integer("page_number"),
    heading: text("heading"),
    text: text("text").notNull(),
    tokenCount: integer("token_count").notNull().default(0),
    contentHash: text("content_hash").notNull(),
    embedding: vector("embedding", { dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS }),
    embeddingModel: text("embedding_model"),
    embeddedAt: timestamp("embedded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("knowledge_chunks_org_source_idx").on(t.organizationId, t.sourceId),
    uniqueIndex("knowledge_chunks_document_ordinal_uq").on(t.documentId, t.ordinal),
  ],
);

/**
 * Discrete assertions from a source ("RPO", "4 hours"). Claim ids are cited
 * by tender answers, so they are updated in place and soft-deleted
 * (REJECTED), never recycled. AI-extracted claims start as SUGGESTED.
 */
export const knowledgeClaims = pgTable(
  "knowledge_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    value: text("value").notNull(),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull().default("0"),
    status: knowledgeClaimStatusEnum("status").notNull().default("ACTIVE"),
    origin: text("origin").$type<"manual" | "extracted">().notNull().default("manual"),
    documentId: uuid("document_id").references(() => knowledgeDocuments.id, { onDelete: "set null" }),
    chunkId: uuid("chunk_id").references(() => knowledgeChunks.id, { onDelete: "set null" }),
    /** Embedding of `label`, written lazily by conflict detection (migration 0040). */
    labelEmbedding: vector("label_embedding", { dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS }),
    labelEmbeddingModel: text("label_embedding_model"),
    ...timestamps,
  },
  (t) => [
    index("knowledge_claims_source_idx").on(t.sourceId),
    index("knowledge_claims_source_status_idx").on(t.sourceId, t.status),
  ],
);

export interface KnowledgeRevisionChanges {
  name?: string;
  type?: string;
  summary?: string;
  authority?: "high" | "medium" | "low";
  claims?: Array<{ id?: string; label: string; value: string; confidence?: number }>;
}

/** A pending content change to an ACTIVE source, applied on approval. */
export const knowledgeSourceRevisions = pgTable(
  "knowledge_source_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "cascade" }),
    status: knowledgeRevisionStatusEnum("status").notNull().default("PENDING"),
    baseVersion: text("base_version").notNull(),
    changes: jsonb("changes").$type<KnowledgeRevisionChanges>().notNull().default({}),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("knowledge_source_revisions_source_idx").on(t.sourceId),
    uniqueIndex("knowledge_source_revisions_pending_uq").on(t.sourceId).where(sql`${t.status} = 'PENDING'`),
  ],
);

export const knowledgeVersions = pgTable(
  "knowledge_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    date: date("date").notNull(),
    note: text("note").notNull().default(""),
    /** Source fields plus ACTIVE claims at this version; null for pre-0039 rows. */
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>(),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("knowledge_versions_source_idx").on(t.sourceId)],
);

export const knowledgeConflicts = pgTable(
  "knowledge_conflicts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
    recommended: text("recommended").notNull().default(""),
    action: text("action").notNull().default(""),
    status: text("status").notNull().default("OPEN"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolutionNote: text("resolution_note"),
    /** Sorted claim-id pair for engine-detected conflicts; re-detection upserts on it. */
    pairKey: text("pair_key"),
    detectedBy: text("detected_by").$type<"manual" | "engine">().notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("knowledge_conflicts_source_idx").on(t.sourceId),
    index("knowledge_conflicts_status_idx").on(t.status),
    uniqueIndex("knowledge_conflicts_pair_key_uq").on(t.pairKey).where(sql`${t.pairKey} IS NOT NULL`),
  ],
);

/** The competing values for one conflict topic. */
export const knowledgeConflictVariants = pgTable(
  "knowledge_conflict_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conflictId: uuid("conflict_id")
      .notNull()
      .references(() => knowledgeConflicts.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    value: text("value").notNull(),
  },
  (t) => [index("knowledge_conflict_variants_conflict_idx").on(t.conflictId)],
);

export const responseTemplates = pgTable(
  "response_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: requirementCategoryEnum("category").notNull(),
    status: responseTemplateStatusEnum("status").notNull().default("DRAFT"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    description: text("description").notNull().default(""),
    sections: jsonb("sections")
      .$type<Array<{ id?: string; title: string; body: string }>>()
      .notNull()
      .default([]),
    variables: jsonb("variables")
      .$type<Array<{ key: string; label: string; required?: boolean; defaultValue?: string }>>()
      .notNull()
      .default([]),
    version: text("version").notNull().default("1.0"),
    usageMetadata: jsonb("usage_metadata").$type<Record<string, unknown>>().notNull().default({}),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("response_templates_org_idx").on(t.organizationId),
    index("response_templates_org_status_idx").on(t.organizationId, t.status),
  ],
);
