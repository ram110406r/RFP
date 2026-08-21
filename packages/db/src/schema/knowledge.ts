import { date, index, numeric, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { requirementCategoryEnum, timestamps } from "./_shared";
import { users } from "./identity";
import { organizations } from "./organization";

/**
 * How much weight a source carries when two sources disagree — the seed of
 * the authority hierarchy the conflict engine (Phase 19) will enforce.
 */
export const authorityEnum = pgEnum("authority", ["high", "medium", "low"]);

/**
 * The organization's shared knowledge layer. Deliberately NOT an RFP-specific
 * knowledge base: RFP answers cite these sources through rfp_evidence, so the
 * same source powers every RFP rather than being copied per deal.
 *
 * Chunking + embeddings (pgvector) and the OpenSearch mirror arrive in
 * Phase 12/13; this is the source/version/claim skeleton they hang off.
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
    ...timestamps,
  },
  (t) => [index("knowledge_sources_org_idx").on(t.organizationId)],
);

/** Discrete assertions extracted from a source ("RPO", "4 hours"). */
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
  },
  (t) => [index("knowledge_claims_source_idx").on(t.sourceId)],
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
  },
  (t) => [index("knowledge_conflicts_source_idx").on(t.sourceId)],
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
