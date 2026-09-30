import { envSchema, type Env } from "./env.schema";

/**
 * A fully-defaulted Env for tests that construct services by hand. Built from
 * envSchema itself, so adding a key to the schema does not break every
 * copy-pasted fixture the way hand-written `satisfies Env` literals did.
 */
export function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...envSchema.parse({
      APP_ENV: "local",
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      BETTER_AUTH_SECRET: "test-secret-that-is-long-enough-for-zod-min-32",
      SESSION_MAX_AGE_SECONDS: 3600,
    }),
    ...overrides,
  };
}
