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
export function createAuth(db: Database, env: Env) {
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
       * Verification is not wired up yet — there is no mail transport in the
       * platform until a later phase — so requiring it would lock every new
       * account out. The column is populated and enforced the moment one exists.
       */
      requireEmailVerification: false,
      minPasswordLength: 12,
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
