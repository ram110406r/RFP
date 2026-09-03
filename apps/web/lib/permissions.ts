import { isOrgRole, roleHasPermission, type OrgRole, type Permission } from "@rfp-os/types";

/** UI affordance check only; the API remains the authorization authority. */
export function can(role: string | null | undefined, permission: Permission): boolean {
  return Boolean(role && isOrgRole(role) && roleHasPermission(role as OrgRole, permission));
}
