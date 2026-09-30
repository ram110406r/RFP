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
} from "@rfp-os/db";
import { permissionsForRole, type AuthContext } from "@rfp-os/types";

import { ensurePermissionCatalog } from "../../common/auth/permission-catalog";
import { RolesService } from "./roles.service";

const shouldRunDbTests = Boolean(process.env.DATABASE_URL && !process.env.TENDYY_ROOT_BUN_TEST);
const dbTest = shouldRunDbTests ? test : test.skip;
const describeDb = shouldRunDbTests ? describe : describe.skip;

describeDb("RolesService", () => {
  const db = shouldRunDbTests ? getDb() : (undefined as never);
  const service = new RolesService(db);

  const orgA = randomUUID();
  const orgB = randomUUID();
  const ownerA = randomUUID();
  const ownerB = randomUUID();
  const suffix = randomUUID().slice(0, 8);
  const orgRoleId = randomUUID();
  const globalRoleId = randomUUID();

  const auth = (): AuthContext => ({
    userId: ownerA,
    organizationId: orgA,
    role: "OWNER",
    permissions: permissionsForRole("OWNER"),
    organizationPermissions: permissionsForRole("OWNER"),
    sessionId: "roles-test-session",
  });

  beforeAll(async () => {
    await ensurePermissionCatalog(db);
    await db.insert(organizations).values([
      { id: orgA, name: `Role Test A ${suffix}`, domain: `roles-a-${suffix}.invalid` },
      { id: orgB, name: `Role Test B ${suffix}`, domain: `roles-b-${suffix}.invalid` },
    ]);
    await db.insert(users).values([
      { id: ownerA, organizationId: orgA, name: "Owner A", email: `owner-a-${suffix}@probe.invalid` },
      { id: ownerB, organizationId: orgB, name: "Owner B", email: `owner-b-${suffix}@probe.invalid` },
    ]);
    const [memberA, memberB] = await db
      .insert(organizationMembers)
      .values([
        { organizationId: orgA, userId: ownerA, role: "OWNER", status: "active" },
        { organizationId: orgB, userId: ownerB, role: "OWNER", status: "active" },
      ])
      .returning({ id: organizationMembers.id });

    // Historical rows only: nothing in the product can create these any more.
    await db.insert(roles).values([
      { id: orgRoleId, organizationId: orgA, name: `Legacy A ${suffix}` },
      { id: globalRoleId, organizationId: null, name: `Legacy Global ${suffix}` },
    ]);
    const [auditRead] = await db.select({ id: permissions.id }).from(permissions).where(eq(permissions.key, "audit:read"));
    await db.insert(rolePermissions).values({ roleId: orgRoleId, permissionId: auditRead!.id });
    // Org B's assignment of the shared global role must not show in org A's counts.
    await db.insert(organizationMemberRoles).values([
      { organizationMemberId: memberA!.id, roleId: globalRoleId },
      { organizationMemberId: memberB!.id, roleId: globalRoleId },
    ]);
  });

  afterAll(async () => {
    await db.delete(roles).where(inArray(roles.id, [orgRoleId, globalRoleId]));
    await db.delete(organizationMembers).where(inArray(organizationMembers.organizationId, [orgA, orgB]));
    await db.delete(users).where(inArray(users.id, [ownerA, ownerB]));
    await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
  });

  dbTest("lists own and global roles with permission keys, never another org's role", async () => {
    const listed = await service.list(auth());
    const own = listed.find((role) => role.id === orgRoleId);
    expect(own?.permissionKeys).toEqual(["audit:read"]);
    expect(listed.some((role) => role.id === globalRoleId)).toBe(true);
  });

  dbTest("counts assignments within the caller's organization only", async () => {
    const listed = await service.list(auth());
    const global = listed.find((role) => role.id === globalRoleId);
    expect(global?.organizationAssignmentCount).toBe(1);
    expect(global?.assignmentCount).toBe(1);
  });

  dbTest("lists assignments scoped to the caller's organization", async () => {
    const assignments = await service.listAssignments(auth());
    expect(assignments.filter((assignment) => assignment.roleId === globalRoleId)).toHaveLength(1);
  });
});
