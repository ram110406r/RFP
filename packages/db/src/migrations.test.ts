import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(import.meta.dir, "..", "migrations");

interface Journal {
  entries: { idx: number; tag: string; when: number }[];
}

function readJournal(): Journal {
  return JSON.parse(readFileSync(join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8")) as Journal;
}

/**
 * This history was inherited from the earlier API and is already applied to
 * live databases. Drizzle decides what to run by hashing each .sql file and
 * comparing against drizzle.__drizzle_migrations, so a renamed, reordered, or
 * edited-in-place migration would not error — it would silently re-run
 * against a database that already has those tables. These tests make that
 * class of mistake fail in CI instead.
 */
describe("migration history", () => {
  test("every journal entry has a matching .sql file", () => {
    const files = new Set(readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")));
    for (const entry of readJournal().entries) {
      expect(files.has(`${entry.tag}.sql`)).toBe(true);
    }
  });

  test("every .sql file is registered in the journal", () => {
    const tags = new Set(readJournal().entries.map((e) => e.tag));
    for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"))) {
      expect(tags.has(file.replace(/\.sql$/, ""))).toBe(true);
    }
  });

  test("entries are contiguous and ordered from 0", () => {
    const entries = readJournal().entries;
    expect(entries.map((e) => e.idx)).toEqual(entries.map((_, i) => i));
  });

  test("the inherited baseline is intact", () => {
    // These three came from the earlier API and are applied in existing
    // databases. Their names must never change.
    const tags = readJournal().entries.map((e) => e.tag);
    expect(tags.slice(0, 3)).toEqual([
      "0000_youthful_leopardon",
      "0001_even_random",
      "0002_messy_masked_marvel",
    ]);
  });

  test("pgvector is enabled by the migrations", () => {
    const sql = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
      .join("\n");
    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS vector");
  });

  test("0011 repairs missing 0010 extraction tables before referencing them", () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, "0011_overjoyed_mauler.sql"), "utf8");
    const repairIndex = sql.indexOf('CREATE TABLE IF NOT EXISTS "document_extractions"');
    const fkIndex = sql.indexOf(
      'ALTER TABLE "document_blocks" ADD CONSTRAINT "document_blocks_extraction_id_document_extractions_id_fk"',
    );

    expect(repairIndex).toBeGreaterThanOrEqual(0);
    expect(fkIndex).toBeGreaterThan(repairIndex);
  });

  test("0025 creates the shared tender catalog and workspace conversion constraints", () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, "0025_india_tender_discovery.sql"), "utf8");
    expect(sql).toContain('CREATE TABLE "tender_notices"');
    expect(sql).toContain('CREATE TABLE "saved_tender_notices"');
    expect(sql).toContain('CREATE UNIQUE INDEX "tenders_workspace_discovery_notice_uq"');
    expect(sql).toContain('CREATE INDEX "tender_notices_search_idx"');
    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  });

  test("0026 enables only the verified official discovery connectors", () => {
    const sql = readFileSync(
      join(MIGRATIONS_DIR, "0026_enable_official_tender_connectors.sql"),
      "utf8",
    );
    expect(sql).toContain('ADD COLUMN "sync_cursor"');
    expect(sql).toContain("\"key\" = 'gem'");
    expect(sql).toContain("\"key\" = 'cppp'");
    expect(sql).toContain('"builtInConnector":"GEM"');
    expect(sql).toContain('"builtInConnector":"CPPP_LATEST"');
  });

  test("0027 replaces expiring CPPP session links with durable navigation", () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, "0027_repair_cppp_session_links.sql"), "utf8");
    expect(sql).toContain("https://eprocure.gov.in/eprocure/app?service=restart");
    expect(sql).toContain("SEARCH_BY_REFERENCE");
    expect(sql).toContain("Open CPPP and search by reference");
  });

  test("0028 adds per-source lifecycle state and protected operations", () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, "0028_tender_discovery_operations.sql"), "utf8");
    expect(sql).toContain('ADD COLUMN "last_seen_run_id"');
    expect(sql).toContain('ADD COLUMN "missed_syncs"');
    expect(sql).toContain('CREATE TABLE "platform_administrators"');
    expect(sql).toContain('CREATE TABLE "tender_ingestion_alerts"');
    expect(sql).toContain('"connectorVerified":true');
  });

  test("0029 adds durable apply automation and immutable submission records", () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, "0029_tender_apply_automation.sql"), "utf8");
    expect(sql).toContain('CREATE TABLE "tender_requirement_candidates"');
    expect(sql).toContain('CREATE TABLE "tender_automation_runs"');
    expect(sql).toContain('CREATE TABLE "tender_submission_packages"');
    expect(sql).toContain('CREATE UNIQUE INDEX "tender_submission_packages_digest_uq"');
    expect(sql).toContain('CREATE TABLE "tender_submissions"');
    expect(sql).toContain('CREATE UNIQUE INDEX "tender_submissions_tender_reference_uq"');
  });

  test("0030 prevents concurrent active automation runs", () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, "0030_tender_automation_active_run.sql"), "utf8");
    expect(sql).toContain('CREATE UNIQUE INDEX "tender_automation_runs_active_uq"');
    expect(sql).toContain("WHERE \"status\" IN ('QUEUED', 'RUNNING')");
  });

  test("0032 adds weighted discovery, saved searches, durable imports, and analytics", () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, "0032_tender_search_p0_p2.sql"), "utf8");
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "search_vector" tsvector GENERATED ALWAYS AS');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "tender_match_profiles"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "tender_saved_searches"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "tender_saved_search_matches"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "tender_discovery_events"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "import_status"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "rejection_reason"');
    expect(sql).toContain('ALTER TABLE "tender_match_profiles" ADD COLUMN IF NOT EXISTS "organization_id" uuid');
    expect(sql).toContain('ALTER TABLE "tender_saved_searches" ADD COLUMN IF NOT EXISTS "workspace_id" uuid');
    expect(sql).toContain('ALTER TABLE "tender_discovery_events" ADD COLUMN IF NOT EXISTS "event_type" text');
    expect(sql).toContain('UPDATE "tender_saved_searches" SET');
    expect(sql).toContain("WHEN duplicate_object THEN null");
  });

  test("0033 repairs partially existing response template tables", () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, "0033_knowledge_brain_workflows.sql"), "utf8");
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "response_templates"');
    expect(sql).toContain('ALTER TABLE "response_templates" ADD COLUMN IF NOT EXISTS "organization_id" uuid');
    expect(sql).toContain('ALTER TABLE "response_templates" ADD COLUMN IF NOT EXISTS "usage_metadata" jsonb');
    expect(sql).toContain('UPDATE "response_templates" SET');
  });

  test("0037 promotes knowledge lifecycle to indexed columns and backfills from metadata", () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, "0037_knowledge_lifecycle_columns.sql"), "utf8");
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "lifecycle_status" "knowledge_lifecycle_status"');
    expect(sql).toContain("\"metadata\" ->> 'lifecycleStatus'");
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "citation_status" text');
    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    expect(sql).toContain('"response_templates_org_status_idx"');
  });

  test("0038 adds knowledge documents and hybrid-searchable chunks", () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, "0038_knowledge_documents_chunks.sql"), "utf8");
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "knowledge_documents"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "knowledge_chunks"');
    expect(sql).toContain('"embedding" vector(1024)');
    expect(sql).toContain("USING hnsw (\"embedding\" vector_cosine_ops)");
    expect(sql).toContain('"search_vector" tsvector GENERATED ALWAYS AS');
  });

  test("0039 adds pending revisions, version snapshots and claim lifecycle", () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, "0039_knowledge_revisions_claims.sql"), "utf8");
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "knowledge_source_revisions"');
    expect(sql).toContain('"knowledge_source_revisions_pending_uq"');
    expect(sql).toContain('ALTER TABLE "knowledge_versions" ADD COLUMN IF NOT EXISTS "snapshot" jsonb');
    expect(sql).toContain('ALTER TABLE "knowledge_claims" ADD COLUMN IF NOT EXISTS "status" "knowledge_claim_status"');
    expect(sql).toContain('"knowledge_conflicts_pair_key_uq"');
  });

  test("0040 gives claims a label embedding for semantic conflict matching", () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, "0040_knowledge_claim_label_embeddings.sql"), "utf8");
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "label_embedding" vector(1024)');
    expect(sql).toContain('USING hnsw ("label_embedding" vector_cosine_ops)');
  });
});
