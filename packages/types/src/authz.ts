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
] as const;

export type Permission = (typeof PERMISSIONS)[number];

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
    "org:read",
    "org:update",
    "member:read",
    "member:invite",
    "member:update",
    "member:remove",
  ],
  ADMIN: [
    ...ALL_RFP,
    "org:read",
    "org:update",
    "member:read",
    "member:invite",
    "member:update",
    "member:remove",
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
    "org:read",
    "member:read",
  ],
  /** Drafts and edits answers. Cannot approve their own work or submit. */
  CONTRIBUTOR: ["rfp:read", "rfp:update", "rfp:export", "org:read", "member:read"],
  /** Judges answers. Can review and approve, but not author or submit. */
  REVIEWER: ["rfp:read", "rfp:review", "rfp:approve", "org:read", "member:read"],
  /** Domain specialist: reviews and may correct answers in their area. */
  SME: ["rfp:read", "rfp:update", "rfp:review", "org:read", "member:read"],
  VIEWER: ["rfp:read", "org:read"],
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
  role: OrgRole;
  permissions: readonly Permission[];
  sessionId: string;
}
