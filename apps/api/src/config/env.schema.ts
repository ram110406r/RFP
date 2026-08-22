import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4100),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  RATE_LIMIT_TTL_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_LIMIT: z.coerce.number().int().positive().default(100),
  /**
   * Signs session cookies. Blank in the committed .env, so an empty value is
   * normalised to "absent" rather than being accepted as a 0-length secret —
   * see the production check below, which refuses to boot without a real one.
   */
  BETTER_AUTH_SECRET: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(32, "must be at least 32 characters").optional(),
  ),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:4100"),
  /** How long a session stays valid, in seconds. Default 7 days. */
  SESSION_MAX_AGE_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 24 * 7),
  /** How long an organization invitation remains acceptable, in hours. */
  INVITATION_TTL_HOURS: z.coerce.number().int().positive().default(72),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Passed to ConfigModule.forRoot({ validate }) — Nest calls this once at
 * bootstrap with the raw process.env, and a thrown error fails startup
 * immediately with a readable message instead of surfacing as a confusing
 * runtime error the first time a missing var is read.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  /**
   * A missing auth secret is survivable in development (auth.config.ts derives
   * an ephemeral one and warns), but in production it would silently make every
   * session forgeable. Fail the boot instead.
   */
  if (result.data.NODE_ENV === "production" && !result.data.BETTER_AUTH_SECRET) {
    throw new Error(
      "Invalid environment configuration:\n  - BETTER_AUTH_SECRET: required in production (min 32 characters)",
    );
  }

  return result.data;
}
