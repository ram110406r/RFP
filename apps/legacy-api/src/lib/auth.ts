import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";
import { unauthorized } from "./errors";

export interface AuthContext {
  userId: string;
  organizationId: string;
}

/**
 * DEV-ONLY auth boundary. The bearer token is just the user's id, issued by
 * POST /api/auth/dev-login. There is no password hashing or JWT signing —
 * this is intentionally NOT a production authentication system (see
 * server/README.md and the migration report for why, and how to swap in a
 * real provider like better-auth later).
 *
 * What IS real and enforced: organizationId is always derived here,
 * server-side, from the authenticated user's row in the database — every
 * route handler receives it from this function and never from a
 * client-supplied field, so org scoping cannot be spoofed by the client.
 */
export async function requireAuth(
  headers: Record<string, string | undefined>,
): Promise<AuthContext> {
  const authHeader = headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  if (!token) throw unauthorized("Missing Authorization header.");

  const rows = await db
    .select({ id: users.id, organizationId: users.organizationId })
    .from(users)
    .where(eq(users.id, token))
    .limit(1);
  const user = rows[0];
  if (!user) throw unauthorized("Invalid session token.");

  return { userId: user.id, organizationId: user.organizationId };
}
