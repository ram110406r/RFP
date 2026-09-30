import { isOrgRole, roleHasPermission, type OrgRole, type Permission } from "@rfp-os/types";

import type { AuthMe } from "./models";
import { useAuthMe } from "./queries";

/**
 * Role-only check against the static matrix.
 *
 * Prefer useAccess(): for non-admins most permissions are granted per
 * workspace, which a role alone cannot express. The API remains the
 * authorization authority either way; this only decides what to show.
 */
export function can(role: string | null | undefined, permission: Permission): boolean {
  return Boolean(role && isOrgRole(role) && roleHasPermission(role as OrgRole, permission));
}

export interface Access {
  loading: boolean;
  role: OrgRole | null;
  /** Held organization-wide (what the API checks for org-level actions). */
  can: (permission: Permission) => boolean;
  /** Held organization-wide, or in this specific workspace. */
  canInWorkspace: (permission: Permission, workspaceId: string | null | undefined) => boolean;
  /** Held in at least one workspace — enough to show an entry point. */
  canAnywhere: (permission: Permission) => boolean;
}

export function accessFrom(me: AuthMe | undefined | null): Omit<Access, "loading"> {
  const organizationPermissions = new Set(me?.organizationPermissions ?? []);
  const anywhere = new Set(me?.permissions ?? []);
  const perWorkspace = me?.workspacePermissions ?? {};
  const role = me?.role && isOrgRole(me.role) ? me.role : null;
  return {
    role,
    can: (permission) => organizationPermissions.has(permission),
    canInWorkspace: (permission, workspaceId) =>
      organizationPermissions.has(permission) ||
      Boolean(workspaceId && perWorkspace[workspaceId]?.includes(permission)),
    canAnywhere: (permission) => anywhere.has(permission),
  };
}

/** Effective permissions from GET /auth/me, the same split the API enforces. */
export function useAccess(): Access {
  const me = useAuthMe();
  return { loading: me.isLoading, ...accessFrom(me.data) };
}

/** Roles the caller may assign: only OWNER grants OWNER; only OWNER/ADMIN grant ADMIN. */
export function assignableRoles(callerRole: OrgRole | null): OrgRole[] {
  const all: OrgRole[] = ["OWNER", "ADMIN", "RFP_MANAGER", "CONTRIBUTOR", "REVIEWER", "SME", "VIEWER"];
  if (callerRole === "OWNER") return all;
  if (callerRole === "ADMIN") return all.filter((role) => role !== "OWNER");
  return all.filter((role) => role !== "OWNER" && role !== "ADMIN");
}
