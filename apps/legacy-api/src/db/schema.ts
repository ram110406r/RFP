/**
 * The schema now lives in packages/db (@rfp-os/db) — the single source of
 * truth for the platform database, shared by apps/api, apps/worker, apps/mcp
 * and this app.
 *
 * This file remains only as a re-export so the 13 modules here keep their
 * `import { rfps } from "../db/schema"` paths working while they are ported
 * to NestJS module by module (Phase 6). Do not add table definitions here:
 * migrations are generated from packages/db/src/schema alone, so anything
 * declared locally would silently never reach the database.
 */
export * from "@rfp-os/db";
