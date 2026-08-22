import { Inject, Injectable } from "@nestjs/common";
import { and, eq, or, isNull } from "drizzle-orm";
import { accessPolicies, type Database } from "@rfp-os/db";
import type { AuthContext } from "@rfp-os/types";

import { DATABASE } from "../../infrastructure/database";

/**
 * Attributes of the thing being acted on, supplied by the calling handler.
 * Values are compared literally against a policy's condition.
 */
export type ResourceAttributes = Record<string, string | number | boolean | null | undefined>;

/**
 * A stored condition, e.g. `{ "risk": "critical", "assigneeId": "$subject.userId" }`.
 *
 * Every key must match for the condition to hold. The `$subject.` prefix
 * resolves against the caller, which is what expresses relationship rules
 * ("only the assigned reviewer") without a bespoke query per rule.
 */
type Condition = Record<string, unknown>;

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
        ),
      );

    if (policies.length === 0) return { allowed: true };

    const matching = policies
      .filter((policy) =>
        this.conditionHolds(policy.condition as Condition | null, auth, attributes),
      )
      .sort((a, b) => b.priority - a.priority);

    const denied = matching.find((policy) => policy.effect === "deny");
    if (denied) {
      return {
        allowed: false,
        reason: denied.description || `Denied by policy on ${resource}:${action}.`,
      };
    }

    /**
     * If policies exist for this resource/action but none matched, RBAC still
     * governs — these rules narrow access, they are not an allowlist.
     */
    return { allowed: true };
  }

  private conditionHolds(
    condition: Condition | null,
    auth: AuthContext,
    attributes: ResourceAttributes,
  ): boolean {
    if (!condition || Object.keys(condition).length === 0) return true;

    return Object.entries(condition).every(([key, expected]) => {
      const resolved = this.resolveExpected(expected, auth);
      return attributes[key] === resolved;
    });
  }

  private resolveExpected(expected: unknown, auth: AuthContext): unknown {
    if (typeof expected !== "string" || !expected.startsWith("$subject.")) return expected;
    const field = expected.slice("$subject.".length);
    if (field === "userId") return auth.userId;
    if (field === "organizationId") return auth.organizationId;
    if (field === "role") return auth.role;
    return undefined;
  }
}
