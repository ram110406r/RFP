const NETWORK_DELAY_MS = 260;

/**
 * Simulates network latency for mock data accessors. This is the seam a real
 * NestJS-backed client would replace: every function in `src/lib/api/*`
 * keeps this signature (async, returning the same shape) so swapping the
 * body for a `fetch()` call requires no changes anywhere else in the app.
 */
export function delay<T>(value: T, ms = NETWORK_DELAY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export class ApiNotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} "${id}" was not found.`);
    this.name = "ApiNotFoundError";
  }
}
