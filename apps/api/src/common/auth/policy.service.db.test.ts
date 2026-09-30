import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { accessPolicies, getDb, organizations, policyConditions } from "@rfp-os/db";
import type { AuthContext } from "@rfp-os/types";

import { PolicyService } from "./policy.service";

const shouldRunDbTests = Boolean(process.env.DATABASE_URL && !process.env.TENDYY_ROOT_BUN_TEST);
const dbTest = shouldRunDbTests ? test : test.skip;
const describeDb = shouldRunDbTests ? describe : describe.skip;

describeDb("PolicyService live DB matrix", () => {
  const db = shouldRunDbTests ? getDb() : (undefined as never);
  const service = new PolicyService(db);

  const orgId = randomUUID();
  const otherOrgId = randomUUID();
  const suffix = randomUUID().slice(0, 8);
  const createdPolicyIds: string[] = [];

  const auth: AuthContext = {
    userId: "user-a",
    organizationId: orgId,
    role: "CONTRIBUTOR",
    permissions: ["rfp:update", "rfp:read"],
    organizationPermissions: ["rfp:update", "rfp:read"],
    sessionId: "policy-db",
  };

  beforeAll(async () => {
    await db.insert(organizations).values([
      { id: orgId, name: `Policy Org ${suffix}`, domain: `policy-${suffix}.invalid` },
      { id: otherOrgId, name: `Policy Other ${suffix}`, domain: `policy-other-${suffix}.invalid` },
    ]);
  });

  afterAll(async () => {
    if (createdPolicyIds.length > 0) {
      await db.delete(policyConditions).where(inArray(policyConditions.policyId, createdPolicyIds));
      await db.delete(accessPolicies).where(inArray(accessPolicies.id, createdPolicyIds));
    }
    await db.delete(organizations).where(inArray(organizations.id, [orgId, otherOrgId]));
  });

  dbTest("supports organization, workspace, owner, assignment and mutable-state conditions", async () => {
    const policyIds = await createPolicies([
      {
        name: "same-org",
        action: "update",
        effect: "deny",
        conditions: [
          { attribute: "resource.organizationId", operator: "neq", value: "$actor.organizationId" },
        ],
      },
      {
        name: "same-workspace",
        action: "update",
        effect: "deny",
        conditions: [
          { attribute: "resource.workspaceId", operator: "neq", value: "workspace-a1" },
        ],
      },
      {
        name: "must-own",
        action: "update",
        effect: "deny",
        conditions: [{ attribute: "resource.ownerId", operator: "neq", value: "$actor.userId" }],
      },
      {
        name: "must-be-assigned",
        action: "update",
        effect: "deny",
        conditions: [
          { attribute: "resource.assigneeId", operator: "neq", value: "$actor.userId" },
        ],
      },
      {
        name: "not-final",
        action: "update",
        effect: "deny",
        conditions: [{ attribute: "resource.status", operator: "eq", value: "FINAL" }],
      },
    ]);
    createdPolicyIds.push(...policyIds);

    const allowed = await service.evaluate(auth, "rfp", "update", {
      organizationId: orgId,
      workspaceId: "workspace-a1",
      ownerId: "user-a",
      assigneeId: "user-a",
      status: "DRAFT",
    });
    expect(allowed).toEqual({ allowed: true });

    const wrongOrg = await service.evaluate(auth, "rfp", "update", {
      organizationId: otherOrgId,
      workspaceId: "workspace-a1",
      ownerId: "user-a",
      assigneeId: "user-a",
      status: "DRAFT",
    });
    expect(wrongOrg.allowed).toBe(false);

    const wrongWorkspace = await service.evaluate(auth, "rfp", "update", {
      organizationId: orgId,
      workspaceId: "workspace-a2",
      ownerId: "user-a",
      assigneeId: "user-a",
      status: "DRAFT",
    });
    expect(wrongWorkspace.allowed).toBe(false);

    const wrongOwner = await service.evaluate(auth, "rfp", "update", {
      organizationId: orgId,
      workspaceId: "workspace-a1",
      ownerId: "user-b",
      assigneeId: "user-a",
      status: "DRAFT",
    });
    expect(wrongOwner.allowed).toBe(false);

    const wrongAssignee = await service.evaluate(auth, "rfp", "update", {
      organizationId: orgId,
      workspaceId: "workspace-a1",
      ownerId: "user-a",
      assigneeId: "user-b",
      status: "DRAFT",
    });
    expect(wrongAssignee.allowed).toBe(false);

    const finalState = await service.evaluate(auth, "rfp", "update", {
      organizationId: orgId,
      workspaceId: "workspace-a1",
      ownerId: "user-a",
      assigneeId: "user-a",
      status: "FINAL",
    });
    expect(finalState.allowed).toBe(false);
  });

  dbTest("gives deny precedence over allow with stored policies", async () => {
    const policyIds = await createPolicies([
      {
        name: "broad-allow",
        action: "read",
        effect: "allow",
        priority: 1000,
        conditions: [{ attribute: "resource.ownerId", operator: "eq", value: "$actor.userId" }],
      },
      {
        name: "narrow-deny",
        action: "read",
        effect: "deny",
        priority: -1000,
        conditions: [{ attribute: "resource.ownerId", operator: "eq", value: "$actor.userId" }],
      },
    ]);
    createdPolicyIds.push(...policyIds);

    const decision = await service.evaluate(auth, "rfp", "read", {
      ownerId: "user-a",
    });

    expect(decision).toEqual({
      allowed: false,
      reason: expect.stringContaining("Denied"),
    });
  });

  async function createPolicies(
    specs: {
      name: string;
      action: string;
      effect: "allow" | "deny";
      priority?: number;
      conditions: {
        attribute: string;
        operator: "eq" | "neq" | "exists" | "not_exists" | "in" | "not_in";
        value?: unknown;
      }[];
    }[],
  ) {
    const ids: string[] = [];

    for (const spec of specs) {
      const [policy] = await db
        .insert(accessPolicies)
        .values({
          organizationId: orgId,
          name: `${spec.name}-${randomUUID().slice(0, 6)}`,
          resource: "rfp",
          action: spec.action,
          effect: spec.effect,
          priority: spec.priority ?? 0,
          status: "active",
        })
        .returning({ id: accessPolicies.id });

      ids.push(policy!.id);

      await db.insert(policyConditions).values(
        spec.conditions.map((condition) => ({
          policyId: policy!.id,
          attribute: condition.attribute,
          operator: condition.operator,
          value: condition.value ?? null,
          logicalGroup: "default",
        })),
      );
    }

    return ids;
  }
});
