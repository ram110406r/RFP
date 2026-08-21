import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

let queryClient: ReturnType<typeof postgres> | undefined;
let db: ReturnType<typeof drizzle<typeof schema>> | undefined;

/**
 * Lazily creates a single shared postgres connection pool + Drizzle instance
 * per process, so every app (api, worker, mcp) reads DATABASE_URL once
 * on first use instead of eagerly connecting at import time.
 */
export function getDb() {
  if (!db) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required to connect to the database.");
    }
    queryClient = postgres(databaseUrl);
    db = drizzle(queryClient, { schema });
  }
  return db;
}

export type Database = ReturnType<typeof getDb>;
export { schema };
