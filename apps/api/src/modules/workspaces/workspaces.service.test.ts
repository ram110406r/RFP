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
import { testEnv } from "../../config/test-env";

const shouldRunDbTests = Boolean(process.env.DATABASE_URL && !process.env.TENDYY_ROOT_BUN_TEST);
const dbTest = shouldRunDbTests ? test : test.skip;
const describeDb = shouldRunDbTests ? describe : describe.skip;

const env = testEnv();

const config = {
  get: (key: keyof typeof env) => env[key],
} as never;

describeDb("WorkspacesService tenant isolation", () => {
// Database scenarios are skipped locally unless a disposable DATABASE_URL is supplied.
const db = shouldRunDbTests ? getDb() : (undefined as never);
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
  if (!process.env.DATABASE_URL) return;
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
