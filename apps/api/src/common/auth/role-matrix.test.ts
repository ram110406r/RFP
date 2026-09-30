import { describe, expect, it } from "bun:test";
import {
  ORG_ROLES,
  WORKSPACE_SCOPED_PERMISSIONS,
  roleHasPermission,
  type OrgRole,
  type Permission,
} from "@rfp-os/types";

/**
 * Pins the authorization decisions made when fixing organization and team
 * management, so a later edit to the matrix has to change these on purpose.
 */
describe("role matrix", () => {
  const holders = (permission: Permission): OrgRole[] =>
    ORG_ROLES.filter((role) => roleHasPermission(role, permission));

  it("treats knowledge as organization-level, not per-workspace", () => {
    for (const permission of [
      "ai.knowledge.read",
      "ai.knowledge.create",
      "ai.knowledge.update",
      "ai.knowledge.approve",
    ] as const) {
      expect(WORKSPACE_SCOPED_PERMISSIONS).not.toContain(permission);
    }
  });

  it("lets every role read knowledge", () => {
    expect(holders("ai.knowledge.read")).toEqual([...ORG_ROLES]);
  });

  it("restricts knowledge curation to OWNER, ADMIN, RFP_MANAGER and SME", () => {
    const curators: OrgRole[] = ["OWNER", "ADMIN", "RFP_MANAGER", "SME"];
    expect(holders("ai.knowledge.create")).toEqual(curators);
    expect(holders("ai.knowledge.update")).toEqual(curators);
    expect(holders("ai.knowledge.approve")).toEqual(curators);
  });

  it("gates the organization-wide match profile behind its own org-level permission", () => {
    expect(WORKSPACE_SCOPED_PERMISSIONS).not.toContain("tender:match_profile:update");
    expect(holders("tender:match_profile:update")).toEqual(["OWNER", "ADMIN", "RFP_MANAGER"]);
  });

  it("lets RFP_MANAGER manage teams and workspace membership, only per workspace", () => {
    for (const permission of [
      "team:create",
      "team:update",
      "team:archive",
      "team:member:manage",
      "workspace:member:manage",
    ] as const) {
      expect(roleHasPermission("RFP_MANAGER", permission)).toBe(true);
      expect(WORKSPACE_SCOPED_PERMISSIONS).toContain(permission);
    }
  });

  it("keeps inviting and org-level membership changes with OWNER and ADMIN", () => {
    for (const permission of ["member:invite", "member:update", "member:remove", "workspace:create"] as const) {
      expect(holders(permission)).toEqual(["OWNER", "ADMIN"]);
    }
  });
});
