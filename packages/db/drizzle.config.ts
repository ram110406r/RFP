import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required (see .env.example).");
}

export default defineConfig({
  /**
   * The barrel, not the directory. Pointing at "./src/schema" made drizzle-kit
   * load every file in the folder — including schema.test.ts, which imports
   * "bun:test" and cannot be resolved by drizzle-kit's Node loader. The barrel
   * re-exports every table, so generation sees exactly the same schema.
   */
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
});
