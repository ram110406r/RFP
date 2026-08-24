import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import {
  accessPolicies,
  policyConditions,
  workspaces,
  withTransaction,
  type Database,
} from "@rfp-os/db";
import {
  hasOrganizationPermission,
  hasWorkspacePermission,
  type AuthContext,
  type Permission,
} from "@rfp-os/types";

import { ActivityService } from "../../infrastructure/activity";
import { AuditService } from "../../infrastructure/audit";
import { DATABASE } from "../../infrastructure/database";
import type { CreatePolicyInput, TogglePolicyInput, UpdatePolicyInput } from "./policies.dto";

@Injectable()
export class PoliciesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly activity: ActivityService,
    private readonly audit: AuditService,
  ) {}

  async list(auth: AuthContext, workspaceId?: string) {
    if (workspaceId) {
      await this.requireWorkspace(auth.organizationId, workspaceId);
      this.assertPolicyPermission(auth, workspaceId, "policy:read");
      return this.selectPolicies(auth.organizationId, workspaceId);
    }

    if (hasOrganizationPermission(auth, "policy:read")) {
      return this.selectPolicies(auth.organizationId);
    }

    if (!auth.workspaceIds || auth.workspaceIds.length === 0) {
      return [];
    }

    return this.selectPolicies(auth.organizationId, null, [...auth.workspaceIds]);
  }

  async create(auth: AuthContext, input: CreatePolicyInput) {
    if (input.workspaceId) {
      await this.requireWorkspace(auth.organizationId, input.workspaceId);
    }
    this.assertPolicyPermission(auth, input.workspaceId ?? null, "policy:create");

    return withTransaction(async (tx) => {
      const [created] = await tx
        .insert(accessPolicies)
        .values({
          organizationId: auth.organizationId,
          workspaceId: input.workspaceId ?? null,
          name: input.name,
          description: input.description ?? "",
          role: input.role ?? null,
          resource: input.resource,
          action: input.action,
          effect: input.effect,
          priority: input.priority ?? 0,
          condition: serializeConditions(input.conditions),
        })
        .returning();

      if (input.conditions && input.conditions.length > 0) {
        await tx.insert(policyConditions).values(
          input.conditions.map((condition) => ({
            policyId: created!.id,
            attribute: condition.attribute,
            operator: condition.operator,
            value: condition.value ?? null,
            logicalGroup: condition.logicalGroup ?? "default",
          })),
        );
      }

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: created!.workspaceId,
          actorId: auth.userId,
          action: "POLICY_CREATED",
          entityType: "access_policy",
          entityId: created!.id,
          newValue: { ...created, conditions: input.conditions ?? [] },
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: created!.workspaceId,
          actorId: auth.userId,
          actorLabel: auth.userId,
          action: "POLICY_CREATED",
          entityType: "access_policy",
          entityId: created!.id,
          label: `Policy created: ${created!.name}`,
          summary: `Created policy ${created!.name}`,
        },
        tx,
      );

      return created;
    });
  }

  async update(auth: AuthContext, policyId: string, input: UpdatePolicyInput) {
    const existing = await this.requirePolicy(auth.organizationId, policyId);
    if (input.workspaceId) {
      await this.requireWorkspace(auth.organizationId, input.workspaceId);
    }
    this.assertPolicyPermission(auth, existing.workspaceId, "policy:update");
    if (input.workspaceId !== undefined) {
      this.assertPolicyPermission(auth, input.workspaceId, "policy:update");
    }

    return withTransaction(async (tx) => {
      const [updated] = await tx
        .update(accessPolicies)
        .set({
          ...(input.workspaceId !== undefined ? { workspaceId: input.workspaceId } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.resource !== undefined ? { resource: input.resource } : {}),
          ...(input.action !== undefined ? { action: input.action } : {}),
          ...(input.effect !== undefined ? { effect: input.effect } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.conditions !== undefined ? { condition: serializeConditions(input.conditions) } : {}),
          updatedAt: new Date(),
        })
        .where(eq(accessPolicies.id, policyId))
        .returning();

      if (!updated) {
        throw new NotFoundException({ code: "NOT_FOUND", message: "Policy not found." });
      }

      if (input.conditions !== undefined) {
        await tx.delete(policyConditions).where(eq(policyConditions.policyId, policyId));
        if (input.conditions.length > 0) {
          await tx.insert(policyConditions).values(
            input.conditions.map((condition) => ({
              policyId,
              attribute: condition.attribute,
              operator: condition.operator,
              value: condition.value ?? null,
              logicalGroup: condition.logicalGroup ?? "default",
            })),
          );
        }
      }

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: updated!.workspaceId,
          actorId: auth.userId,
          action: "POLICY_UPDATED",
          entityType: "access_policy",
          entityId: policyId,
          previousValue: existing,
          newValue: { ...updated, conditions: input.conditions },
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: updated!.workspaceId,
          actorId: auth.userId,
          actorLabel: auth.userId,
          action: "POLICY_UPDATED",
          entityType: "access_policy",
          entityId: policyId,
          label: `Policy updated: ${updated!.name}`,
          summary: `Updated policy ${updated!.name}`,
        },
        tx,
      );

      return updated;
    });
  }

  async toggle(auth: AuthContext, policyId: string, input: TogglePolicyInput) {
    const existing = await this.requirePolicy(auth.organizationId, policyId);
    this.assertPolicyPermission(auth, existing.workspaceId, "policy:toggle");

    const [updated] = await this.db
      .update(accessPolicies)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(accessPolicies.id, policyId))
      .returning();

    if (!updated) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Policy not found." });
    }

    await this.audit.record({
      organizationId: auth.organizationId,
      workspaceId: updated.workspaceId,
      actorId: auth.userId,
      action: "POLICY_TOGGLED",
      entityType: "access_policy",
      entityId: policyId,
      previousValue: existing,
      newValue: updated,
    });
    await this.activity.record({
      organizationId: auth.organizationId,
      workspaceId: updated.workspaceId,
      actorId: auth.userId,
      actorLabel: auth.userId,
      action: "POLICY_TOGGLED",
      entityType: "access_policy",
      entityId: policyId,
      kind: input.status === "disabled" ? "rejected" : "generated",
      label: `Policy ${input.status}: ${updated.name}`,
      summary: `${input.status === "disabled" ? "Disabled" : "Enabled"} policy ${updated.name}`,
    });

    return updated;
  }

  private async selectPolicies(
    organizationId: string,
    workspaceId?: string | null,
    workspaceIds?: readonly string[],
  ) {
    const rows = await this.db
      .select()
      .from(accessPolicies)
      .where(
        and(
          eq(accessPolicies.organizationId, organizationId),
          workspaceId === undefined
            ? undefined
            : workspaceId === null
              ? or(
                  inArray(accessPolicies.workspaceId, workspaceIds ?? []),
                  isNull(accessPolicies.workspaceId),
                )
              : eq(accessPolicies.workspaceId, workspaceId),
        ),
      );

    const conditions = rows.length
      ? await this.db
          .select()
          .from(policyConditions)
          .where(
            inArray(
              policyConditions.policyId,
              rows.map((row) => row.id),
            ),
          )
      : [];

    const byPolicy = new Map<string, typeof conditions>();
    for (const condition of conditions) {
      const bucket = byPolicy.get(condition.policyId) ?? [];
      bucket.push(condition);
      byPolicy.set(condition.policyId, bucket);
    }

    return rows
      .sort((a, b) => b.priority - a.priority || b.createdAt.getTime() - a.createdAt.getTime())
      .map((row) => ({
        ...row,
        conditions: byPolicy.get(row.id) ?? [],
      }));
  }

  private async requirePolicy(organizationId: string, policyId: string) {
    const [policy] = await this.db
      .select()
      .from(accessPolicies)
      .where(and(eq(accessPolicies.id, policyId), eq(accessPolicies.organizationId, organizationId)))
      .limit(1);

    if (!policy) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Policy not found." });
    }
    return policy;
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

  private assertPolicyPermission(
    auth: AuthContext,
    workspaceId: string | null,
    permission: "policy:read" | "policy:create" | "policy:update" | "policy:toggle",
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

function serializeConditions(
  conditions:
    | readonly {
        attribute: string;
        operator: string;
        value?: unknown;
        logicalGroup?: string;
      }[]
    | undefined,
) {
  if (!conditions || conditions.length === 0) return null;

  return {
    conditions: conditions.map((condition) => ({
      attribute: condition.attribute,
      operator: condition.operator,
      value: condition.value ?? null,
      logicalGroup: condition.logicalGroup ?? "default",
    })),
  };
}
