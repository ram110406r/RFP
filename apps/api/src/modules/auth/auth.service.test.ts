import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import {
  getDb,
  organizationMemberRoles,
  organizationMembers,
  organizations,
  permissions,
  rolePermissions,
  roles,
  users,
  workspaceMemberRoles,
  workspaceMembers,
  workspaces,
} from "@rfp-os/db";
import { hasWorkspacePermission } from "@rfp-os/types";

import { AuthService } from "./auth.service";
import { testEnv } from "../../config/test-env";

/**
 * Exercises the tenant-resolution rules against a real database, because the
 * property under test — that a request can never reach another organization's
 * data — is a property of the queries, not of the TypeScript.
 *
 * Skipped rather than failed without DATABASE_URL, matching packages/db.
 */
const shouldRunDbTests = Boolean(process.env.DATABASE_URL && !process.env.TENDYY_ROOT_BUN_TEST);
const dbTest = shouldRunDbTests ? test : test.skip;
const describeDb = shouldRunDbTests ? describe : describe.skip;

const env = testEnv();

const config = {
  get: (key: keyof typeof env) => env[key],
} as never;

describeDb("AuthService tenant resolution", () => {
  const db = shouldRunDbTests ? getDb() : (undefined as never);
  const service = new AuthService(db, config);

  const orgA = randomUUID();
  const orgB = randomUUID();
  const userInA = randomUUID();
  const userInBoth = randomUUID();
  const orphanUser = randomUUID();
  const workspaceA = randomUUID();
  const workspaceA2 = randomUUID();
  const workspaceB = randomUUID();
  const orgCustomRole = randomUUID();
  const workspaceCustomRole = randomUUID();
  const workspaceMemberInA = randomUUID();
  const suffix = randomUUID().slice(0, 8);
  let memberInAId = "";

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

    await db.insert(workspaces).values([
      { id: workspaceA, organizationId: orgA, name: `Workspace A ${suffix}`, slug: `wa-${suffix}` },
      { id: workspaceA2, organizationId: orgA, name: `Workspace A2 ${suffix}`, slug: `wa2-${suffix}` },
      { id: workspaceB, organizationId: orgB, name: `Workspace B ${suffix}`, slug: `wb-${suffix}` },
    ]);

    const [memberInA] = await db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, userInA))
      .limit(1);
    memberInAId = memberInA!.id;

    await db.insert(workspaceMembers).values({
      id: workspaceMemberInA,
      workspaceId: workspaceA,
      organizationMemberId: memberInAId,
      status: "active",
    });

    await db
      .insert(permissions)
      .values([
        {
          key: "audit:read",
          label: "Audit Read",
          description: "Audit read permission",
          resource: "audit",
          action: "read",
        },
        {
          key: "team:update",
          label: "Team Update",
          description: "Team update permission",
          resource: "team",
          action: "update",
        },
      ])
      .onConflictDoNothing({ target: permissions.key });

    await db.insert(roles).values([
      {
        id: orgCustomRole,
        organizationId: orgA,
        name: `Compliance Auditor ${suffix}`,
        description: "Org-scoped audit access",
      },
      {
        id: workspaceCustomRole,
        organizationId: orgA,
        name: `Workspace Operator ${suffix}`,
        description: "Workspace-scoped team access",
      },
    ]);

    const permissionRows = await db
      .select({ id: permissions.id, key: permissions.key })
      .from(permissions)
      .where(inArray(permissions.key, ["audit:read", "team:update"]));

    const permissionByKey = new Map(permissionRows.map((row) => [row.key, row.id]));

    await db.insert(rolePermissions).values([
      { roleId: orgCustomRole, permissionId: permissionByKey.get("audit:read")! },
      { roleId: workspaceCustomRole, permissionId: permissionByKey.get("team:update")! },
    ]);

    await db.insert(organizationMemberRoles).values({
      organizationMemberId: memberInAId,
      roleId: orgCustomRole,
    });

    await db.insert(workspaceMemberRoles).values({
      workspaceMemberId: workspaceMemberInA,
      roleId: workspaceCustomRole,
    });
  });

  afterAll(async () => {
    await db
      .delete(workspaceMemberRoles)
      .where(eq(workspaceMemberRoles.workspaceMemberId, workspaceMemberInA));
    await db.delete(organizationMemberRoles).where(eq(organizationMemberRoles.roleId, orgCustomRole));
    await db.delete(rolePermissions).where(inArray(rolePermissions.roleId, [orgCustomRole, workspaceCustomRole]));
    await db.delete(roles).where(inArray(roles.id, [orgCustomRole, workspaceCustomRole]));
    await db.delete(workspaceMembers).where(eq(workspaceMembers.id, workspaceMemberInA));
    await db.delete(workspaces).where(inArray(workspaces.id, [workspaceA, workspaceA2, workspaceB]));
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

  dbTest("merges organization-scoped custom role permissions into the auth context", async () => {
    const auth = await service.resolveAuthContext({
      userId: userInA,
      sessionId: "s1",
      activeOrganizationId: orgA,
    });

    expect(auth?.organizationPermissions).toContain("audit:read");
    expect(auth?.permissions).toContain("audit:read");
  });

  dbTest("limits workspace-scoped custom role permissions to the assigned workspace", async () => {
    const auth = await service.resolveAuthContext({
      userId: userInA,
      sessionId: "s1",
      activeOrganizationId: orgA,
    });

    expect(auth?.permissions).toContain("team:update");
    expect(auth?.workspaceIds).toContain(workspaceA);
    expect(hasWorkspacePermission(auth!, workspaceA, "team:update")).toBe(true);
    expect(hasWorkspacePermission(auth!, workspaceA2, "team:update")).toBe(false);
    expect(hasWorkspacePermission(auth!, workspaceB, "team:update")).toBe(false);
  });

  dbTest("grants built-in workspace permissions only through active workspace membership", async () => {
    const auth = await service.resolveAuthContext({
      userId: userInA,
      sessionId: "s1",
      activeOrganizationId: orgA,
    });

    expect(auth?.organizationPermissions).not.toContain("workspace:read");
    expect(hasWorkspacePermission(auth!, workspaceA, "workspace:read")).toBe(true);
    expect(hasWorkspacePermission(auth!, workspaceA, "team:read")).toBe(true);
    expect(hasWorkspacePermission(auth!, workspaceA2, "workspace:read")).toBe(false);
    expect(hasWorkspacePermission(auth!, workspaceA2, "team:read")).toBe(false);
  });

  dbTest("refreshes organization and workspace custom role permissions on the next resolution", async () => {
    await db
      .delete(organizationMemberRoles)
      .where(eq(organizationMemberRoles.organizationMemberId, memberInAId));
    await db
      .delete(workspaceMemberRoles)
      .where(eq(workspaceMemberRoles.workspaceMemberId, workspaceMemberInA));

    const before = await service.resolveAuthContext({
      userId: userInA,
      sessionId: "s1",
      activeOrganizationId: orgA,
    });
    expect(before?.permissions).not.toContain("audit:read");
    expect(hasWorkspacePermission(before!, workspaceA, "team:update")).toBe(false);

    await db.insert(organizationMemberRoles).values({
      organizationMemberId: memberInAId,
      roleId: orgCustomRole,
    });
    await db.insert(workspaceMemberRoles).values({
      workspaceMemberId: workspaceMemberInA,
      roleId: workspaceCustomRole,
    });

    const afterAssign = await service.resolveAuthContext({
      userId: userInA,
      sessionId: "s1",
      activeOrganizationId: orgA,
    });
    expect(afterAssign?.permissions).toContain("audit:read");
    expect(hasWorkspacePermission(afterAssign!, workspaceA, "team:update")).toBe(true);
    expect(hasWorkspacePermission(afterAssign!, workspaceA2, "team:update")).toBe(false);

    await db
      .delete(organizationMemberRoles)
      .where(eq(organizationMemberRoles.organizationMemberId, memberInAId));
    await db
      .delete(workspaceMemberRoles)
      .where(eq(workspaceMemberRoles.workspaceMemberId, workspaceMemberInA));

    const afterRevoke = await service.resolveAuthContext({
      userId: userInA,
      sessionId: "s1",
      activeOrganizationId: orgA,
    });
    expect(afterRevoke?.permissions).not.toContain("audit:read");
    expect(hasWorkspacePermission(afterRevoke!, workspaceA, "team:update")).toBe(false);

    await db.insert(organizationMemberRoles).values({
      organizationMemberId: memberInAId,
      roleId: orgCustomRole,
    });
    await db.insert(workspaceMemberRoles).values({
      workspaceMemberId: workspaceMemberInA,
      roleId: workspaceCustomRole,
    });
  });
});
