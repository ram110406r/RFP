import { eq, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import postgres from "postgres";

import * as relations from "./relations";
import * as tables from "./schema";

/**
 * Tables and relations merged into the single namespace drizzle() expects.
 * Tables come from ./schema (drizzle-kit reads that folder alone to generate
 * migrations); relations come from ./relations and power `db.query.*`.
 */
export const schema = { ...tables, ...relations };

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

/**
 * The transactional handle passed to withTransaction callbacks. Structurally
 * a Database minus the nested-transaction method, so callers can run any
 * query against it but the type discourages re-opening a transaction inside
 * one (postgres would make that a savepoint, rarely what's intended).
 */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Runs `fn` inside a single database transaction: everything commits or
 * nothing does. Throwing from `fn` rolls back and re-throws.
 *
 * This is the primitive multi-table writes must use — most importantly the
 * business-change-plus-audit-log pair, so an action can never be recorded
 * without its audit trail (or vice versa).
 *
 *   await withTransaction(async (tx) => {
 *     await tx.update(rfps).set({ status: "review" }).where(eq(rfps.id, id));
 *     await tx.insert(auditLogs).values({ ...  });
 *   });
 */
export function withTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return getDb().transaction(fn);
}

/**
 * Builds the `organization_id = $1` predicate for a tenant-scoped table.
 *
 * Multi-tenancy is enforced by every query carrying this filter, so having
 * one named helper makes an unscoped query visible in review (a `.where()`
 * without an orgScope on an org-owned table) instead of invisible. Pair it
 * with `and(...)` when a query has further conditions:
 *
 *   .where(and(orgScope(rfps, organizationId), eq(rfps.status, "review")))
 *
 * `organizationId` must always come from the authenticated session, never
 * from client input.
 */
export function orgScope<T extends PgTable & { organizationId: PgColumn }>(
  table: T,
  organizationId: string,
): SQL {
  return eq(table.organizationId, organizationId);
}
