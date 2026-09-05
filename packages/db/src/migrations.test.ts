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
});
