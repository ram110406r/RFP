import { createHash, randomBytes, randomUUID } from "node:crypto";

import { BadRequestException } from "@nestjs/common";
import { hashPassword } from "better-auth/crypto";
import { and, eq, like } from "drizzle-orm";
import { accounts, sessions, users, verifications, withTransaction, type Database } from "@rfp-os/db";

import type { MailService } from "../../infrastructure/mail";

const LINK_TTL_MS = 24 * 60 * 60 * 1000;
const IDENTIFIER_PREFIX = "password-link:";
export const MIN_PASSWORD_LENGTH = 12;

/**
 * Email-first account setup: the password is chosen *after* the inbox is
 * proven, never before.
 *
 * The obvious flow (sign up with email + password, then click a verification
 * link) has a hole when accounts are bound to an email invitation: anyone can
 * register the invitee's address with a password of their choosing, the real
 * invitee clicks the "verify your email" message that lands in their inbox,
 * and that click vouches for the stranger's password. Here there is no such
 * link: the only emailed link lets its holder set the password, so whoever
 * controls the inbox controls the account.
 *
 * The same link serves sign-up, password reset and finishing an account that
 * was created unverified before this flow existed. Completing it always
 * replaces the password and signs out every existing session.
 */
export class PasswordLinks {
  constructor(
    private readonly db: Database,
    private readonly mail: Pick<MailService, "sendPasswordLink">,
    private readonly webAppUrl: string,
  ) {}

  /**
   * Emails a single-use link. Deliberately gives the caller no signal about
   * whether an account exists; only the message wording differs.
   */
  async start(rawEmail: string): Promise<void> {
    const email = normalizeEmail(rawEmail);
    const token = randomBytes(32).toString("base64url");

    // One live link per address: a new request invalidates the previous one.
    await this.db
      .delete(verifications)
      .where(and(like(verifications.identifier, `${IDENTIFIER_PREFIX}%`), eq(verifications.value, email)));
    await this.db.insert(verifications).values({
      id: randomUUID(),
      identifier: identifierFor(token),
      value: email,
      expiresAt: new Date(Date.now() + LINK_TTL_MS),
    });

    const [existing] = await this.db
      .select({ emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    const url = `${this.webAppUrl.replace(/\/$/, "")}/set-password#token=${encodeURIComponent(token)}`;
    await this.mail.sendPasswordLink(email, url, existing?.emailVerified ? "reset" : "setup");
  }

  /**
   * Consumes a link and sets the password. Returns the email so the caller can
   * sign the person in with the password they just chose.
   */
  async complete(token: string, password: string, name?: string): Promise<{ email: string }> {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException({
        code: "PASSWORD_TOO_SHORT",
        message: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
      });
    }
    const passwordHash = await hashPassword(password);

    return withTransaction(async (tx) => {
      // Single use: the row is deleted in the same transaction that uses it.
      const [link] = await tx
        .delete(verifications)
        .where(eq(verifications.identifier, identifierFor(token)))
        .returning();
      if (!link || link.expiresAt.getTime() < Date.now()) {
        throw new BadRequestException({
          code: "LINK_INVALID",
          message: "This link has expired or was already used. Request a new one.",
        });
      }
      const email = link.value;

      const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      let userId: string;
      if (existing) {
        userId = existing.id;
        await tx.update(users).set({ emailVerified: true, updatedAt: new Date() }).where(eq(users.id, userId));
        // Whoever held the old password (or a session from it) is signed out.
        await tx.delete(sessions).where(eq(sessions.userId, userId));
      } else {
        const [created] = await tx
          .insert(users)
          .values({ name: name?.trim() || email.split("@")[0] || "TENDYY user", email, emailVerified: true })
          .returning({ id: users.id });
        userId = created!.id;
      }

      const [credential] = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
        .limit(1);
      if (credential) {
        await tx.update(accounts).set({ password: passwordHash, updatedAt: new Date() }).where(eq(accounts.id, credential.id));
      } else {
        await tx.insert(accounts).values({
          id: randomUUID(),
          accountId: userId,
          providerId: "credential",
          issuer: "local:credential",
          userId,
          password: passwordHash,
        });
      }

      return { email };
    });
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/** Only a hash of the token is stored, like invitation tokens. */
function identifierFor(token: string) {
  return `${IDENTIFIER_PREFIX}${createHash("sha256").update(token, "utf8").digest("hex")}`;
}
