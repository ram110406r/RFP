import { eq } from "drizzle-orm";

import { closeDb, getDb } from "./client";
import { seedDevelopmentData } from "./seed/index";
import { users } from "./schema";

const DEMO_LOGIN_EMAIL = process.env.VITE_DEV_LOGIN_EMAIL ?? "priya.nair@halcyonsystems.com";

function maskEmail(email: string): string {
  const [local = "", domain] = email.split("@");
  if (!domain || local.length < 3) return "***";
  return `${local.slice(0, 2)}***@${domain}`;
}

async function main() {
  const db = getDb();
  try {
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, DEMO_LOGIN_EMAIL))
      .limit(1);

    if (existingUser) {
      console.log(`[seed] demo user already present (${maskEmail(DEMO_LOGIN_EMAIL)}), skipping`);
      return;
    }

    console.log(`[seed] demo user missing (${maskEmail(DEMO_LOGIN_EMAIL)}), seeding dataset`);
    await seedDevelopmentData();
  } finally {
    await closeDb();
  }
}

main().catch((error) => {
  console.error("[seed] ensure-seed failed");
  console.error(error);
  process.exit(1);
});
