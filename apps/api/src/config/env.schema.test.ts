import { describe, expect, it } from "bun:test";
import { z } from "zod";

import { envBoolean, envSchema, validateEnv } from "./env.schema";

// A strict flag (no fallback), the way auth-sensitive booleans are declared.
const strictFlagSchema = z.object({ FLAG: envBoolean(false) });

const productionBase = {
  APP_ENV: "production",
  NODE_ENV: "production",
  DATABASE_URL: "postgres://user:pass@db:5432/app",
  REDIS_URL: "redis://redis:6379",
  BETTER_AUTH_SECRET: "a".repeat(48),
  BETTER_AUTH_URL: "https://app.example.com",
  BETTER_AUTH_GOOGLE_CLIENT_ID: "google-client-id",
  BETTER_AUTH_GOOGLE_CLIENT_SECRET: "google-client-secret",
  AI_PROVIDER: "groq",
  GROQ_API_KEY: "groq-key",
};

describe("envBoolean flags", () => {
  it.each([
    ["false", false],
    ["FALSE", false],
    ["0", false],
    ["no", false],
    ["true", true],
    ['"true"', true],
    ["'true'", true],
    ['\\"true\\"', true],
    ["`true`", true],
    [1, true],
    [" True ", true],
    ["1", true],
    ["yes", true],
    ['"false"', false],
    ["'false'", false],
    ['\\"false\\"', false],
    ["`false`", false],
    [0, false],
  ])("parses %p as %p", (raw, expected) => {
    expect(strictFlagSchema.parse({ FLAG: raw }).FLAG).toBe(expected);
    expect(envSchema.parse({ STORAGE_FORCE_PATH_STYLE: raw }).STORAGE_FORCE_PATH_STYLE).toBe(expected);
  });

  it("falls back to the default when unset or blank", () => {
    expect(strictFlagSchema.parse({}).FLAG).toBe(false);
    expect(envSchema.parse({}).STORAGE_FORCE_PATH_STYLE).toBe(true);
    expect(strictFlagSchema.parse({ FLAG: "  " }).FLAG).toBe(false);
  });

  it("rejects values that are not a recognisable boolean", () => {
    expect(strictFlagSchema.safeParse({ FLAG: "maybe" }).success).toBe(false);
  });

  it("falls back for malformed storage path-style values without weakening auth flags", () => {
    const env = envSchema.parse({ STORAGE_FORCE_PATH_STYLE: "path-style" });

    expect(env.STORAGE_FORCE_PATH_STYLE).toBe(true);
    expect(strictFlagSchema.safeParse({ FLAG: "path-style" }).success).toBe(false);
  });
});

describe("validateEnv production checks", () => {
  it("accepts a complete production configuration", () => {
    expect(() => validateEnv(productionBase)).not.toThrow();
  });

  it("requires GROQ_API_KEY when AI_PROVIDER=groq", () => {
    expect(() => validateEnv({ ...productionBase, GROQ_API_KEY: "" })).toThrow(/GROQ_API_KEY/);
  });

  it("requires the Google OAuth client", () => {
    expect(() => validateEnv({ ...productionBase, BETTER_AUTH_GOOGLE_CLIENT_SECRET: "" })).toThrow(
      /BETTER_AUTH_GOOGLE_CLIENT_ID/,
    );
  });

  it("rejects the local development database and storage passwords", () => {
    expect(() =>
      validateEnv({ ...productionBase, DATABASE_URL: "postgres://rfpos:rfpos_dev_password@postgres:5432/rfpos" }),
    ).toThrow(/POSTGRES_PASSWORD/);
    expect(() =>
      validateEnv({
        ...productionBase,
        STORAGE_ENDPOINT: "http://minio:9000",
        STORAGE_PUBLIC_ENDPOINT: "https://app.example.com",
        STORAGE_ACCESS_KEY_ID: "rfpos",
        STORAGE_SECRET_ACCESS_KEY: "rfpos_dev_password",
      }),
    ).toThrow(/STORAGE_SECRET_ACCESS_KEY/);
  });

  it("does not require GROQ_API_KEY outside production", () => {
    expect(() => validateEnv({ APP_ENV: "local", AI_PROVIDER: "groq" })).not.toThrow();
  });
});
