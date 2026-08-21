import { Elysia, t, type TSchema } from "elysia";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  knowledgeClaims,
  knowledgeConflictVariants,
  knowledgeConflicts,
  knowledgeSources,
  knowledgeVersions,
  rfpAnswers,
  rfpEvidence,
} from "../db/schema";
import { requireAuth } from "../lib/auth";
import { badRequest, notFound } from "../lib/errors";
import { sql } from "drizzle-orm";

const AUTHORITY = ["high", "medium", "low"] as const;
const CATEGORIES = [
  "Security",
  "Commercial",
  "Compliance",
  "Product",
  "Legal",
  "Architecture",
  "Support",
] as const;

const FRESH_DAYS = 90;
const AGING_DAYS = 180;

/** Freshness is inherently time-derived — computed on read, never stored, so it can't go stale itself. */
function computeFreshness(
  lastVerified: string | null,
  hasConflicts: boolean,
): "fresh" | "aging" | "stale" | "conflicting" {
  if (hasConflicts) return "conflicting";
  if (!lastVerified) return "stale";
  const days = Math.floor((Date.now() - new Date(lastVerified).getTime()) / 86_400_000);
  if (days <= FRESH_DAYS) return "fresh";
  if (days <= AGING_DAYS) return "aging";
  return "stale";
}

async function serializeSource(source: typeof knowledgeSources.$inferSelect) {
  const [claims, versions, conflicts, usage] = await Promise.all([
    db.select().from(knowledgeClaims).where(eq(knowledgeClaims.sourceId, source.id)),
    db.select().from(knowledgeVersions).where(eq(knowledgeVersions.sourceId, source.id)),
    db.select().from(knowledgeConflicts).where(eq(knowledgeConflicts.sourceId, source.id)),
    db
      .select({
        used: sql<number>`count(distinct ${rfpEvidence.answerId})`.mapWith(Number),
        staleRisk:
          sql<number>`count(distinct ${rfpEvidence.answerId}) filter (where ${rfpAnswers.confidence} < 0.7)`.mapWith(
            Number,
          ),
      })
      .from(rfpEvidence)
      .innerJoin(rfpAnswers, eq(rfpAnswers.id, rfpEvidence.answerId))
      .where(eq(rfpEvidence.sourceId, source.id)),
  ]);

  const conflictsWithVariants = await Promise.all(
    conflicts.map(async (c) => ({
      id: c.id,
      topic: c.topic,
      variants: (
        await db
          .select()
          .from(knowledgeConflictVariants)
          .where(eq(knowledgeConflictVariants.conflictId, c.id))
      ).map((v) => ({ label: v.label, value: v.value })),
      recommended: c.recommended,
      action: c.action,
    })),
  );

  return {
    id: source.id,
    name: source.name,
    type: source.type,
    category: source.category,
    version: source.version,
    authority: source.authority,
    freshness: computeFreshness(source.lastVerified, conflicts.length > 0),
    ownerId: source.ownerId,
    lastVerified: source.lastVerified,
    lastUpdated: source.lastUpdated,
    expiresAt: source.expiresAt,
    usedByAnswers: usage[0]?.used ?? 0,
    staleRiskAnswers: usage[0]?.staleRisk ?? 0,
    summary: source.summary,
    claims: claims.map((c) => ({
      id: c.id,
      label: c.label,
      value: c.value,
      confidence: Number(c.confidence),
    })),
    versions: versions.map((v) => ({ version: v.version, date: v.date, note: v.note })),
    conflicts: conflictsWithVariants,
  };
}

export const knowledgeModule = new Elysia({ prefix: "/api/knowledge" })
  .get("/", async ({ headers }) => {
    const auth = await requireAuth(headers);
    const rows = await db
      .select()
      .from(knowledgeSources)
      .where(eq(knowledgeSources.organizationId, auth.organizationId));
    return { items: await Promise.all(rows.map(serializeSource)) };
  })
  .get("/:id", async ({ headers, params }) => {
    const auth = await requireAuth(headers);
    const rows = await db
      .select()
      .from(knowledgeSources)
      .where(
        and(
          eq(knowledgeSources.id, params.id),
          eq(knowledgeSources.organizationId, auth.organizationId),
        ),
      )
      .limit(1);
    const source = rows[0];
    if (!source) throw notFound("Knowledge source", params.id);
    return serializeSource(source);
  })
  .post(
    "/",
    async ({ headers, body }) => {
      const auth = await requireAuth(headers);
      const [source] = await db
        .insert(knowledgeSources)
        .values({
          organizationId: auth.organizationId,
          name: body.name,
          type: body.type,
          category: body.category,
          version: body.version ?? "1.0",
          authority: body.authority ?? "medium",
          ownerId: body.ownerId,
          summary: body.summary ?? "",
          lastVerified: body.lastVerified,
          lastUpdated: new Date().toISOString().slice(0, 10),
          expiresAt: body.expiresAt,
        })
        .returning();
      if (!source) throw badRequest("Could not create knowledge source.");
      return serializeSource(source);
    },
    {
      body: t.Object({
        name: t.String(),
        type: t.String(),
        category: t.Union(CATEGORIES.map((c) => t.Literal(c)) as TSchema[]),
        version: t.Optional(t.String()),
        authority: t.Optional(t.Union(AUTHORITY.map((a) => t.Literal(a)) as TSchema[])),
        ownerId: t.Optional(t.String()),
        summary: t.Optional(t.String()),
        lastVerified: t.Optional(t.String()),
        expiresAt: t.Optional(t.String()),
      }),
    },
  )
  .patch(
    "/:id",
    async ({ headers, params, body }) => {
      const auth = await requireAuth(headers);
      const rows = await db
        .select()
        .from(knowledgeSources)
        .where(
          and(
            eq(knowledgeSources.id, params.id),
            eq(knowledgeSources.organizationId, auth.organizationId),
          ),
        )
        .limit(1);
      if (!rows[0]) throw notFound("Knowledge source", params.id);

      await db
        .update(knowledgeSources)
        .set({ ...body, updatedAt: new Date(), lastUpdated: new Date().toISOString().slice(0, 10) })
        .where(eq(knowledgeSources.id, params.id));

      const [updated] = await db
        .select()
        .from(knowledgeSources)
        .where(eq(knowledgeSources.id, params.id));
      if (!updated) throw notFound("Knowledge source", params.id);
      return serializeSource(updated);
    },
    {
      body: t.Object({
        name: t.Optional(t.String()),
        summary: t.Optional(t.String()),
        authority: t.Optional(t.Union(AUTHORITY.map((a) => t.Literal(a)) as TSchema[])),
        lastVerified: t.Optional(t.String()),
        expiresAt: t.Optional(t.String()),
      }),
    },
  );
