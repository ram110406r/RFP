import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  organizationMembers,
  teamMembers,
  teams,
  users,
  withTransaction,
  workspaceMembers,
  workspaces,
  type Database,
} from "@rfp-os/db";
import {
  hasOrganizationPermission,
  hasWorkspacePermission,
  type AuthContext,
} from "@rfp-os/types";

import { DATABASE } from "../../infrastructure/database";
import { ActivityService } from "../../infrastructure/activity";
import { AuditService } from "../../infrastructure/audit";
import type {
  AddWorkspaceMemberInput,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
} from "./workspaces.dto";

@Injectable()
export class WorkspacesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly activity: ActivityService,
    private readonly audit: AuditService,
  ) {}

  async list(auth: AuthContext, requestedStatus = "active") {
    if (!["active", "archived", "all"].includes(requestedStatus)) {
      throw new ConflictException({ code: "INVALID_WORKSPACE_STATUS", message: "status must be active, archived, or all." });
    }
    const includeInactive = requestedStatus !== "active";
    const workspaceStatus = requestedStatus === "archived" ? "archived" : "active";
    if (includeInactive && !hasOrganizationPermission(auth, "workspace:archive")) {
      throw new ForbiddenException({ code: "WORKSPACE_ARCHIVE_FORBIDDEN", message: "Archived workspaces are restricted to workspace administrators." });
    }
    if (hasOrganizationPermission(auth, "workspace:read")) {
      return this.db
        .select()
        .from(workspaces)
        .where(and(eq(workspaces.organizationId, auth.organizationId), ...(requestedStatus === "all" ? [] : [eq(workspaces.status, workspaceStatus)])))
        .orderBy(desc(workspaces.createdAt));
    }

    if (!auth.workspaceIds || auth.workspaceIds.length === 0) {
      return [];
    }

    return this.db
      .select()
      .from(workspaces)
      .where(
        and(
          eq(workspaces.organizationId, auth.organizationId),
          eq(workspaces.status, "active"),
          inArray(workspaces.id, [...auth.workspaceIds]),
        ),
      )
      .orderBy(desc(workspaces.createdAt));
  }

  async create(auth: AuthContext, input: CreateWorkspaceInput) {
    this.assertOrganizationPermission(auth, "workspace:create");

    const [workspace] = await withTransaction(async (tx) => {
      const [created] = await tx
        .insert(workspaces)
        .values({
          organizationId: auth.organizationId,
          name: input.name,
          slug: input.slug,
          description: input.description ?? "",
        })
        .returning();

      const [ownerMembership] = await tx
        .select({ id: organizationMembers.id })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, auth.organizationId),
            eq(organizationMembers.userId, auth.userId),
            eq(organizationMembers.status, "active"),
          ),
        )
        .limit(1);
      if (!ownerMembership) throw new ForbiddenException({ code: "NO_ORGANIZATION", message: "Active membership required." });
      await tx.insert(workspaceMembers).values({
        workspaceId: created!.id,
        organizationMemberId: ownerMembership.id,
        status: "active",
      });

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: created!.id,
          actorId: auth.userId,
          action: "WORKSPACE_CREATED",
          entityType: "workspace",
          entityId: created!.id,
          newValue: created,
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: created!.id,
          actorId: auth.userId,
          actorLabel: auth.userId,
          action: "WORKSPACE_CREATED",
          entityType: "workspace",
          entityId: created!.id,
          label: `Workspace created: ${created!.name}`,
          summary: `Created workspace ${created!.name}`,
        },
        tx,
      );

      return [created!];
    });

    return workspace;
  }

  async get(auth: AuthContext, workspaceId: string) {
    this.assertWorkspacePermission(auth, workspaceId, "workspace:read");
    return this.requireWorkspace(auth.organizationId, workspaceId);
  }

  async update(auth: AuthContext, workspaceId: string, input: UpdateWorkspaceInput) {
    this.assertWorkspacePermission(auth, workspaceId, "workspace:update");
    const existing = await this.requireWorkspace(auth.organizationId, workspaceId);
    const [updated] = await withTransaction(async (tx) => {
      const [next] = await tx
        .update(workspaces)
        .set({ ...input, updatedAt: new Date() })
        .where(
          and(eq(workspaces.id, workspaceId), eq(workspaces.organizationId, auth.organizationId)),
        )
        .returning();

      if (!next) {
        throw new NotFoundException({ code: "NOT_FOUND", message: "Workspace not found." });
      }

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId,
          actorId: auth.userId,
          action: "WORKSPACE_UPDATED",
          entityType: "workspace",
          entityId: workspaceId,
          previousValue: existing,
          newValue: next,
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId,
          actorId: auth.userId,
          actorLabel: auth.userId,
          action: "WORKSPACE_UPDATED",
          entityType: "workspace",
          entityId: workspaceId,
          label: `Workspace updated: ${next!.name}`,
          summary: `Updated workspace ${next!.name}`,
        },
        tx,
      );

      return [next];
    });

    return updated;
  }

  async archive(auth: AuthContext, workspaceId: string) {
    this.assertWorkspacePermission(auth, workspaceId, "workspace:archive");
    const existing = await this.requireWorkspace(auth.organizationId, workspaceId);
    const [archived] = await withTransaction(async (tx) => {
      const [next] = await tx
        .update(workspaces)
        .set({ status: "archived", updatedAt: new Date() })
        .where(
          and(eq(workspaces.id, workspaceId), eq(workspaces.organizationId, auth.organizationId)),
        )
        .returning();

      if (!next) {
        throw new NotFoundException({ code: "NOT_FOUND", message: "Workspace not found." });
      }

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId,
          actorId: auth.userId,
          action: "WORKSPACE_ARCHIVED",
          entityType: "workspace",
          entityId: workspaceId,
          previousValue: existing,
          newValue: next,
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId,
          actorId: auth.userId,
          actorLabel: auth.userId,
          action: "WORKSPACE_ARCHIVED",
          entityType: "workspace",
          entityId: workspaceId,
          kind: "rejected",
          label: `Workspace archived: ${next!.name}`,
          summary: `Archived workspace ${next!.name}`,
        },
        tx,
      );

      return [next];
    });

    return archived;
  }

  async listMembers(auth: AuthContext, workspaceId: string) {
    this.assertWorkspacePermission(auth, workspaceId, "workspace:member:read");
    await this.requireWorkspace(auth.organizationId, workspaceId);
    return this.db
      .select({
        workspaceMemberId: workspaceMembers.id,
        organizationMemberId: workspaceMembers.organizationMemberId,
        status: workspaceMembers.status,
        userId: users.id,
        name: users.name,
        email: users.email,
      })
      .from(workspaceMembers)
      .innerJoin(
        organizationMembers,
        eq(organizationMembers.id, workspaceMembers.organizationMemberId),
      )
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspaceId))
      .orderBy(desc(users.createdAt));
  }

  async addMember(auth: AuthContext, workspaceId: string, input: AddWorkspaceMemberInput) {
    this.assertWorkspacePermission(auth, workspaceId, "workspace:member:manage");
    const workspace = await this.requireWorkspace(auth.organizationId, workspaceId);
    const member = await this.requireActiveOrganizationMember(
      auth.organizationId,
      input.organizationMemberId,
    );

    if (member.organizationId !== workspace.organizationId) {
      throw new ForbiddenException({
        code: "CROSS_ORGANIZATION",
        message: "Workspace membership must stay within the organization.",
      });
    }

    const [added] = await withTransaction(async (tx) => {
      const [created] = await tx
        .insert(workspaceMembers)
        .values({
          workspaceId,
          organizationMemberId: input.organizationMemberId,
          status: "active",
        })
        .onConflictDoUpdate({
          target: [workspaceMembers.workspaceId, workspaceMembers.organizationMemberId],
          set: { status: "active", updatedAt: new Date() },
        })
        .returning();

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId,
          actorId: auth.userId,
          action: "WORKSPACE_MEMBER_ADDED",
          entityType: "workspace_member",
          entityId: created!.id,
          newValue: created,
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId,
          actorId: auth.userId,
          actorLabel: auth.userId,
          action: "WORKSPACE_MEMBER_ADDED",
          entityType: "workspace_member",
          entityId: created!.id,
          label: "Workspace member added",
          summary: `Added member ${input.organizationMemberId} to workspace ${workspace.name}`,
        },
        tx,
      );

      return [created!];
    });

    return added;
  }

  async removeMember(auth: AuthContext, workspaceId: string, organizationMemberId: string) {
    this.assertWorkspacePermission(auth, workspaceId, "workspace:member:manage");
    await this.requireWorkspace(auth.organizationId, workspaceId);
    const [removed] = await withTransaction(async (tx) => {
      const [next] = await tx
        .update(workspaceMembers)
        .set({ status: "removed", updatedAt: new Date() })
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspaceId),
            eq(workspaceMembers.organizationMemberId, organizationMemberId),
          ),
        )
        .returning();

      if (!next) {
        throw new NotFoundException({
          code: "NOT_FOUND",
          message: "Workspace member not found.",
        });
      }

      // Team links are only valid while the member has this workspace.
      const workspaceTeams = await tx
        .select({ id: teams.id })
        .from(teams)
        .where(and(eq(teams.workspaceId, workspaceId), eq(teams.organizationId, auth.organizationId)));
      if (workspaceTeams.length > 0) {
        await tx
          .delete(teamMembers)
          .where(
            and(
              inArray(teamMembers.teamId, workspaceTeams.map((team) => team.id)),
              eq(teamMembers.organizationMemberId, organizationMemberId),
            ),
          );
      }

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId,
          actorId: auth.userId,
          action: "WORKSPACE_MEMBER_REMOVED",
          entityType: "workspace_member",
          entityId: next.id,
          previousValue: next,
          newValue: { ...next, status: "removed" },
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId,
          actorId: auth.userId,
          actorLabel: auth.userId,
          action: "WORKSPACE_MEMBER_REMOVED",
          entityType: "workspace_member",
          entityId: next.id,
          kind: "rejected",
          label: "Workspace member removed",
          summary: `Removed member ${organizationMemberId} from workspace ${workspaceId}`,
        },
        tx,
      );

      return [next];
    });

    return removed;
  }

  private async requireWorkspace(organizationId: string, workspaceId: string) {
    const [workspace] = await this.db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.id, workspaceId), eq(workspaces.organizationId, organizationId)))
      .limit(1);

    if (!workspace) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Workspace not found." });
    }
    return workspace;
  }

  private async requireActiveOrganizationMember(organizationId: string, organizationMemberId: string) {
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
        message: "Only active organization members can join a workspace.",
      });
    }
    return member;
  }

  private assertOrganizationPermission(auth: AuthContext, permission: "workspace:create") {
    if (hasOrganizationPermission(auth, permission)) return;

    throw new ForbiddenException({
      code: "FORBIDDEN",
      message: `You do not have permission to perform this action (${permission}).`,
    });
  }

  private assertWorkspacePermission(
    auth: AuthContext,
    workspaceId: string,
    permission:
      | "workspace:read"
      | "workspace:update"
      | "workspace:archive"
      | "workspace:member:read"
      | "workspace:member:manage",
  ) {
    if (hasWorkspacePermission(auth, workspaceId, permission)) return;

    throw new ForbiddenException({
      code: "FORBIDDEN",
      message: `You do not have permission to perform this action (${permission}).`,
    });
  }
}
