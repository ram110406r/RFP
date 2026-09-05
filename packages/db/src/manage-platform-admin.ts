import { eq } from "drizzle-orm";

import { getDb } from "./client";
import { platformAdministrators, users } from "./schema";

const [action, rawEmail] = process.argv.slice(2);
const email = rawEmail?.trim().toLowerCase();

if ((action !== "grant" && action !== "revoke") || !email) {
  console.error("Usage: bun run db:platform-admin <grant|revoke> <user-email>");
  process.exit(1);
}

const db = getDb();
const [user] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.email, email)).limit(1);
if (!user) {
  console.error(`No application user exists for ${email}.`);
  process.exit(1);
}

if (action === "grant") {
  await db.insert(platformAdministrators).values({ userId: user.id }).onConflictDoNothing();
  console.log(`Platform administrator access granted to ${user.email}.`);
} else {
  await db.delete(platformAdministrators).where(eq(platformAdministrators.userId, user.id));
  console.log(`Platform administrator access revoked from ${user.email}.`);
}

process.exit(0);
