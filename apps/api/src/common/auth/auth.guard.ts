import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { AuthService } from "../../modules/auth/auth.service";
import { ALLOW_WITHOUT_ORG, IS_PUBLIC, type RequestWithAuth } from "./auth.decorators";

/**
 * Establishes who is calling and which tenant they are acting in, for every
 * request.
 *
 * Registered globally, so authentication is the default and opting out is an
 * explicit, greppable @Public() on the route. The organization is resolved
 * from the session server-side — never from a header, param or body — which is
 * the single property that makes tenant isolation hold.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const session = await this.authService.resolveSession(toFetchHeaders(request));

    if (!session) {
      throw new UnauthorizedException({
        code: "UNAUTHENTICATED",
        message: "Sign in to continue.",
      });
    }

    const allowWithoutOrg = this.reflector.getAllAndOverride<boolean>(ALLOW_WITHOUT_ORG, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (session.emailVerified === false && !allowWithoutOrg) {
      throw new ForbiddenException({
        code: "EMAIL_VERIFICATION_REQUIRED",
        message: "Verify your email address before accessing company data.",
      });
    }

    const auth = await this.authService.resolveAuthContext(session);

    if (!auth) {
      if (allowWithoutOrg) {
        /**
         * The route is reachable without a tenant (accepting an invitation,
         * creating a first organization). The identity is attached so the
         * handler knows who is asking; there is deliberately no organizationId
         * to scope by, and such handlers must not query org-owned tables.
         */
        request.auth = undefined;
        request.sessionUserId = session.userId;
        request.sessionId = session.sessionId;
        request.emailVerified = session.emailVerified;
        return true;
      }
      throw new ForbiddenException({
        code: "NO_ORGANIZATION",
        message: "Your account is not an active member of any organization.",
      });
    }

    request.auth = auth;
    request.sessionUserId = session.userId;
    request.sessionId = session.sessionId;
    request.emailVerified = session.emailVerified;
    return true;
  }
}

/**
 * Express headers to the Fetch `Headers` that Better Auth expects. Multi-value
 * headers are appended rather than joined, so multiple Cookie headers survive.
 */
export function toFetchHeaders(request: { headers: Record<string, unknown> }): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, String(item));
    } else if (typeof value === "string") {
      headers.set(key, value);
    }
  }
  return headers;
}
