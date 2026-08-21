/**
 * DEV-ONLY. Drops every table this package owns and reruns migrations against
 * a clean schema — useful after seeding test data during local development.
 * Never point this at a database with real application data.
 */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required (see .env.example).");
}

// Its own single connection rather than the shared getDb() pool: this script
// drops the schema out from under any prepared statements, so it should not
// share a pool with anything else.
const client = postgres(databaseUrl, { max: 1 });
const db = drizzle(client);

console.log("Dropping schemas...");
// Also drop the `drizzle` schema (migration tracking table) — otherwise
// drizzle thinks every migration is already applied and skips recreating
// the tables we just dropped.
await db.execute(sql`DROP SCHEMA public CASCADE`);
await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
await db.execute(sql`CREATE SCHEMA public`);

console.log("Reapplying migrations...");
await migrate(db, { migrationsFolder: "./migrations" });

console.log("Database reset. Run `bun run db:seed` to repopulate development data.");
await client.end();
