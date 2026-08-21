import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { validateEnv } from "./env.schema";

/**
 * process.env is already populated before Nest boots (bun --env-file loads
 * the root .env in dev; the two envFilePath entries below are a fallback for
 * anything invoked without that flag, e.g. `node dist/main.js` in prod).
 * dotenv-style loading never overwrites a variable already set in
 * process.env, so this is additive, not a second source of truth.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", "../../.env"],
      validate: validateEnv,
    }),
  ],
})
export class AppConfigModule {}
