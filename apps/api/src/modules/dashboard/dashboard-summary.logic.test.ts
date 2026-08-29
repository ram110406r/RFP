import { describe, expect, test } from "bun:test";

import {
  buildDashboardSummary,
  mapPipelineStage,
  type DashboardAiActivity,
  type DashboardEvidenceHealth,
  type DashboardKnowledgeHealth,
  type DashboardTenderCard,
} from "./dashboard-summary.logic";

const emptyKnowledge: DashboardKnowledgeHealth = {
  counts: { total: 0, draft: 0, active: 0, archived: 0, stale: 0 },
  items: [],
  attention: [],
};

describe("dashboard summary logic", () => {
  test("maps tender statuses into pipeline stages", () => {
    expect(mapPipelineStage("DRAFT")).toBe("intake");
    expect(mapPipelineStage("IN_PROGRESS")).toBe("answering");
    expect(mapPipelineStage("REVIEW")).toBe("review");
    expect(mapPipelineStage("APPROVED")).toBe("approval");
    expect(mapPipelineStage("READY")).toBe("ready");
    expect(mapPipelineStage("SUBMITTED")).toBe("submitted");
  });

  test("returns an empty summary when no tenders are present", () => {
    const summary = buildDashboardSummary({
      generatedAt: "2026-08-26T00:00:00.000Z",
      pageSize: 6,
      tenders: [],
      knowledge: emptyKnowledge,
      aiActivity: null,
      evidenceHealth: null,
      errors: [],
    });

    expect(summary.metrics.activeRfps).toBe(0);
    expect(summary.metrics.awaitingReview).toBe(0);
    expect(summary.pipeline.every((bucket) => bucket.count === 0)).toBe(true);
    expect(summary.activeTenders).toHaveLength(0);
    expect(summary.knowledgeHealth.counts.total).toBe(0);
    expect(summary.reviewQueue.count).toBe(0);
  });

  test("keeps active tender and review metrics aligned", () => {
    const tender: DashboardTenderCard = {
      tender: {
        id: "tender-1",
        name: "Customer Data Platform RFP",
        title: "Customer Data Platform RFP",
        referenceNumber: "RFP-001",
        status: "REVIEW",
        dueAt: "2026-09-10T00:00:00.000Z",
      },
      readiness: 33,
      ready: false,
      issueCount: 3,
      blockingIssueCount: 1,
      highestIssue: {
        id: "issue-1",
        severity: "CRITICAL",
        title: "Missing privacy SLA",
        detail: "A required answer has not been completed.",
        recommendation: "Resolve the blocker before submission.",
        blocking: true,
      },
      pendingReviews: 2,
      totalReviews: 3,
    };
    const aiActivity: DashboardAiActivity = {
      totalAnswers: 5,
      aiGenerated: 2,
      imported: 1,
      manual: 2,
      inReview: 1,
      approved: 1,
      final: 0,
      aiAccepted: 1,
      aiAcceptanceRate: 50,
    };
    const evidenceHealth: DashboardEvidenceHealth = {
      total: 4,
      answerCount: 5,
      answersWithEvidence: 3,
      answersWithoutEvidence: 2,
      fresh: 2,
      aging: 1,
      stale: 1,
      expired: 0,
      unknown: 0,
      coverageRate: 60,
      freshnessRate: 75,
    };

    const summary = buildDashboardSummary({
      generatedAt: "2026-08-26T00:00:00.000Z",
      pageSize: 6,
      tenders: [tender],
      knowledge: {
        counts: { total: 1, draft: 1, active: 0, archived: 0, stale: 0 },
        items: [
          {
            id: "knowledge-1",
            name: "SOC 2 Type II Report",
            type: "Audit Report",
            category: "Security",
            version: "1.0",
            authority: "High",
            status: "DRAFT",
            ownerId: "owner-1",
            lastVerified: null,
            lastUpdated: "2026-08-25",
            expiresAt: null,
            summary: "Draft policy awaiting approval.",
            metadata: {},
            createdAt: "2026-08-25T00:00:00.000Z",
            updatedAt: "2026-08-25T00:00:00.000Z",
          },
        ],
        attention: [],
      },
      aiActivity,
      evidenceHealth,
      errors: [{ section: "knowledge", message: "Partial failure" }],
    });

    expect(summary.metrics.activeRfps).toBe(1);
    expect(summary.metrics.highRiskItems).toBe(1);
    expect(summary.metrics.awaitingReview).toBe(2);
    expect(summary.metrics.submissionReady).toBe(0);
    expect(summary.pipeline.find((bucket) => bucket.id === "review")?.count).toBe(1);
    expect(summary.reviewQueue.count).toBe(1);
    expect(summary.activeTenders[0]?.tender.id).toBe("tender-1");
    expect(summary.attention[0]?.severity).toBe("CRITICAL");
    expect(summary.aiActivity?.aiAcceptanceRate).toBe(50);
    expect(summary.evidenceHealth?.coverageRate).toBe(60);
    expect(summary.errors).toHaveLength(1);
  });
});
