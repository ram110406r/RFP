import { Elysia } from "elysia";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  knowledgeSources,
  rfpAnswers,
  rfpOutcomes,
  rfpRequirements,
  rfpReviews,
  rfps,
} from "../db/schema";
import { requireAuth } from "../lib/auth";

/**
 * Every figure here is computed from real rows for the caller's
 * organization. Where the schema genuinely doesn't track something yet
 * (e.g. SME hours — there's no time-tracking entity), the value is 0 and
 * period-over-period deltas are 0 rather than invented, per the migration
 * brief's "never invent analytics" rule.
 */
export const analyticsModule = new Elysia({ prefix: "/api/analytics" }).get(
  "/",
  async ({ headers }) => {
    const auth = await requireAuth(headers);
    const orgId = auth.organizationId;

    const [
      rfpCount,
      requirementCount,
      riskRows,
      outcomeRows,
      currentAnswers,
      evidenceFreshRows,
      sourceCount,
      byMonthReceived,
      byMonthOutcome,
      byMonthAnswers,
      ownerTeamReviews,
    ] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(rfps)
        .where(eq(rfps.organizationId, orgId)),
      db
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(rfpRequirements)
        .innerJoin(rfps, eq(rfps.id, rfpRequirements.rfpId))
        .where(eq(rfps.organizationId, orgId)),
      db
        .select({
          low: sql<number>`count(*) filter (where ${rfpRequirements.risk} = 'low')`.mapWith(Number),
          medium: sql<number>`count(*) filter (where ${rfpRequirements.risk} = 'medium')`.mapWith(
            Number,
          ),
          high: sql<number>`count(*) filter (where ${rfpRequirements.risk} = 'high')`.mapWith(
            Number,
          ),
          critical:
            sql<number>`count(*) filter (where ${rfpRequirements.risk} = 'critical')`.mapWith(
              Number,
            ),
        })
        .from(rfpRequirements)
        .innerJoin(rfps, eq(rfps.id, rfpRequirements.rfpId))
        .where(eq(rfps.organizationId, orgId)),
      db
        .select({
          won: sql<number>`count(*) filter (where ${rfpOutcomes.outcome} = 'won')`.mapWith(Number),
          lost: sql<number>`count(*) filter (where ${rfpOutcomes.outcome} = 'lost')`.mapWith(
            Number,
          ),
        })
        .from(rfpOutcomes)
        .innerJoin(rfps, eq(rfps.id, rfpOutcomes.rfpId))
        .where(eq(rfps.organizationId, orgId)),
      db
        .select({
          total: sql<number>`count(*)`.mapWith(Number),
          aiAcceptedAsIs:
            sql<number>`count(*) filter (where ${rfpAnswers.generatedBy} = 'ai_draft')`.mapWith(
              Number,
            ),
        })
        .from(rfpAnswers)
        .innerJoin(rfpRequirements, eq(rfpRequirements.id, rfpAnswers.requirementId))
        .innerJoin(rfps, eq(rfps.id, rfpRequirements.rfpId))
        .where(sql`${rfps.organizationId} = ${orgId} and ${rfpAnswers.isCurrent}`),
      db
        .select({
          fresh:
            sql<number>`count(*) filter (where ${knowledgeSources.lastVerified} >= now() - interval '90 days')`.mapWith(
              Number,
            ),
        })
        .from(knowledgeSources)
        .where(eq(knowledgeSources.organizationId, orgId)),
      db
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(knowledgeSources)
        .where(eq(knowledgeSources.organizationId, orgId)),
      db
        .select({
          month: sql<string>`to_char(${rfps.createdAt}, 'Mon')`,
          monthIdx: sql<number>`extract(month from ${rfps.createdAt})`.mapWith(Number),
          received: sql<number>`count(*)`.mapWith(Number),
        })
        .from(rfps)
        .where(eq(rfps.organizationId, orgId))
        .groupBy(
          sql`to_char(${rfps.createdAt}, 'Mon')`,
          sql`extract(month from ${rfps.createdAt})`,
        ),
      db
        .select({
          month: sql<string>`to_char(${rfpOutcomes.closedAt}, 'Mon')`,
          monthIdx: sql<number>`extract(month from ${rfpOutcomes.closedAt})`.mapWith(Number),
          won: sql<number>`count(*) filter (where ${rfpOutcomes.outcome} = 'won')`.mapWith(Number),
          lost: sql<number>`count(*) filter (where ${rfpOutcomes.outcome} = 'lost')`.mapWith(
            Number,
          ),
        })
        .from(rfpOutcomes)
        .innerJoin(rfps, eq(rfps.id, rfpOutcomes.rfpId))
        .where(eq(rfps.organizationId, orgId))
        .groupBy(
          sql`to_char(${rfpOutcomes.closedAt}, 'Mon')`,
          sql`extract(month from ${rfpOutcomes.closedAt})`,
        ),
      db
        .select({
          month: sql<string>`to_char(${rfpAnswers.createdAt}, 'Mon')`,
          monthIdx: sql<number>`extract(month from ${rfpAnswers.createdAt})`.mapWith(Number),
          accepted:
            sql<number>`count(*) filter (where ${rfpAnswers.generatedBy} = 'ai_draft')`.mapWith(
              Number,
            ),
          edited:
            sql<number>`count(*) filter (where ${rfpAnswers.generatedBy} = 'human_edited')`.mapWith(
              Number,
            ),
        })
        .from(rfpAnswers)
        .innerJoin(rfpRequirements, eq(rfpRequirements.id, rfpAnswers.requirementId))
        .innerJoin(rfps, eq(rfps.id, rfpRequirements.rfpId))
        .where(eq(rfps.organizationId, orgId))
        .groupBy(
          sql`to_char(${rfpAnswers.createdAt}, 'Mon')`,
          sql`extract(month from ${rfpAnswers.createdAt})`,
        ),
      db
        .select({
          team: rfpRequirements.ownerTeam,
          reviews: sql<number>`count(${rfpReviews.id})`.mapWith(Number),
        })
        .from(rfpReviews)
        .innerJoin(rfpRequirements, eq(rfpRequirements.id, rfpReviews.requirementId))
        .innerJoin(rfps, eq(rfps.id, rfpRequirements.rfpId))
        .where(eq(rfps.organizationId, orgId))
        .groupBy(rfpRequirements.ownerTeam),
    ]);

    const total = requirementCount[0]?.count ?? 0;
    const risk = riskRows[0] ?? { low: 0, medium: 0, high: 0, critical: 0 };
    const outcomes = outcomeRows[0] ?? { won: 0, lost: 0 };
    const decided = outcomes.won + outcomes.lost;
    const winRate = decided ? Math.round((outcomes.won / decided) * 100) : null;
    const answers = currentAnswers[0] ?? { total: 0, aiAcceptedAsIs: 0 };
    const acceptanceRate = answers.total
      ? Math.round((answers.aiAcceptedAsIs / answers.total) * 100)
      : null;
    const evidenceFreshness = sourceCount[0]?.count
      ? Math.round(((evidenceFreshRows[0]?.fresh ?? 0) / sourceCount[0].count) * 100)
      : null;
    const highRiskRate = total ? Math.round(((risk.high + risk.critical) / total) * 1000) / 10 : 0;

    const sortByMonth = <T extends { monthIdx: number }>(rows: T[]) =>
      [...rows].sort((a, b) => a.monthIdx - b.monthIdx);

    return {
      kpis: [
        {
          id: "k1",
          label: "RFPs received",
          value: String(rfpCount[0]?.count ?? 0),
          delta: 0,
          hint: "All time",
        },
        {
          id: "k2",
          label: "Win rate",
          value: winRate === null ? "No data yet" : `${winRate}%`,
          delta: 0,
          hint: "Based on closed RFPs",
        },
        {
          id: "k4",
          label: "AI draft acceptance",
          value: acceptanceRate === null ? "No data yet" : `${acceptanceRate}%`,
          delta: 0,
          hint: "Current answers left as AI drafts",
        },
        {
          id: "k5",
          label: "Avg. requirements per RFP",
          value: rfpCount[0]?.count ? String(Math.round(total / rfpCount[0].count)) : "0",
          delta: 0,
          hint: "All time",
        },
        {
          id: "k6",
          label: "High-risk requirement rate",
          value: `${highRiskRate}%`,
          delta: 0,
          hint: "Share flagged high or critical",
        },
        { id: "k7", label: "SME review hours", value: "0 hrs", delta: 0, hint: "Not yet tracked" },
        {
          id: "k8",
          label: "Evidence freshness",
          value: evidenceFreshness === null ? "No data yet" : `${evidenceFreshness}%`,
          delta: 0,
          hint: "Sources verified within 90 days",
        },
      ],
      volume: sortByMonth(byMonthReceived).map((r) => ({
        month: r.month,
        received: r.received,
        submitted: 0,
      })),
      winLoss: sortByMonth(byMonthOutcome).map((r) => ({
        month: r.month,
        won: r.won,
        lost: r.lost,
      })),
      riskDistribution: [
        { name: "Low", value: risk.low },
        { name: "Medium", value: risk.medium },
        { name: "High", value: risk.high },
        { name: "Critical", value: risk.critical },
      ],
      acceptance: sortByMonth(byMonthAnswers).map((r) => ({
        month: r.month,
        accepted: r.accepted,
        edited: r.edited,
      })),
      completionTime: [],
      smePerformance: ownerTeamReviews
        .filter((r) => r.team)
        .map((r) => ({ team: r.team, hours: 0, reviews: r.reviews })),
    };
  },
);
