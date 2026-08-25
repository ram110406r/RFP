import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { closeDb, getDb } from "./client";

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

function describeDatabaseTarget(env: NodeJS.ProcessEnv = process.env) {
  const user = env.POSTGRES_USER?.trim();
  const database = env.POSTGRES_DB?.trim();
  if (user && database) {
    const host = env.POSTGRES_HOST?.trim() || "postgres";
    const port = env.POSTGRES_PORT?.trim() || "5432";
    return `POSTGRES_* -> ${user}@${host}:${port}/${database}`;
  }

  if (env.DATABASE_URL?.trim()) {
    try {
      const url = new URL(env.DATABASE_URL.trim());
      if (url.password) {
        url.password = "***";
      }
      return `DATABASE_URL -> ${url.toString()}`;
    } catch {
      return "DATABASE_URL -> <unparseable>";
    }
  }

  return "<unconfigured>";
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
