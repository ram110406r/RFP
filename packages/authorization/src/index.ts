import type { Permission } from "../../types/src/authz";

export type ConditionOperator = "eq" | "neq" | "in" | "not_in" | "exists" | "not_exists";
export type PolicyEffect = "allow" | "deny";

export interface AuthorizationActor {
  userId: string;
  organizationId: string;
  workspaceId?: string | null;
  role?: string | null;
  permissions: readonly Permission[];
  teamIds?: readonly string[];
}

export interface AuthorizationResource {
  type: string;
  organizationId?: string | null;
  workspaceId?: string | null;
  ownerId?: string | null;
  assigneeId?: string | null;
  status?: string | null;
  risk?: string | null;
  attributes?: Record<string, unknown>;
}

export interface AuthorizationPolicyCondition {
  attribute: string;
  operator: ConditionOperator;
  value?: unknown;
  logicalGroup?: string | null;
}

export interface AuthorizationPolicy {
  /** Optional; echoed back as `policyId` when this policy is the one that denies. */
  id?: string;
  effect: PolicyEffect;
  action: string;
  resource: string;
  priority: number;
  conditions: readonly AuthorizationPolicyCondition[];
}

export interface AuthorizationAssignment {
  assigneeType: "user" | "team";
  assigneeId: string;
}

export interface AuthorizationInput {
  actor: AuthorizationActor;
  action: string;
  resource: AuthorizationResource;
  policies?: readonly AuthorizationPolicy[];
  assignments?: readonly AuthorizationAssignment[];
  requireAssignment?: boolean;
}

export interface AuthorizationDecision {
  allowed: boolean;
  reason?: string;
  /** The deny policy that decided, when there was one and it carried an id. */
  policyId?: string;
}

export function can(input: AuthorizationInput): AuthorizationDecision {
  const isolation = checkTenantIsolation(input.actor, input.resource);
  if (!isolation.allowed) return isolation;

  const permission = `${input.resource.type}:${input.action}` as Permission;
  if (!input.actor.permissions.includes(permission)) {
    return { allowed: false, reason: `Missing permission ${permission}.` };
  }

  const assignment = checkAssignment(input.actor, input.assignments ?? [], input.requireAssignment);
  if (!assignment.allowed) return assignment;

  return evaluatePolicies(input.actor, input.resource, input.action, input.policies ?? []);
}

export function authorize(input: AuthorizationInput): void {
  const decision = can(input);
  if (!decision.allowed) {
    throw new Error(decision.reason ?? "Forbidden");
  }
}

export function evaluatePolicies(
  actor: AuthorizationActor,
  resource: AuthorizationResource,
  action: string,
  policies: readonly AuthorizationPolicy[],
): AuthorizationDecision {
  const matching = policies
    .filter((policy) => policy.action === action || policy.action === "*")
    .filter((policy) => policy.resource === resource.type)
    .filter((policy) => policy.conditions.every((condition) => evaluateCondition(condition, actor, resource)))
    .sort((a, b) => b.priority - a.priority);

  const denied = matching.find((policy) => policy.effect === "deny");
  if (denied) {
    return { allowed: false, reason: "Denied by policy.", ...(denied.id ? { policyId: denied.id } : {}) };
  }

  return { allowed: true };
}

function checkTenantIsolation(
  actor: AuthorizationActor,
  resource: AuthorizationResource,
): AuthorizationDecision {
  if (resource.organizationId && resource.organizationId !== actor.organizationId) {
    return { allowed: false, reason: "Cross-organization access is forbidden." };
  }

  if (
    resource.workspaceId &&
    actor.workspaceId &&
    resource.workspaceId !== actor.workspaceId &&
    resource.organizationId === actor.organizationId
  ) {
    return { allowed: false, reason: "Cross-workspace access is forbidden." };
  }

  return { allowed: true };
}

function checkAssignment(
  actor: AuthorizationActor,
  assignments: readonly AuthorizationAssignment[],
  requireAssignment = false,
): AuthorizationDecision {
  if (!requireAssignment) return { allowed: true };

  const assigned = assignments.some((assignment) => {
    if (assignment.assigneeType === "user") return assignment.assigneeId === actor.userId;
      return actor.teamIds?.includes(assignment.assigneeId) ?? false;
  });

  return assigned
    ? { allowed: true }
    : { allowed: false, reason: "This action requires an assignment." };
}

function evaluateCondition(
  condition: AuthorizationPolicyCondition,
  actor: AuthorizationActor,
  resource: AuthorizationResource,
): boolean {
  const actual = readAttribute(condition.attribute, actor, resource);
  const expected = resolveExpected(condition.value, actor, resource);

  switch (condition.operator) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "in":
      return Array.isArray(expected) && expected.includes(actual);
    case "not_in":
      return Array.isArray(expected) && !expected.includes(actual);
    case "exists":
      return actual !== undefined && actual !== null;
    case "not_exists":
      return actual === undefined || actual === null;
  }
}

function readAttribute(
  attribute: string,
  actor: AuthorizationActor,
  resource: AuthorizationResource,
): unknown {
  if (attribute.startsWith("actor.")) {
    return readPath(actor as unknown as Record<string, unknown>, attribute.slice("actor.".length));
  }
  if (attribute.startsWith("resource.")) {
    return readPath({ ...resource, ...(resource.attributes ?? {}) }, attribute.slice("resource.".length));
  }
  return undefined;
}

function resolveExpected(
  value: unknown,
  actor: AuthorizationActor,
  resource: AuthorizationResource,
): unknown {
  if (typeof value !== "string") return value;
  if (value.startsWith("$actor.")) {
    return readPath(valueOf(actor), value.slice("$actor.".length));
  }
  if (value.startsWith("$resource.")) {
    return readPath({ ...resource, ...(resource.attributes ?? {}) }, value.slice("$resource.".length));
  }
  return value;
}

function readPath(value: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[part];
  }, value);
}

function valueOf(actor: AuthorizationActor): Record<string, unknown> {
  return actor as unknown as Record<string, unknown>;
}
