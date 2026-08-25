import { migrate } from "drizzle-orm/postgres-js/migrator";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { getDb } from "./client";

const migrationsFolder = join(import.meta.dir, "..", "migrations");

async function main() {
  console.log(`[migrate] starting`);
  console.log(`[migrate] working directory: ${process.cwd()}`);
  console.log(`[migrate] migration directory: ${migrationsFolder}`);
  console.log(`[migrate] migration directory exists: ${existsSync(migrationsFolder)}`);
  console.log(`[migrate] database target: ${describeDatabaseTarget()}`);
  console.log(`[migrate] connecting to database`);

  const db = getDb();

  console.log(`[migrate] database connection successful`);
  console.log(`[migrate] running migrations`);
  await migrate(db, { migrationsFolder });
  console.log(`[migrate] migrations completed successfully`);
  console.log(`[migrate] exiting 0`);
}

main().catch((error: unknown) => {
  console.error(`[migrate] FAILED`);
  if (error instanceof Error) {
    console.error(`[migrate] error: ${error.message}`);
    if (error.stack) {
      console.error(`[migrate] stack: ${error.stack}`);
    }
  } else {
    console.error(`[migrate] error:`, error);
  }
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
