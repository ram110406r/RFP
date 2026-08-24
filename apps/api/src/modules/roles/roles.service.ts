import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  organizationMemberRoles,
  organizationMembers,
  permissions,
  rolePermissions,
  roles,
  workspaceMemberRoles,
  workspaceMembers,
  workspaces,
  withTransaction,
  type Database,
} from "@rfp-os/db";
import { ORG_ROLES, type AuthContext, type Permission } from "@rfp-os/types";

import { ensurePermissionCatalog } from "../../common/auth/permission-catalog";
import { ActivityService } from "../../infrastructure/activity";
import { AuditService } from "../../infrastructure/audit";
import { DATABASE } from "../../infrastructure/database";
import type { AssignRoleInput, CreateRoleInput, UpdateRoleInput } from "./roles.dto";

@Injectable()
export class RolesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly activity: ActivityService,
    private readonly audit: AuditService,
  ) {}

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

    const permissionRows = await this.db
      .select({
        roleId: rolePermissions.roleId,
        key: permissions.key,
      })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(
        inArray(
          rolePermissions.roleId,
          roleRows.map((role) => role.id),
        ),
      );

    const orgCounts = await this.db
      .select({
        roleId: organizationMemberRoles.roleId,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(organizationMemberRoles)
      .groupBy(organizationMemberRoles.roleId);

    const workspaceCounts = await this.db
      .select({
        roleId: workspaceMemberRoles.roleId,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(workspaceMemberRoles)
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

  async create(auth: AuthContext, input: CreateRoleInput) {
    this.assertCustomRoleName(input.name);
    await ensurePermissionCatalog(this.db);

    return withTransaction(async (tx) => {
      const permissionIds = await this.resolvePermissionIds(input.permissionKeys);
      const [role] = await tx
        .insert(roles)
        .values({
          organizationId: auth.organizationId,
          name: input.name,
          description: input.description ?? "",
          isSystem: false,
        })
        .returning();

      if (!role) {
        throw new BadRequestException({
          code: "ROLE_NOT_CREATED",
          message: "Could not create the role.",
        });
      }

      await tx.insert(rolePermissions).values(
        permissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
      );

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          actorId: auth.userId,
          action: "ROLE_CREATED",
          entityType: "role",
          entityId: role.id,
          newValue: { ...role, permissionKeys: input.permissionKeys },
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          actorId: auth.userId,
          actorLabel: auth.userId,
          action: "ROLE_CREATED",
          entityType: "role",
          entityId: role.id,
          label: `Role created: ${role.name}`,
          summary: `Created custom role ${role.name}`,
        },
        tx,
      );

      return {
        ...role,
        permissionKeys: unique(input.permissionKeys),
      };
    });
  }

  async update(auth: AuthContext, roleId: string, input: UpdateRoleInput) {
    const existing = await this.requireManagedRole(auth.organizationId, roleId);
    if (input.name) this.assertCustomRoleName(input.name);
    await ensurePermissionCatalog(this.db);

    return withTransaction(async (tx) => {
      const [updated] = await tx
        .update(roles)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          updatedAt: new Date(),
        })
        .where(eq(roles.id, roleId))
        .returning();

      if (!updated) {
        throw new NotFoundException({ code: "NOT_FOUND", message: "Role not found." });
      }

      let permissionKeys = await this.rolePermissionKeys(roleId);
      if (input.permissionKeys) {
        const permissionIds = await this.resolvePermissionIds(input.permissionKeys);
        await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
        await tx.insert(rolePermissions).values(
          permissionIds.map((permissionId) => ({
            roleId,
            permissionId,
          })),
        );
        permissionKeys = unique(input.permissionKeys);
      }

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          actorId: auth.userId,
          action: "ROLE_UPDATED",
          entityType: "role",
          entityId: roleId,
          previousValue: existing,
          newValue: { ...updated, permissionKeys },
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          actorId: auth.userId,
          actorLabel: auth.userId,
          action: "ROLE_UPDATED",
          entityType: "role",
          entityId: roleId,
          label: `Role updated: ${updated.name}`,
          summary: `Updated custom role ${updated.name}`,
        },
        tx,
      );

      return { ...updated, permissionKeys };
    });
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

  async assign(auth: AuthContext, input: AssignRoleInput) {
    const role = await this.requireAssignableRole(auth.organizationId, input.roleId);

    return withTransaction(async (tx) => {
      if (input.scopeType === "organization_member") {
        const member = await this.requireOrganizationMember(auth.organizationId, input.organizationMemberId);

        await tx
          .insert(organizationMemberRoles)
          .values({
            organizationMemberId: member.id,
            roleId: role.id,
          })
          .onConflictDoNothing();

        await this.audit.record(
          {
            organizationId: auth.organizationId,
            actorId: auth.userId,
            action: "ROLE_ASSIGNED",
            entityType: "organization_member_role",
            entityId: `${member.id}:${role.id}`,
            newValue: input,
          },
          tx,
        );
        await this.activity.record(
          {
            organizationId: auth.organizationId,
            actorId: auth.userId,
            actorLabel: auth.userId,
            action: "ROLE_ASSIGNED",
            entityType: "organization_member_role",
            entityId: `${member.id}:${role.id}`,
            kind: "assigned",
            label: "Role assigned",
            summary: `Assigned role ${role.name} to organization member ${member.id}`,
          },
          tx,
        );

        return { assigned: true, scopeType: input.scopeType, roleId: role.id, memberId: member.id };
      }

      const workspaceMember = await this.requireWorkspaceMember(auth.organizationId, input.workspaceMemberId);

      await tx
        .insert(workspaceMemberRoles)
        .values({
          workspaceMemberId: workspaceMember.id,
          roleId: role.id,
        })
        .onConflictDoNothing();

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          actorId: auth.userId,
          action: "ROLE_ASSIGNED",
          entityType: "workspace_member_role",
          entityId: `${workspaceMember.id}:${role.id}`,
          newValue: input,
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: workspaceMember.workspaceId,
          actorId: auth.userId,
          actorLabel: auth.userId,
          action: "ROLE_ASSIGNED",
          entityType: "workspace_member_role",
          entityId: `${workspaceMember.id}:${role.id}`,
          kind: "assigned",
          label: "Workspace role assigned",
          summary: `Assigned role ${role.name} in workspace ${workspaceMember.workspaceId}`,
        },
        tx,
      );

      return {
        assigned: true,
        scopeType: input.scopeType,
        roleId: role.id,
        memberId: workspaceMember.id,
      };
    });
  }

  async revoke(auth: AuthContext, input: AssignRoleInput) {
    const role = await this.requireAssignableRole(auth.organizationId, input.roleId);

    return withTransaction(async (tx) => {
      if (input.scopeType === "organization_member") {
        await this.requireOrganizationMember(auth.organizationId, input.organizationMemberId);
        await tx
          .delete(organizationMemberRoles)
          .where(
            and(
              eq(organizationMemberRoles.organizationMemberId, input.organizationMemberId),
              eq(organizationMemberRoles.roleId, role.id),
            ),
          );

        await this.audit.record(
          {
            organizationId: auth.organizationId,
            actorId: auth.userId,
            action: "ROLE_REVOKED",
            entityType: "organization_member_role",
            entityId: `${input.organizationMemberId}:${role.id}`,
            previousValue: input,
          },
          tx,
        );
        await this.activity.record(
          {
            organizationId: auth.organizationId,
            actorId: auth.userId,
            actorLabel: auth.userId,
            action: "ROLE_REVOKED",
            entityType: "organization_member_role",
            entityId: `${input.organizationMemberId}:${role.id}`,
            kind: "rejected",
            label: "Role revoked",
            summary: `Revoked role ${role.name} from organization member ${input.organizationMemberId}`,
          },
          tx,
        );

        return { revoked: true, scopeType: input.scopeType, roleId: role.id };
      }

      const workspaceMember = await this.requireWorkspaceMember(
        auth.organizationId,
        input.workspaceMemberId,
      );
      await tx
        .delete(workspaceMemberRoles)
        .where(
          and(
            eq(workspaceMemberRoles.workspaceMemberId, input.workspaceMemberId),
            eq(workspaceMemberRoles.roleId, role.id),
          ),
        );

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          actorId: auth.userId,
          action: "ROLE_REVOKED",
          entityType: "workspace_member_role",
          entityId: `${input.workspaceMemberId}:${role.id}`,
          previousValue: input,
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: workspaceMember.workspaceId,
          actorId: auth.userId,
          actorLabel: auth.userId,
          action: "ROLE_REVOKED",
          entityType: "workspace_member_role",
          entityId: `${input.workspaceMemberId}:${role.id}`,
          kind: "rejected",
          label: "Workspace role revoked",
          summary: `Revoked role ${role.name} from workspace member ${input.workspaceMemberId}`,
        },
        tx,
      );

      return { revoked: true, scopeType: input.scopeType, roleId: role.id };
    });
  }

  private async resolvePermissionIds(permissionKeys: readonly Permission[]) {
    const rows = await this.db
      .select({
        id: permissions.id,
        key: permissions.key,
      })
      .from(permissions)
      .where(inArray(permissions.key, unique(permissionKeys)));

    if (rows.length !== unique(permissionKeys).length) {
      throw new BadRequestException({
        code: "PERMISSION_NOT_FOUND",
        message: "One or more permissions are not in the catalog.",
      });
    }

    return rows.map((row) => row.id);
  }

  private async rolePermissionKeys(roleId: string): Promise<readonly Permission[]> {
    const rows = await this.db
      .select({ key: permissions.key })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(rolePermissions.roleId, roleId));

    return rows.map((row) => row.key as Permission);
  }

  private async requireManagedRole(organizationId: string, roleId: string) {
    const [role] = await this.db
      .select()
      .from(roles)
      .where(and(eq(roles.id, roleId), eq(roles.organizationId, organizationId)))
      .limit(1);

    if (!role) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Role not found." });
    }
    if (role.isSystem) {
      throw new ForbiddenException({
        code: "SYSTEM_ROLE",
        message: "Built-in roles cannot be modified here.",
      });
    }
    return role;
  }

  private async requireAssignableRole(organizationId: string, roleId: string) {
    const [role] = await this.db
      .select()
      .from(roles)
      .where(and(eq(roles.id, roleId), or(eq(roles.organizationId, organizationId), isNull(roles.organizationId))))
      .limit(1);

    if (!role) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Role not found." });
    }
    return role;
  }

  private async requireOrganizationMember(organizationId: string, organizationMemberId: string) {
    const [member] = await this.db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.id, organizationMemberId),
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.status, "active"),
        ),
      )
      .limit(1);

    if (!member) {
      throw new ConflictException({
        code: "MEMBER_NOT_ACTIVE",
        message: "Only active organization members may receive custom roles.",
      });
    }
    return member;
  }

  private async requireWorkspaceMember(organizationId: string, workspaceMemberId: string) {
    const [member] = await this.db
      .select({
        id: workspaceMembers.id,
        organizationMemberId: workspaceMembers.organizationMemberId,
        workspaceId: workspaceMembers.workspaceId,
      })
      .from(workspaceMembers)
      .innerJoin(
        organizationMembers,
        eq(organizationMembers.id, workspaceMembers.organizationMemberId),
      )
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(
        and(
          eq(workspaceMembers.id, workspaceMemberId),
          eq(workspaceMembers.status, "active"),
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.status, "active"),
          eq(workspaces.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!member) {
      throw new ConflictException({
        code: "WORKSPACE_MEMBER_NOT_ACTIVE",
        message: "Only active workspace members may receive workspace-scoped roles.",
      });
    }
    return member;
  }

  private assertCustomRoleName(name: string) {
    if ((ORG_ROLES as readonly string[]).includes(name.toUpperCase())) {
      throw new BadRequestException({
        code: "RESERVED_ROLE_NAME",
        message: "That role name is reserved for a built-in platform role.",
      });
    }
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
