import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { users } from "./identity";

/**
 * Better Auth's own tables.
 *
 * Deliberately NOT a second user system: Better Auth is pointed at the
 * existing `users` table (see auth.config.ts in apps/api), and these three
 * tables carry only what it owns — credentials, sessions, and verification
 * tokens. `users` remains the single identity record for the platform.
 *
 * Ids are `text` rather than `uuid` because Better Auth generates its own
 * ids for these rows. `userId` stays `uuid` so it can carry a real foreign
 * key to users.id.
 */

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    /**
     * The organization the session is currently acting in. A user can belong
     * to several organizations, so "which tenant is this request for" is a
     * property of the session, not of the user — and because it is stored
     * server-side, a client cannot switch tenants by editing a header.
     */
    activeOrganizationId: uuid("active_organization_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sessions_token_uq").on(t.token),
    index("sessions_user_idx").on(t.userId),
    index("sessions_expires_idx").on(t.expiresAt),
  ],
);

/**
 * Credential and OAuth links. For email+password sign-in Better Auth stores
 * the hash in `password` with providerId = "credential"; social providers
 * later add rows here with tokens instead.
 */
export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    /**
     * Required by Better Auth 1.7's account-issuer model (verified against
     * `getAuthTables()` rather than the docs, which still describe the 1.6
     * shape). Nullable because the library populates it — the schema does not
     * get to assume when.
     */
    issuer: text("issuer"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("accounts_user_idx").on(t.userId),
    /**
     * Not unique: with `issuer` in play the natural key is Better Auth's
     * business, and inventing a constraint it does not ask for would reject
     * rows it considers legitimate.
     */
    index("accounts_provider_account_idx").on(t.providerId, t.accountId),
  ],
);

/** Short-lived tokens for email verification and password reset. */
export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("verifications_identifier_idx").on(t.identifier),
    index("verifications_expires_idx").on(t.expiresAt),
  ],
);
