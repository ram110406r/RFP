import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  getDb,
  organizationMembers,
  organizations,
  rolePermissions,
  roles,
  users,
  workspaceMembers,
  workspaces,
} from "@rfp-os/db";
import { permissionsForRole, type AuthContext } from "@rfp-os/types";

import { RolesService } from "./roles.service";
import { ActivityService } from "../../infrastructure/activity";
import { AuditService } from "../../infrastructure/audit";

const dbTest = process.env.DATABASE_URL ? test : test.skip;
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb("RolesService", () => {
  const db = getDb();
  const service = new RolesService(db, new ActivityService(db), new AuditService(db));

  const orgId = randomUUID();
  const ownerId = randomUUID();
  const memberId = randomUUID();
  const workspaceId = randomUUID();
  const suffix = randomUUID().slice(0, 8);

  let ownerMembershipId = "";
  let targetMembershipId = "";
  let workspaceMemberId = "";
  let createdRoleId = "";

  const auth = (): AuthContext => ({
    userId: ownerId,
    organizationId: orgId,
    role: "OWNER",
    permissions: permissionsForRole("OWNER"),
    organizationPermissions: permissionsForRole("OWNER"),
    sessionId: "roles-test-session",
  });

  beforeAll(async () => {
    await db.insert(organizations).values({
      id: orgId,
      name: `Role Test Org ${suffix}`,
      domain: `roles-${suffix}.invalid`,
    });

    await db.insert(users).values([
      { id: ownerId, organizationId: orgId, name: "Owner", email: `owner-${suffix}@probe.invalid` },
      { id: memberId, organizationId: orgId, name: "Member", email: `member-${suffix}@probe.invalid` },
    ]);

    await db.insert(organizationMembers).values([
      { organizationId: orgId, userId: ownerId, role: "OWNER", status: "active" },
      { organizationId: orgId, userId: memberId, role: "CONTRIBUTOR", status: "active" },
    ]);

    const membershipRows = await db
      .select({ id: organizationMembers.id, userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, orgId));

    ownerMembershipId = membershipRows.find((row) => row.userId === ownerId)!.id;
    targetMembershipId = membershipRows.find((row) => row.userId === memberId)!.id;

    await db.insert(workspaces).values({
      id: workspaceId,
      organizationId: orgId,
      name: `Workspace ${suffix}`,
      slug: `workspace-${suffix}`,
    });

    const [workspaceMembership] = await db
      .insert(workspaceMembers)
      .values({
        workspaceId,
        organizationMemberId: targetMembershipId,
        status: "active",
      })
      .returning({ id: workspaceMembers.id });

    workspaceMemberId = workspaceMembership!.id;
  });

  afterAll(async () => {
    if (createdRoleId) {
      await db.delete(rolePermissions).where(eq(rolePermissions.roleId, createdRoleId));
      await db.delete(roles).where(eq(roles.id, createdRoleId));
    }
    await db.delete(workspaceMembers).where(eq(workspaceMembers.id, workspaceMemberId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(organizationMembers).where(eq(organizationMembers.organizationId, orgId));
    await db.delete(users).where(inArray(users.id, [ownerId, memberId]));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  dbTest("creates, assigns, lists, and revokes a custom role", async () => {
    const created = await service.create(auth(), {
      name: `Audit Analyst ${suffix}`,
      description: "Can read audit trails",
      permissionKeys: ["audit:read"],
    });
    createdRoleId = created.id;

    await service.assign(auth(), {
      scopeType: "organization_member",
      organizationMemberId: targetMembershipId,
      roleId: createdRoleId,
    });
    await service.assign(auth(), {
      scopeType: "workspace_member",
      workspaceMemberId,
      roleId: createdRoleId,
    });

    const listed = await service.list(auth());
    const role = listed.find((item) => item.id === createdRoleId);

    expect(role).toBeDefined();
    expect(role?.permissionKeys).toContain("audit:read");
    expect(role?.organizationAssignmentCount).toBe(1);
    expect(role?.workspaceAssignmentCount).toBe(1);

    const assignments = await service.listAssignments(auth());
    expect(
      assignments.filter(
        (assignment) =>
          assignment.roleId === createdRoleId &&
          assignment.organizationMemberId === targetMembershipId,
      ).length,
    ).toBe(2);

    await service.revoke(auth(), {
      scopeType: "workspace_member",
      workspaceMemberId,
      roleId: createdRoleId,
    });

    const afterRevoke = await service.listAssignments(auth());
    expect(
      afterRevoke.some(
        (assignment) =>
          assignment.roleId === createdRoleId &&
          assignment.scopeType === "workspace_member" &&
          assignment.workspaceMemberId === workspaceMemberId,
      ),
    ).toBe(false);

    const scopedRole = await db
      .select()
      .from(roles)
      .where(and(eq(roles.id, createdRoleId), eq(roles.organizationId, orgId)));
    expect(scopedRole).toHaveLength(1);
  });
});
