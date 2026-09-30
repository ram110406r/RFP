import { describe, expect, it } from "bun:test";
import { permissionsForRole, WORKSPACE_SCOPED_PERMISSIONS, type AuthContext, type Permission } from "@rfp-os/types";

import { TenderPermissionError } from "./domain/tender.errors";
import { TendersService } from "./tenders.service";

/**
 * PermissionsGuard admits a request when the caller holds tender:update in
 * *any* workspace, because auth.permissions is the union across workspaces.
 * TendersService.update must therefore check the tender's own workspace.
 */
const contributorPermissions = permissionsForRole("CONTRIBUTOR");
const workspaceScoped = contributorPermissions.filter((permission) =>
  WORKSPACE_SCOPED_PERMISSIONS.includes(permission),
);

const memberOfWorkspaceA: AuthContext = {
  userId: "user-a",
  organizationId: "org-1",
  role: "CONTRIBUTOR",
  sessionId: "session-a",
  organizationPermissions: contributorPermissions.filter((permission) => !workspaceScoped.includes(permission)),
  permissions: contributorPermissions,
  workspaceIds: ["workspace-a"],
  workspacePermissions: { "workspace-a": workspaceScoped as Permission[] },
};

function serviceReturningTenderIn(workspaceId: string) {
  const service = Object.create(TendersService.prototype) as TendersService;
  const touched: string[] = [];
  Object.assign(service, {
    requireTender: async () => ({ id: "tender-1", organizationId: "org-1", workspaceId, status: "DRAFT" }),
    assertPolicyAllows: async () => {
      touched.push("policy");
    },
    requireActiveMember: async () => {
      touched.push("member");
    },
  });
  return { service, touched };
}

describe("TendersService.update workspace authorization", () => {
  it("rejects editing a tender in a workspace the caller does not belong to", async () => {
    const { service, touched } = serviceReturningTenderIn("workspace-b");
    const error = await service
      .update(memberOfWorkspaceA, "tender-1", { title: "Hijacked" } as never)
      .then(() => null, (rejection: unknown) => rejection);
    expect(error).toBeInstanceOf(TenderPermissionError);
    // Rejected before any policy evaluation or write path ran.
    expect(touched).toEqual([]);
  });

  it("lets the check pass for the caller's own workspace", async () => {
    const { service, touched } = serviceReturningTenderIn("workspace-a");
    // The rest of update() needs a database; reaching the policy check is
    // enough to show the workspace check let it through.
    await service
      .update(memberOfWorkspaceA, "tender-1", { title: "Mine" } as never)
      .catch(() => undefined);
    expect(touched).toContain("policy");
  });
});
