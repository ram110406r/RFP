import { Elysia, t, type TSchema } from "elysia";
import { and, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  customers,
  rfpCollaborators,
  rfpDocuments,
  rfpOutcomes,
  rfpRequirements,
  rfps,
} from "../db/schema";
import { requireAuth } from "../lib/auth";
import { badRequest, notFound } from "../lib/errors";
import { paginate, paginationSchema } from "../lib/query";
import { logActivity } from "../lib/activity";

const RFP_STATUSES = [
  "draft",
  "analyzing",
  "in_progress",
  "review",
  "needs_attention",
  "submitted",
  "won",
  "lost",
] as const;

/** riskCount/needsReview/requirementsTotal etc. are never stored — always
 * computed live from rfp_requirements so they can't drift out of sync. */
const statsSelection = {
  requirementsTotal: sql<number>`count(${rfpRequirements.id})`.mapWith(Number),
  requirementsComplete:
    sql<number>`count(${rfpRequirements.id}) filter (where ${rfpRequirements.status} = 'approved')`.mapWith(
      Number,
    ),
  mandatoryTotal:
    sql<number>`count(${rfpRequirements.id}) filter (where ${rfpRequirements.mandatory})`.mapWith(
      Number,
    ),
  mandatoryComplete:
    sql<number>`count(${rfpRequirements.id}) filter (where ${rfpRequirements.mandatory} and ${rfpRequirements.status} = 'approved')`.mapWith(
      Number,
    ),
  riskLow:
    sql<number>`count(${rfpRequirements.id}) filter (where ${rfpRequirements.risk} = 'low')`.mapWith(
      Number,
    ),
  riskMedium:
    sql<number>`count(${rfpRequirements.id}) filter (where ${rfpRequirements.risk} = 'medium')`.mapWith(
      Number,
    ),
  riskHigh:
    sql<number>`count(${rfpRequirements.id}) filter (where ${rfpRequirements.risk} = 'high')`.mapWith(
      Number,
    ),
  riskCritical:
    sql<number>`count(${rfpRequirements.id}) filter (where ${rfpRequirements.risk} = 'critical')`.mapWith(
      Number,
    ),
  needsReview:
    sql<number>`count(${rfpRequirements.id}) filter (where ${rfpRequirements.status} in ('needs_review', 'changes_requested'))`.mapWith(
      Number,
    ),
  // `a.requirement_id = rfp_requirements.id` must be table-qualified: inside the
  // correlated subquery, an unqualified "id" is ambiguous between
  // rfp_answers.id, rfp_evidence.id, and the outer rfp_requirements.id.
  evidenceBacked:
    sql<number>`count(distinct ${rfpRequirements.id}) filter (where exists (select 1 from rfp_answers a join rfp_evidence e on e.answer_id = a.id where a.requirement_id = rfp_requirements.id and a.is_current))`.mapWith(
      Number,
    ),
};

type StatsRow = {
  [K in keyof typeof statsSelection]: number;
};

function deriveMetrics(stats: StatsRow) {
  const total = stats.requirementsTotal || 0;
  const progress = total ? Math.round((stats.requirementsComplete / total) * 100) : 0;
  const mandatoryRatio = stats.mandatoryTotal ? stats.mandatoryComplete / stats.mandatoryTotal : 1;
  const highRiskRatio = total ? (stats.riskHigh + stats.riskCritical) / total : 0;
  const readiness = total
    ? Math.round((mandatoryRatio * 0.6 + (1 - highRiskRatio) * 0.4) * 100)
    : 0;
  const evidenceCoverage = total ? Math.round((stats.evidenceBacked / total) * 100) : 0;
  return {
    requirementsTotal: total,
    requirementsComplete: stats.requirementsComplete,
    mandatoryTotal: stats.mandatoryTotal,
    mandatoryComplete: stats.mandatoryComplete,
    riskCount: {
      low: stats.riskLow,
      medium: stats.riskMedium,
      high: stats.riskHigh,
      critical: stats.riskCritical,
    },
    needsReview: stats.needsReview,
    progress,
    readiness,
    evidenceCoverage,
  };
}

async function loadRfpExtras(rfpId: string) {
  const [documents, collaborators] = await Promise.all([
    db.select().from(rfpDocuments).where(eq(rfpDocuments.rfpId, rfpId)),
    db
      .select({ userId: rfpCollaborators.userId })
      .from(rfpCollaborators)
      .where(eq(rfpCollaborators.rfpId, rfpId)),
  ]);
  return {
    documents: documents.map((d) => ({
      id: d.id,
      name: d.filename,
      type: d.type,
      sizeMb: Number(d.sizeMb),
      status: d.status,
    })),
    collaboratorIds: collaborators.map((c) => c.userId),
  };
}

function serializeRfp(
  row: typeof rfps.$inferSelect & { customerName: string },
  stats: ReturnType<typeof deriveMetrics>,
  extras: Awaited<ReturnType<typeof loadRfpExtras>>,
) {
  return {
    id: row.id,
    title: row.title,
    customer: row.customerName,
    customerId: row.customerId,
    ownerId: row.ownerId,
    opportunity: row.opportunity,
    estimatedValue: Number(row.estimatedValue),
    deadline: row.deadline,
    status: row.status,
    createdAt: row.createdAt.toISOString().slice(0, 10),
    ...stats,
    ...extras,
  };
}

async function getRfpOr404(id: string, organizationId: string) {
  const rows = await db
    .select({ rfp: rfps, customerName: customers.name })
    .from(rfps)
    .innerJoin(customers, eq(customers.id, rfps.customerId))
    .where(and(eq(rfps.id, id), eq(rfps.organizationId, organizationId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw notFound("RFP", id);

  const [statsRows, extras] = await Promise.all([
    db.select(statsSelection).from(rfpRequirements).where(eq(rfpRequirements.rfpId, id)),
    loadRfpExtras(id),
  ]);
  const stats = deriveMetrics(statsRows[0] as StatsRow);
  return serializeRfp({ ...row.rfp, customerName: row.customerName }, stats, extras);
}

const createRfpBody = t.Object({
  title: t.String({ minLength: 3 }),
  customer: t.String({ minLength: 2 }),
  opportunity: t.Optional(t.String()),
  estimatedValue: t.Number({ minimum: 0 }),
  deadline: t.String(),
  ownerId: t.String(),
  documents: t.Array(
    t.Object({
      name: t.String(),
      type: t.Union([
        t.Literal("PDF"),
        t.Literal("DOCX"),
        t.Literal("XLSX"),
        t.Literal("PPTX"),
        t.Literal("ZIP"),
        t.Literal("HTML"),
      ]),
      sizeMb: t.Number(),
    }),
  ),
  collaboratorIds: t.Optional(t.Array(t.String())),
  asDraft: t.Optional(t.Boolean()),
});

export const rfpsModule = new Elysia({ prefix: "/api/rfps" })
  .get(
    "/",
    async ({ headers, query }) => {
      const auth = await requireAuth(headers);
      const { page, limit } = paginationSchema.parse(query);
      const statuses = query.status
        ? query.status
            .split(",")
            .map((s) => s.trim())
            .filter((s): s is (typeof RFP_STATUSES)[number] =>
              (RFP_STATUSES as readonly string[]).includes(s),
            )
        : [];

      const conditions = [eq(rfps.organizationId, auth.organizationId)];
      if (statuses.length) conditions.push(inArray(rfps.status, statuses));
      if (query.search) conditions.push(ilike(rfps.title, `%${query.search}%`));

      const whereClause = and(...conditions);
      const [rows, totalRows] = await Promise.all([
        db
          .select({ rfp: rfps, customerName: customers.name })
          .from(rfps)
          .innerJoin(customers, eq(customers.id, rfps.customerId))
          .where(whereClause)
          .orderBy(desc(rfps.createdAt))
          .limit(limit)
          .offset(paginate(page, limit).offset),
        db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(rfps)
          .where(whereClause),
      ]);

      const items = await Promise.all(
        rows.map(async ({ rfp, customerName }) => {
          const [statsRows, extras] = await Promise.all([
            db
              .select(statsSelection)
              .from(rfpRequirements)
              .where(eq(rfpRequirements.rfpId, rfp.id)),
            loadRfpExtras(rfp.id),
          ]);
          return serializeRfp(
            { ...rfp, customerName },
            deriveMetrics(statsRows[0] as StatsRow),
            extras,
          );
        }),
      );

      const total = totalRows[0]?.count ?? 0;
      return { items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
    },
    {
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        status: t.Optional(t.String()),
        search: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/",
    async ({ headers, body }) => {
      const auth = await requireAuth(headers);

      let [customer] = await db
        .select()
        .from(customers)
        .where(
          and(eq(customers.organizationId, auth.organizationId), eq(customers.name, body.customer)),
        )
        .limit(1);
      if (!customer) {
        const [created] = await db
          .insert(customers)
          .values({ organizationId: auth.organizationId, name: body.customer })
          .returning();
        customer = created;
      }
      if (!customer) throw badRequest("Could not resolve customer.");

      const status = body.asDraft ? "draft" : "analyzing";
      const [rfp] = await db
        .insert(rfps)
        .values({
          organizationId: auth.organizationId,
          customerId: customer.id,
          title: body.title,
          opportunity: body.opportunity ?? "",
          ownerId: body.ownerId,
          deadline: body.deadline,
          estimatedValue: String(body.estimatedValue),
          status,
        })
        .returning();
      if (!rfp) throw badRequest("Could not create RFP.");

      const collaboratorIds = Array.from(new Set([body.ownerId, ...(body.collaboratorIds ?? [])]));
      if (collaboratorIds.length) {
        await db
          .insert(rfpCollaborators)
          .values(collaboratorIds.map((userId) => ({ rfpId: rfp.id, userId })));
      }

      if (body.documents.length) {
        await db.insert(rfpDocuments).values(
          body.documents.map((doc) => ({
            // rfp_documents carries its own organization_id as of the Phase 6
            // document work, so the processing worker can scope without a join.
            organizationId: auth.organizationId,
            rfpId: rfp.id,
            filename: doc.name,
            type: doc.type,
            sizeMb: String(doc.sizeMb),
            status: (body.asDraft ? "queued" : "processing") as "queued" | "processing",
            uploadedBy: auth.userId,
          })),
        );
      }

      await logActivity({
        organizationId: auth.organizationId,
        rfpId: rfp.id,
        actorId: auth.userId,
        kind: "generated",
        label: `New RFP created — ${rfp.title}`,
      });

      return getRfpOr404(rfp.id, auth.organizationId);
    },
    { body: createRfpBody },
  )
  .get("/:id", async ({ headers, params }) => {
    const auth = await requireAuth(headers);
    return getRfpOr404(params.id, auth.organizationId);
  })
  .patch(
    "/:id",
    async ({ headers, params, body }) => {
      const auth = await requireAuth(headers);
      await getRfpOr404(params.id, auth.organizationId); // 404s if missing/out-of-org

      const updates: Partial<typeof rfps.$inferInsert> = { updatedAt: new Date() };
      if (body.title !== undefined) updates.title = body.title;
      if (body.opportunity !== undefined) updates.opportunity = body.opportunity;
      if (body.ownerId !== undefined) updates.ownerId = body.ownerId;
      if (body.deadline !== undefined) updates.deadline = body.deadline;
      if (body.estimatedValue !== undefined) updates.estimatedValue = String(body.estimatedValue);
      if (body.status !== undefined) {
        updates.status = body.status;
        if (body.status === "won" || body.status === "lost") {
          const rfpRow = await getRfpOr404(params.id, auth.organizationId);
          await db
            .insert(rfpOutcomes)
            .values({
              rfpId: params.id,
              outcome: body.status,
              value: String(rfpRow.estimatedValue),
              closedAt: new Date().toISOString().slice(0, 10),
            })
            .onConflictDoUpdate({
              target: rfpOutcomes.rfpId,
              set: { outcome: body.status, closedAt: new Date().toISOString().slice(0, 10) },
            });
        }
      }

      await db.update(rfps).set(updates).where(eq(rfps.id, params.id));
      await logActivity({
        organizationId: auth.organizationId,
        rfpId: params.id,
        actorId: auth.userId,
        kind: "comment",
        label: `RFP updated${body.status ? ` — status changed to ${body.status}` : ""}`,
      });

      return getRfpOr404(params.id, auth.organizationId);
    },
    {
      body: t.Object({
        title: t.Optional(t.String()),
        opportunity: t.Optional(t.String()),
        ownerId: t.Optional(t.String()),
        deadline: t.Optional(t.String()),
        estimatedValue: t.Optional(t.Number()),
        status: t.Optional(t.Union(RFP_STATUSES.map((s) => t.Literal(s)) as TSchema[])),
      }),
    },
  )
  .delete("/:id", async ({ headers, params }) => {
    const auth = await requireAuth(headers);
    await getRfpOr404(params.id, auth.organizationId);
    await db.delete(rfps).where(eq(rfps.id, params.id));
    return { deleted: true };
  })
  .get("/:id/documents", async ({ headers, params }) => {
    const auth = await requireAuth(headers);
    await getRfpOr404(params.id, auth.organizationId);
    const rows = await db.select().from(rfpDocuments).where(eq(rfpDocuments.rfpId, params.id));
    return {
      documents: rows.map((d) => ({
        id: d.id,
        name: d.filename,
        type: d.type,
        sizeMb: Number(d.sizeMb),
        status: d.status,
      })),
    };
  })
  .post(
    "/:id/documents",
    async ({ headers, params, body }) => {
      const auth = await requireAuth(headers);
      await getRfpOr404(params.id, auth.organizationId);
      const [doc] = await db
        .insert(rfpDocuments)
        .values({
          organizationId: auth.organizationId,
          rfpId: params.id,
          filename: body.name,
          type: body.type,
          sizeMb: String(body.sizeMb),
          status: "processing",
          uploadedBy: auth.userId,
        })
        .returning();
      if (!doc) throw badRequest("Could not create document.");

      await logActivity({
        organizationId: auth.organizationId,
        rfpId: params.id,
        actorId: auth.userId,
        kind: "generated",
        label: `Document uploaded — ${doc.filename}`,
      });

      // Mock document-processing pipeline: flips to "ready" shortly after
      // upload, mirroring the frontend's previous simulated latency.
      setTimeout(() => {
        void db.update(rfpDocuments).set({ status: "ready" }).where(eq(rfpDocuments.id, doc.id));
      }, 1200);

      return {
        id: doc.id,
        name: doc.filename,
        type: doc.type,
        sizeMb: Number(doc.sizeMb),
        status: doc.status,
      };
    },
    {
      body: t.Object({
        name: t.String(),
        type: t.Union([
          t.Literal("PDF"),
          t.Literal("DOCX"),
          t.Literal("XLSX"),
          t.Literal("PPTX"),
          t.Literal("ZIP"),
          t.Literal("HTML"),
        ]),
        sizeMb: t.Number(),
      }),
    },
  );

export { getRfpOr404 };
