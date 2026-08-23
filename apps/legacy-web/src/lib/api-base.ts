/**
 * Resolves the API origin for the current execution context.
 *
 * This app renders on the server (TanStack Start runs `__root.tsx`'s
 * `beforeLoad` — and therefore `ensureSession()` — during SSR) and then again
 * in the browser, and in a deployed environment those two contexts must NOT
 * use the same URL:
 *
 *   - The SSR server sits *inside* the container network, behind the same
 *     reverse proxy that password-gates the site. If it called the public
 *     URL it would be challenged by that gate and every render would fail
 *     with a 401. So it talks to the API container directly, over the private
 *     network, via API_INTERNAL_URL.
 *
 *   - The browser must use an origin it can actually reach from outside. We
 *     default to the page's own origin so the deployment is domain-agnostic:
 *     the reverse proxy forwards /api to the API container, so no public
 *     hostname has to be baked into the bundle at build time.
 *
 * Both fall back to the historical localhost defaults so `bun run dev`
 * against a locally running API keeps working with no configuration.
 */
export function resolveApiBaseUrl(): string {
  const configured = import.meta.env["VITE_API_URL"];

  if (typeof window === "undefined") {
    // `process` is not defined in every SSR target, so probe it defensively.
    const internal = typeof process !== "undefined" ? process.env?.["API_INTERNAL_URL"] : undefined;
    return internal || configured || "http://localhost:4000";
  }

  return configured || window.location.origin;
}
