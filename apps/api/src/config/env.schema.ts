import { z } from "zod";

/**
 * Treats an empty or whitespace-only value as absent.
 *
 * The committed .env leaves secrets blank rather than omitting the keys, so
 * without this a blank line would satisfy a required string and produce a
 * zero-length secret — accepted at boot and broken at runtime.
 */
function blankToUndefined<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    schema.optional(),
  );
}

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
  BETTER_AUTH_SECRET: blankToUndefined(z.string().min(32, "must be at least 32 characters")),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:4100"),
  FIREBASE_PROJECT_ID: z.string().min(1).optional(),
  GROQ_API_KEY: blankToUndefined(z.string().min(1)),
  GROQ_MODEL: z.string().min(1).default("openai/gpt-oss-20b"),
  GROQ_BASE_URL: z.string().url().default("https://api.groq.com/openai/v1"),
  GROQ_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  /** How long a session stays valid, in seconds. Default 7 days. */
  SESSION_MAX_AGE_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 24 * 7),
  /** How long an organization invitation remains acceptable, in hours. */
  INVITATION_TTL_HOURS: z.coerce.number().int().positive().default(72),

  /*
   * Object storage (Phase 6a). Declared in .env.example since Phase 1 but not
   * validated until now, so they were readable only via process.env and had no
   * types. Optional in development: with no endpoint configured the storage
   * readiness check reports "skipped" and upload endpoints fail loudly rather
   * than the API refusing to boot.
   */
  STORAGE_ENDPOINT: z.string().url().optional(),
  STORAGE_REGION: z.string().default("us-east-1"),
  STORAGE_BUCKET: z.string().default("rfp-os-documents"),
  STORAGE_ACCESS_KEY_ID: blankToUndefined(z.string().min(1)),
  STORAGE_SECRET_ACCESS_KEY: blankToUndefined(z.string().min(1)),
  /** MinIO addresses buckets by path; real S3 uses a subdomain. */
  STORAGE_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  /** 100 MB. Enforced before presigning, so oversized uploads never start. */
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(104_857_600),
  UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  /** Downloads are short-lived: the URL grants the bytes to whoever holds it. */
  DOWNLOAD_URL_TTL_SECONDS: z.coerce.number().int().positive().default(300),
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
  if (result.data.NODE_ENV === "production") {
    const missing: string[] = [];
    if (!result.data.BETTER_AUTH_SECRET) {
      missing.push("BETTER_AUTH_SECRET: required in production (min 32 characters)");
    }
    if (!result.data.GROQ_API_KEY) {
      missing.push("GROQ_API_KEY: required in production for real AI generation");
    }
    /*
     * Storage is optional in development so the API boots without MinIO, but
     * in production a missing credential would only surface when someone first
     * tried to upload — a real document, rather than the deploy.
     */
    if (!result.data.STORAGE_ACCESS_KEY_ID || !result.data.STORAGE_SECRET_ACCESS_KEY) {
      missing.push("STORAGE_ACCESS_KEY_ID / STORAGE_SECRET_ACCESS_KEY: both required in production");
    }
    if (missing.length > 0) {
      const issues = missing.map((entry) => `  - ${entry}`).join("\n");
      throw new Error(`Invalid environment configuration:\n${issues}`);
    }
  }

  return result.data;
}
