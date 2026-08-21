import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";
import { requireAuth } from "../lib/auth";
import { unauthorized } from "../lib/errors";

function toPublicUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    organizationId: user.organizationId,
    name: user.name,
    email: user.email,
    role: user.memberRole,
    team: user.team,
    jobTitle: user.jobTitle,
    status: user.status,
  };
}

/**
 * DEV-ONLY auth endpoints — see src/lib/auth.ts for the full rationale.
 * dev-login exchanges a seeded user's email for a bearer token (their user
 * id); there is no password. The frontend calls this once on boot with a
 * fixed seeded email to preserve the existing "no login screen" UX while
 * still going through a real, server-enforced identity boundary.
 */
export const authModule = new Elysia({ prefix: "/api/auth" })
  .post(
    "/dev-login",
    async ({ body }) => {
      const rows = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
      const user = rows[0];
      if (!user) throw unauthorized(`No user found for ${body.email}.`);
      return { token: user.id, user: toPublicUser(user) };
    },
    { body: t.Object({ email: t.String() }) },
  )
  .get("/session", async ({ headers }) => {
    const auth = await requireAuth(headers);
    const rows = await db.select().from(users).where(eq(users.id, auth.userId)).limit(1);
    const user = rows[0];
    if (!user) throw unauthorized();
    return { user: toPublicUser(user) };
  });
