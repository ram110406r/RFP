import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Permission } from "@rfp-os/types";

import { REQUIRED_PERMISSIONS, type RequestWithAuth } from "./auth.decorators";

/**
 * Enforces @RequirePermissions against the role resolved by AuthGuard.
 *
 * Runs after AuthGuard (guards execute in registration order), so req.auth is
 * already populated and re-derived from the membership row on this request —
 * the permission set is never read from anything the client sent.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== "http") return true;

    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(
      REQUIRED_PERMISSIONS,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const auth = request.auth;

    if (!auth) {
      throw new ForbiddenException({
        code: "NO_ORGANIZATION",
        message: "Your account is not an active member of any organization.",
      });
    }

    const missing = required.filter((permission) => !auth.permissions.includes(permission));
    if (missing.length > 0) {
      /**
       * The message names the permission rather than the role, because the
       * caller can act on the former ("ask an admin for rfp:approve") and the
       * latter leaks the tenant's role structure.
       */
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: `You do not have permission to perform this action (${missing.join(", ")}).`,
      });
    }

    return true;
  }
}
