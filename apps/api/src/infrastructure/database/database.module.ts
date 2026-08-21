import { Global, Module } from "@nestjs/common";
import { getDb, type Database } from "@rfp-os/db";

import { DATABASE } from "./database.tokens";

/**
 * Makes the shared database connection available application-wide.
 *
 * Global because practically every future domain module needs it, and
 * re-importing it in each one would be noise. getDb() is lazy and memoised,
 * so this provider does not open a connection at bootstrap — the first query
 * does, which keeps the API able to start (and serve /health) even when
 * Postgres is briefly unavailable.
 */
@Global()
@Module({
  providers: [{ provide: DATABASE, useFactory: (): Database => getDb() }],
  exports: [DATABASE],
})
export class DatabaseModule {}
