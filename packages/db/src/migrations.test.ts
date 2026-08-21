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
 * This history was inherited from apps/legacy-api and is already applied to
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
    // These three came from apps/legacy-api and are applied in existing
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
});
