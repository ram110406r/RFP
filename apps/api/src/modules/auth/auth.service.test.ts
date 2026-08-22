import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb, organizationMembers, organizations, users } from "@rfp-os/db";

import { AuthService } from "./auth.service";
import type { Env } from "../../config/env.schema";

/**
 * Exercises the tenant-resolution rules against a real database, because the
 * property under test — that a request can never reach another organization's
 * data — is a property of the queries, not of the TypeScript.
 *
 * Skipped rather than failed without DATABASE_URL, matching packages/db.
 */
const dbTest = process.env.DATABASE_URL ? test : test.skip;
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

const env = {
  NODE_ENV: "test",
  API_PORT: 4100,
  CORS_ORIGIN: "http://localhost:3000",
  LOG_LEVEL: "silent",
  RATE_LIMIT_TTL_MS: 60_000,
  RATE_LIMIT_LIMIT: 100,
  BETTER_AUTH_SECRET: "test-secret-that-is-long-enough-for-zod-min-32",
  BETTER_AUTH_URL: "http://localhost:4100",
  SESSION_MAX_AGE_SECONDS: 3600,
  INVITATION_TTL_HOURS: 72,
  STORAGE_REGION: "us-east-1",
  STORAGE_BUCKET: "rfp-os-documents",
  STORAGE_FORCE_PATH_STYLE: true,
  UPLOAD_MAX_BYTES: 104_857_600,
  UPLOAD_URL_TTL_SECONDS: 900,
  DOWNLOAD_URL_TTL_SECONDS: 300,
} satisfies Env;

const config = {
  get: (key: keyof typeof env) => env[key],
} as never;

describeDb("AuthService tenant resolution", () => {
  const db = getDb();
  const service = new AuthService(db, config);

  const orgA = randomUUID();
  const orgB = randomUUID();
  const userInA = randomUUID();
  const userInBoth = randomUUID();
  const orphanUser = randomUUID();
  const suffix = randomUUID().slice(0, 8);

  beforeAll(async () => {
    await db.insert(organizations).values([
      { id: orgA, name: `Isolation A ${suffix}`, domain: `a-${suffix}.invalid` },
      { id: orgB, name: `Isolation B ${suffix}`, domain: `b-${suffix}.invalid` },
    ]);

    await db.insert(users).values([
      { id: userInA, organizationId: orgA, name: "In A", email: `a-${suffix}@probe.invalid` },
      {
        id: userInBoth,
        organizationId: orgA,
        name: "In Both",
        email: `both-${suffix}@probe.invalid`,
      },
      {
        id: orphanUser,
        organizationId: null,
        name: "Orphan",
        email: `orphan-${suffix}@probe.invalid`,
      },
    ]);

    await db.insert(organizationMembers).values([
      { organizationId: orgA, userId: userInA, role: "CONTRIBUTOR", status: "active" },
      { organizationId: orgA, userId: userInBoth, role: "VIEWER", status: "active" },
      { organizationId: orgB, userId: userInBoth, role: "ADMIN", status: "active" },
    ]);
  });

  afterAll(async () => {
    await db
      .delete(organizationMembers)
      .where(inArray(organizationMembers.organizationId, [orgA, orgB]));
    await db.delete(users).where(inArray(users.id, [userInA, userInBoth, orphanUser]));
    await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
  });

  dbTest("resolves the organization pinned on the session", async () => {
    const auth = await service.resolveAuthContext({
      userId: userInBoth,
      sessionId: "s1",
      activeOrganizationId: orgB,
    });
    expect(auth?.organizationId).toBe(orgB);
    expect(auth?.role).toBe("ADMIN");
  });

  dbTest("derives permissions from the membership role, per organization", async () => {
    const inA = await service.resolveAuthContext({
      userId: userInBoth,
      sessionId: "s1",
      activeOrganizationId: orgA,
    });
    // Same human, different tenant, different authority.
    expect(inA?.role).toBe("VIEWER");
    expect(inA?.permissions).toContain("rfp:read");
    expect(inA?.permissions).not.toContain("member:invite");
  });

  dbTest("refuses a session pinned to an organization the user is not in", async () => {
    const auth = await service.resolveAuthContext({
      userId: userInA,
      sessionId: "s1",
      activeOrganizationId: orgB,
    });
    // Critically: null, not a silent fallback to the user's own organization.
    expect(auth).toBeNull();
  });

  dbTest("refuses a session pinned to a suspended membership", async () => {
    await db
      .update(organizationMembers)
      .set({ status: "suspended" })
      .where(eq(organizationMembers.userId, userInA));

    const auth = await service.resolveAuthContext({
      userId: userInA,
      sessionId: "s1",
      activeOrganizationId: orgA,
    });
    expect(auth).toBeNull();

    await db
      .update(organizationMembers)
      .set({ status: "active" })
      .where(eq(organizationMembers.userId, userInA));
  });

  dbTest("falls back to the user's default organization when the session names none", async () => {
    const auth = await service.resolveAuthContext({
      userId: userInA,
      sessionId: "s1",
      activeOrganizationId: null,
    });
    expect(auth?.organizationId).toBe(orgA);
  });

  dbTest("yields no context for a user with no membership at all", async () => {
    const auth = await service.resolveAuthContext({
      userId: orphanUser,
      sessionId: "s1",
      activeOrganizationId: null,
    });
    expect(auth).toBeNull();
  });

  dbTest("lists only the organizations the user actually belongs to", async () => {
    const memberships = await service.listMemberships(userInBoth);
    const ids = memberships.map((m) => m.organizationId).sort();
    expect(ids).toEqual([orgA, orgB].sort());

    const single = await service.listMemberships(userInA);
    expect(single.map((m) => m.organizationId)).toEqual([orgA]);
  });

  dbTest("refuses to activate an organization the user is not a member of", async () => {
    await expect(
      service.activateOrganization(
        { userId: userInA, sessionId: "s1", activeOrganizationId: orgA },
        orgB,
      ),
    ).rejects.toThrow();
  });
});
