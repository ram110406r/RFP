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
    const policies = await this.db
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

    if (policies.length === 0) return { allowed: true };

    const conditionRows = await this.db
      .select()
      .from(policyConditions)
      .where(inArray(policyConditions.policyId, policies.map((policy) => policy.id)));
    const conditions = conditionRows.filter(
      (condition): condition is typeof policyConditions.$inferSelect =>
        typeof (condition as { attribute?: unknown }).attribute === "string",
    );

    const decision = evaluatePolicies(
      {
        userId: auth.userId,
        organizationId: auth.organizationId,
        role: auth.role,
        permissions: auth.permissions,
      },
      {
        type: resource,
        organizationId: auth.organizationId,
        attributes,
      },
      action,
      policies.map((policy) => ({
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
      })),
    );

    return decision.allowed
      ? { allowed: true }
      : {
          allowed: false,
          reason:
            policies.find((policy) => policy.effect === "deny")?.description ||
            `Denied by policy on ${resource}:${action}.`,
        };
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
