/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";

import { accessFrom, assignableRoles } from "./permissions";

describe("accessFrom", () => {
  const manager = accessFrom({
    userId: "u",
    organizationId: "o",
    role: "RFP_MANAGER",
    permissions: ["org:read", "team:create"],
    organizationPermissions: ["org:read"],
    workspacePermissions: { "ws-a": ["team:create"] },
    workspaceIds: ["ws-a"],
    emailVerified: true,
    memberships: [],
  });

  test("separates organization-wide from per-workspace grants", () => {
    expect(manager.can("org:read")).toBe(true);
    expect(manager.can("team:create")).toBe(false);
    expect(manager.canInWorkspace("team:create", "ws-a")).toBe(true);
    expect(manager.canInWorkspace("team:create", "ws-b")).toBe(false);
    expect(manager.canAnywhere("team:create")).toBe(true);
  });

  test("denies everything while nothing is loaded", () => {
    const none = accessFrom(undefined);
    expect(none.role).toBeNull();
    expect(none.can("org:read")).toBe(false);
    expect(none.canInWorkspace("team:create", "ws-a")).toBe(false);
  });
});

describe("assignableRoles", () => {
  test("follows the server's role ceiling", () => {
    expect(assignableRoles("OWNER")).toContain("OWNER");
    expect(assignableRoles("ADMIN")).not.toContain("OWNER");
    expect(assignableRoles("ADMIN")).toContain("ADMIN");
    expect(assignableRoles("RFP_MANAGER")).not.toContain("ADMIN");
    expect(assignableRoles(null)).toEqual(["RFP_MANAGER", "CONTRIBUTOR", "REVIEWER", "SME", "VIEWER"]);
  });
});
