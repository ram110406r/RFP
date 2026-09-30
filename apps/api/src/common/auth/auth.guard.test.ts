import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "bun:test";
import { permissionsForRole, type AuthContext } from "@rfp-os/types";

import { AuthGuard, toFetchHeaders } from "./auth.guard";
import { ALLOW_UNVERIFIED, ALLOW_WITHOUT_ORG, IS_PUBLIC } from "./auth.decorators";
import type { ResolvedSession } from "../../modules/auth/auth.service";

interface StubOptions {
  session?: ResolvedSession | null;
  authContext?: AuthContext | null;
}

/** Stands in for AuthService — the guard only ever calls these two methods. */
function stubAuthService({ session = null, authContext = null }: StubOptions) {
  return {
    resolveSession: async () => session,
    resolveAuthContext: async () => authContext,
  } as never;
}

function contextFor(request: Record<string, unknown>, metadata: Record<string, boolean> = {}) {
  const handler = () => undefined;
  const cls = class Controller {};
  for (const [key, value] of Object.entries(metadata)) {
    Reflect.defineMetadata(key, value, handler);
  }
  return {
    getType: () => "http",
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

const session: ResolvedSession = {
  userId: "user-1",
  sessionId: "session-1",
  activeOrganizationId: "org-1",
  emailVerified: true,
};

const unverifiedSession: ResolvedSession = { ...session, emailVerified: false };

const authContext: AuthContext = {
  userId: "user-1",
  organizationId: "org-1",
  role: "CONTRIBUTOR",
  permissions: permissionsForRole("CONTRIBUTOR"),
  sessionId: "session-1",
};

describe("AuthGuard", () => {
  it("lets a @Public route through without a session", async () => {
    const guard = new AuthGuard(new Reflector(), stubAuthService({}));
    const request: Record<string, unknown> = { headers: {} };
    await expect(guard.canActivate(contextFor(request, { [IS_PUBLIC]: true }))).resolves.toBe(true);
    expect(request.auth).toBeUndefined();
  });

  it("rejects an unauthenticated request to a guarded route", async () => {
    const guard = new AuthGuard(new Reflector(), stubAuthService({ session: null }));
    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("attaches the resolved tenant context to the request", async () => {
    const guard = new AuthGuard(new Reflector(), stubAuthService({ session, authContext }));
    const request: Record<string, unknown> = { headers: {} };
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.auth).toEqual(authContext);
    expect(request.sessionUserId).toBe("user-1");
  });

  it("forbids an authenticated user with no active membership", async () => {
    const guard = new AuthGuard(new Reflector(), stubAuthService({ session, authContext: null }));
    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("admits a membership-less user only to @AllowWithoutOrg routes, with no tenant", async () => {
    const guard = new AuthGuard(new Reflector(), stubAuthService({ session, authContext: null }));
    const request: Record<string, unknown> = { headers: {} };
    await expect(
      guard.canActivate(contextFor(request, { [ALLOW_WITHOUT_ORG]: true })),
    ).resolves.toBe(true);
    expect(request.auth).toBeUndefined();
    expect(request.sessionUserId).toBe("user-1");
  });

  it("rejects an unverified email on ordinary routes", async () => {
    const guard = new AuthGuard(new Reflector(), stubAuthService({ session: unverifiedSession, authContext }));
    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toMatchObject({
      response: { code: "EMAIL_VERIFICATION_REQUIRED" },
    });
  });

  it("rejects an unverified email on @AllowWithoutOrg routes too (invitation takeover)", async () => {
    const guard = new AuthGuard(
      new Reflector(),
      stubAuthService({ session: unverifiedSession, authContext: null }),
    );
    await expect(
      guard.canActivate(contextFor({ headers: {} }, { [ALLOW_WITHOUT_ORG]: true })),
    ).rejects.toMatchObject({ response: { code: "EMAIL_VERIFICATION_REQUIRED" } });
  });

  it("treats a session with unknown verification status as unverified", async () => {
    const { emailVerified: _omitted, ...unknown } = session;
    const guard = new AuthGuard(new Reflector(), stubAuthService({ session: unknown, authContext }));
    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("admits an unverified email only to @AllowUnverified routes", async () => {
    const guard = new AuthGuard(
      new Reflector(),
      stubAuthService({ session: unverifiedSession, authContext: null }),
    );
    const request: Record<string, unknown> = { headers: {} };
    await expect(
      guard.canActivate(
        contextFor(request, { [ALLOW_UNVERIFIED]: true, [ALLOW_WITHOUT_ORG]: true }),
      ),
    ).resolves.toBe(true);
    expect(request.emailVerified).toBe(false);
  });

  it("never takes the organization from a client-supplied header", async () => {
    const guard = new AuthGuard(new Reflector(), stubAuthService({ session, authContext }));
    const request: Record<string, unknown> = {
      headers: { "x-organization-id": "org-attacker" },
      body: { organizationId: "org-attacker" },
    };
    await guard.canActivate(contextFor(request));
    expect((request.auth as AuthContext).organizationId).toBe("org-1");
  });
});

describe("toFetchHeaders", () => {
  it("carries single and repeated headers across", () => {
    const headers = toFetchHeaders({
      headers: { cookie: "a=1", "x-multi": ["one", "two"], "content-type": "application/json" },
    });
    expect(headers.get("cookie")).toBe("a=1");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-multi")).toContain("one");
    expect(headers.get("x-multi")).toContain("two");
  });
});
