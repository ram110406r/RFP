/** Minimal logger so providers stay framework-free (Nest's Logger and console both fit). */
export interface ProviderLogger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export const consoleProviderLogger: ProviderLogger = {
  log: (message) => console.log(message),
  warn: (message) => console.warn(message),
  error: (message) => console.error(message),
};

export function readEnv(name: string, env: Record<string, string | undefined> = process.env): string | undefined {
  const raw = env[name];
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
}

export function readNumberEnv(name: string, env: Record<string, string | undefined> = process.env): number | undefined {
  const raw = readEnv(name, env);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export class ProviderHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ProviderHttpError";
  }

  /** Rate limits and server errors are worth retrying; auth and validation errors are not. */
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

export async function postJson<T>(
  url: string,
  body: unknown,
  options: { apiKey: string; timeoutMs: number; operation: string },
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } | string; detail?: string };
    if (!response.ok) {
      const error = payload?.error;
      const message = typeof error === "string" ? error : error?.message ?? payload?.detail ?? response.statusText;
      throw new ProviderHttpError(`${options.operation} failed (${response.status}): ${message}`, response.status);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}
