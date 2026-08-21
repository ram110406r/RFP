/**
 * Injection token for the shared Drizzle instance.
 *
 * A token rather than a class because Database is a type, not a constructor —
 * and it gives every consumer one seam to substitute a test double at,
 * instead of reaching for getDb() directly at each call site.
 */
export const DATABASE = Symbol("DATABASE");
