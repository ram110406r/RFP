import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * SHA-256 of the BETTER_AUTH_SECRET fallback that docker-compose.yml used to
 * ship. That string is public in git history, so a deployment still carrying
 * it (e.g. copied into a .env) must not boot. Stored as a hash so the literal
 * is not repeated here.
 */
const LEAKED_AUTH_SECRET_SHA256 = "ce95891a8bbde99d5da2b92c3d2dd01f811e44e52f23b639690d7970cc24b025";

/** Local-dev default for Postgres and MinIO (docker-compose.yml, .env.example). */
const DEV_DEFAULT_PASSWORD = "rfpos_dev_password";

function databaseUrlPassword(databaseUrl: string | undefined): string | undefined {
  if (!databaseUrl) return undefined;
  try {
    return decodeURIComponent(new URL(databaseUrl).password) || undefined;
  } catch {
    return undefined;
  }
}

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

/**
 * Parses a boolean flag from its env-string form.
 *
 * z.coerce.boolean() is Boolean(value), so the string "false" becomes true —
 * the opposite of what anyone setting FLAG=false means. Only explicit
 * true/false spellings are accepted; blank falls back to the default and
 * anything else fails validation.
 */
export function envBoolean(defaultValue: boolean) {
  return z.preprocess(
    (value) => {
      if (typeof value === "boolean") return value;
      if (value === undefined || value === null) return undefined;
      const trimmed = String(value).trim();
      const normalized =
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
          ? trimmed.slice(1, -1).trim().toLowerCase()
          : trimmed.toLowerCase();
      if (normalized === "") return undefined;
      if (["true", "1", "yes", "on"].includes(normalized)) return true;
      if (["false", "0", "no", "off"].includes(normalized)) return false;
      return value;
    },
    z.boolean({ invalid_type_error: "must be true or false" }).default(defaultValue),
  );
}

export const envSchema = z.object({
  APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
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
  BETTER_AUTH_GOOGLE_CLIENT_ID: blankToUndefined(z.string().min(1)),
  BETTER_AUTH_GOOGLE_CLIENT_SECRET: blankToUndefined(z.string().min(1)),
  ENABLE_FIREBASE_AUTH_COMPAT: envBoolean(false),
  FIREBASE_PROJECT_ID: z.string().min(1).optional(),
  APP_COMMIT_SHA: z.string().min(1).optional(),
  APP_BUILD_TIME: blankToUndefined(z.string().datetime()),
  AI_PROVIDER: z.enum(["mock", "groq", "openai", "anthropic", "gemini"]).default("mock"),
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
  STORAGE_ENDPOINT: blankToUndefined(z.string().url()),
  /** Browser-reachable endpoint used for presigned URLs. */
  STORAGE_PUBLIC_ENDPOINT: blankToUndefined(z.string().url()),
  STORAGE_REGION: z.string().default("us-east-1"),
  STORAGE_BUCKET: z.string().default("rfp-os-documents"),
  STORAGE_ACCESS_KEY_ID: blankToUndefined(z.string().min(1)),
  STORAGE_SECRET_ACCESS_KEY: blankToUndefined(z.string().min(1)),
  /** MinIO addresses buckets by path; real S3 uses a subdomain. */
  STORAGE_FORCE_PATH_STYLE: envBoolean(true),
  /** 100 MB. Enforced before presigning, so oversized uploads never start. */
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(104_857_600),
  UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  /** Downloads are short-lived: the URL grants the bytes to whoever holds it. */
  DOWNLOAD_URL_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OPENSEARCH_URL: blankToUndefined(z.string().url()),
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
  if (result.data.APP_ENV === "production") {
    const missing: string[] = [];
    const hasDatabaseUrl = Boolean(result.data.DATABASE_URL);
    const hasPostgresEnv =
      Boolean(config.POSTGRES_USER) &&
      Boolean(config.POSTGRES_PASSWORD) &&
      Boolean(config.POSTGRES_DB);
    if (!result.data.BETTER_AUTH_SECRET) {
      missing.push("BETTER_AUTH_SECRET: required in production (min 32 characters)");
    } else if (
      createHash("sha256").update(result.data.BETTER_AUTH_SECRET).digest("hex") === LEAKED_AUTH_SECRET_SHA256
    ) {
      missing.push("BETTER_AUTH_SECRET: is the old public docker-compose fallback; generate a new secret");
    }
    if (!result.data.BETTER_AUTH_URL) {
      missing.push("BETTER_AUTH_URL: required in production");
    }
    if (!result.data.BETTER_AUTH_GOOGLE_CLIENT_ID || !result.data.BETTER_AUTH_GOOGLE_CLIENT_SECRET) {
      missing.push("BETTER_AUTH_GOOGLE_CLIENT_ID / BETTER_AUTH_GOOGLE_CLIENT_SECRET: both required in production");
    }
    if (result.data.ENABLE_FIREBASE_AUTH_COMPAT && !result.data.FIREBASE_PROJECT_ID) {
      missing.push("FIREBASE_PROJECT_ID: required only when ENABLE_FIREBASE_AUTH_COMPAT=true");
    }
    if (!hasDatabaseUrl && !hasPostgresEnv) {
      missing.push(
        "DATABASE_URL or POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB: required in production",
      );
    }
    if (
      databaseUrlPassword(result.data.DATABASE_URL) === DEV_DEFAULT_PASSWORD ||
      config.POSTGRES_PASSWORD === DEV_DEFAULT_PASSWORD
    ) {
      missing.push("POSTGRES_PASSWORD / DATABASE_URL: still the local development password; set a real one");
    }
    if (result.data.STORAGE_SECRET_ACCESS_KEY === DEV_DEFAULT_PASSWORD) {
      missing.push("STORAGE_SECRET_ACCESS_KEY: still the local development password; set a real one");
    }
    if (!result.data.REDIS_URL) {
      missing.push("REDIS_URL: required in production for background jobs");
    }
    if (result.data.AI_PROVIDER === "mock") {
      missing.push("AI_PROVIDER: mock is not allowed in production");
    }
    if (result.data.AI_PROVIDER === "groq" && !result.data.GROQ_API_KEY) {
      missing.push("GROQ_API_KEY: required when AI_PROVIDER=groq");
    }
    /*
     * Storage is optional in development so the API boots without MinIO, but
     * in production a missing credential would only surface when someone first
     * tried to upload – a real document, rather than the deploy.
     */
    const hasStorage = Boolean(result.data.STORAGE_ENDPOINT);
    if (hasStorage && (!result.data.STORAGE_ACCESS_KEY_ID || !result.data.STORAGE_SECRET_ACCESS_KEY)) {
      missing.push("STORAGE_ACCESS_KEY_ID / STORAGE_SECRET_ACCESS_KEY: both required in production");
    }
    if (hasStorage && !result.data.STORAGE_PUBLIC_ENDPOINT) {
      missing.push("STORAGE_PUBLIC_ENDPOINT: required when using S3-compatible storage in production");
    }
    if (hasStorage && result.data.STORAGE_PUBLIC_ENDPOINT) {
      try {
        const publicStorageUrl = new URL(result.data.STORAGE_PUBLIC_ENDPOINT);
        const localHostnames = new Set(["localhost", "127.0.0.1", "::1"]);
        if (publicStorageUrl.protocol !== "https:" && !localHostnames.has(publicStorageUrl.hostname)) {
          missing.push("STORAGE_PUBLIC_ENDPOINT: must use HTTPS in production");
        }
      } catch {
        // The Zod URL check above normally handles this; keep the production
        // error explicit if configuration is transformed unexpectedly.
        missing.push("STORAGE_PUBLIC_ENDPOINT: must be a valid HTTPS URL");
      }
    }
    if (missing.length > 0) {
      const issues = missing.map((entry) => `  - ${entry}`).join("\n");
      throw new Error(
        [
          "TENDYY configuration error:",
          "",
          "Missing or invalid:",
          issues,
          "",
          `Environment: ${result.data.APP_ENV}`,
        ].join("\n"),
      );
    }
  }

  return result.data;
}
