import { Elysia, t, type TSchema } from "elysia";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  activities,
  knowledgeSources,
  rfpAnswers,
  rfpEvidence,
  rfpRequirements,
  rfpRisks,
  rfps,
} from "../db/schema";
import { requireAuth } from "../lib/auth";
import { badRequest, notFound } from "../lib/errors";
import { logActivity, logAudit } from "../lib/activity";
import { paginate, paginationSchema, parseList } from "../lib/query";

const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
const REQUIREMENT_STATUSES = [
  "unanswered",
  "drafted",
  "needs_review",
  "changes_requested",
  "approved",
  "rejected",
] as const;
const CATEGORIES = [
  "Security",
  "Commercial",
  "Compliance",
  "Product",
  "Legal",
  "Architecture",
  "Support",
] as const;

async function assertRfpInOrg(rfpId: string, organizationId: string) {
  const rows = await db
    .select({ id: rfps.id })
    .from(rfps)
    .where(and(eq(rfps.id, rfpId), eq(rfps.organizationId, organizationId)))
    .limit(1);
  if (!rows[0]) throw notFound("RFP", rfpId);
}

/** Resolves a requirement and asserts it belongs to the caller's org (via its RFP). */
async function getRequirementInOrg(requirementId: string, organizationId: string) {
  const rows = await db
    .select({ requirement: rfpRequirements, orgId: rfps.organizationId })
    .from(rfpRequirements)
    .innerJoin(rfps, eq(rfps.id, rfpRequirements.rfpId))
    .where(eq(rfpRequirements.id, requirementId))
    .limit(1);
  const row = rows[0];
  if (!row || row.orgId !== organizationId) throw notFound("Requirement", requirementId);
  return row.requirement;
}

async function getCurrentAnswer(requirementId: string) {
  const rows = await db
    .select()
    .from(rfpAnswers)
    .where(and(eq(rfpAnswers.requirementId, requirementId), eq(rfpAnswers.isCurrent, true)))
    .orderBy(desc(rfpAnswers.createdAt))
    .limit(1);
  return rows[0];
}

async function getEvidenceIds(answerId: string | undefined): Promise<string[]> {
  if (!answerId) return [];
  const rows = await db
    .select({ id: rfpEvidence.id })
    .from(rfpEvidence)
    .where(eq(rfpEvidence.answerId, answerId));
  return rows.map((r) => r.id);
}

async function serializeRequirement(req: typeof rfpRequirements.$inferSelect) {
  const answer = await getCurrentAnswer(req.id);
  const evidenceIds = await getEvidenceIds(answer?.id);
  return {
    id: req.id,
    rfpId: req.rfpId,
    code: req.code,
    title: req.title,
    question: req.question,
    category: req.category,
    mandatory: req.mandatory,
    risk: req.risk,
    riskRationale: req.riskRationale,
    confidence: answer ? Number(answer.confidence) : 0,
    status: req.status,
    ownerTeam: req.ownerTeam,
    answer: answer?.answer ?? "",
    answerSource: answer?.generatedBy ?? "ai_draft",
    evidenceIds,
    reviewerId: req.reviewerId,
    dueDate: req.dueDate,
  };
}

async function serializeActivity(requirementId: string) {
  const rows = await db
    .select()
    .from(activities)
    .where(eq(activities.requirementId, requirementId))
    .orderBy(asc(activities.createdAt));
  return rows.map((a) => ({
    id: a.id,
    at: a.createdAt.toISOString(),
    kind: a.kind,
    label: a.label,
    actor: a.actorLabel,
    rfpId: a.rfpId ?? undefined,
  }));
}

export const requirementsModule = new Elysia()
  .get(
    "/api/requirements",
    async ({ headers, query }) => {
      const auth = await requireAuth(headers);

      const { page, limit } = paginationSchema.parse(query);
      const risks = parseList(query.risk).filter((r): r is (typeof RISK_LEVELS)[number] =>
        (RISK_LEVELS as readonly string[]).includes(r),
      );
      const statuses = parseList(query.status).filter(
        (s): s is (typeof REQUIREMENT_STATUSES)[number] =>
          (REQUIREMENT_STATUSES as readonly string[]).includes(s),
      );
      const categories = parseList(query.category).filter((c): c is (typeof CATEGORIES)[number] =>
        (CATEGORIES as readonly string[]).includes(c),
      );

      const conditions = [eq(rfps.organizationId, auth.organizationId)];
      if (risks.length) conditions.push(inArray(rfpRequirements.risk, risks));
      if (statuses.length) conditions.push(inArray(rfpRequirements.status, statuses));
      if (categories.length) conditions.push(inArray(rfpRequirements.category, categories));
      if (query.mandatoryOnly === "true") conditions.push(eq(rfpRequirements.mandatory, true));
      if (query.owner === "currentUser")
        conditions.push(eq(rfpRequirements.reviewerId, auth.userId));

      const whereClause = and(...conditions);
      const [rows, totalRows] = await Promise.all([
        db
          .select({ requirement: rfpRequirements })
          .from(rfpRequirements)
          .innerJoin(rfps, eq(rfps.id, rfpRequirements.rfpId))
          .where(whereClause)
          .orderBy(asc(rfpRequirements.code))
          .limit(limit)
          .offset(paginate(page, limit).offset),
        db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(rfpRequirements)
          .innerJoin(rfps, eq(rfps.id, rfpRequirements.rfpId))
          .where(whereClause),
      ]);

      let items = await Promise.all(
        rows.map(async (r) => ({
          ...(await serializeRequirement(r.requirement)),
          activity: await serializeActivity(r.requirement.id),
        })),
      );
      if (query.evidence === "missing") items = items.filter((r) => r.evidenceIds.length === 0);

      const total = totalRows[0]?.count ?? 0;
      return { items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
    },
    {
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        risk: t.Optional(t.String()),
        status: t.Optional(t.String()),
        category: t.Optional(t.String()),
        mandatoryOnly: t.Optional(t.String()),
        evidence: t.Optional(t.String()),
        owner: t.Optional(t.String()),
      }),
    },
  )
  .get(
    "/api/rfps/:id/requirements",
    async ({ headers, params, query }) => {
      const auth = await requireAuth(headers);
      await assertRfpInOrg(params.id, auth.organizationId);

      const { page, limit } = paginationSchema.parse(query);
      const risks = parseList(query.risk).filter((r): r is (typeof RISK_LEVELS)[number] =>
        (RISK_LEVELS as readonly string[]).includes(r),
      );
      const statuses = parseList(query.status).filter(
        (s): s is (typeof REQUIREMENT_STATUSES)[number] =>
          (REQUIREMENT_STATUSES as readonly string[]).includes(s),
      );
      const categories = parseList(query.category).filter((c): c is (typeof CATEGORIES)[number] =>
        (CATEGORIES as readonly string[]).includes(c),
      );

      const conditions = [eq(rfpRequirements.rfpId, params.id)];
      if (risks.length) conditions.push(inArray(rfpRequirements.risk, risks));
      if (statuses.length) conditions.push(inArray(rfpRequirements.status, statuses));
      if (categories.length) conditions.push(inArray(rfpRequirements.category, categories));
      if (query.mandatoryOnly === "true") conditions.push(eq(rfpRequirements.mandatory, true));
      if (query.owner === "currentUser")
        conditions.push(eq(rfpRequirements.reviewerId, auth.userId));

      const whereClause = and(...conditions);
      const [rows, totalRows] = await Promise.all([
        db
          .select()
          .from(rfpRequirements)
          .where(whereClause)
          .orderBy(asc(rfpRequirements.code))
          .limit(limit)
          .offset(paginate(page, limit).offset),
        db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(rfpRequirements)
          .where(whereClause),
      ]);

      let items = await Promise.all(rows.map(serializeRequirement));
      // evidence=missing can't be expressed as a simple column filter (it depends
      // on the joined answer/evidence rows), so it's applied post-fetch.
      if (query.evidence === "missing") items = items.filter((r) => r.evidenceIds.length === 0);

      const total = totalRows[0]?.count ?? 0;
      return { items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
    },
    {
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        risk: t.Optional(t.String()),
        status: t.Optional(t.String()),
        category: t.Optional(t.String()),
        mandatoryOnly: t.Optional(t.String()),
        evidence: t.Optional(t.String()),
        owner: t.Optional(t.String()),
      }),
    },
  )
  .get("/api/requirements/:id", async ({ headers, params }) => {
    const auth = await requireAuth(headers);
    const req = await getRequirementInOrg(params.id, auth.organizationId);
    return { ...(await serializeRequirement(req)), activity: await serializeActivity(req.id) };
  })
  .patch(
    "/api/requirements/:id",
    async ({ headers, params, body }) => {
      const auth = await requireAuth(headers);
      const req = await getRequirementInOrg(params.id, auth.organizationId);

      const updates: Partial<typeof rfpRequirements.$inferInsert> = { updatedAt: new Date() };
      if (body.status !== undefined) updates.status = body.status;
      if (body.ownerTeam !== undefined) updates.ownerTeam = body.ownerTeam;
      if (body.reviewerId !== undefined) updates.reviewerId = body.reviewerId;

      if (body.risk !== undefined) {
        updates.risk = body.risk;
        await db.insert(rfpRisks).values({
          requirementId: req.id,
          level: body.risk,
          rationale: body.riskRationale ?? req.riskRationale,
          setBy: auth.userId,
        });
        await logActivity({
          organizationId: auth.organizationId,
          rfpId: req.rfpId,
          requirementId: req.id,
          actorId: auth.userId,
          kind: "risk",
          label: `Risk set to ${body.risk}`,
        });
      }

      if (body.status !== undefined) {
        const status: string = body.status;
        const kind =
          status === "approved" ? "approved" : status === "rejected" ? "rejected" : "comment";
        const label =
          status === "approved"
            ? "Approved"
            : status === "rejected"
              ? "Rejected"
              : status === "changes_requested"
                ? `Changes requested${body.note ? `: ${body.note}` : ""}`
                : `Status changed to ${status.replace("_", " ")}`;
        await logActivity({
          organizationId: auth.organizationId,
          rfpId: req.rfpId,
          requirementId: req.id,
          actorId: auth.userId,
          kind,
          label,
        });
      }

      if (body.reviewerId !== undefined) {
        await logActivity({
          organizationId: auth.organizationId,
          rfpId: req.rfpId,
          requirementId: req.id,
          actorId: auth.userId,
          kind: "assigned",
          label: "Reviewer assigned",
        });
      }

      await logAudit({
        organizationId: auth.organizationId,
        actorId: auth.userId,
        action: "REQUIREMENT_UPDATED",
        entityType: "requirement",
        entityId: req.id,
        previousValue: { status: req.status, risk: req.risk, ownerTeam: req.ownerTeam },
        newValue: body,
      });

      await db.update(rfpRequirements).set(updates).where(eq(rfpRequirements.id, req.id));
      const updated = await getRequirementInOrg(req.id, auth.organizationId);
      return serializeRequirement(updated);
    },
    {
      body: t.Object({
        status: t.Optional(t.Union(REQUIREMENT_STATUSES.map((s) => t.Literal(s)) as TSchema[])),
        risk: t.Optional(t.Union(RISK_LEVELS.map((r) => t.Literal(r)) as TSchema[])),
        riskRationale: t.Optional(t.String()),
        ownerTeam: t.Optional(t.String()),
        reviewerId: t.Optional(t.String()),
        note: t.Optional(t.String()),
      }),
    },
  )
  .get("/api/requirements/:id/answer", async ({ headers, params }) => {
    const auth = await requireAuth(headers);
    const req = await getRequirementInOrg(params.id, auth.organizationId);
    const answer = await getCurrentAnswer(req.id);
    if (!answer) return { answer: null };
    return {
      answer: {
        id: answer.id,
        requirementId: answer.requirementId,
        answer: answer.answer,
        confidence: Number(answer.confidence),
        generatedBy: answer.generatedBy,
        status: req.status,
        approvedBy: answer.approvedBy,
        createdAt: answer.createdAt.toISOString(),
      },
    };
  })
  .patch(
    "/api/requirements/:id/answer",
    async ({ headers, params, body }) => {
      const auth = await requireAuth(headers);
      const req = await getRequirementInOrg(params.id, auth.organizationId);
      const previous = await getCurrentAnswer(req.id);

      await db
        .update(rfpAnswers)
        .set({ isCurrent: false })
        .where(and(eq(rfpAnswers.requirementId, req.id), eq(rfpAnswers.isCurrent, true)));

      const [created] = await db
        .insert(rfpAnswers)
        .values({
          requirementId: req.id,
          answer: body.answer,
          confidence: previous ? previous.confidence : "0",
          generatedBy: "human_edited",
          isCurrent: true,
        })
        .returning();
      if (!created) throw badRequest("Could not save answer.");

      if (req.status === "unanswered") {
        await db
          .update(rfpRequirements)
          .set({ status: "drafted" })
          .where(eq(rfpRequirements.id, req.id));
      }

      await logActivity({
        organizationId: auth.organizationId,
        rfpId: req.rfpId,
        requirementId: req.id,
        actorId: auth.userId,
        kind: "comment",
        label: "Answer edited manually",
      });
      await logAudit({
        organizationId: auth.organizationId,
        actorId: auth.userId,
        action: "ANSWER_UPDATED",
        entityType: "requirement",
        entityId: req.id,
        previousValue: previous?.answer ?? null,
        newValue: body.answer,
      });

      return getRequirementInOrg(req.id, auth.organizationId).then(serializeRequirement);
    },
    { body: t.Object({ answer: t.String() }) },
  )
  .post("/api/requirements/:id/answer/regenerate", async ({ headers, params }) => {
    const auth = await requireAuth(headers);
    const req = await getRequirementInOrg(params.id, auth.organizationId);
    const previous = await getCurrentAnswer(req.id);

    const regenerationCount = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(rfpAnswers)
      .where(and(eq(rfpAnswers.requirementId, req.id), eq(rfpAnswers.generatedBy, "ai_draft")));
    const openers = [
      "Based on our current documentation, ",
      "Drawing on the latest verified sources, ",
      "Per our most recent internal review, ",
    ];
    const opener = openers[(regenerationCount[0]?.count ?? 0) % openers.length];
    const stripped = openers.reduce(
      (t, o) => (t.startsWith(o) ? t.slice(o.length) : t),
      previous?.answer ?? "",
    );
    const nextAnswer = stripped
      ? `${opener}${stripped}`
      : `Draft response to: "${req.question}" — a first pass covering ${req.category.toLowerCase()} requirements, pending SME review before submission.`;
    const nextConfidence = Math.min(0.98, Number(previous?.confidence ?? 0.6) + 0.04);

    if (previous) {
      await db.update(rfpAnswers).set({ isCurrent: false }).where(eq(rfpAnswers.id, previous.id));
    }
    await db.insert(rfpAnswers).values({
      requirementId: req.id,
      answer: nextAnswer,
      confidence: String(nextConfidence),
      generatedBy: "ai_draft",
      isCurrent: true,
    });
    if (req.status === "unanswered") {
      await db
        .update(rfpRequirements)
        .set({ status: "drafted" })
        .where(eq(rfpRequirements.id, req.id));
    }

    await logActivity({
      organizationId: auth.organizationId,
      rfpId: req.rfpId,
      requirementId: req.id,
      actorId: auth.userId,
      actorLabel: "AI Assistant",
      kind: "generated",
      label: "AI draft regenerated",
    });

    return getRequirementInOrg(req.id, auth.organizationId).then(serializeRequirement);
  })
  .get("/api/requirements/:id/evidence", async ({ headers, params }) => {
    const auth = await requireAuth(headers);
    const req = await getRequirementInOrg(params.id, auth.organizationId);
    const answer = await getCurrentAnswer(req.id);
    if (!answer) return { evidence: [] };

    const rows = await db
      .select({ evidence: rfpEvidence, sourceName: knowledgeSources.name })
      .from(rfpEvidence)
      .innerJoin(knowledgeSources, eq(knowledgeSources.id, rfpEvidence.sourceId))
      .where(eq(rfpEvidence.answerId, answer.id));
    return {
      evidence: rows.map(({ evidence: e, sourceName }) => ({
        id: e.id,
        title: e.title,
        sourceId: e.sourceId,
        sourceName,
        excerpt: e.excerpt,
        verifiedAt: e.verifiedAt,
        freshnessDays: e.verifiedAt
          ? Math.floor((Date.now() - new Date(e.verifiedAt).getTime()) / 86_400_000)
          : 9999,
        confidence: Number(e.relevance),
        url: `/knowledge/${e.sourceId}`,
      })),
    };
  });
