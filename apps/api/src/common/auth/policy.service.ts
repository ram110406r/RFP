import { Inject, Injectable } from "@nestjs/common";
import { evaluatePolicies } from "@rfp-os/authorization";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { accessPolicies, policyConditions, type Database } from "@rfp-os/db";
import type { AuthContext } from "@rfp-os/types";

import { DATABASE } from "../../infrastructure/database";

/**
 * Attributes of the thing being acted on, supplied by the calling handler.
 * Values are compared literally against a policy's condition.
 */
export type ResourceAttributes = Record<string, string | number | boolean | null | undefined>;

export interface PolicyDecision {
  allowed: boolean;
  /** Set when a deny policy matched, for the error message and audit trail. */
  reason?: string;
}

/**
 * ABAC evaluation, layered on top of RBAC rather than replacing it.
 *
 * RBAC answers "may a REVIEWER approve answers at all". It cannot answer "may
 * this reviewer approve *this* answer", because that depends on attributes of
 * the subject and the resource together. This service answers the second
 * question against `access_policies`.
 *
 * Two deliberate properties:
 *  - Deny wins. A matching deny beats any allow, whatever the priority, so a
 *    policy can carve an exception out of a broad role grant.
 *  - Absence is not denial. With no policies for a resource, RBAC alone
 *    decides — so this stays a foundation that later phases tighten, without
 *    every unpoliced action failing closed today and blocking the pipeline.
 */
@Injectable()
export class PolicyService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async evaluate(
    auth: AuthContext,
    resource: string,
    action: string,
    attributes: ResourceAttributes = {},
  ): Promise<PolicyDecision> {
    const [decision] = await this.evaluateMany(auth, resource, action, [attributes]);
    return decision ?? { allowed: true };
  }

  /**
   * Evaluates one action against many resources of the same type. Policies and
   * their conditions are loaded once, then each attribute set is decided in
   * memory — so filtering a list costs two queries, not two per row. Decisions
   * are returned in the same order as `attributesList`.
   */
  async evaluateMany(
    auth: AuthContext,
    resource: string,
    action: string,
    attributesList: ResourceAttributes[],
  ): Promise<PolicyDecision[]> {
    if (attributesList.length === 0) return [];

    const policies = await this.loadActivePolicies(auth, resource, action);
    if (policies.length === 0) return attributesList.map(() => ({ allowed: true }));

    const conditionRows = await this.db
      .select()
      .from(policyConditions)
      .where(inArray(policyConditions.policyId, policies.map((policy) => policy.id)));
    const conditions = conditionRows.filter(
      (condition): condition is typeof policyConditions.$inferSelect =>
        typeof (condition as { attribute?: unknown }).attribute === "string",
    );

    const actor = {
      userId: auth.userId,
      organizationId: auth.organizationId,
      role: auth.role,
      permissions: auth.permissions,
    };
    const evaluable = policies.map((policy) => ({
      id: policy.id,
      workspaceId: policy.workspaceId,
      effect: policy.effect,
      action: policy.action,
      resource: policy.resource,
      priority: policy.priority,
      conditions: [
        ...this.conditionsFromLegacyJson(policy.condition as Record<string, unknown> | null),
        ...conditions
          .filter((condition) => condition.policyId === policy.id)
          .map((condition) => ({
            attribute: condition.attribute,
            operator: condition.operator,
            value: condition.value,
            logicalGroup: condition.logicalGroup,
          })),
      ],
    }));
    const descriptionById = new Map(policies.map((policy) => [policy.id, policy.description]));

    return attributesList.map((attributes) => {
      /*
       * A policy pinned to a workspace governs only resources in that
       * workspace. Resources with no workspace (org-level ones such as an RFP)
       * are governed only by organization-wide policies.
       */
      const resourceWorkspaceId = typeof attributes.workspaceId === "string" ? attributes.workspaceId : null;
      const applicable = evaluable.filter(
        (policy) => !policy.workspaceId || policy.workspaceId === resourceWorkspaceId,
      );
      const decision = evaluatePolicies(
        actor,
        { type: resource, organizationId: auth.organizationId, attributes },
        action,
        applicable,
      );
      if (decision.allowed) return { allowed: true };
      // The reason is the description of the deny policy that actually matched.
      const reason =
        (decision.policyId && descriptionById.get(decision.policyId)) ||
        `Denied by policy on ${resource}:${action}.`;
      return { allowed: false, reason };
    });
  }

  /**
   * Cheap check for whether any active policy could affect this caller's
   * `resource:action`. When none can, RBAC alone decides and callers may skip
   * per-row evaluation entirely.
   */
  async hasActivePolicies(auth: AuthContext, resource: string, action: string): Promise<boolean> {
    const policies = await this.loadActivePolicies(auth, resource, action);
    return policies.length > 0;
  }

  private loadActivePolicies(auth: AuthContext, resource: string, action: string) {
    return this.db
      .select()
      .from(accessPolicies)
      .where(
        and(
          eq(accessPolicies.organizationId, auth.organizationId),
          eq(accessPolicies.resource, resource),
          or(eq(accessPolicies.action, action), eq(accessPolicies.action, "*")),
          or(isNull(accessPolicies.role), eq(accessPolicies.role, auth.role)),
          eq(accessPolicies.status, "active"),
        ),
      );
  }

  private conditionsFromLegacyJson(condition: Record<string, unknown> | null) {
    if (!condition || Object.keys(condition).length === 0) return [];
    return Object.entries(condition).map(([attribute, value]) => ({
      attribute: `resource.${attribute}`,
      operator: "eq" as const,
      value: typeof value === "string" && value.startsWith("$subject.")
        ? `$actor.${value.slice("$subject.".length)}`
        : value,
      logicalGroup: "legacy",
    }));
  }
}
