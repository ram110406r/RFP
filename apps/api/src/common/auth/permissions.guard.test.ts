import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "bun:test";
import {
  ROLE_PERMISSIONS,
  permissionsForRole,
  roleHasPermission,
  type AuthContext,
  type OrgRole,
  type Permission,
} from "@rfp-os/types";

import { PermissionsGuard } from "./permissions.guard";
import { REQUIRED_PERMISSIONS } from "./auth.decorators";

function contextFor(auth: AuthContext | undefined, required?: Permission[]) {
  const handler = () => undefined;
  const cls = class Controller {};
  if (required) Reflect.defineMetadata(REQUIRED_PERMISSIONS, required, handler);

  return {
    getType: () => "http",
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => ({ auth }) }),
  } as never;
}

function authAs(role: OrgRole): AuthContext {
  return {
    userId: "user-1",
    organizationId: "org-1",
    role,
    permissions: permissionsForRole(role),
    sessionId: "session-1",
  };
}

describe("role permission matrix", () => {
  it("gives OWNER and ADMIN every rfp permission", () => {
    for (const role of ["OWNER", "ADMIN"] as const) {
      expect(roleHasPermission(role, "rfp:delete")).toBe(true);
      expect(roleHasPermission(role, "rfp:submit")).toBe(true);
      expect(roleHasPermission(role, "member:remove")).toBe(true);
    }
  });

  it("withholds rfp:delete and org administration from RFP_MANAGER", () => {
    expect(roleHasPermission("RFP_MANAGER", "rfp:submit")).toBe(true);
    expect(roleHasPermission("RFP_MANAGER", "rfp:delete")).toBe(false);
    expect(roleHasPermission("RFP_MANAGER", "member:invite")).toBe(false);
    expect(roleHasPermission("RFP_MANAGER", "org:update")).toBe(false);
  });

  it("keeps CONTRIBUTOR out of approval and submission", () => {
    expect(roleHasPermission("CONTRIBUTOR", "rfp:update")).toBe(true);
    expect(roleHasPermission("CONTRIBUTOR", "rfp:approve")).toBe(false);
    expect(roleHasPermission("CONTRIBUTOR", "rfp:submit")).toBe(false);
  });

  it("gives VIEWER read access and nothing that writes", () => {
    const writes: Permission[] = [
      "rfp:create",
      "rfp:update",
      "rfp:delete",
      "rfp:approve",
      "rfp:submit",
      "member:invite",
    ];
    expect(roleHasPermission("VIEWER", "rfp:read")).toBe(true);
    for (const permission of writes) {
      expect(roleHasPermission("VIEWER", permission)).toBe(false);
    }
  });

  it("defines a permission set for every role", () => {
    for (const role of Object.keys(ROLE_PERMISSIONS) as OrgRole[]) {
      expect(permissionsForRole(role).length).toBeGreaterThan(0);
    }
  });
});

describe("PermissionsGuard", () => {
  const guard = new PermissionsGuard(new Reflector());

  it("allows a route with no declared permissions", () => {
    expect(guard.canActivate(contextFor(authAs("VIEWER")))).toBe(true);
  });

  it("allows a caller holding the required permission", () => {
    expect(guard.canActivate(contextFor(authAs("OWNER"), ["rfp:delete"]))).toBe(true);
  });

  it("forbids a caller missing the required permission", () => {
    expect(() => guard.canActivate(contextFor(authAs("VIEWER"), ["rfp:delete"]))).toThrow(
      ForbiddenException,
    );
  });

  it("requires every listed permission, not just one", () => {
    // REVIEWER has rfp:review but not rfp:delete.
    expect(() =>
      guard.canActivate(contextFor(authAs("REVIEWER"), ["rfp:review", "rfp:delete"])),
    ).toThrow(ForbiddenException);
  });

  it("names the missing permission in the error", () => {
    try {
      guard.canActivate(contextFor(authAs("CONTRIBUTOR"), ["rfp:approve"]));
      throw new Error("expected the guard to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      const body = (error as ForbiddenException).getResponse() as {
        code: string;
        message: string;
      };
      expect(body.code).toBe("FORBIDDEN");
      expect(body.message).toContain("rfp:approve");
    }
  });

  it("forbids a request that carries no auth context at all", () => {
    expect(() => guard.canActivate(contextFor(undefined, ["rfp:read"]))).toThrow(
      ForbiddenException,
    );
  });
});
