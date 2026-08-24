import { permissions, type Database } from "@rfp-os/db";
import { PERMISSIONS, type Permission } from "@rfp-os/types";

function toLabel(permission: Permission): string {
  return permission
    .split(":")
    .map((part) => part.replace(/_/g, " "))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toResource(permission: Permission): string {
  return permission.split(":")[0] ?? "";
}

function toAction(permission: Permission): string {
  return permission.split(":")[1] ?? "";
}

export async function ensurePermissionCatalog(db: Database): Promise<void> {
  await db
    .insert(permissions)
    .values(
      PERMISSIONS.map((key) => ({
        key,
        label: toLabel(key),
        description: `${toLabel(key)} permission`,
        resource: toResource(key),
        action: toAction(key),
      })),
    )
    .onConflictDoNothing();
}
