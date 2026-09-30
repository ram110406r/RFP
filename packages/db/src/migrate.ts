import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { closeDb, getDb, resolveDatabaseUrl } from "./client";

const migrationsFolder = join(import.meta.dir, "..", "migrations");

async function main() {
  console.log(`[migrate] starting`);
  console.log(`[migrate] working directory: ${process.cwd()}`);
  console.log(`[migrate] migration directory: ${migrationsFolder}`);
  console.log(`[migrate] migration directory exists: ${existsSync(migrationsFolder)}`);
  console.log(`[migrate] database target: ${describeDatabaseTarget()}`);
  console.log(`[migrate] connecting to database`);

  const db = getDb();
  try {
    await db.execute(sql`select 1`);

    console.log(`[migrate] database connection successful`);
    await logMigrationState(db);
    console.log(`[migrate] running migrations`);
    await migrate(db, { migrationsFolder });
    console.log(`[migrate] migrations completed successfully`);
    console.log(`[migrate] exiting 0`);
  } finally {
    await closeDb();
  }
}

main().catch((error: unknown) => {
  console.error(`[migrate] FAILED`);
  logError(error);
  process.exit(1);
});

/**
 * Logs the last applied migration and the ones about to run, so a failure in
 * the deploy log points at a specific file instead of just "exit 1". Drizzle
 * applies every journal entry newer than the last recorded `created_at`.
 */
async function logMigrationState(db: ReturnType<typeof getDb>) {
  const journal = readMigrationFiles({ migrationsFolder });
  const tags = readJournalTags();
  let lastAppliedAt: number | null = null;
  try {
    const rows = await db.execute<{ created_at: string | number }>(
      sql`select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1`,
    );
    const last = rows[0];
    lastAppliedAt = last ? Number(last.created_at) : null;
  } catch {
    // Table missing on a brand-new database: everything is pending.
  }

  const lastTag = journal.find((entry) => entry.folderMillis === lastAppliedAt);
  console.log(
    `[migrate] last applied: ${
      lastAppliedAt === null ? "<none>" : (tags.get(lastTag?.folderMillis ?? -1) ?? `created_at=${lastAppliedAt}`)
    }`,
  );
  const pending = journal.filter((entry) => lastAppliedAt === null || entry.folderMillis > lastAppliedAt);
  console.log(
    `[migrate] pending (${pending.length}): ${
      pending.map((entry) => tags.get(entry.folderMillis) ?? String(entry.folderMillis)).join(", ") || "<none>"
    }`,
  );
}

function readJournalTags(): Map<number, string> {
  const journal = JSON.parse(readFileSync(join(migrationsFolder, "meta", "_journal.json"), "utf8")) as {
    entries: { when: number; tag: string }[];
  };
  return new Map(journal.entries.map((entry) => [entry.when, entry.tag]));
}

function describeDatabaseTarget(env: NodeJS.ProcessEnv = process.env) {
  const databaseUrl = resolveDatabaseUrl(env as Parameters<typeof resolveDatabaseUrl>[0]);
  if (databaseUrl) {
    try {
      const url = new URL(databaseUrl);
      if (url.password) {
        url.password = "***";
      }
      return `${targetSource(env, databaseUrl)} -> ${url.toString()}`;
    } catch {
      return `${targetSource(env, databaseUrl)} -> <unparseable>`;
    }
  }

  return "<unconfigured>";
}

function targetSource(env: NodeJS.ProcessEnv, databaseUrl: string) {
  return databaseUrl === env.DATABASE_URL?.trim() ? "DATABASE_URL" : "POSTGRES_*";
}

function logError(error: unknown, depth = 0) {
  const label = depth === 0 ? "error" : `cause ${depth}`;

  if (!(error instanceof Error)) {
    console.error(`[migrate] ${label}:`, error);
    return;
  }

  console.error(`[migrate] ${label}: ${error.message}`);

  const details = error as Error & {
    code?: string;
    severity?: string;
    detail?: string;
    hint?: string;
    cause?: unknown;
  };
  if (details.code) console.error(`[migrate] ${label} code: ${details.code}`);
  if (details.severity) console.error(`[migrate] ${label} severity: ${details.severity}`);
  if (details.detail) console.error(`[migrate] ${label} detail: ${details.detail}`);
  if (details.hint) console.error(`[migrate] ${label} hint: ${details.hint}`);
  if (error.stack) console.error(`[migrate] ${label} stack: ${error.stack}`);
  if (details.cause && depth < 5) logError(details.cause, depth + 1);
}
