import { useSuspenseQuery } from "@tanstack/react-query";
import { rolesQueryOptions } from "@/lib/api/settings";

export function RolesTab() {
  const { data: roles } = useSuspenseQuery(rolesQueryOptions());
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {roles.map((role) => (
        <div key={role.id} className="surface-panel space-y-2 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">{role.name}</p>
            <span className="num text-xs text-muted-foreground">{role.memberCount} members</span>
          </div>
          <p className="text-xs text-muted-foreground">{role.description}</p>
          {(role.organizationAssignmentCount ?? 0) > 0 || (role.workspaceAssignmentCount ?? 0) > 0 ? (
            <p className="text-xs text-muted-foreground">
              Org assignments: {role.organizationAssignmentCount ?? 0} | Workspace assignments:{" "}
              {role.workspaceAssignmentCount ?? 0}
            </p>
          ) : null}
          <ul className="space-y-1">
            {role.permissions.map((perm) => (
              <li key={perm} className="text-xs text-foreground/80">
                · {perm}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
