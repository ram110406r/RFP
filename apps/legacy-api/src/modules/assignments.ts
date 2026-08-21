import { Elysia, t, type TSchema } from "elysia";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { rfpAssignments, rfpRequirements, rfps } from "../db/schema";
import { requireAuth } from "../lib/auth";
import { badRequest, notFound } from "../lib/errors";
import { logActivity } from "../lib/activity";

const ASSIGNMENT_STATUSES = [
  "pending",
  "in_review",
  "approved",
  "rejected",
  "changes_requested",
] as const;

async function assertRequirementInOrg(requirementId: string, organizationId: string) {
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

export const assignmentsModule = new Elysia({ prefix: "/api/assignments" })
  .get(
    "/",
    async ({ headers, query }) => {
      const auth = await requireAuth(headers);
      const rows = await db
        .select({ assignment: rfpAssignments, requirement: rfpRequirements })
        .from(rfpAssignments)
        .innerJoin(rfpRequirements, eq(rfpRequirements.id, rfpAssignments.requirementId))
        .innerJoin(rfps, eq(rfps.id, rfpRequirements.rfpId))
        .where(
          query.userId
            ? and(
                eq(rfps.organizationId, auth.organizationId),
                eq(rfpAssignments.userId, query.userId),
              )
            : eq(rfps.organizationId, auth.organizationId),
        );
      return {
        items: rows.map(({ assignment, requirement }) => ({
          id: assignment.id,
          requirementId: assignment.requirementId,
          requirementCode: requirement.code,
          userId: assignment.userId,
          role: assignment.role,
          deadline: assignment.deadline,
          status: assignment.status,
        })),
      };
    },
    { query: t.Object({ userId: t.Optional(t.String()) }) },
  )
  .post(
    "/",
    async ({ headers, body }) => {
      const auth = await requireAuth(headers);
      const req = await assertRequirementInOrg(body.requirementId, auth.organizationId);

      const existing = await db
        .select()
        .from(rfpAssignments)
        .where(eq(rfpAssignments.requirementId, body.requirementId))
        .limit(1);

      let assignment;
      if (existing[0]) {
        [assignment] = await db
          .update(rfpAssignments)
          .set({
            userId: body.userId,
            role: body.role ?? existing[0].role,
            deadline: body.deadline ?? existing[0].deadline,
            status: "pending",
            updatedAt: new Date(),
          })
          .where(eq(rfpAssignments.id, existing[0].id))
          .returning();
      } else {
        [assignment] = await db
          .insert(rfpAssignments)
          .values({
            requirementId: body.requirementId,
            userId: body.userId,
            role: body.role ?? "reviewer",
            deadline: body.deadline,
          })
          .returning();
      }
      if (!assignment) throw badRequest("Could not create assignment.");

      await db
        .update(rfpRequirements)
        .set({ reviewerId: body.userId, updatedAt: new Date() })
        .where(eq(rfpRequirements.id, body.requirementId));

      await logActivity({
        organizationId: auth.organizationId,
        rfpId: req.rfpId,
        requirementId: req.id,
        actorId: auth.userId,
        kind: "assigned",
        label: "Reviewer assigned",
      });

      return {
        id: assignment.id,
        requirementId: assignment.requirementId,
        userId: assignment.userId,
      };
    },
    {
      body: t.Object({
        requirementId: t.String(),
        userId: t.String(),
        role: t.Optional(t.String()),
        deadline: t.Optional(t.String()),
      }),
    },
  )
  .patch(
    "/:id",
    async ({ headers, params, body }) => {
      const auth = await requireAuth(headers);
      const rows = await db
        .select({ assignment: rfpAssignments, orgId: rfps.organizationId })
        .from(rfpAssignments)
        .innerJoin(rfpRequirements, eq(rfpRequirements.id, rfpAssignments.requirementId))
        .innerJoin(rfps, eq(rfps.id, rfpRequirements.rfpId))
        .where(eq(rfpAssignments.id, params.id))
        .limit(1);
      const row = rows[0];
      if (!row || row.orgId !== auth.organizationId) throw notFound("Assignment", params.id);

      const updates: Partial<typeof rfpAssignments.$inferInsert> = { updatedAt: new Date() };
      if (body.status !== undefined) updates.status = body.status;
      if (body.deadline !== undefined) updates.deadline = body.deadline;
      if (body.userId !== undefined) updates.userId = body.userId;

      await db.update(rfpAssignments).set(updates).where(eq(rfpAssignments.id, params.id));
      return { updated: true };
    },
    {
      body: t.Object({
        status: t.Optional(t.Union(ASSIGNMENT_STATUSES.map((s) => t.Literal(s)) as TSchema[])),
        deadline: t.Optional(t.String()),
        userId: t.Optional(t.String()),
      }),
    },
  );
