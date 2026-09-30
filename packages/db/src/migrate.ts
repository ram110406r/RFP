import { readMigrationFiles } from "drizzle-orm/migrator";
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
    const pending = await logMigrationState(db);
    console.log(`[migrate] running migrations`);
    await runPendingMigrations(db, pending);
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
  return pending.map((entry) => ({
    ...entry,
    tag: tags.get(entry.folderMillis) ?? String(entry.folderMillis),
  }));
}

async function runPendingMigrations(
  db: ReturnType<typeof getDb>,
  pending: Array<ReturnType<typeof readMigrationFiles>[number] & { tag: string }>,
) {
  if (pending.length === 0) {
    return;
  }

  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS drizzle`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  await db.transaction(async (tx) => {
    for (const migration of pending) {
      console.log(`[migrate] applying ${migration.tag}`);
      for (const [index, statement] of migration.sql.entries()) {
        if (!statement.trim()) continue;

        try {
          await tx.execute(sql.raw("SAVEPOINT migrate_statement"));
          await tx.execute(sql.raw(statement));
          await tx.execute(sql.raw("RELEASE SAVEPOINT migrate_statement"));
        } catch (error) {
          await tx.execute(sql.raw("ROLLBACK TO SAVEPOINT migrate_statement")).catch(() => undefined);
          await tx.execute(sql.raw("RELEASE SAVEPOINT migrate_statement")).catch(() => undefined);
          if (isRecoverableDriftError(error)) {
            console.warn(
              `[migrate] skipped drift-safe failure in ${migration.tag}, statement ${index + 1}/${migration.sql.length}`,
            );
            logError(error);
            continue;
          }

          console.error(`[migrate] failed in ${migration.tag}, statement ${index + 1}/${migration.sql.length}`);
          console.error(`[migrate] statement: ${compactStatement(statement)}`);
          throw error;
        }
      }

      await tx.execute(
        sql`insert into drizzle.__drizzle_migrations ("hash", "created_at") values(${migration.hash}, ${migration.folderMillis})`,
      );
      console.log(`[migrate] applied ${migration.tag}`);
    }
  });
}

function readJournalTags(): Map<number, string> {
  const journal = JSON.parse(readFileSync(join(migrationsFolder, "meta", "_journal.json"), "utf8")) as {
    entries: { when: number; tag: string }[];
  };
  return new Map(journal.entries.map((entry) => [entry.when, entry.tag]));
}

function compactStatement(statement: string) {
  const compacted = statement.replace(/\s+/g, " ").trim();
  return compacted.length > 500 ? `${compacted.slice(0, 500)}...` : compacted;
}

function isRecoverableDriftError(error: unknown) {
  const code = (error as { code?: string } | undefined)?.code;
  return (
    code === "23503" || // foreign_key_violation on already-populated drifted tables
    code === "23505" || // unique_violation while recreating an index/constraint
    code === "42701" || // duplicate_column
    code === "42710" || // duplicate_object
    code === "42P06" || // duplicate_schema
    code === "42P07" // duplicate_table / duplicate_relation
  );
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
