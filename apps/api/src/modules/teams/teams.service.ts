import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, getTableColumns, inArray, isNull, sql } from "drizzle-orm";
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

import { ActivityService } from "../../infrastructure/activity";
import { DATABASE } from "../../infrastructure/database";
import { AuditService } from "../../infrastructure/audit";
import type { AddTeamMemberInput, CreateTeamInput, UpdateTeamInput } from "./teams.dto";

/** Each listed team carries its member count (see workspaceWithMemberCount). */
const teamWithMemberCount = {
  ...getTableColumns(teams),
  memberCount: sql<number>`(
    select count(*) from "team_members" tm
    inner join "organization_members" om on om."id" = tm."organization_member_id"
    where tm."team_id" = "teams"."id"
      and om."status" = 'active'
  )`.mapWith(Number),
};

@Injectable()
export class TeamsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly activity: ActivityService,
    private readonly audit: AuditService,
  ) {}

  async list(auth: AuthContext) {
    if (hasOrganizationPermission(auth, "team:read")) {
      return this.db
        .select(teamWithMemberCount)
        .from(teams)
        .where(eq(teams.organizationId, auth.organizationId))
        .orderBy(desc(teams.createdAt));
    }

    if (!auth.workspaceIds || auth.workspaceIds.length === 0) {
      return [];
    }

    return this.db
      .select(teamWithMemberCount)
      .from(teams)
      .where(
        and(
          eq(teams.organizationId, auth.organizationId),
          inArray(teams.workspaceId, [...auth.workspaceIds]),
        ),
      )
      .orderBy(desc(teams.createdAt));
  }

  async create(auth: AuthContext, input: CreateTeamInput) {
    this.assertWorkspacePermission(auth, input.workspaceId, "team:create");
    await this.requireActiveWorkspace(auth.organizationId, input.workspaceId);

    const [team] = await withTransaction(async (tx) => {
      const [created] = await tx
        .insert(teams)
        .values({
          organizationId: auth.organizationId,
          workspaceId: input.workspaceId,
          name: input.name,
          description: input.description ?? "",
        })
        .returning();

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: created!.workspaceId,
          actorId: auth.userId,
          action: "TEAM_CREATED",
          entityType: "team",
          entityId: created!.id,
          newValue: created,
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: created!.workspaceId,
          actorId: auth.userId,
          actorLabel: auth.userId,
          action: "TEAM_CREATED",
          entityType: "team",
          entityId: created!.id,
          label: `Team created: ${created!.name}`,
          summary: `Created team ${created!.name}`,
        },
        tx,
      );

      return [created!];
    });

    return team;
  }

  async update(auth: AuthContext, teamId: string, input: UpdateTeamInput) {
    const existing = await this.requireTeam(auth.organizationId, teamId);
    this.assertWorkspacePermission(auth, existing.workspaceId, "team:update");
    this.assertTeamActive(existing);
    if (input.workspaceId && input.workspaceId !== existing.workspaceId) {
      this.assertWorkspacePermission(auth, input.workspaceId, "team:update");
      await this.requireActiveWorkspace(auth.organizationId, input.workspaceId);
      await this.assertMembersBelongToWorkspace(teamId, input.workspaceId);
    }

    const [updated] = await withTransaction(async (tx) => {
      const [next] = await tx
        .update(teams)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.workspaceId !== undefined ? { workspaceId: input.workspaceId } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(teams.id, teamId), eq(teams.organizationId, auth.organizationId)))
        .returning();

      if (!next) {
        throw new NotFoundException({ code: "NOT_FOUND", message: "Team not found." });
      }

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: next!.workspaceId,
          actorId: auth.userId,
          action: "TEAM_UPDATED",
          entityType: "team",
          entityId: teamId,
          previousValue: existing,
          newValue: next,
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: next!.workspaceId,
          actorId: auth.userId,
          actorLabel: auth.userId,
          action: "TEAM_UPDATED",
          entityType: "team",
          entityId: teamId,
          label: `Team updated: ${next!.name}`,
          summary: `Updated team ${next!.name}`,
        },
        tx,
      );

      return [next];
    });

    return updated;
  }

  async archive(auth: AuthContext, teamId: string) {
    const existing = await this.requireTeam(auth.organizationId, teamId);
    this.assertWorkspacePermission(auth, existing.workspaceId, "team:archive");
    const [archived] = await withTransaction(async (tx) => {
      const [next] = await tx
        .update(teams)
        .set({ status: "archived", updatedAt: new Date() })
        .where(and(eq(teams.id, teamId), eq(teams.organizationId, auth.organizationId)))
        .returning();

      if (!next) {
        throw new NotFoundException({ code: "NOT_FOUND", message: "Team not found." });
      }

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: next!.workspaceId,
          actorId: auth.userId,
          action: "TEAM_ARCHIVED",
          entityType: "team",
          entityId: teamId,
          previousValue: existing,
          newValue: next,
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: next!.workspaceId,
          actorId: auth.userId,
          actorLabel: auth.userId,
          action: "TEAM_ARCHIVED",
          entityType: "team",
          entityId: teamId,
          kind: "rejected",
          label: `Team archived: ${next!.name}`,
          summary: `Archived team ${next!.name}`,
        },
        tx,
      );

      return [next];
    });

    return archived;
  }

  async listMembers(auth: AuthContext, teamId: string) {
    const team = await this.requireTeam(auth.organizationId, teamId);
    this.assertWorkspacePermission(auth, team.workspaceId, "team:read");
    return this.db
      .select({
        teamMemberId: teamMembers.id,
        organizationMemberId: teamMembers.organizationMemberId,
        userId: users.id,
        name: users.name,
        email: users.email,
      })
      .from(teamMembers)
      .innerJoin(organizationMembers, eq(organizationMembers.id, teamMembers.organizationMemberId))
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(eq(teamMembers.teamId, teamId))
      .orderBy(desc(users.createdAt));
  }

  async addMember(auth: AuthContext, teamId: string, input: AddTeamMemberInput) {
    const team = await this.requireTeam(auth.organizationId, teamId);
    this.assertWorkspacePermission(auth, team.workspaceId, "team:member:manage");
    this.assertTeamActive(team);
    const member = await this.requireActiveOrganizationMember(
      auth.organizationId,
      input.organizationMemberId,
    );

    if (member.organizationId !== team.organizationId) {
      throw new ForbiddenException({
        code: "CROSS_ORGANIZATION",
        message: "Team membership must stay within the organization.",
      });
    }

    if (team.workspaceId) {
      const [workspaceMembership] = await this.db
        .select({ id: workspaceMembers.id })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, team.workspaceId),
            eq(workspaceMembers.organizationMemberId, input.organizationMemberId),
            eq(workspaceMembers.status, "active"),
          ),
        )
        .limit(1);

      if (!workspaceMembership) {
        throw new ConflictException({
          code: "WORKSPACE_MEMBERSHIP_REQUIRED",
          message: "Workspace teams require an active workspace membership.",
        });
      }
    }

    const [added] = await withTransaction(async (tx) => {
      const [created] = await tx
        .insert(teamMembers)
        .values({
          teamId,
          organizationMemberId: input.organizationMemberId,
        })
        .onConflictDoNothing()
        .returning();

      if (created) {
        await this.audit.record(
          {
            organizationId: auth.organizationId,
            workspaceId: team.workspaceId,
            actorId: auth.userId,
            action: "TEAM_MEMBER_ADDED",
            entityType: "team_member",
            entityId: created.id,
            newValue: created,
          },
          tx,
        );
        await this.activity.record(
          {
            organizationId: auth.organizationId,
            workspaceId: team.workspaceId,
            actorId: auth.userId,
            actorLabel: auth.userId,
            action: "TEAM_MEMBER_ADDED",
            entityType: "team_member",
            entityId: created.id,
            label: "Team member added",
            summary: `Added member ${input.organizationMemberId} to team ${team.name}`,
          },
          tx,
        );
      }

      return [created];
    });

    return added ?? { teamId, organizationMemberId: input.organizationMemberId };
  }

  async removeMember(auth: AuthContext, teamId: string, organizationMemberId: string) {
    const team = await this.requireTeam(auth.organizationId, teamId);
    this.assertWorkspacePermission(auth, team.workspaceId, "team:member:manage");
    const [removed] = await withTransaction(async (tx) => {
      const [deleted] = await tx
        .delete(teamMembers)
        .where(
          and(eq(teamMembers.teamId, teamId), eq(teamMembers.organizationMemberId, organizationMemberId)),
        )
        .returning();

      if (!deleted) {
        throw new NotFoundException({ code: "NOT_FOUND", message: "Team member not found." });
      }

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: team.workspaceId,
          actorId: auth.userId,
          action: "TEAM_MEMBER_REMOVED",
          entityType: "team_member",
          entityId: deleted.id,
          previousValue: deleted,
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: team.workspaceId,
          actorId: auth.userId,
          actorLabel: auth.userId,
          action: "TEAM_MEMBER_REMOVED",
          entityType: "team_member",
          entityId: deleted.id,
          kind: "rejected",
          label: "Team member removed",
          summary: `Removed member ${organizationMemberId} from team ${team.name}`,
        },
        tx,
      );

      return [deleted];
    });

    return removed;
  }

  private async requireActiveWorkspace(organizationId: string, workspaceId: string) {
    const [workspace] = await this.db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.id, workspaceId), eq(workspaces.organizationId, organizationId)))
      .limit(1);

    if (!workspace) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Workspace not found." });
    }
    if (workspace.status !== "active") {
      throw new ConflictException({
        code: "WORKSPACE_ARCHIVED",
        message: "That workspace is archived. Restore it before adding teams to it.",
      });
    }
    return workspace;
  }

  private assertTeamActive(team: { status: string }) {
    if (team.status !== "active") {
      throw new ConflictException({
        code: "TEAM_ARCHIVED",
        message: "This team is archived and cannot be changed.",
      });
    }
  }

  /**
   * A workspace team may only contain members of that workspace (addMember
   * enforces it). Moving a team must not smuggle its members into a workspace
   * they were never given, so the move is refused until they are added there.
   */
  private async assertMembersBelongToWorkspace(teamId: string, workspaceId: string) {
    const outsiders = await this.db
      .select({ organizationMemberId: teamMembers.organizationMemberId, email: users.email })
      .from(teamMembers)
      .innerJoin(organizationMembers, eq(organizationMembers.id, teamMembers.organizationMemberId))
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .leftJoin(
        workspaceMembers,
        and(
          eq(workspaceMembers.organizationMemberId, teamMembers.organizationMemberId),
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.status, "active"),
        ),
      )
      .where(and(eq(teamMembers.teamId, teamId), isNull(workspaceMembers.id)));

    if (outsiders.length > 0) {
      throw new ConflictException({
        code: "TEAM_MEMBERS_NOT_IN_WORKSPACE",
        message: "Some team members are not in the destination workspace. Add them to it first, or remove them from the team.",
        members: outsiders.map((outsider) => outsider.email),
      });
    }
  }

  private async requireTeam(organizationId: string, teamId: string) {
    const [team] = await this.db
      .select()
      .from(teams)
      .where(and(eq(teams.id, teamId), eq(teams.organizationId, organizationId)))
      .limit(1);

    if (!team) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Team not found." });
    }
    return team;
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
        message: "Only active organization members can join a team.",
      });
    }
    return member;
  }

  private assertWorkspacePermission(
    auth: AuthContext,
    workspaceId: string | null,
    permission:
      | "team:create"
      | "team:read"
      | "team:update"
      | "team:archive"
      | "team:member:manage",
  ) {
    if (workspaceId === null) {
      if (hasOrganizationPermission(auth, permission)) return;
    } else if (hasWorkspacePermission(auth, workspaceId, permission)) {
      return;
    }

    throw new ForbiddenException({
      code: "FORBIDDEN",
      message: `You do not have permission to perform this action (${permission}).`,
    });
  }
}
