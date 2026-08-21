import { Elysia, t, type TSchema } from "elysia";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { rfpAnswers, rfpAssignments, rfpRequirements, rfpReviews, rfps } from "../db/schema";
import { requireAuth } from "../lib/auth";
import { notFound } from "../lib/errors";
import { logActivity } from "../lib/activity";

const REVIEW_ACTIONS = ["APPROVED", "REJECTED", "REQUEST_CHANGES", "COMMENT", "ASSIGNED"] as const;
const TODAY = () => new Date().toISOString().slice(0, 10);

function isOverdue(due: string | null, status: string): boolean {
  if (!due) return false;
  return due < TODAY() && status !== "approved" && status !== "rejected";
}

async function serializeReviewQueue(organizationId: string, currentUserId: string) {
  const rows = await db
    .select({
      assignment: rfpAssignments,
      requirement: rfpRequirements,
      rfpTitle: rfps.title,
    })
    .from(rfpAssignments)
    .innerJoin(rfpRequirements, eq(rfpRequirements.id, rfpAssignments.requirementId))
    .innerJoin(rfps, eq(rfps.id, rfpRequirements.rfpId))
    .where(eq(rfps.organizationId, organizationId))
    .orderBy(desc(rfpAssignments.createdAt));

  return Promise.all(
    rows.map(async ({ assignment, requirement, rfpTitle }) => {
      const answer = await db
        .select({ confidence: rfpAnswers.confidence })
        .from(rfpAnswers)
        .where(and(eq(rfpAnswers.requirementId, requirement.id), eq(rfpAnswers.isCurrent, true)))
        .limit(1);
      const events = await db
        .select()
        .from(rfpReviews)
        .where(eq(rfpReviews.requirementId, requirement.id))
        .orderBy(desc(rfpReviews.createdAt));

      return {
        id: assignment.id,
        requirementId: requirement.id,
        rfpId: requirement.rfpId,
        rfpTitle,
        requirementCode: requirement.code,
        requirementTitle: requirement.title,
        category: requirement.category,
        risk: requirement.risk,
        confidence: answer[0] ? Number(answer[0].confidence) : 0,
        reviewerId: assignment.userId,
        due: assignment.deadline,
        status: assignment.status,
        mine: assignment.userId === currentUserId,
        overdue: isOverdue(assignment.deadline, assignment.status),
        comments: events
          .filter((e) => e.action === "COMMENT")
          .map((e) => ({
            id: e.id,
            authorId: e.reviewerId,
            at: e.createdAt.toISOString(),
            body: e.comment ?? "",
          })),
        history: events.map((e) => ({
          id: e.id,
          at: e.createdAt.toISOString(),
          label: reviewActionLabel(e.action, e.comment),
          actorId: e.reviewerId,
        })),
      };
    }),
  );
}

function reviewActionLabel(
  action: (typeof REVIEW_ACTIONS)[number],
  comment: string | null,
): string {
  switch (action) {
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    case "REQUEST_CHANGES":
      return `Changes requested${comment ? `: ${comment}` : ""}`;
    case "ASSIGNED":
      return "Assigned for review";
    case "COMMENT":
      return "Comment added";
  }
}

export const reviewsModule = new Elysia({ prefix: "/api/reviews" })
  .get(
    "/",
    async ({ headers, query }) => {
      const auth = await requireAuth(headers);
      let items = await serializeReviewQueue(auth.organizationId, auth.userId);
      if (query.mine === "true") items = items.filter((i) => i.mine);
      if (query.status) items = items.filter((i) => i.status === query.status);
      return { items };
    },
    { query: t.Object({ mine: t.Optional(t.String()), status: t.Optional(t.String()) }) },
  )
  .get("/:id", async ({ headers, params }) => {
    const auth = await requireAuth(headers);
    const items = await serializeReviewQueue(auth.organizationId, auth.userId);
    const item = items.find((i) => i.id === params.id);
    if (!item) throw notFound("Review", params.id);
    return item;
  })
  .post(
    "/",
    async ({ headers, body }) => {
      const auth = await requireAuth(headers);
      const reqRows = await db
        .select({ requirement: rfpRequirements, orgId: rfps.organizationId })
        .from(rfpRequirements)
        .innerJoin(rfps, eq(rfps.id, rfpRequirements.rfpId))
        .where(eq(rfpRequirements.id, body.requirementId))
        .limit(1);
      const row = reqRows[0];
      if (!row || row.orgId !== auth.organizationId)
        throw notFound("Requirement", body.requirementId);

      await db.insert(rfpReviews).values({
        requirementId: body.requirementId,
        reviewerId: auth.userId,
        action: body.action,
        comment: body.comment,
      });

      const statusByAction: Record<
        string,
        "approved" | "rejected" | "changes_requested" | undefined
      > = {
        APPROVED: "approved",
        REJECTED: "rejected",
        REQUEST_CHANGES: "changes_requested",
      };
      const nextStatus = statusByAction[body.action];
      if (nextStatus) {
        await db
          .update(rfpAssignments)
          .set({ status: nextStatus, updatedAt: new Date() })
          .where(eq(rfpAssignments.requirementId, body.requirementId));
        await db
          .update(rfpRequirements)
          .set({ status: nextStatus, updatedAt: new Date() })
          .where(eq(rfpRequirements.id, body.requirementId));
      }

      await logActivity({
        organizationId: auth.organizationId,
        rfpId: row.requirement.rfpId,
        requirementId: body.requirementId,
        actorId: auth.userId,
        kind:
          nextStatus === "approved"
            ? "approved"
            : nextStatus === "rejected"
              ? "rejected"
              : "comment",
        label: reviewActionLabel(body.action, body.comment ?? null),
      });

      return { created: true };
    },
    {
      body: t.Object({
        requirementId: t.String(),
        action: t.Union(REVIEW_ACTIONS.map((a) => t.Literal(a)) as TSchema[]),
        comment: t.Optional(t.String()),
      }),
    },
  );
