import type { OrgProfile, Person } from "@/types";

/**
 * Dev-only client session. Logs in as a fixed seeded user (see
 * server/src/lib/auth.ts + server/src/db/seed.ts) so the app keeps its
 * existing "no login screen" UX while still going through a real,
 * server-enforced identity boundary — the bearer token this exchanges for is
 * checked against the database on every request, and organizationId is
 * always derived server-side from it, never sent by the client.
 *
 * `__root.tsx` awaits `ensureSession()` in `beforeLoad`, so by the time any
 * route component renders, `CURRENT_USER_ID` and `people` below are already
 * populated — every consumer that used to read the static mock arrays in
 * `src/data/people.ts` synchronously can keep doing so unchanged.
 */

import { resolveApiBaseUrl } from "@/lib/api-base";

const DEV_LOGIN_EMAIL = import.meta.env["VITE_DEV_LOGIN_EMAIL"] ?? "priya.nair@halcyonsystems.com";

export let authToken: string | null = null;
export let CURRENT_USER_ID = "";
export let people: Person[] = [];
export let orgProfile: OrgProfile = {
  name: "",
  domain: "",
  plan: "Starter",
  seats: 0,
  seatsUsed: 0,
  industry: "",
  logoInitials: "",
};

export function getPerson(id: string | null | undefined): Person | undefined {
  if (!id) return undefined;
  return people.find((p) => p.id === id);
}

export function personName(id: string | null | undefined): string {
  if (!id) return "Unassigned";
  return getPerson(id)?.name ?? id;
}

let sessionPromise: Promise<void> | null = null;

function maskEmail(email: string): string {
  const [local = "", domain] = email.split("@");
  if (!domain || local.length < 3) return "***";
  return `${local.slice(0, 2)}***@${domain}`;
}

function sanitizeLogText(text: string): string {
  return text
    .replace(/"token"\s*:\s*"[^"]*"/gi, '"token":"[redacted]"')
    .replace(/"password"\s*:\s*"[^"]*"/gi, '"password":"[redacted]"')
    .replace(/"cookie"\s*:\s*"[^"]*"/gi, '"cookie":"[redacted]"')
    .replace(/authorization:\s*bearer\s+[^\s"]+/gi, "authorization: bearer [redacted]")
    .slice(0, 500);
}

async function bootstrapSession(): Promise<void> {
  const API_BASE_URL = resolveApiBaseUrl();
  const loginUrl = new URL("/api/auth/dev-login", API_BASE_URL).toString();
  const apiHost = new URL(API_BASE_URL).host;

  console.info("[session] dev-login request", {
    apiBaseUrl: API_BASE_URL,
    apiHost,
    method: "POST",
    url: loginUrl,
    email: maskEmail(DEV_LOGIN_EMAIL),
    runtime: typeof window === "undefined" ? "ssr" : "browser",
    apiInternalUrlSet:
      typeof process !== "undefined" ? Boolean(process.env?.["API_INTERNAL_URL"]) : false,
  });

  const loginRes = await fetch(`${API_BASE_URL}/api/auth/dev-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: DEV_LOGIN_EMAIL }),
  });
  if (!loginRes.ok) {
    const contentType = loginRes.headers.get("content-type") ?? "";
    const rawBody = await loginRes.text();
    console.warn("[session] dev-login response", {
      url: loginUrl,
      method: "POST",
      status: loginRes.status,
      contentType,
      body: sanitizeLogText(rawBody),
    });
    throw new Error(`Dev login failed (${loginRes.status}).`);
  }
  const { token } = (await loginRes.json()) as { token: string };
  authToken = token;

  const [peopleRes, orgRes] = await Promise.all([
    // X-Auth-Token, not Authorization — the basic-auth gate owns that header.
    fetch(`${API_BASE_URL}/api/people`, { headers: { "X-Auth-Token": token } }),
    fetch(`${API_BASE_URL}/api/settings/org`, { headers: { "X-Auth-Token": token } }),
  ]);
  if (!peopleRes.ok) {
    throw new Error(`Failed to load org members (${peopleRes.status}).`);
  }
  if (!orgRes.ok) {
    throw new Error(`Failed to load organization profile (${orgRes.status}).`);
  }
  const { people: orgPeople } = (await peopleRes.json()) as { people: Person[] };
  people = orgPeople;
  orgProfile = (await orgRes.json()) as OrgProfile;
  CURRENT_USER_ID = token;
}

/** Idempotent — safe to call from every route's `beforeLoad` and from the http client. */
export function ensureSession(): Promise<void> {
  if (!sessionPromise) {
    sessionPromise = bootstrapSession().catch((error) => {
      // A failed bootstrap should not poison the app forever; the next
      // navigation or reload can retry once the backend is back.
      sessionPromise = null;
      throw error;
    });
  }
  return sessionPromise;
}
