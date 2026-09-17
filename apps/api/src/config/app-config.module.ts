import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { validateEnv } from "./env.schema";

/**
 * process.env is already populated before Nest boots when scripts load
 * .env.local / .env. The envFilePath entries below are a fallback for
 * anything invoked without that flag, e.g. `node dist/main.js` in prod).
 * dotenv-style loading never overwrites a variable already set in
 * process.env, so this is additive, not a second source of truth.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env", "../../.env.local", "../../.env"],
      validate: validateEnv,
    }),
  ],
})
export class AppConfigModule {}
