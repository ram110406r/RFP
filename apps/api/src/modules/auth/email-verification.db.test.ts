import { afterAll, describe, expect, test } from "bun:test";
import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { eq, inArray } from "drizzle-orm";
import {
  accounts,
  getDb,
  invitations,
  organizationMembers,
  organizations,
  sessions,
  users,
  workspaces,
} from "@rfp-os/db";

import { testEnv } from "../../config/test-env";
import { MailService } from "../../infrastructure/mail";
import { hashInvitationToken } from "../organizations/invitation-token";
import { OrganizationsService } from "../organizations/organizations.service";
import { AuthService } from "./auth.service";

const shouldRunDbTests = Boolean(process.env.DATABASE_URL && !process.env.TENDYY_ROOT_BUN_TEST);
const dbTest = shouldRunDbTests ? test : test.skip;
const describeDb = shouldRunDbTests ? describe : describe.skip;

const env = testEnv({ WEB_APP_URL: "http://localhost:3000" });
const config = { get: (key: keyof typeof env) => env[key] } as never;

async function rejection(promise: Promise<unknown>) {
  return promise.then(
    () => null,
    (error: unknown) => error as { body?: { code?: string }; response?: { code?: string } },
  );
}

/**
 * Invitations are bound to an email, so whoever controls an account for that
 * email can accept them. These tests pin the rule that makes that safe: the
 * password of an account is only ever chosen by the owner of its inbox.
 */
describeDb("Email-first account setup", () => {
  const db = shouldRunDbTests ? getDb() : (undefined as never);
  const mail = new MailService(config);
  const authService = new AuthService(db, config, mail);
  const recorder = { record: async () => undefined };
  const organizationsService = new OrganizationsService(db, config, recorder as never, recorder as never, mail);

  const suffix = randomUUID().slice(0, 8);
  const email = `setup-${suffix}@example.invalid`;
  const victim = `victim-${suffix}@example.invalid`;
  const password = "owner-chosen-password-1";
  const createdOrganizationIds: string[] = [];

  function tokenFromOutbox(to: string): string {
    const message = [...mail.outbox].reverse().find((item) => item.to === to);
    expect(message).toBeDefined();
    const url = message!.text.split("\n").find((line) => line.startsWith("http"))!;
    expect(url).toContain("/set-password#token=");
    return decodeURIComponent(url.split("#token=")[1]!);
  }

  dbTest("Better Auth's password sign-up endpoint is disabled", async () => {
    const error = await rejection(
      authService.auth.api.signUpEmail({ body: { email: `direct-${suffix}@example.invalid`, password, name: "x" } }),
    );
    expect(error).not.toBeNull();
    const [user] = await db.select().from(users).where(eq(users.email, `direct-${suffix}@example.invalid`));
    expect(user).toBeUndefined();
  });

  dbTest("sign-up emails a set-password link and creates nothing until it is used", async () => {
    await authService.passwordLinks.start(email);
    tokenFromOutbox(email);
    const [user] = await db.select().from(users).where(eq(users.email, email));
    expect(user).toBeUndefined();
  });

  dbTest("the link creates a verified account with the chosen password, once", async () => {
    const token = tokenFromOutbox(email);
    await authService.passwordLinks.complete(token, password, "Setup Person");

    const [user] = await db.select().from(users).where(eq(users.email, email));
    expect(user?.emailVerified).toBe(true);
    const signedIn = await authService.auth.api.signInEmail({ body: { email, password } });
    expect(signedIn.token).toBeTruthy();

    const reused = await rejection(authService.passwordLinks.complete(token, "another-password-123"));
    expect(reused?.response?.code).toBe("LINK_INVALID");
  });

  dbTest("a pre-registered account is taken back by the inbox owner (regression)", async () => {
    // An attacker created an account for the victim's address with their own
    // password (as was possible before this flow) and holds a session.
    const [squatted] = await db
      .insert(users)
      .values({ name: "squatter", email: victim, emailVerified: false })
      .returning({ id: users.id });
    await db.insert(accounts).values({
      id: randomUUID(),
      accountId: squatted!.id,
      providerId: "credential",
      issuer: "local:credential",
      userId: squatted!.id,
      password: await hashPassword("attacker-password-123"),
    });

    // Signing in as the unverified account is refused, and what reaches the
    // victim's inbox is a set-password link, not a "verify" link.
    const blocked = await rejection(
      authService.auth.api.signInEmail({ body: { email: victim, password: "attacker-password-123" } }),
    );
    expect(blocked?.body?.code).toBe("EMAIL_NOT_VERIFIED");
    const token = tokenFromOutbox(victim);

    // The victim uses the link from their inbox.
    await authService.passwordLinks.complete(token, "victim-chosen-password-1");

    const attackerRetry = await rejection(
      authService.auth.api.signInEmail({ body: { email: victim, password: "attacker-password-123" } }),
    );
    expect(attackerRetry).not.toBeNull();
    const victimSignIn = await authService.auth.api.signInEmail({ body: { email: victim, password: "victim-chosen-password-1" } });
    expect(victimSignIn.token).toBeTruthy();
  });

  dbTest("completing a reset signs out every existing session", async () => {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    await authService.auth.api.signInEmail({ body: { email, password } });
    const before = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, user!.id));
    expect(before.length).toBeGreaterThan(0);

    await authService.passwordLinks.start(email);
    const resetMail = [...mail.outbox].reverse().find((item) => item.to === email)!;
    expect(resetMail.subject).toContain("Reset");
    await authService.passwordLinks.complete(tokenFromOutbox(email), "brand-new-password-1");

    const after = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, user!.id));
    expect(after).toHaveLength(0);
  });

  dbTest("an unverified account cannot accept an invitation sent to its address", async () => {
    const unverified = `unverified-${suffix}@example.invalid`;
    const [user] = await db.insert(users).values({ name: "u", email: unverified, emailVerified: false }).returning({ id: users.id });
    const [organization] = await db
      .insert(organizations)
      .values({ name: `Verification ${suffix}`, domain: `verification-${suffix}.invalid` })
      .returning();
    createdOrganizationIds.push(organization!.id);
    const [workspace] = await db
      .insert(workspaces)
      .values({ organizationId: organization!.id, name: "Main", slug: `main-${suffix}` })
      .returning();
    const token = randomBytes(32).toString("base64url");
    await db.insert(invitations).values({
      organizationId: organization!.id,
      workspaceId: workspace!.id,
      email: unverified,
      role: "ADMIN",
      tokenHash: hashInvitationToken(token),
      expiresAt: new Date(Date.now() + 3_600_000),
    });

    const acceptance = await rejection(organizationsService.acceptInvitation(user!.id, token));
    expect(acceptance?.response?.code).toBe("EMAIL_VERIFICATION_REQUIRED");
    const memberships = await db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, organization!.id));
    expect(memberships).toHaveLength(0);
  });

  afterAll(async () => {
    if (!shouldRunDbTests) return;
    if (createdOrganizationIds.length > 0) {
      await db.delete(organizations).where(inArray(organizations.id, createdOrganizationIds));
    }
    await db.delete(users).where(
      inArray(users.email, [email, victim, `unverified-${suffix}@example.invalid`, `direct-${suffix}@example.invalid`]),
    );
  });
});
