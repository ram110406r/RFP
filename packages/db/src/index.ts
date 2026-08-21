/**
 * Public surface of the platform database package.
 *
 * Tables and relations are re-exported by name so consumers write
 * `import { rfps, getDb } from "@rfp-os/db"` — one import path for the
 * schema, whichever domain a table lives in.
 */

export * from "./schema";
export * from "./relations";

export { getDb, orgScope, schema, withTransaction } from "./client";
export type { Database, Transaction } from "./client";
