import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import {
  assignments,
  organizationMembers,
  teams,
  workspaces,
  withTransaction,
  type Database,
  type Transaction,
} from "@rfp-os/db";
import {
  hasOrganizationPermission,
  hasWorkspacePermission,
  type AuthContext,
} from "@rfp-os/types";

import { ActivityService } from "../../infrastructure/activity";
import { AuditService } from "../../infrastructure/audit";
import { DATABASE } from "../../infrastructure/database";
import type { CreateAssignmentInput, UpdateAssignmentInput } from "./assignments.dto";

@Injectable()
export class AssignmentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly activity: ActivityService,
    private readonly audit: AuditService,
  ) {}

  async list(
    auth: AuthContext,
    filters: {
      workspaceId?: string;
      resourceType?: string;
      resourceId?: string;
      status?: "pending" | "in_progress" | "completed" | "cancelled";
    },
  ) {
    if (filters.workspaceId) {
      await this.requireWorkspace(auth.organizationId, filters.workspaceId);
      this.assertAssignmentPermission(auth, filters.workspaceId, "assignment:read");
      return this.queryAssignments(auth.organizationId, filters.workspaceId, filters);
    }

    if (hasOrganizationPermission(auth, "assignment:read")) {
      return this.queryAssignments(auth.organizationId, undefined, filters);
    }

    if (!auth.workspaceIds || auth.workspaceIds.length === 0) {
      return [];
    }

    return this.queryAssignments(auth.organizationId, null, filters, [...auth.workspaceIds]);
  }

  async create(auth: AuthContext, input: CreateAssignmentInput, assertActive?: (tx: Transaction) => Promise<void>) {
    if (input.workspaceId) {
      await this.requireWorkspace(auth.organizationId, input.workspaceId);
    }
    this.assertAssignmentPermission(auth, input.workspaceId ?? null, "assignment:create");
    await this.assertAssignee(auth.organizationId, input.assigneeType, input.assigneeId, input.workspaceId);

    return withTransaction(async (tx) => {
      await assertActive?.(tx);
      const [created] = await tx
        .insert(assignments)
        .values({
          organizationId: auth.organizationId,
          workspaceId: input.workspaceId ?? null,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          assigneeType: input.assigneeType,
          assigneeId: input.assigneeId,
          assignmentRole: input.assignmentRole ?? "",
          assignedBy: auth.userId,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
        })
        .returning();

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: created!.workspaceId,
          actorId: auth.userId,
          action: "ASSIGNMENT_CREATED",
          entityType: "assignment",
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
          action: "ASSIGNMENT_CREATED",
          entityType: "assignment",
          entityId: created!.id,
          kind: "assigned",
          label: "Assignment created",
          summary: `Assigned ${input.assigneeType} ${input.assigneeId} to ${input.resourceType}:${input.resourceId}`,
        },
        tx,
      );

      return created;
    });
  }

  async update(auth: AuthContext, assignmentId: string, input: UpdateAssignmentInput) {
    const existing = await this.requireAssignment(auth.organizationId, assignmentId);
    this.assertAssignmentPermission(auth, existing.workspaceId, "assignment:update");
    if (input.assigneeId) {
      await this.assertAssignee(
        auth.organizationId,
        existing.assigneeType,
        input.assigneeId,
        existing.workspaceId,
      );
    }

    return withTransaction(async (tx) => {
      const [updated] = await tx
        .update(assignments)
        .set({
          ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
          ...(input.assignmentRole !== undefined ? { assignmentRole: input.assignmentRole } : {}),
          ...(input.dueAt !== undefined
            ? { dueAt: input.dueAt === null ? null : new Date(input.dueAt) }
            : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          updatedAt: new Date(),
        })
        .where(eq(assignments.id, assignmentId))
        .returning();

      if (!updated) {
        throw new NotFoundException({ code: "NOT_FOUND", message: "Assignment not found." });
      }

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: updated!.workspaceId,
          actorId: auth.userId,
          action: "ASSIGNMENT_UPDATED",
          entityType: "assignment",
          entityId: assignmentId,
          previousValue: existing,
          newValue: updated,
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: updated!.workspaceId,
          actorId: auth.userId,
          actorLabel: auth.userId,
          action: "ASSIGNMENT_UPDATED",
          entityType: "assignment",
          entityId: assignmentId,
          label: "Assignment updated",
          summary: `Updated assignment ${assignmentId}`,
        },
        tx,
      );

      return updated;
    });
  }

  async complete(auth: AuthContext, assignmentId: string) {
    return this.transition(auth, assignmentId, "completed", "ASSIGNMENT_COMPLETED", "assignment:complete");
  }

  async cancel(auth: AuthContext, assignmentId: string) {
    return this.transition(auth, assignmentId, "cancelled", "ASSIGNMENT_CANCELLED", "assignment:cancel");
  }

  private async transition(
    auth: AuthContext,
    assignmentId: string,
    status: "completed" | "cancelled",
    action: string,
    permission: "assignment:complete" | "assignment:cancel",
  ) {
    const existing = await this.requireAssignment(auth.organizationId, assignmentId);
    this.assertAssignmentPermission(auth, existing.workspaceId, permission);

    const [updated] = await this.db
      .update(assignments)
      .set({ status, updatedAt: new Date() })
      .where(eq(assignments.id, assignmentId))
      .returning();

    if (!updated) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Assignment not found." });
    }

    await this.audit.record({
      organizationId: auth.organizationId,
      workspaceId: updated.workspaceId,
      actorId: auth.userId,
      action,
      entityType: "assignment",
      entityId: assignmentId,
      previousValue: existing,
      newValue: updated,
    });
    await this.activity.record({
      organizationId: auth.organizationId,
      workspaceId: updated.workspaceId,
      actorId: auth.userId,
      actorLabel: auth.userId,
      action,
      entityType: "assignment",
      entityId: assignmentId,
      kind: status === "completed" ? "approved" : "rejected",
      label: `Assignment ${status}`,
      summary: `${status === "completed" ? "Completed" : "Cancelled"} assignment ${assignmentId}`,
    });

    return updated;
  }

  private async queryAssignments(
    organizationId: string,
    workspaceId:
      | string
      | null
      | undefined,
    filters: {
      resourceType?: string;
      resourceId?: string;
      status?: "pending" | "in_progress" | "completed" | "cancelled";
    },
    workspaceIds?: readonly string[],
  ) {
    return this.db
      .select()
      .from(assignments)
      .where(
        and(
          eq(assignments.organizationId, organizationId),
          workspaceId === undefined
            ? undefined
            : workspaceId === null
              ? inArray(assignments.workspaceId, workspaceIds ?? [])
              : eq(assignments.workspaceId, workspaceId),
          filters.resourceType ? eq(assignments.resourceType, filters.resourceType) : undefined,
          filters.resourceId ? eq(assignments.resourceId, filters.resourceId) : undefined,
          filters.status ? eq(assignments.status, filters.status) : undefined,
        ),
      )
      .orderBy(desc(assignments.createdAt));
  }

  private async requireAssignment(organizationId: string, assignmentId: string) {
    const [assignment] = await this.db
      .select()
      .from(assignments)
      .where(and(eq(assignments.id, assignmentId), eq(assignments.organizationId, organizationId)))
      .limit(1);

    if (!assignment) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Assignment not found." });
    }
    return assignment;
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

  private async assertAssignee(
    organizationId: string,
    assigneeType: "user" | "team",
    assigneeId: string,
    workspaceId: string | null | undefined,
  ) {
    if (assigneeType === "user") {
      const [member] = await this.db
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.id, assigneeId),
            eq(organizationMembers.organizationId, organizationId),
            eq(organizationMembers.status, "active"),
          ),
        )
        .limit(1);

      if (!member) {
        throw new ConflictException({
          code: "ASSIGNEE_NOT_ACTIVE",
          message: "Assignments may target only active organization members.",
        });
      }
      return;
    }

    const [team] = await this.db
      .select()
      .from(teams)
      .where(and(eq(teams.id, assigneeId), eq(teams.organizationId, organizationId)))
      .limit(1);

    if (!team) {
      throw new ConflictException({
        code: "TEAM_NOT_FOUND",
        message: "Assignments may target only teams in the active organization.",
      });
    }

    if (workspaceId && team.workspaceId && team.workspaceId !== workspaceId) {
      throw new ConflictException({
        code: "TEAM_WORKSPACE_MISMATCH",
        message: "Workspace-scoped assignments must target teams in the same workspace.",
      });
    }
  }

  private assertAssignmentPermission(
    auth: AuthContext,
    workspaceId: string | null,
    permission:
      | "assignment:read"
      | "assignment:create"
      | "assignment:update"
      | "assignment:complete"
      | "assignment:cancel",
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
