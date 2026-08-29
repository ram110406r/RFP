import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { auditLogs, getDb, organizations, users } from "@rfp-os/db";

import { AuditService } from "./audit.service";

const liveDatabaseUrl = process.env.DATABASE_URL ?? "";
const hasComposeDatabase =
  process.env.POSTGRES_HOST === "postgres" ||
  liveDatabaseUrl.includes("@postgres:5432/") ||
  liveDatabaseUrl.includes("@postgres/");

const dbTest = hasComposeDatabase ? test : test.skip;
const describeDb = hasComposeDatabase ? describe : describe.skip;

describeDb("Audit immutability", () => {
  const db = getDb();
  const audit = new AuditService(db);
  const orgId = randomUUID();
  const userId = randomUUID();
  let auditId = "";

  beforeAll(async () => {
    const suffix = randomUUID().slice(0, 8);
    await db.insert(organizations).values({
      id: orgId,
      name: `Audit Lock ${suffix}`,
      domain: `audit-lock-${suffix}.invalid`,
    });
    await db.insert(users).values({
      id: userId,
      organizationId: orgId,
      name: "Audit User",
      email: `audit-user-${suffix}@probe.invalid`,
    });
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  dbTest("allows insert and select", async () => {
    await audit.record({
      organizationId: orgId,
      actorId: userId,
      action: "AUDIT_IMMUTABILITY_INSERT",
      entityType: "test_entity",
      entityId: "entity-1",
      beforeState: { status: "before" },
      afterState: { status: "after" },
      metadata: { origin: "db-test" },
    });

    const rows = await db.select().from(auditLogs).where(eq(auditLogs.organizationId, orgId));
    expect(rows.length).toBeGreaterThan(0);
    auditId = rows[0]!.id;
    expect(rows[0]!.actorId).toBe(userId);
    expect(rows[0]!.beforeState).toMatchObject({ status: "before" });
    expect(rows[0]!.afterState).toMatchObject({ status: "after" });
  });

  dbTest("rejects UPDATE", async () => {
    await expect(
      db
        .update(auditLogs)
        .set({
          actorId: randomUUID(),
          beforeState: { status: "changed" },
          afterState: { status: "changed" },
        })
        .where(eq(auditLogs.id, auditId)),
    ).rejects.toThrow(/append-only/i);
  });

  dbTest("rejects DELETE", async () => {
    await expect(db.delete(auditLogs).where(eq(auditLogs.id, auditId))).rejects.toThrow(
      /append-only/i,
    );
  });
});
