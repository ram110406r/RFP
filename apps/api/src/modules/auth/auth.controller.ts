import { All, Controller, Get, Post, Req, Res, VERSION_NEUTRAL } from "@nestjs/common";
import type { Request, Response } from "express";

import { AllowWithoutOrg, CurrentAuth, Public, toFetchHeaders } from "../../common/auth";
import type { RequestWithAuth } from "../../common/auth";
import type { AuthContext } from "@rfp-os/types";
import { AuthService } from "./auth.service";

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

  /** The caller's identity, tenant, role and effective permissions. */
  @Get("me")
  async me(@CurrentAuth() auth: AuthContext, @Req() request: RequestWithAuth) {
    const userId = auth?.userId ?? request.sessionUserId;
    const memberships = userId ? await this.authService.listMemberships(userId) : [];
    return {
      userId,
      organizationId: auth?.organizationId ?? null,
      role: auth?.role ?? null,
      permissions: auth?.permissions ?? [],
      memberships,
    };
  }

  /** Reachable without a tenant, so a user with no membership can see they have none. */
  @AllowWithoutOrg()
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
