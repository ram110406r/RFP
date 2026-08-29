import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { organizationMembers, users } from "../db/schema";
import { unauthorized } from "./errors";

export interface AuthContext {
  userId: string;
  organizationId: string;
}

/**
 * DEV-ONLY auth boundary. The bearer token is just the user's id, issued by
 * POST /api/auth/dev-login. There is no password hashing or JWT signing -
 * this is intentionally NOT a production authentication system (see
 * server/README.md and the migration report for why, and how to swap in a
 * real provider like better-auth later).
 *
 * What IS real and enforced: organizationId is always derived here,
 * server-side, from the authenticated user's row in the database - every
 * route handler receives it from this function and never from a
 * client-supplied field, so org scoping cannot be spoofed by the client.
 */
export async function requireAuth(
  headers: Record<string, string | undefined>,
): Promise<AuthContext> {
  /**
   * X-Auth-Token takes precedence over Authorization because the deployed
   * demo sits behind an HTTP basic-auth gate, which owns the Authorization
   * header. A browser can only send one Authorization header, so if the app
   * used `Bearer` there it would overwrite the gate credential and every
   * request would be rejected by the proxy before reaching this code.
   * Authorization stays supported for direct API use and the test suite.
   */
  const authHeader = headers.authorization;
  const token =
    headers["x-auth-token"] ||
    (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined);
  if (!token) throw unauthorized("Missing X-Auth-Token header.");

  const rows = await db
    .select({ id: users.id, organizationId: users.organizationId })
    .from(users)
    .where(eq(users.id, token))
    .limit(1);
  const user = rows[0];
  if (!user) throw unauthorized("Invalid session token.");

  /**
   * Tier 0 membership is the authoritative tenant boundary. Legacy routes can
   * keep working for users that only have the prototype's default-tenant
   * column, but once organization_members exists we use that as the source of
   * truth and refuse to guess across tenants.
   */
  const memberships = await db
    .select({
      organizationId: organizationMembers.organizationId,
    })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, user.id));

  const activeMembership = user.organizationId
    ? memberships.find((membership) => membership.organizationId === user.organizationId)
    : undefined;

  if (activeMembership) {
    return { userId: user.id, organizationId: activeMembership.organizationId };
  }

  if (memberships.length === 1) {
    return { userId: user.id, organizationId: memberships[0]!.organizationId };
  }

  if (memberships.length === 0 && user.organizationId) {
    return { userId: user.id, organizationId: user.organizationId };
  }

  throw unauthorized("This account is not a member of any organization.");
}
