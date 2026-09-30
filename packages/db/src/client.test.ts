import { describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";

import { getDb, orgScope, resolveDatabaseUrl, withTransaction } from "./client";
import { organizations, rfps } from "./schema";

describe("resolveDatabaseUrl", () => {
  test("uses DATABASE_URL when postgres parts are absent", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: "postgres://direct" })).toBe("postgres://direct");
  });

  test("builds a safe URL from postgres parts", () => {
    expect(
      resolveDatabaseUrl({
        POSTGRES_USER: "demo user",
        POSTGRES_PASSWORD: "p@ss:word/with#chars",
        POSTGRES_DB: "rfp db",
      }),
    ).toBe("postgres://demo%20user:p%40ss%3Aword%2Fwith%23chars@postgres:5432/rfp%20db");
  });

  test("prefers explicit postgres parts over DATABASE_URL", () => {
    expect(
      resolveDatabaseUrl({
        DATABASE_URL: "postgres://wrong:wrong@localhost:55432/wrong",
        POSTGRES_USER: "rfpos",
        POSTGRES_PASSWORD: "secret",
        POSTGRES_DB: "rfpos",
        POSTGRES_HOST: "postgres",
        POSTGRES_PORT: "5432",
      }),
    ).toBe("postgres://rfpos:secret@postgres:5432/rfpos");
  });
});

describe("orgScope", () => {
  test("builds an equality predicate on the table's organizationId", () => {
    const scoped = orgScope(rfps, "11111111-1111-1111-1111-111111111111");
    const direct = eq(rfps.organizationId, "11111111-1111-1111-1111-111111111111");
    expect(scoped).toEqual(direct);
  });
});

/**
 * Needs a live database. The DB suite is enabled by package scripts that set
 * NODE_ENV=test and preserve DATABASE_URL; accidental root discovery skips it.
 */
const dbTest = process.env.NODE_ENV === "test" && process.env.DATABASE_URL ? test : test.skip;

describe("withTransaction", () => {
  const marker = "tx-rollback-probe.invalid";

  dbTest("rolls back every write when the callback throws", async () => {
    const boom = new Error("intentional");

    await expect(
      withTransaction(async (tx) => {
        await tx.insert(organizations).values({ name: "Rollback Probe", domain: marker });
        throw boom;
      }),
    ).rejects.toThrow("intentional");

    const rows = await getDb().select().from(organizations).where(eq(organizations.domain, marker));
    expect(rows).toHaveLength(0);
  });

  dbTest("commits when the callback returns", async () => {
    const id = await withTransaction(async (tx) => {
      const [row] = await tx
        .insert(organizations)
        .values({ name: "Commit Probe", domain: marker })
        .returning({ id: organizations.id });
      return row!.id;
    });

    const rows = await getDb().select().from(organizations).where(eq(organizations.id, id));
    expect(rows).toHaveLength(1);

    // This test owns the row it created; leave the dev database as it found it.
    await getDb().delete(organizations).where(eq(organizations.id, id));
  });

  dbTest("connects and runs a trivial query", async () => {
    const result = await getDb().execute(sql`select 1 as ok`);
    expect(result).toBeDefined();
  });
});
