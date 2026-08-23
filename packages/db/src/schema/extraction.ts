import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { timestamps } from "./_shared";
import { organizations } from "./organization";
import { rfpDocuments } from "./rfp";

/**
 * Extracted document content — the output of Phase 6 parsing, and the input
 * to requirement extraction, search and evidence.
 *
 * Kept in Postgres rather than object storage because everything downstream
 * queries it: Phase 6E reads pages to find requirements, Phase 7 indexes them
 * for search and embeds them (pgvector is already installed), and every
 * citation resolves back through these rows. Text in a bucket would mean a
 * fetch per candidate on every one of those paths.
 *
 * Content is addressed by (document, version), never by document alone. A new
 * version is new bytes, so its extraction is a separate row — an answer whose
 * evidence cites version 1 keeps resolving after version 2 is uploaded.
 */

export const extractionStatusEnum = pgEnum("extraction_status", [
  "pending",
  "succeeded",
  "failed",
]);

/**
 * One extraction run over one document version.
 *
 * The unique constraint on (document_id, version) is what makes re-parsing
 * idempotent: a retried job upserts this row and replaces its children rather
 * than accumulating a second copy of the same text.
 */
export const documentExtractions = pgTable(
  "document_extractions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => rfpDocuments.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    /**
     * Which extractor produced this, including its version — e.g. "unpdf@0.12".
     * Recorded because re-extracting with a better parser is a normal event,
     * and without it there is no way to tell which rows predate the upgrade.
     */
    extractor: text("extractor").notNull().default(""),
    status: extractionStatusEnum("status").notNull().default("pending"),
    /** Null until the run succeeds; formats without pages report their unit count. */
    pageCount: integer("page_count"),
    characterCount: integer("character_count").notNull().default(0),
    tableCount: integer("table_count").notNull().default(0),
    /** Populated when status is `failed`, mirroring rfp_documents.failure_reason. */
    failureReason: text("failure_reason"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("document_extractions_document_version_uq").on(t.documentId, t.version),
    index("document_extractions_org_idx").on(t.organizationId),
    index("document_extractions_document_idx").on(t.documentId),
    index("document_extractions_org_status_idx").on(t.organizationId, t.status),
  ],
);

/**
 * The text of one page.
 *
 * "Page" is the unit the source format divides itself into: a PDF page, a
 * spreadsheet sheet, an HTML document (always one). Formats without natural
 * pagination still produce numbered rows so a citation has something stable
 * to point at, and `label` carries the human-facing name — "Sheet1" reads
 * better in provenance than "page 2".
 *
 * Character offsets into `text` are what make a requirement's source location
 * precise; storing the whole page rather than pre-cut fragments keeps that
 * decision open for Phase 6E without a migration.
 */
export const documentPages = pgTable(
  "document_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    extractionId: uuid("extraction_id")
      .notNull()
      .references(() => documentExtractions.id, { onDelete: "cascade" }),
    /**
     * Denormalized from the extraction. Every read of this table is scoped to
     * a document, and carrying it here keeps that a single-table query rather
     * than a join on the hot path in Phase 6E and Phase 7.
     */
    documentId: uuid("document_id")
      .notNull()
      .references(() => rfpDocuments.id, { onDelete: "cascade" }),
    /** 1-based, in reading order. */
    pageNumber: integer("page_number").notNull(),
    label: text("label").notNull().default(""),
    text: text("text").notNull().default(""),
    characterCount: integer("character_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("document_pages_extraction_page_uq").on(t.extractionId, t.pageNumber),
    index("document_pages_org_idx").on(t.organizationId),
    index("document_pages_document_idx").on(t.documentId),
  ],
);

/**
 * One extracted table.
 *
 * `cells` is a jsonb array of rows of strings rather than a normalized
 * cell table: RFP tables are read whole — a requirements matrix, a pricing
 * grid — and a row-per-cell schema would turn every read into a thousand-row
 * reassembly for a structure nothing queries into.
 *
 * Everything is text. A spreadsheet's own idea of a cell's type says nothing
 * about what an RFP means by it, and coercing "N/A" or "see §4.2" into a
 * number loses the content that matters.
 */
export const documentTables = pgTable(
  "document_tables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    extractionId: uuid("extraction_id")
      .notNull()
      .references(() => documentExtractions.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => rfpDocuments.id, { onDelete: "cascade" }),
    /**
     * Sequential across the whole extraction, not per page. Uniqueness has to
     * hold for formats where pageNumber is null, and Postgres treats nulls as
     * distinct — a (extraction, page, index) constraint would silently permit
     * duplicates for exactly those formats.
     */
    tableIndex: integer("table_index").notNull(),
    /** Null when the format has no pages, or the table spans several. */
    pageNumber: integer("page_number"),
    caption: text("caption").notNull().default(""),
    rowCount: integer("row_count").notNull().default(0),
    columnCount: integer("column_count").notNull().default(0),
    cells: jsonb("cells").$type<string[][]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("document_tables_extraction_index_uq").on(t.extractionId, t.tableIndex),
    index("document_tables_org_idx").on(t.organizationId),
    index("document_tables_document_idx").on(t.documentId),
  ],
);
