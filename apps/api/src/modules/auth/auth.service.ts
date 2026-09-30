import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { and, eq, isNull, or } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import {
  accounts,
  DEMO_LOGIN_EMAIL,
  DEMO_LOGIN_PASSWORD,
  organizationMemberRoles,
  organizationMembers,
  organizations,
  platformAdministrators,
  permissions,
  rolePermissions,
  roles,
  sessions,
  users,
  workspaceMemberRoles,
  workspaceMembers,
  workspaces,
  type Database,
} from "@rfp-os/db";
import {
  permissionsForRole,
  type AuthContext,
  type OrgRole,
  type Permission,
  WORKSPACE_SCOPED_PERMISSIONS,
} from "@rfp-os/types";

import { DATABASE } from "../../infrastructure/database";
import type { Env } from "../../config/env.schema";
import { createAuth, type Auth } from "./auth.config";

export interface ResolvedSession {
  userId: string;
  sessionId: string;
  activeOrganizationId: string | null;
  emailVerified?: boolean;
}

export interface MembershipSummary {
  organizationId: string;
  organizationName: string;
  role: OrgRole;
}

@Injectable()
export class AuthService {
  readonly auth: Auth;
  private readonly firebaseProjectId: string;
  private readonly firebaseCompatEnabled: boolean;
  private readonly developmentLoginEnabled: boolean;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    config: ConfigService<Env, true>,
  ) {
    this.firebaseProjectId = config.get("FIREBASE_PROJECT_ID", { infer: true }) ?? "tendyy";
    this.firebaseCompatEnabled = config.get("ENABLE_FIREBASE_AUTH_COMPAT", { infer: true });
    this.developmentLoginEnabled =
      config.get("APP_ENV", { infer: true }) === "local" && config.get("NODE_ENV", { infer: true }) !== "production";
    this.auth = createAuth(db, {
      NODE_ENV: config.get("NODE_ENV", { infer: true }),
      API_PORT: config.get("API_PORT", { infer: true }),
      CORS_ORIGIN: config.get("CORS_ORIGIN", { infer: true }),
      LOG_LEVEL: config.get("LOG_LEVEL", { infer: true }),
      RATE_LIMIT_TTL_MS: config.get("RATE_LIMIT_TTL_MS", { infer: true }),
      RATE_LIMIT_LIMIT: config.get("RATE_LIMIT_LIMIT", { infer: true }),
      BETTER_AUTH_SECRET: config.get("BETTER_AUTH_SECRET", { infer: true }),
      BETTER_AUTH_URL: config.get("BETTER_AUTH_URL", { infer: true }),
      BETTER_AUTH_GOOGLE_CLIENT_ID: config.get("BETTER_AUTH_GOOGLE_CLIENT_ID", { infer: true }),
      BETTER_AUTH_GOOGLE_CLIENT_SECRET: config.get("BETTER_AUTH_GOOGLE_CLIENT_SECRET", { infer: true }),
      ENABLE_FIREBASE_AUTH_COMPAT: config.get("ENABLE_FIREBASE_AUTH_COMPAT", { infer: true }),
      SESSION_MAX_AGE_SECONDS: config.get("SESSION_MAX_AGE_SECONDS", { infer: true }),
      INVITATION_TTL_HOURS: config.get("INVITATION_TTL_HOURS", { infer: true }),
    } as Env);
  }

  /** Reads the session cookie. Returns null when there is no valid session. */
  async resolveSession(headers: Headers): Promise<ResolvedSession | null> {
    const result = await this.auth.api.getSession({ headers });
    if (!result?.session || !result.user) {
      return this.firebaseCompatEnabled ? this.resolveFirebaseSession(headers) : null;
    }

    const session = result.session as typeof result.session & {
      activeOrganizationId?: string | null;
    };

    return {
      userId: result.user.id,
      sessionId: session.id,
      activeOrganizationId: session.activeOrganizationId ?? null,
      emailVerified: true,
    };
  }

  /** Verify Firebase identity tokens and reuse the existing DB membership model. */
  private async resolveFirebaseSession(headers: Headers): Promise<ResolvedSession | null> {
    const authorization = headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return null;

    try {
      // Load Firebase Admin lazily: Bun cannot initialize its CommonJS jose
      // dependency during application bootstrap, but can load it on demand.
      const [{ getApps, initializeApp }, { getAuth: getFirebaseAdminAuth }] = await Promise.all([
        import("firebase-admin/app"),
        import("firebase-admin/auth"),
      ]);
      const app = getApps()[0] ?? initializeApp({ projectId: this.firebaseProjectId });
      const decoded = await getFirebaseAdminAuth(app).verifyIdToken(authorization.slice("Bearer ".length));
      const email = decoded.email?.toLowerCase();
      if (!email) return null;

      let [user] = await this.db
        .select({ id: users.id, emailVerified: users.emailVerified })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (!user) {
        user = await this.provisionFirebaseUser({
          email,
          name: decoded.name?.trim() || email.split("@")[0] || "Firebase user",
          emailVerified: decoded.email_verified === true,
          uid: decoded.uid,
        });
      }
      if (user.emailVerified !== (decoded.email_verified === true)) {
        await this.db
          .update(users)
          .set({ emailVerified: decoded.email_verified === true, updatedAt: new Date() })
          .where(eq(users.id, user.id));
      }

      return {
        userId: user.id,
        sessionId: `firebase:${decoded.uid}`,
        activeOrganizationId: null,
        emailVerified: decoded.email_verified === true,
      };
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[firebase-auth] ID token verification failed: ${
            error instanceof Error ? error.message : "unknown verification error"
          }`,
        );
      }
      return null;
    }
  }

  /** Creates only the application identity; onboarding creates its tenant later. */
  private async provisionFirebaseUser(input: {
    email: string;
    name: string;
    emailVerified: boolean;
    uid: string;
  }) {
    const [user] = await this.db.transaction(async (tx) => {
      const [createdUser] = await tx
        .insert(users)
        .values({
          name: input.name,
          email: input.email,
          memberRole: "Admin",
          status: "active",
          emailVerified: input.emailVerified,
          lastActiveAt: new Date(),
        })
        .returning({ id: users.id });
      if (!createdUser) throw new Error("Failed to provision Firebase user.");
      return [createdUser];
    });
    if (!user) throw new Error("Firebase user provisioning returned no user.");
    return { ...user, emailVerified: input.emailVerified };
  }

  /**
   * Turns an authenticated identity into a tenant-scoped authorization context.
   *
   * The organization is resolved server-side in a fixed order — the session's
   * active organization, else the user's default, else their only membership —
   * and in every case the membership row is re-read and re-checked. A request
   * cannot name its own tenant, which is what makes cross-organization access
   * impossible rather than merely discouraged.
   *
   * Returns null when the user has no usable membership; the caller decides
   * whether that is a 401 or a 403.
   */
  async resolveAuthContext(session: ResolvedSession): Promise<AuthContext | null> {
    const membership = await this.findActiveMembership(session);
    if (!membership) return null;

    const role = membership.role as OrgRole;
    const basePermissions = permissionsForRole(role);
    const organizationPermissions = uniquePermissions([
      ...organizationScopedPermissions(role, basePermissions),
      ...(await this.loadOrganizationRolePermissions(membership.id, membership.organizationId)),
    ]);
    const workspaceAccess = await this.loadWorkspaceAccess(
      membership.id,
      membership.organizationId,
      workspaceScopedPermissions(role, basePermissions),
    );
    const [platformAdministrator] = await this.db
      .select({ userId: platformAdministrators.userId })
      .from(platformAdministrators)
      .where(eq(platformAdministrators.userId, session.userId))
      .limit(1);

    return {
      userId: session.userId,
      organizationId: membership.organizationId,
      organizationMemberId: membership.id,
      role,
      organizationPermissions,
      permissions: uniquePermissions([
        ...organizationPermissions,
        ...Object.values(workspaceAccess.workspacePermissions).flat(),
      ]),
      sessionId: session.sessionId,
      workspaceIds: Object.keys(workspaceAccess.workspaceMemberIds),
      workspacePermissions: workspaceAccess.workspacePermissions,
      workspaceMemberIds: workspaceAccess.workspaceMemberIds,
      isPlatformAdmin: Boolean(platformAdministrator),
    };
  }

  private async findActiveMembership(session: ResolvedSession) {
    if (session.activeOrganizationId) {
      const [pinned] = await this.db
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.userId, session.userId),
            eq(organizationMembers.organizationId, session.activeOrganizationId),
            eq(organizationMembers.status, "active"),
          ),
        )
        .limit(1);
      /**
       * A session pinned to an organization the user has since been removed
       * from resolves to nothing rather than quietly falling back to another
       * tenant — silently switching the tenant under an in-flight session is
       * how data ends up written to the wrong organization.
       */
      return pinned ?? null;
    }

    const [user] = await this.db
      .select({ organizationId: users.organizationId })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    if (user?.organizationId) {
      const [preferred] = await this.db
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.userId, session.userId),
            eq(organizationMembers.organizationId, user.organizationId),
            eq(organizationMembers.status, "active"),
          ),
        )
        .limit(1);
      if (preferred) return preferred;
    }

    const [fallback] = await this.db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.userId, session.userId),
          eq(organizationMembers.status, "active"),
        ),
      )
      .limit(1);

    return fallback ?? null;
  }

  /** Every organization the user can act in, for an org switcher. */
  async listMemberships(userId: string): Promise<MembershipSummary[]> {
    const rows = await this.db
      .select({
        organizationId: organizationMembers.organizationId,
        organizationName: organizations.name,
        role: organizationMembers.role,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.status, "active")));

    return rows.map((row) => ({ ...row, role: row.role as OrgRole }));
  }

  async markEmailVerifiedForPasswordSignup(email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;
    await this.db
      .update(users)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(eq(users.email, normalizedEmail));
  }

  /**
   * Repoints a session at another organization the caller belongs to.
   * Membership is verified here, not by the caller, so this is safe to expose
   * directly to an authenticated request.
   */
  async activateOrganization(
    session: ResolvedSession,
    organizationId: string,
  ): Promise<MembershipSummary> {
    const [membership] = await this.db
      .select({
        organizationId: organizationMembers.organizationId,
        organizationName: organizations.name,
        role: organizationMembers.role,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(
        and(
          eq(organizationMembers.userId, session.userId),
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.status, "active"),
        ),
      )
      .limit(1);

    if (!membership) {
      /*
       * 403, not 401: the caller is authenticated, they simply have no
       * standing in that tenant. Answering 401 would invite a client to retry
       * the sign-in it already completed.
       */
      throw new ForbiddenException({
        code: "NOT_A_MEMBER",
        message: "You are not a member of that organization.",
      });
    }

    await this.db
      .update(sessions)
      .set({ activeOrganizationId: organizationId, updatedAt: new Date() })
      .where(eq(sessions.id, session.sessionId));

    return { ...membership, role: membership.role as OrgRole };
  }

  /** Dev-login only exists on a local stack (APP_ENV=local, non-production NODE_ENV). */
  isDevelopmentLoginEnabled(): boolean {
    return this.developmentLoginEnabled;
  }

  /**
   * Keeps localhost usable by ensuring the seeded demo user has a credential
   * account with the known demo password. This is dev-only bootstrap, not a
   * public auth flow: it only ever touches the demo user, so it cannot be used
   * to reset anyone else's password.
   */
  async ensureDevelopmentCredential(): Promise<void> {
    if (!this.developmentLoginEnabled) {
      throw new ForbiddenException("Development login is only available on a local stack.");
    }

    const [user] = await this.db.select().from(users).where(eq(users.email, DEMO_LOGIN_EMAIL)).limit(1);
    if (!user) {
      throw new ForbiddenException({
        code: "DEMO_USER_MISSING",
        message: `No seeded user exists for ${DEMO_LOGIN_EMAIL}. Run the seed first.`,
      });
    }

    const passwordHash = await hashPassword(DEMO_LOGIN_PASSWORD);
    const [existingAccount] = await this.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, user.id),
          eq(accounts.providerId, "credential"),
          eq(accounts.issuer, "local:credential"),
        ),
      )
      .limit(1);

    if (existingAccount) {
      await this.db
        .update(accounts)
        .set({ password: passwordHash, updatedAt: new Date() })
        .where(eq(accounts.id, existingAccount.id));
      return;
    }

    await this.db.insert(accounts).values({
      id: randomUUID(),
      accountId: user.id,
      providerId: "credential",
      issuer: "local:credential",
      userId: user.id,
      password: passwordHash,
    });
  }

  private async loadOrganizationRolePermissions(
    organizationMemberId: string,
    organizationId: string,
  ): Promise<readonly Permission[]> {
    const rows = await this.db
      .select({ key: permissions.key })
      .from(organizationMemberRoles)
      .innerJoin(roles, eq(roles.id, organizationMemberRoles.roleId))
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(
        and(
          eq(organizationMemberRoles.organizationMemberId, organizationMemberId),
          or(eq(roles.organizationId, organizationId), isNull(roles.organizationId)),
        ),
      );

    return rows.map((row) => row.key as Permission);
  }

  private async loadWorkspaceAccess(
    organizationMemberId: string,
    organizationId: string,
    inheritedPermissions: readonly Permission[],
  ) {
    const memberships = await this.db
      .select({
        workspaceId: workspaceMembers.workspaceId,
        workspaceMemberId: workspaceMembers.id,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(
        and(
          eq(workspaceMembers.organizationMemberId, organizationMemberId),
          eq(workspaceMembers.status, "active"),
          eq(workspaces.organizationId, organizationId),
          eq(workspaces.status, "active"),
        ),
      );

    const workspaceMemberIds: Record<string, string> = Object.fromEntries(
      memberships.map((membership) => [membership.workspaceId, membership.workspaceMemberId]),
    );
    const workspacePermissions: Record<string, readonly Permission[]> = Object.fromEntries(
      memberships.map((membership) => [
        membership.workspaceId,
        uniquePermissions(inheritedPermissions),
      ]),
    );

    if (memberships.length === 0) {
      return { workspaceMemberIds, workspacePermissions };
    }

    const rows = await this.db
      .select({
        workspaceId: workspaceMembers.workspaceId,
        key: permissions.key,
      })
      .from(workspaceMembers)
      .innerJoin(workspaceMemberRoles, eq(workspaceMemberRoles.workspaceMemberId, workspaceMembers.id))
      .innerJoin(roles, eq(roles.id, workspaceMemberRoles.roleId))
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(
        and(
          eq(workspaceMembers.organizationMemberId, organizationMemberId),
          eq(workspaceMembers.status, "active"),
          eq(workspaces.organizationId, organizationId),
          eq(workspaces.status, "active"),
          or(eq(roles.organizationId, organizationId), isNull(roles.organizationId)),
        ),
      );

    for (const row of rows) {
      workspacePermissions[row.workspaceId] = uniquePermissions([
        ...(workspacePermissions[row.workspaceId] ?? []),
        row.key as Permission,
      ]);
    }

    return { workspaceMemberIds, workspacePermissions };
  }
}

function uniquePermissions<T extends string>(permissions: readonly T[]): readonly T[] {
  return [...new Set(permissions)];
}

function organizationScopedPermissions(
  role: OrgRole,
  permissions: readonly Permission[],
): readonly Permission[] {
  if (role === "OWNER" || role === "ADMIN") {
    return permissions;
  }

  return permissions.filter((permission) => !WORKSPACE_SCOPED_PERMISSIONS.includes(permission));
}

function workspaceScopedPermissions(
  role: OrgRole,
  permissions: readonly Permission[],
): readonly Permission[] {
  if (role === "OWNER" || role === "ADMIN") {
    return [];
  }

  return permissions.filter((permission) => WORKSPACE_SCOPED_PERMISSIONS.includes(permission));
}
