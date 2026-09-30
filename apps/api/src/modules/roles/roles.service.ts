import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  organizationMemberRoles,
  organizationMembers,
  permissions,
  rolePermissions,
  roles,
  workspaceMemberRoles,
  workspaceMembers,
  type Database,
} from "@rfp-os/db";
import type { AuthContext } from "@rfp-os/types";

import { ensurePermissionCatalog } from "../../common/auth/permission-catalog";
import { DATABASE } from "../../infrastructure/database";

/**
 * Read-only view of roles.
 *
 * Authorization is decided by the seven fixed organization roles in
 * @rfp-os/types. Custom roles were retired: their write endpoints answer 410
 * (see RolesController), their assignments were deleted by migration 0035, and
 * AuthService no longer reads them. What remains here is what the UI still
 * shows — the role catalogue and any historical role rows.
 */
@Injectable()
export class RolesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(auth: AuthContext) {
    await ensurePermissionCatalog(this.db);

    const roleRows = await this.db
      .select({
        id: roles.id,
        name: roles.name,
        description: roles.description,
        isSystem: roles.isSystem,
        organizationId: roles.organizationId,
        createdAt: roles.createdAt,
        updatedAt: roles.updatedAt,
      })
      .from(roles)
      .where(or(eq(roles.organizationId, auth.organizationId), isNull(roles.organizationId)));

    if (roleRows.length === 0) return [];
    const roleIds = roleRows.map((role) => role.id);

    const permissionRows = await this.db
      .select({
        roleId: rolePermissions.roleId,
        key: permissions.key,
      })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(inArray(rolePermissions.roleId, roleIds));

    /*
     * Counts are scoped to the caller's organization. Global roles
     * (organization_id null) are shared across tenants, so an unscoped count
     * would disclose how many members other organizations assigned them.
     */
    const orgCounts = await this.db
      .select({
        roleId: organizationMemberRoles.roleId,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(organizationMemberRoles)
      .innerJoin(organizationMembers, eq(organizationMembers.id, organizationMemberRoles.organizationMemberId))
      .where(
        and(
          inArray(organizationMemberRoles.roleId, roleIds),
          eq(organizationMembers.organizationId, auth.organizationId),
        ),
      )
      .groupBy(organizationMemberRoles.roleId);

    const workspaceCounts = await this.db
      .select({
        roleId: workspaceMemberRoles.roleId,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(workspaceMemberRoles)
      .innerJoin(workspaceMembers, eq(workspaceMembers.id, workspaceMemberRoles.workspaceMemberId))
      .innerJoin(organizationMembers, eq(organizationMembers.id, workspaceMembers.organizationMemberId))
      .where(
        and(
          inArray(workspaceMemberRoles.roleId, roleIds),
          eq(organizationMembers.organizationId, auth.organizationId),
        ),
      )
      .groupBy(workspaceMemberRoles.roleId);

    const permissionsByRole = groupPermissions(permissionRows);
    const orgCountByRole = new Map(orgCounts.map((row) => [row.roleId, row.count]));
    const workspaceCountByRole = new Map(workspaceCounts.map((row) => [row.roleId, row.count]));

    return roleRows.map((role) => ({
      ...role,
      permissionKeys: permissionsByRole[role.id] ?? [],
      assignmentCount:
        (orgCountByRole.get(role.id) ?? 0) + (workspaceCountByRole.get(role.id) ?? 0),
      organizationAssignmentCount: orgCountByRole.get(role.id) ?? 0,
      workspaceAssignmentCount: workspaceCountByRole.get(role.id) ?? 0,
    }));
  }

  async permissionCatalog() {
    await ensurePermissionCatalog(this.db);
    return this.db.select().from(permissions);
  }

  async listAssignments(auth: AuthContext) {
    const organizationAssignments = await this.db
      .select({
        scopeType: sql<"organization_member">`'organization_member'`,
        roleId: organizationMemberRoles.roleId,
        organizationMemberId: organizationMemberRoles.organizationMemberId,
        workspaceMemberId: sql<string | null>`null`,
        workspaceId: sql<string | null>`null`,
      })
      .from(organizationMemberRoles)
      .innerJoin(
        organizationMembers,
        eq(organizationMembers.id, organizationMemberRoles.organizationMemberId),
      )
      .where(eq(organizationMembers.organizationId, auth.organizationId));

    const workspaceAssignments = await this.db
      .select({
        scopeType: sql<"workspace_member">`'workspace_member'`,
        roleId: workspaceMemberRoles.roleId,
        organizationMemberId: workspaceMembers.organizationMemberId,
        workspaceMemberId: workspaceMemberRoles.workspaceMemberId,
        workspaceId: workspaceMembers.workspaceId,
      })
      .from(workspaceMemberRoles)
      .innerJoin(workspaceMembers, eq(workspaceMembers.id, workspaceMemberRoles.workspaceMemberId))
      .innerJoin(
        organizationMembers,
        eq(organizationMembers.id, workspaceMembers.organizationMemberId),
      )
      .where(eq(organizationMembers.organizationId, auth.organizationId));

    return [...organizationAssignments, ...workspaceAssignments];
  }
}

function groupPermissions(rows: { roleId: string; key: string }[]) {
  const grouped: Record<string, readonly string[]> = {};

  for (const row of rows) {
    grouped[row.roleId] = unique([...(grouped[row.roleId] ?? []), row.key]);
  }

  return grouped;
}

function unique<T>(values: readonly T[]): readonly T[] {
  return [...new Set(values)];
}
