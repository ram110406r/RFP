import { SetMetadata, createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { AuthContext, Permission } from "@rfp-os/types";

export const IS_PUBLIC = "auth:public";
export const REQUIRED_PERMISSIONS = "auth:required-permissions";
export const ALLOW_WITHOUT_ORG = "auth:allow-without-org";

/**
 * Opts a route out of authentication.
 *
 * Authentication is on by default (AuthGuard is registered globally), so a new
 * endpoint is protected unless someone deliberately marks it otherwise. The
 * reverse default — remembering to add a guard — is how endpoints ship
 * unprotected.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * Requires an authenticated user but no organization context. For the handful
 * of routes that exist precisely because the caller has no tenant yet:
 * listing invitations addressed to them, accepting one, creating an
 * organization.
 */
export const AllowWithoutOrg = () => SetMetadata(ALLOW_WITHOUT_ORG, true);

/**
 * Declares the permissions a route needs. All listed permissions must be held
 * (AND, not OR) — a route that legitimately needs either of two permissions
 * should say so explicitly with its own check rather than weakening this.
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);

export interface RequestWithAuth extends Request {
  auth?: AuthContext;
  sessionUserId?: string;
  sessionId?: string;
}

/**
 * Injects the resolved AuthContext. Always populated on a guarded route —
 * AuthGuard rejects the request before the handler runs otherwise.
 */
export const CurrentAuth = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<RequestWithAuth>();
  return request.auth;
});

/**
 * Injects just the organization id. Handlers take the tenant from here rather
 * than from a route param or body field, so an org-scoped query cannot be
 * pointed at another tenant by editing the request.
 */
export const OrgId = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<RequestWithAuth>();
  return request.auth?.organizationId;
});

/**
 * Injects the caller's user id.
 *
 * Falls back to the session identity because @AllowWithoutOrg routes
 * deliberately have no AuthContext — those routes exist precisely for a user
 * with no tenant yet, and they still need to know who is asking.
 */
export const CurrentUserId = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<RequestWithAuth>();
  return request.auth?.userId ?? request.sessionUserId;
});
