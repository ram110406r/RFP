import { describe, expect, it } from "bun:test";

import { can } from "./index";

const baseActor = {
  userId: "user-a",
  organizationId: "org-a",
  permissions: ["rfp:update", "rfp:read"],
} as const;

describe("authorization engine", () => {
  it("denies cross-organization access", () => {
    const decision = can({
      actor: baseActor,
      action: "read",
      resource: {
        type: "rfp",
        organizationId: "org-b",
      },
    });

    expect(decision).toEqual({
      allowed: false,
      reason: "Cross-organization access is forbidden.",
    });
  });

  it("denies cross-workspace access when the actor is scoped to another workspace", () => {
    const decision = can({
      actor: { ...baseActor, workspaceId: "workspace-a1" },
      action: "read",
      resource: {
        type: "rfp",
        organizationId: "org-a",
        workspaceId: "workspace-a2",
      },
    });

    expect(decision).toEqual({
      allowed: false,
      reason: "Cross-workspace access is forbidden.",
    });
  });

  it("allows an owner-only policy when the actor matches resource.ownerId", () => {
    const decision = can({
      actor: baseActor,
      action: "update",
      resource: {
        type: "rfp",
        organizationId: "org-a",
        ownerId: "user-a",
      },
      policies: [
        {
          effect: "allow",
          action: "update",
          resource: "rfp",
          priority: 10,
          conditions: [
            {
              attribute: "resource.ownerId",
              operator: "eq",
              value: "$actor.userId",
            },
          ],
        },
      ],
    });

    expect(decision.allowed).toBe(true);
  });

  it("denies when a policy requires ownership and the actor does not own the resource", () => {
    const decision = can({
      actor: baseActor,
      action: "update",
      resource: {
        type: "rfp",
        organizationId: "org-a",
        ownerId: "user-b",
      },
      policies: [
        {
          effect: "deny",
          action: "update",
          resource: "rfp",
          priority: 100,
          conditions: [
            {
              attribute: "resource.ownerId",
              operator: "neq",
              value: "$actor.userId",
            },
          ],
        },
      ],
    });

    expect(decision).toEqual({ allowed: false, reason: "Denied by policy." });
  });

  it("requires assignment when the caller lacks one", () => {
    const decision = can({
      actor: baseActor,
      action: "update",
      resource: {
        type: "rfp",
        organizationId: "org-a",
      },
      requireAssignment: true,
      assignments: [{ assigneeType: "user", assigneeId: "user-b" }],
    });

    expect(decision).toEqual({
      allowed: false,
      reason: "This action requires an assignment.",
    });
  });

  it("does not let assignment bypass missing RBAC permission", () => {
    const decision = can({
      actor: {
        userId: "user-a",
        organizationId: "org-a",
        permissions: ["rfp:read"],
      },
      action: "update",
      resource: {
        type: "rfp",
        organizationId: "org-a",
      },
      requireAssignment: true,
      assignments: [{ assigneeType: "user", assigneeId: "user-a" }],
    });

    expect(decision).toEqual({
      allowed: false,
      reason: "Missing permission rfp:update.",
    });
  });

  it("allows assigned users when RBAC passes and assignment is required", () => {
    const decision = can({
      actor: baseActor,
      action: "update",
      resource: {
        type: "rfp",
        organizationId: "org-a",
      },
      requireAssignment: true,
      assignments: [{ assigneeType: "user", assigneeId: "user-a" }],
    });

    expect(decision.allowed).toBe(true);
  });

  it("denies mutation of FINAL resources when a deny policy matches resource state", () => {
    const decision = can({
      actor: baseActor,
      action: "update",
      resource: {
        type: "rfp",
        organizationId: "org-a",
        status: "FINAL",
      },
      policies: [
        {
          effect: "deny",
          action: "update",
          resource: "rfp",
          priority: 50,
          conditions: [
            {
              attribute: "resource.status",
              operator: "eq",
              value: "FINAL",
            },
          ],
        },
      ],
    });

    expect(decision).toEqual({ allowed: false, reason: "Denied by policy." });
  });

  it("lets deny win over allow regardless of priority ordering", () => {
    const decision = can({
      actor: baseActor,
      action: "update",
      resource: {
        type: "rfp",
        organizationId: "org-a",
        ownerId: "user-a",
      },
      policies: [
        {
          effect: "allow",
          action: "update",
          resource: "rfp",
          priority: 1000,
          conditions: [
            {
              attribute: "resource.ownerId",
              operator: "eq",
              value: "$actor.userId",
            },
          ],
        },
        {
          effect: "deny",
          action: "update",
          resource: "rfp",
          priority: -1000,
          conditions: [
            {
              attribute: "resource.ownerId",
              operator: "eq",
              value: "$actor.userId",
            },
          ],
        },
      ],
    });

    expect(decision).toEqual({ allowed: false, reason: "Denied by policy." });
  });
});
