import { migrate } from "drizzle-orm/postgres-js/migrator";

import { getDb } from "./client";

await migrate(getDb(), { migrationsFolder: "./drizzle" });
console.log("Migrations complete.");
process.exit(0);
