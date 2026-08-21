import { authToken, ensureSession } from "@/lib/session";

const API_BASE_URL = import.meta.env["VITE_API_URL"] ?? "http://localhost:4000";

/** Thrown for any non-2xx API response. Carries the server's structured `{ error }` body. */
export class ApiRequestError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

/** Thin alias kept for call sites that specifically expect a "not found" case. */
export class ApiNotFoundError extends ApiRequestError {
  constructor(entity: string, id: string) {
    super(404, "NOT_FOUND", `${entity} "${id}" was not found.`);
    this.name = "ApiNotFoundError";
  }
}

type Query = Record<string, string | number | boolean | undefined>;

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Query;
}

function buildUrl(path: string, query?: Query): string {
  const url = new URL(path, API_BASE_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/**
 * Shared fetch wrapper for every `src/lib/api/*` module. Ensures the dev
 * session is established, attaches the bearer token, and turns any non-2xx
 * response into a typed `ApiRequestError` carrying the server's `{ code,
 * message }` — never raw SQL text or stack traces, since the server itself
 * never sends those (see server/src/lib/errors.ts).
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  await ensureSession();

  const init: RequestInit = {
    method: options.method ?? "GET",
    headers: {
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);

  const res = await fetch(buildUrl(path, options.query), init);

  if (!res.ok) {
    let code = "UNKNOWN_ERROR";
    let message = `Request to ${path} failed (${res.status}).`;
    try {
      const data = (await res.json()) as { error?: { code?: string; message?: string } };
      if (data?.error?.code) code = data.error.code;
      if (data?.error?.message) message = data.error.message;
    } catch {
      // Non-JSON error body — fall back to the generic message above.
    }
    throw new ApiRequestError(res.status, code, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
