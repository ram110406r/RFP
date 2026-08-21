import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { customers, knowledgeSources, organizations, rfps, users } from "../db/schema";
import { app } from "../app";

/**
 * Exercises requirements, answers, reviews, assignments, knowledge,
 * validation, and submissions against the real HTTP layer + real database.
 * Complements rfps.test.ts (RFP CRUD, org isolation, unauthorized access,
 * empty database) rather than repeating those cases.
 */

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

describe("Workflow API", () => {
  let orgId: string;
  let userId: string;
  let reviewerId: string;
  let rfpId: string;
  let requirementId: string;

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `workflow-test-${Date.now()}`, domain: "workflow-test.test" })
      .returning();
    if (!org) throw new Error("failed to seed org");
    orgId = org.id;

    const [owner] = await db
      .insert(users)
      .values({ organizationId: orgId, name: "Owner", email: "owner@workflow-test.test" })
      .returning();
    const [reviewer] = await db
      .insert(users)
      .values({ organizationId: orgId, name: "Reviewer", email: "reviewer@workflow-test.test" })
      .returning();
    if (!owner || !reviewer) throw new Error("failed to seed users");
    userId = owner.id;
    reviewerId = reviewer.id;

    const [customer] = await db
      .insert(customers)
      .values({ organizationId: orgId, name: "Workflow Test Customer" })
      .returning();
    if (!customer) throw new Error("failed to seed customer");

    const [source] = await db
      .insert(knowledgeSources)
      .values({
        organizationId: orgId,
        name: "Test Knowledge Source",
        type: "Policy",
        category: "Security",
        authority: "high",
        summary: "Seeded for workflow tests.",
      })
      .returning();
    if (!source) throw new Error("failed to seed knowledge source");

    const [rfp] = await db
      .insert(rfps)
      .values({
        organizationId: orgId,
        customerId: customer.id,
        title: "Workflow Test RFP",
        ownerId: userId,
        deadline: "2027-01-01",
        estimatedValue: "10000",
        status: "in_progress",
      })
      .returning();
    if (!rfp) throw new Error("failed to seed rfp");
    rfpId = rfp.id;

    const createReqRes = await req("/api/rfps", { token: userId }); // warms nothing, just sanity
    void createReqRes;
  });

  afterAll(async () => {
    // rfp_reviews.reviewer_id is ON DELETE RESTRICT (reviews shouldn't
    // silently lose who took the action) — deleting the RFP first cascades
    // through requirements → reviews/assignments/answers so the org's users
    // can then be cascade-deleted cleanly.
    await db.delete(rfps).where(eq(rfps.organizationId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it("creates a requirement's answer via direct insert, then retrieves it through the API", async () => {
    const [requirement] = await db
      .insert((await import("../db/schema")).rfpRequirements)
      .values({
        rfpId,
        code: "WF-001",
        title: "Test requirement",
        question: "Does this work?",
        category: "Security",
        mandatory: true,
        risk: "low",
      })
      .returning();
    if (!requirement) throw new Error("failed to seed requirement");
    requirementId = requirement.id;

    const listRes = await req(`/api/rfps/${rfpId}/requirements`, { token: userId });
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as { items: { id: string }[]; total: number };
    expect(listBody.total).toBe(1);
    expect(listBody.items[0]?.id).toBe(requirementId);
  });

  it("updates requirement status and risk, and logs it in the requirement's activity", async () => {
    const res = await req(`/api/requirements/${requirementId}`, {
      method: "PATCH",
      token: userId,
      body: JSON.stringify({
        status: "needs_review",
        risk: "high",
        riskRationale: "Escalated for review.",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; risk: string };
    expect(body.status).toBe("needs_review");
    expect(body.risk).toBe("high");

    const detailRes = await req(`/api/requirements/${requirementId}`, { token: userId });
    const detail = (await detailRes.json()) as { activity: { kind: string }[] };
    expect(detail.activity.some((a) => a.kind === "risk")).toBe(true);
  });

  it("edits an answer, then regenerates it, preserving history instead of destroying it", async () => {
    const editRes = await req(`/api/requirements/${requirementId}/answer`, {
      method: "PATCH",
      token: userId,
      body: JSON.stringify({ answer: "First human-edited answer." }),
    });
    expect(editRes.status).toBe(200);

    const regenRes = await req(`/api/requirements/${requirementId}/answer/regenerate`, {
      method: "POST",
      token: userId,
    });
    expect(regenRes.status).toBe(200);
    const regenerated = (await regenRes.json()) as { answer: string; answerSource: string };
    expect(regenerated.answerSource).toBe("ai_draft");

    const { rfpAnswers } = await import("../db/schema");
    const history = await db
      .select()
      .from(rfpAnswers)
      .where(eq(rfpAnswers.requirementId, requirementId));
    // Both the human edit and the regenerated draft must still exist as rows.
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history.filter((a) => a.isCurrent).length).toBe(1);
  });

  it("creates an assignment, then a review action, and reflects it in the review queue", async () => {
    const assignRes = await req("/api/assignments", {
      method: "POST",
      token: userId,
      body: JSON.stringify({ requirementId, userId: reviewerId }),
    });
    expect(assignRes.status).toBe(200);

    const reviewRes = await req("/api/reviews", {
      method: "POST",
      token: reviewerId,
      body: JSON.stringify({ requirementId, action: "APPROVED" }),
    });
    expect(reviewRes.status).toBe(200);

    const queueRes = await req("/api/reviews", { token: userId });
    const queue = (await queueRes.json()) as { items: { requirementId: string; status: string }[] };
    const entry = queue.items.find((i) => i.requirementId === requirementId);
    expect(entry?.status).toBe("approved");
  });

  it("retrieves knowledge sources for the organization", async () => {
    const res = await req("/api/knowledge", { token: userId });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { name: string }[] };
    expect(body.items.some((s) => s.name === "Test Knowledge Source")).toBe(true);
  });

  it("runs validation against real requirement data", async () => {
    const res = await req(`/api/rfps/${rfpId}/validate`, { method: "POST", token: userId });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { score: number; categories: unknown[]; issues: unknown[] };
    expect(typeof body.score).toBe("number");
    expect(Array.isArray(body.categories)).toBe(true);
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("generates a submission package and persists it", async () => {
    const res = await req(`/api/rfps/${rfpId}/submissions`, {
      method: "POST",
      token: userId,
      body: JSON.stringify({ note: "First draft package." }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; checklist: unknown[]; artifacts: unknown[] };
    expect(body.checklist.length).toBeGreaterThan(0);
    expect(body.artifacts.length).toBeGreaterThan(0);

    const listRes = await req(`/api/rfps/${rfpId}/submissions`, { token: userId });
    const list = (await listRes.json()) as { items: { id: string }[] };
    expect(list.items.some((s) => s.id === body.id)).toBe(true);
  });

  it("returns a structured error, not raw internals, for a malformed request", async () => {
    const res = await req(`/api/requirements/not-a-valid-uuid`, { token: userId });
    // Either a clean 404 (not found) or 500 with a structured body — never a raw stack trace.
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    expect(body.error).toBeDefined();
    expect(body.error?.message).not.toMatch(/at\s+\S+\s+\(.*:\d+:\d+\)/); // no stack-trace-shaped text
  });
});
