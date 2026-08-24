import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import {
  getDb,
  organizationMembers,
  organizations,
  users,
  workspaceMembers,
  workspaces,
} from "@rfp-os/db";

import { AuthService } from "../auth/auth.service";
import { WorkspacesService } from "./workspaces.service";
import { ActivityService } from "../../infrastructure/activity";
import { AuditService } from "../../infrastructure/audit";
import type { Env } from "../../config/env.schema";

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

describeDb("WorkspacesService tenant isolation", () => {
  const db = getDb();
  const authService = new AuthService(db, config);
  const service = new WorkspacesService(db, new ActivityService(db), new AuditService(db));

  const orgA = randomUUID();
  const orgB = randomUUID();
  const workspaceA = randomUUID();
  const workspaceB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
  const suffix = randomUUID().slice(0, 8);
  let membershipAId = "";

  beforeAll(async () => {
    await db.insert(organizations).values([
      { id: orgA, name: `Company A ${suffix}`, domain: `company-a-${suffix}.invalid` },
      { id: orgB, name: `Company B ${suffix}`, domain: `company-b-${suffix}.invalid` },
    ]);

    await db.insert(users).values([
      { id: userA, organizationId: orgA, name: "User A", email: `user-a-${suffix}@probe.invalid` },
      { id: userB, organizationId: orgB, name: "User B", email: `user-b-${suffix}@probe.invalid` },
    ]);

    await db.insert(organizationMembers).values([
      { organizationId: orgA, userId: userA, role: "CONTRIBUTOR", status: "active" },
      { organizationId: orgB, userId: userB, role: "CONTRIBUTOR", status: "active" },
    ]);

    await db.insert(workspaces).values([
      { id: workspaceA, organizationId: orgA, name: `Workspace A ${suffix}`, slug: `workspace-a-${suffix}` },
      { id: workspaceB, organizationId: orgB, name: `Workspace B ${suffix}`, slug: `workspace-b-${suffix}` },
    ]);

    const [membershipA] = await db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, userA))
      .limit(1);
    membershipAId = membershipA!.id;

    await db.insert(workspaceMembers).values({
      workspaceId: workspaceA,
      organizationMemberId: membershipAId,
      status: "active",
    });
  });

  afterAll(async () => {
    await db.delete(workspaceMembers).where(eq(workspaceMembers.organizationMemberId, membershipAId));
    await db.delete(organizationMembers).where(inArray(organizationMembers.organizationId, [orgA, orgB]));
    await db.delete(workspaces).where(inArray(workspaces.id, [workspaceA, workspaceB]));
    await db.delete(users).where(inArray(users.id, [userA, userB]));
    await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
  });

  dbTest("allows User A into Workspace A and denies Workspace B", async () => {
    const authA = await authService.resolveAuthContext({
      userId: userA,
      sessionId: "s-a",
      activeOrganizationId: orgA,
    });

    expect(authA).not.toBeNull();

    const ownWorkspace = await service.get(authA!, workspaceA);
    expect(ownWorkspace.id).toBe(workspaceA);
    expect(ownWorkspace.organizationId).toBe(orgA);

    await expect(service.get(authA!, workspaceB)).rejects.toThrow();
  });
});
