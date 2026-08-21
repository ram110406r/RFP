/**
 * Thin adapter over the shared connection pool in @rfp-os/db.
 *
 * The 13 modules in this app import `db` as an eager binding, so the shape is
 * preserved here rather than rewriting every call site during the migration.
 * getDb() is lazy, so the pool is still created on first use.
 */
import { getDb } from "@rfp-os/db";

export const db = getDb();
export type Db = typeof db;
