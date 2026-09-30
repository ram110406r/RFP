import { randomUUID } from "node:crypto";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { accounts, sessions, users, verifications, type Database } from "@rfp-os/db";

import type { Env } from "../../config/env.schema";

export type Auth = ReturnType<typeof createAuth>;

/**
 * The Better Auth instance.
 *
 * Pointed at the platform's existing tables rather than tables of its own:
 * `users` stays the single identity record, and Better Auth owns only
 * credentials, sessions and verification tokens. This is what keeps the rule
 * "do not create a second user or authentication system" true in practice.
 *
 * Note what is NOT configured here: authorization. Better Auth answers "who is
 * this", and nothing else. Roles, permissions and tenant scoping are resolved
 * from `organization_members` by AuthGuard, so no authorization decision ever
 * depends on a value the auth library round-trips through a cookie.
 */
/**
 * `sendAccountLink` emails the set-password link (PasswordLinks.start). It is
 * what Better Auth calls whenever it would otherwise send a "verify your
 * email" message, e.g. when an unverified account tries to sign in.
 */
export function createAuth(db: Database, env: Env, sendAccountLink: (email: string) => Promise<void>) {
  return betterAuth({
    appName: "RFP OS",
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET ?? developmentSecret(),
    trustedOrigins: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()),

    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
      },
    }),

    emailAndPassword: {
      enabled: true,
      /**
       * Accounts are created only through the email-first flow in
       * PasswordLinks: the address is proven *before* a password exists. A
       * password chosen at sign-up by someone who does not own the inbox is
       * exactly how an invitee's account could be pre-registered and taken
       * over, so Better Auth's own sign-up endpoint is off.
       */
      disableSignUp: true,
      /** No session for an address that was never proven. */
      requireEmailVerification: true,
      minPasswordLength: 12,
      revokeSessionsOnPasswordReset: true,
    },

    emailVerification: {
      /**
       * An unverified account (created before the email-first flow) that tries
       * to sign in gets a set-password link rather than a "verify" link:
       * verifying would vouch for a password the inbox owner never chose.
       */
      sendOnSignIn: true,
      sendVerificationEmail: async ({ user }) => {
        await sendAccountLink(user.email);
      },
    },

    account: {
      accountLinking: {
        /**
         * Pinned rather than left to the library default: Google must never be
         * implicitly linked onto a local account whose email was not verified,
         * or a password set by whoever pre-registered that address would keep
         * working after the real owner signs in.
         */
        requireLocalEmailVerified: true,
      },
    },

    socialProviders: {
      ...(env.BETTER_AUTH_GOOGLE_CLIENT_ID && env.BETTER_AUTH_GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.BETTER_AUTH_GOOGLE_CLIENT_ID,
              clientSecret: env.BETTER_AUTH_GOOGLE_CLIENT_SECRET,
            },
          }
        : {}),
    },

    session: {
      expiresIn: env.SESSION_MAX_AGE_SECONDS,
      /**
       * The tenant a session is currently acting in. Stored on the session row
       * server-side, so switching organizations is an authenticated write we
       * authorize (see OrganizationsService.activate), never a header the
       * client can set.
       */
      additionalFields: {
        activeOrganizationId: { type: "string", required: false, input: false },
      },
    },

    advanced: {
      database: {
        /**
         * users.id is a uuid column, so Better Auth must mint uuids rather than
         * its own id format. The session/account/verification tables take text
         * ids and accept these happily.
         */
        generateId: () => randomUUID(),
      },
    },
  });
}

let cachedDevelopmentSecret: string | undefined;

/**
 * Keeps local development running without a configured secret, while making
 * the consequence explicit. Regenerated per process, so restarting the API
 * invalidates existing dev sessions — which is the correct signal that this is
 * not a real secret. Production never reaches here (see validateEnv).
 */
function developmentSecret(): string {
  if (!cachedDevelopmentSecret) {
    cachedDevelopmentSecret = randomUUID() + randomUUID();
    console.warn(
      "[auth] BETTER_AUTH_SECRET is not set — using an ephemeral development secret. " +
        "Sessions will not survive a restart. Set BETTER_AUTH_SECRET in .env.",
    );
  }
  return cachedDevelopmentSecret;
}
