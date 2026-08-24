/**
 * The authorization vocabulary, shared by every app that has to make or
 * display a permission decision (apps/api enforces it, apps/mcp must apply the
 * same rules to agent traffic, apps/web uses it only to hide controls).
 *
 * Server-side enforcement is the contract. The frontend may read this to grey
 * out a button, but no decision here is trusted from the client — every guard
 * re-derives the caller's role from their membership row.
 */

export const ORG_ROLES = [
  "OWNER",
  "ADMIN",
  "RFP_MANAGER",
  "CONTRIBUTOR",
  "REVIEWER",
  "SME",
  "VIEWER",
] as const;

export type OrgRole = (typeof ORG_ROLES)[number];

/**
 * `rfp:*` comes from the implementation plan verbatim. The `org:*` and
 * `member:*` permissions are added here because Phase 4 ships organization and
 * membership endpoints, and those need something to authorize against —
 * without them, managing members would either be unguarded or hard-coded to a
 * role check, which is the thing this table exists to avoid.
 */
export const PERMISSIONS = [
  "rfp:create",
  "rfp:read",
  "rfp:update",
  "rfp:delete",
  "rfp:assign",
  "rfp:review",
  "rfp:approve",
  "rfp:submit",
  "rfp:export",
  "rfp:manage",
  "org:read",
  "org:update",
  "member:read",
  "member:invite",
  "member:update",
  "member:remove",
  "workspace:create",
  "workspace:read",
  "workspace:update",
  "workspace:archive",
  "workspace:member:read",
  "workspace:member:manage",
  "team:create",
  "team:read",
  "team:update",
  "team:archive",
  "team:member:manage",
  "role:read",
  "role:create",
  "role:update",
  "role:assign",
  "role:revoke",
  "policy:read",
  "policy:create",
  "policy:update",
  "policy:toggle",
  "assignment:create",
  "assignment:read",
  "assignment:update",
  "assignment:complete",
  "assignment:cancel",
  "activity:read",
  "audit:read",
  "document:read",
  "document:upload",
  "document:delete",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Permissions that act on workspace-owned resources and therefore should flow
 * through workspace membership for non-admin roles. OWNER / ADMIN still hold
 * them organization-wide; other roles receive them only in workspaces they
 * actually belong to.
 */
export const WORKSPACE_SCOPED_PERMISSIONS: readonly Permission[] = [
  "workspace:read",
  "workspace:update",
  "workspace:archive",
  "workspace:member:read",
  "workspace:member:manage",
  "team:create",
  "team:read",
  "team:update",
  "team:archive",
  "team:member:manage",
  "policy:read",
  "policy:create",
  "policy:update",
  "policy:toggle",
  "assignment:create",
  "assignment:read",
  "assignment:update",
  "assignment:complete",
  "assignment:cancel",
  "activity:read",
  "audit:read",
] as const;

const ALL_RFP: Permission[] = [
  "rfp:create",
  "rfp:read",
  "rfp:update",
  "rfp:delete",
  "rfp:assign",
  "rfp:review",
  "rfp:approve",
  "rfp:submit",
  "rfp:export",
  "rfp:manage",
];

/**
 * Document permissions are separate from `rfp:*` because uploading source
 * material and editing the RFP record are different acts: a CONTRIBUTOR who
 * may add documents should not thereby gain the ability to delete them, and a
 * REVIEWER needs to read the source of an answer without being able to change
 * what was uploaded. There is deliberately no `document:manage` — nothing
 * needs it, and an unused permission is one more thing to get wrong.
 */
const ALL_DOCUMENT: Permission[] = ["document:read", "document:upload", "document:delete"];

const ALL_WORKSPACE: Permission[] = [
  "workspace:create",
  "workspace:read",
  "workspace:update",
  "workspace:archive",
  "workspace:member:read",
  "workspace:member:manage",
];

const ALL_TEAM: Permission[] = [
  "team:create",
  "team:read",
  "team:update",
  "team:archive",
  "team:member:manage",
];

const ALL_ROLE: Permission[] = [
  "role:read",
  "role:create",
  "role:update",
  "role:assign",
  "role:revoke",
];

const ALL_POLICY: Permission[] = ["policy:read", "policy:create", "policy:update", "policy:toggle"];

const ALL_ASSIGNMENT: Permission[] = [
  "assignment:create",
  "assignment:read",
  "assignment:update",
  "assignment:complete",
  "assignment:cancel",
];

/**
 * The role matrix. Deliberately a static, code-owned table rather than rows in
 * the database: it is a security invariant, it must be reviewable in a diff,
 * and resolving it must not cost a query on every request. Per-organization
 * exceptions are expressed as ABAC policies (see `access_policies`), which
 * narrow these grants rather than widening them.
 *
 * Read it as a ladder — each role has the access its job needs and no more:
 *  - OWNER / ADMIN run the tenant.
 *  - RFP_MANAGER runs deals but cannot delete them or administer the org.
 *  - CONTRIBUTOR drafts answers; REVIEWER and SME judge them.
 *  - VIEWER reads.
 */
export const ROLE_PERMISSIONS: Record<OrgRole, readonly Permission[]> = {
  OWNER: [
    ...ALL_RFP,
    ...ALL_DOCUMENT,
    ...ALL_WORKSPACE,
    ...ALL_TEAM,
    ...ALL_ROLE,
    ...ALL_POLICY,
    ...ALL_ASSIGNMENT,
    "org:read",
    "org:update",
    "member:read",
    "member:invite",
    "member:update",
    "member:remove",
    "activity:read",
    "audit:read",
  ],
  ADMIN: [
    ...ALL_RFP,
    ...ALL_DOCUMENT,
    ...ALL_WORKSPACE,
    ...ALL_TEAM,
    ...ALL_ROLE,
    ...ALL_POLICY,
    ...ALL_ASSIGNMENT,
    "org:read",
    "org:update",
    "member:read",
    "member:invite",
    "member:update",
    "member:remove",
    "activity:read",
    "audit:read",
  ],
  /** Runs the RFP pipeline. No rfp:delete and no org administration. */
  RFP_MANAGER: [
    "rfp:create",
    "rfp:read",
    "rfp:update",
    "rfp:assign",
    "rfp:review",
    "rfp:approve",
    "rfp:submit",
    "rfp:export",
    "rfp:manage",
    ...ALL_DOCUMENT,
    "workspace:create",
    "workspace:read",
    "workspace:update",
    "workspace:member:read",
    "workspace:member:manage",
    ...ALL_TEAM,
    "assignment:create",
    "assignment:read",
    "assignment:update",
    "assignment:complete",
    "policy:read",
    "activity:read",
    "org:read",
    "member:read",
  ],
  /** Drafts and edits answers. Cannot approve their own work or submit. */
  CONTRIBUTOR: [
    "rfp:read",
    "rfp:update",
    "rfp:export",
    "document:read",
    "document:upload",
    "workspace:read",
    "workspace:member:read",
    "team:read",
    "assignment:read",
    "assignment:update",
    "activity:read",
    "org:read",
    "member:read",
  ],
  /** Judges answers. Can review and approve, but not author or submit. */
  REVIEWER: [
    "rfp:read",
    "rfp:review",
    "rfp:approve",
    "document:read",
    "workspace:read",
    "workspace:member:read",
    "team:read",
    "assignment:read",
    "assignment:complete",
    "activity:read",
    "org:read",
    "member:read",
  ],
  /** Domain specialist: reviews and may correct answers in their area. */
  SME: [
    "rfp:read",
    "rfp:update",
    "rfp:review",
    "document:read",
    "workspace:read",
    "team:read",
    "assignment:read",
    "activity:read",
    "org:read",
    "member:read",
  ],
  VIEWER: ["rfp:read", "document:read", "workspace:read", "team:read", "activity:read", "org:read"],
};

/** Roles that may act on membership, used to protect privilege escalation. */
export const ORG_ADMIN_ROLES: readonly OrgRole[] = ["OWNER", "ADMIN"];

export function permissionsForRole(role: OrgRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function roleHasPermission(role: OrgRole, permission: Permission): boolean {
  return permissionsForRole(role).includes(permission);
}

export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === "string" && (ORG_ROLES as readonly string[]).includes(value);
}

/** The authenticated caller, as every guard and controller sees it. */
export interface AuthContext {
  userId: string;
  organizationId: string;
  organizationMemberId?: string;
  role: OrgRole;
  organizationPermissions?: readonly Permission[];
  permissions: readonly Permission[];
  sessionId: string;
  workspaceIds?: readonly string[];
  workspacePermissions?: Readonly<Record<string, readonly Permission[]>>;
  workspaceMemberIds?: Readonly<Record<string, string>>;
}

export function hasPermission(auth: AuthContext, permission: Permission): boolean {
  return auth.permissions.includes(permission);
}

export function hasOrganizationPermission(auth: AuthContext, permission: Permission): boolean {
  const organizationPermissions = auth.organizationPermissions ?? auth.permissions;
  return organizationPermissions.includes(permission);
}

export function hasWorkspacePermission(
  auth: AuthContext,
  workspaceId: string | null | undefined,
  permission: Permission,
): boolean {
  if (hasOrganizationPermission(auth, permission)) return true;
  if (!workspaceId) return false;

  const workspacePermissions = auth.workspacePermissions?.[workspaceId] ?? [];
  return workspacePermissions.includes(permission);
}
