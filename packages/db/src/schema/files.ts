import { bigint, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { timestamps } from "./_shared";
import { users } from "./identity";
import { organizations } from "./organization";

/**
 * Generic, org-scoped record of one stored object in MinIO/S3 — the storage
 * layer Phase 8 builds on.
 *
 * Deliberately not RFP-specific: an uploaded RFP document, a generated
 * submission artifact, and a knowledge PDF are all files. Domain tables link
 * here rather than each inventing their own storage columns (rfp_documents
 * still carries a legacy `storage_key`; Phase 8 migrates it onto `file_id`).
 *
 * `checksumSha256` is what makes ingestion idempotent — re-uploading an
 * identical object is detectable without re-parsing it.
 */
export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    bucket: text("bucket").notNull(),
    objectKey: text("object_key").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    checksumSha256: text("checksum_sha256"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("files_org_idx").on(t.organizationId),
    uniqueIndex("files_bucket_object_key_uq").on(t.bucket, t.objectKey),
    index("files_checksum_idx").on(t.checksumSha256),
  ],
);

/**
 * Immutable version history for a logical document: each version points at
 * its own `files` row, so replacing a document never overwrites the bytes an
 * earlier answer's evidence was drawn from.
 *
 * `documentId` is an untyped uuid rather than an FK to rfp_documents: the
 * same versioning applies to knowledge sources too, and Phase 8 decides which
 * owners participate. Kept loose here rather than guessing wrong now.
 */
export const documentVersions = pgTable(
  "document_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").notNull(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "restrict" }),
    version: integer("version").notNull().default(1),
    note: text("note").notNull().default(""),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("document_versions_org_idx").on(t.organizationId),
    uniqueIndex("document_versions_document_version_uq").on(t.documentId, t.version),
  ],
);
