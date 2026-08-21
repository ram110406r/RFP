import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";
import { requireAuth } from "../lib/auth";

function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function toPerson(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    role: user.memberRole,
    team: user.team,
    initials: initialsOf(user.name),
  };
}

/** Org members, shaped as the frontend's `Person` type — used by pickers, avatars, command palette. */
export const peopleModule = new Elysia({ prefix: "/api/people" }).get("/", async ({ headers }) => {
  const auth = await requireAuth(headers);
  const rows = await db.select().from(users).where(eq(users.organizationId, auth.organizationId));
  return { people: rows.map(toPerson) };
});
