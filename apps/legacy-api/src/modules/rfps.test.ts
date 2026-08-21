import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { customers, organizations, rfps, users } from "../db/schema";
import { app } from "../app";

/**
 * Exercises the real HTTP layer end-to-end against the dev database (see
 * server/.env) — no mocking. Each test creates its own org/user/customer so
 * it can assert real persistence and cross-organization isolation, then
 * cleans up after itself.
 */

async function seedOrgWithUser(name: string) {
  const [org] = await db
    .insert(organizations)
    .values({ name, domain: `${name}.test` })
    .returning();
  if (!org) throw new Error("failed to seed org");
  const [user] = await db
    .insert(users)
    .values({ organizationId: org.id, name: "Test User", email: `test@${name}.test` })
    .returning();
  if (!user) throw new Error("failed to seed user");
  const [customer] = await db
    .insert(customers)
    .values({ organizationId: org.id, name: "Test Customer" })
    .returning();
  if (!customer) throw new Error("failed to seed customer");
  return { org, user, customer };
}

function req(path: string, init: RequestInit & { token?: string } = {}) {
  const { token, ...rest } = init;
  return app.handle(
    new Request(`http://localhost${path}`, {
      ...rest,
      headers: {
        ...(rest.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...rest.headers,
      },
    }),
  );
}

describe("RFPs API", () => {
  let orgA: Awaited<ReturnType<typeof seedOrgWithUser>>;
  let orgB: Awaited<ReturnType<typeof seedOrgWithUser>>;

  beforeAll(async () => {
    orgA = await seedOrgWithUser(`org-a-${Date.now()}`);
    orgB = await seedOrgWithUser(`org-b-${Date.now()}`);
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgA.org.id));
    await db.delete(organizations).where(eq(organizations.id, orgB.org.id));
  });

  it("rejects requests with no auth token", async () => {
    const res = await req("/api/rfps");
    expect(res.status).toBe(401);
  });

  it("rejects an unrecognized token", async () => {
    const res = await req("/api/rfps", { token: "00000000-0000-0000-0000-000000000000" });
    expect(res.status).toBe(401);
  });

  it("creates an RFP and persists it", async () => {
    const res = await req("/api/rfps", {
      method: "POST",
      token: orgA.user.id,
      body: JSON.stringify({
        title: "Test RFP",
        customer: orgA.customer.name,
        opportunity: "Test opportunity",
        estimatedValue: 50000,
        deadline: "2027-01-01",
        ownerId: orgA.user.id,
        documents: [],
        asDraft: true,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; title: string; status: string };
    expect(body.title).toBe("Test RFP");
    expect(body.status).toBe("draft");

    const [row] = await db.select().from(rfps).where(eq(rfps.id, body.id));
    expect(row?.title).toBe("Test RFP");

    const getRes = await req(`/api/rfps/${body.id}`, { token: orgA.user.id });
    expect(getRes.status).toBe(200);
  });

  it("enforces organization isolation — org B cannot read org A's RFP", async () => {
    const created = await req("/api/rfps", {
      method: "POST",
      token: orgA.user.id,
      body: JSON.stringify({
        title: "Org A Private RFP",
        customer: orgA.customer.name,
        opportunity: "",
        estimatedValue: 1000,
        deadline: "2027-01-01",
        ownerId: orgA.user.id,
        documents: [],
        asDraft: true,
      }),
    });
    const { id } = (await created.json()) as { id: string };

    const crossOrgRes = await req(`/api/rfps/${id}`, { token: orgB.user.id });
    expect(crossOrgRes.status).toBe(404);

    const listRes = await req("/api/rfps", { token: orgB.user.id });
    const listBody = (await listRes.json()) as { items: { id: string }[] };
    expect(listBody.items.some((r) => r.id === id)).toBe(false);
  });

  it("returns 404 for a nonexistent RFP", async () => {
    const res = await req("/api/rfps/00000000-0000-0000-0000-000000000000", {
      token: orgA.user.id,
    });
    expect(res.status).toBe(404);
  });

  it("returns empty results for an org with no RFPs yet", async () => {
    const { org, user } = await seedOrgWithUser(`org-empty-${Date.now()}`);
    const res = await req("/api/rfps", { token: user.id });
    const body = (await res.json()) as { items: unknown[]; total: number };
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
    await db.delete(organizations).where(eq(organizations.id, org.id));
  });
});
