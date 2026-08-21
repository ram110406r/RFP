import { Elysia, t } from "elysia";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  rfpSubmissionArtifacts,
  rfpSubmissionChecklistItems,
  rfpSubmissions,
  rfps,
  users,
} from "../db/schema";
import { requireAuth } from "../lib/auth";
import { badRequest } from "../lib/errors";
import { logActivity } from "../lib/activity";
import { getRfpOr404 } from "./rfps";

const CHECKLIST_TEMPLATE = [
  "All mandatory requirements approved",
  "High & critical risk items resolved",
  "Legal clauses signed off",
  "Commercial terms confirmed",
  "Executive summary reviewed",
  "Formatting matches customer template",
];

const ARTIFACT_TEMPLATE = [
  {
    label: "Technical Response.pdf",
    description: "Full requirement-by-requirement response document",
  },
  {
    label: "Executive Summary.pdf",
    description: "3-page executive overview and value proposition",
  },
  { label: "Pricing Schedule.xlsx", description: "Itemized pricing by module and tier" },
  { label: "Compliance Appendix.pdf", description: "Certifications, attestations, and DPA" },
];

async function serializeSubmission(
  submission: typeof rfpSubmissions.$inferSelect,
  createdByName: string,
) {
  const [checklist, artifacts] = await Promise.all([
    db
      .select()
      .from(rfpSubmissionChecklistItems)
      .where(eq(rfpSubmissionChecklistItems.submissionId, submission.id)),
    db
      .select()
      .from(rfpSubmissionArtifacts)
      .where(eq(rfpSubmissionArtifacts.submissionId, submission.id)),
  ]);
  return {
    id: submission.id,
    label: submission.label,
    createdAt: submission.createdAt.toISOString(),
    createdBy: createdByName,
    note: submission.note,
    checklist: checklist.map((c) => ({ id: c.id, label: c.label, done: c.done })),
    artifacts: artifacts.map((a) => ({
      id: a.id,
      label: a.label,
      description: a.description,
      ready: a.ready,
    })),
  };
}

export const submissionsModule = new Elysia()
  .get("/api/rfps/:id/submissions", async ({ headers, params }) => {
    const auth = await requireAuth(headers);
    await getRfpOr404(params.id, auth.organizationId);
    const rows = await db
      .select({ submission: rfpSubmissions, createdByName: users.name })
      .from(rfpSubmissions)
      .leftJoin(users, eq(users.id, rfpSubmissions.createdBy))
      .where(eq(rfpSubmissions.rfpId, params.id))
      .orderBy(desc(rfpSubmissions.createdAt));
    return {
      items: await Promise.all(
        rows.map((r) => serializeSubmission(r.submission, r.createdByName ?? "Unknown")),
      ),
    };
  })
  .post(
    "/api/rfps/:id/submissions",
    async ({ headers, params, body }) => {
      const auth = await requireAuth(headers);
      const rfp = await getRfpOr404(params.id, auth.organizationId);

      const priorCount = await db
        .select({ id: rfpSubmissions.id })
        .from(rfpSubmissions)
        .where(eq(rfpSubmissions.rfpId, params.id));
      const versionLabel = `Version ${priorCount.length + 1}${body.final ? " (submitted)" : " (current draft)"}`;

      const [submission] = await db
        .insert(rfpSubmissions)
        .values({
          rfpId: params.id,
          label: versionLabel,
          note: body.note ?? "",
          createdBy: auth.userId,
        })
        .returning();
      if (!submission) throw badRequest("Could not generate submission package.");

      const mandatoryDone = rfp.mandatoryComplete === rfp.mandatoryTotal && rfp.mandatoryTotal > 0;
      const riskDone = rfp.riskCount.high === 0 && rfp.riskCount.critical === 0;

      await db.insert(rfpSubmissionChecklistItems).values(
        CHECKLIST_TEMPLATE.map((label, i) => ({
          submissionId: submission.id,
          label,
          done: i === 0 ? mandatoryDone : i === 1 ? riskDone : i >= 3,
        })),
      );
      await db.insert(rfpSubmissionArtifacts).values(
        ARTIFACT_TEMPLATE.map((a, i) => ({
          submissionId: submission.id,
          label: a.label,
          description: a.description,
          ready: i < 3,
        })),
      );

      if (body.final) {
        await db
          .update(rfps)
          .set({ status: "submitted", updatedAt: new Date() })
          .where(eq(rfps.id, params.id));
      }

      await logActivity({
        organizationId: auth.organizationId,
        rfpId: params.id,
        actorId: auth.userId,
        kind: "submission",
        label: `Generated submission package — ${versionLabel}`,
      });

      const [createdBy] = await db.select().from(users).where(eq(users.id, auth.userId));
      return serializeSubmission(submission, createdBy?.name ?? "Unknown");
    },
    { body: t.Object({ note: t.Optional(t.String()), final: t.Optional(t.Boolean()) }) },
  );
