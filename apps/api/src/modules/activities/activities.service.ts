import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { activities, workspaces, type Database } from "@rfp-os/db";
import {
  hasOrganizationPermission,
  hasWorkspacePermission,
  type AuthContext,
} from "@rfp-os/types";

import { DATABASE } from "../../infrastructure/database";

@Injectable()
export class ActivitiesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async search(
    auth: AuthContext,
    filters: {
      workspaceId?: string;
      q?: string;
      action?: string;
      entityType?: string;
      rfpId?: string;
      actorId?: string;
    },
  ) {
    if (filters.workspaceId) {
      await this.requireWorkspace(auth.organizationId, filters.workspaceId);
      this.assertPermission(auth, filters.workspaceId, "activity:read");
      return this.query(auth.organizationId, filters.workspaceId, filters);
    }

    if (hasOrganizationPermission(auth, "activity:read")) {
      return this.query(auth.organizationId, undefined, filters);
    }

    if (!auth.workspaceIds || auth.workspaceIds.length === 0) {
      return [];
    }

    return this.query(auth.organizationId, null, filters, [...auth.workspaceIds]);
  }

  private async query(
    organizationId: string,
    workspaceId: string | null | undefined,
    filters: {
      q?: string;
      action?: string;
      entityType?: string;
      rfpId?: string;
      actorId?: string;
    },
    workspaceIds?: readonly string[],
  ) {
    const queryText = filters.q?.trim();
    return this.db
      .select()
      .from(activities)
      .where(
        and(
          eq(activities.organizationId, organizationId),
          workspaceId === undefined
            ? undefined
            : workspaceId === null
              ? inArray(activities.workspaceId, workspaceIds ?? [])
              : eq(activities.workspaceId, workspaceId),
          filters.action ? eq(activities.action, filters.action) : undefined,
          filters.entityType ? eq(activities.entityType, filters.entityType) : undefined,
          filters.rfpId ? eq(activities.rfpId, filters.rfpId) : undefined,
          filters.actorId ? eq(activities.actorId, filters.actorId) : undefined,
          queryText
            ? or(
                ilike(activities.label, `%${queryText}%`),
                ilike(activities.summary, `%${queryText}%`),
                ilike(activities.actorLabel, `%${queryText}%`),
                ilike(activities.entityType, `%${queryText}%`),
                ilike(activities.entityId, `%${queryText}%`),
              )
            : undefined,
        ),
      )
      .orderBy(desc(activities.createdAt));
  }

  private assertPermission(
    auth: AuthContext,
    workspaceId: string | null,
    permission: "activity:read",
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

  private async requireWorkspace(organizationId: string, workspaceId: string) {
    const [workspace] = await this.db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(eq(workspaces.id, workspaceId), eq(workspaces.organizationId, organizationId)))
      .limit(1);

    if (!workspace) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Workspace not found." });
    }
  }
}
