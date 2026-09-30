import { All, Body, Controller, Get, HttpCode, NotFoundException, Post, Req, Res, VERSION_NEUTRAL } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { DEMO_LOGIN_EMAIL, DEMO_LOGIN_PASSWORD } from "@rfp-os/db";

import { AllowUnverified, AllowWithoutOrg, CurrentAuth, Public, toFetchHeaders } from "../../common/auth";
import type { RequestWithAuth } from "../../common/auth";
import type { AuthContext } from "@rfp-os/types";
import { ZodBody } from "../../common/decorators/zod-schema.decorator";
import { AuthService } from "./auth.service";
import {
  completePasswordLinkSchema,
  startPasswordLinkSchema,
  type CompletePasswordLinkInput,
  type StartPasswordLinkInput,
} from "./password-links.dto";

/**
 * Mounts Better Auth's own routes at /api/auth/*.
 *
 * VERSION_NEUTRAL because authentication is not part of the versioned domain
 * surface — /api/v1 endpoints may come and go, but the sign-in URL should not
 * move underneath existing clients. This path also matches the `basePath`
 * configured on the Better Auth instance; the two must agree or callback URLs
 * break.
 */
@Controller({ path: "auth", version: VERSION_NEUTRAL })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Express 5's router requires the named-wildcard form ("*splat"); a bare "*"
   * throws at registration (same reason RequestIdMiddleware uses it).
   */
  @Public()
  @All("*splat")
  async handle(@Req() request: Request, @Res() response: Response): Promise<void> {
    const webRequest = toWebRequest(request);
    const webResponse = await this.authService.auth.handler(webRequest);
    await writeWebResponse(webResponse, response);
  }
}

/**
 * Session-scoped endpoints that are ours rather than Better Auth's: who am I,
 * which tenants can I act in, and switch the active one.
 */
@Controller({ path: "auth", version: "1" })
export class AuthSessionController {
  constructor(private readonly authService: AuthService) {}

  /**
   * The caller's identity, tenant, role and effective permissions. Reachable
   * without a tenant: a signed-in user with no organization yet gets their
   * identity with organizationId null rather than a 403.
   */
  @AllowWithoutOrg()
  @AllowUnverified()
  @Get("me")
  async me(@CurrentAuth() auth: AuthContext, @Req() request: RequestWithAuth) {
    const userId = auth?.userId ?? request.sessionUserId;
    const memberships = userId ? await this.authService.listMemberships(userId) : [];
    return {
      userId,
      organizationId: auth?.organizationId ?? null,
      role: auth?.role ?? null,
      permissions: auth?.permissions ?? [],
      /*
       * `permissions` is the union across workspaces. A client deciding whether
       * to show a control for one workspace needs the split below — the same
       * one the API enforces with hasWorkspacePermission.
       */
      organizationPermissions: auth?.organizationPermissions ?? [],
      workspacePermissions: auth?.workspacePermissions ?? {},
      workspaceIds: auth?.workspaceIds ?? [],
      emailVerified: request.emailVerified === true,
      memberships,
    };
  }

  /** Reachable without a tenant, so a user with no membership can see they have none. */
  @AllowWithoutOrg()
  @AllowUnverified()
  @Get("memberships")
  async memberships(@Req() request: RequestWithAuth) {
    const userId = request.auth?.userId ?? request.sessionUserId;
    if (!userId) return { memberships: [] };
    return { memberships: await this.authService.listMemberships(userId) };
  }

  /**
   * Repoints the session at another organization. Membership is verified in
   * the service, so this cannot be used to reach a tenant the caller is not in.
   */
  @AllowWithoutOrg()
  @Post("organizations/:organizationId/activate")
  async activate(@Req() request: RequestWithAuth) {
    const organizationId = request.params.organizationId as string;
    const membership = await this.authService.activateOrganization(
      {
        userId: request.sessionUserId as string,
        sessionId: request.sessionId as string,
        activeOrganizationId: request.auth?.organizationId ?? null,
      },
      organizationId,
    );
    return { activated: membership };
  }

  /**
   * Starts sign-up or a password reset: emails a single-use set-password link.
   * Always answers the same way, so it cannot be used to discover which
   * addresses have accounts. Tightly rate limited because it sends email.
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(202)
  @Post("email-link/start")
  @ZodBody(startPasswordLinkSchema)
  async startPasswordLink(@Body() body: StartPasswordLinkInput) {
    await this.authService.passwordLinks.start(body.email);
    return { sent: true };
  }

  /**
   * Completes the emailed link: sets the password (creating the account if
   * needed), signs out every other session, then signs in with the new
   * password so the browser receives a normal Better Auth session cookie.
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("email-link/complete")
  @ZodBody(completePasswordLinkSchema)
  async completePasswordLink(
    @Req() request: Request,
    @Res() response: Response,
    @Body() body: CompletePasswordLinkInput,
  ): Promise<void> {
    const { email } = await this.authService.passwordLinks.complete(body.token, body.password, body.name);

    const origin = `${request.protocol}://${request.get("host")}`;
    const headers: Record<string, string> = { "content-type": "application/json" };
    for (const name of ["origin", "user-agent", "x-forwarded-for"]) {
      const value = request.get(name);
      if (value) headers[name] = value;
    }
    const signInResponse = await this.authService.auth.handler(
      new globalThis.Request(new URL("/api/auth/sign-in/email", origin).toString(), {
        method: "POST",
        headers,
        body: JSON.stringify({ email, password: body.password, rememberMe: true }),
      }),
    );
    await writeWebResponse(signInResponse, response);
  }

  /**
   * Local-development helper that creates the demo credential if needed and
   * then signs in through Better Auth so the browser gets the real cookie.
   * Always signs in as the seeded demo user; any request body is ignored.
   * Outside a local stack the route answers 404 as if it did not exist.
   */
  @Public()
  @Post("dev-login")
  async devLogin(@Req() request: Request, @Res() response: Response): Promise<void> {
    if (!this.authService.isDevelopmentLoginEnabled()) {
      throw new NotFoundException();
    }

    const email = DEMO_LOGIN_EMAIL;
    const password = DEMO_LOGIN_PASSWORD;

    try {
      await this.authService.ensureDevelopmentCredential();
    } catch (error) {
      console.warn(
        `[AuthController] dev-login credential bootstrap failed for ${email}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const origin = `${request.protocol}://${request.get("host")}`;
    const signInRequest = new globalThis.Request(new URL("/api/auth/sign-in/email", origin).toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ email, password, rememberMe: true }),
    });
    const signInResponse = await this.authService.auth.handler(signInRequest);

    await writeWebResponse(signInResponse, response);
  }
}

/** Express request to the Fetch Request that Better Auth's handler consumes. */
function toWebRequest(request: Request): Request2 {
  const protocol = request.protocol;
  const host = request.get("host") ?? "localhost";
  const url = new URL(request.originalUrl, `${protocol}://${host}`);
  const headers = toFetchHeaders(request);

  const hasBody = !["GET", "HEAD"].includes(request.method.toUpperCase());
  /**
   * Nest's body parser has already consumed the stream, so the body is
   * re-serialised here. `request.body` is undefined when no parser matched the
   * content type, which is correct to forward as an empty body.
   */
  const body =
    hasBody && request.body !== undefined && request.body !== null
      ? JSON.stringify(request.body)
      : undefined;

  return new globalThis.Request(url.toString(), { method: request.method, headers, body });
}

type Request2 = globalThis.Request;

async function writeWebResponse(webResponse: Response2, response: Response): Promise<void> {
  response.status(webResponse.status);

  /**
   * Set-Cookie must be written as separate headers — collapsing several into
   * one comma-joined value is not parsed back correctly by browsers, and this
   * is exactly the header that carries the session.
   */
  const setCookie =
    typeof webResponse.headers.getSetCookie === "function"
      ? webResponse.headers.getSetCookie()
      : [];
  for (const cookie of setCookie) response.append("set-cookie", cookie);

  webResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return;
    response.setHeader(key, value);
  });

  const buffer = Buffer.from(await webResponse.arrayBuffer());
  response.send(buffer);
}

type Response2 = globalThis.Response;
