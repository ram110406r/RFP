import { describe, expect, test } from "bun:test";

import {
  buildPipelineSummary,
  buildDashboardSummary,
  isActivePipelineStatus,
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
    expect(mapPipelineStage("INTAKE")).toBe("intake");
    expect(mapPipelineStage("PROCESSING")).toBe("intake");
    expect(mapPipelineStage("IN_PROGRESS")).toBe("answering");
    expect(mapPipelineStage("REVIEW")).toBe("review");
    expect(mapPipelineStage("APPROVED")).toBe("approval");
    expect(mapPipelineStage("READY")).toBe("ready");
    expect(mapPipelineStage("SUBMITTED")).toBe("submitted");
    expect(mapPipelineStage("CLOSED")).toBe("submitted");
  });

  test("identifies statuses that belong in the active pipeline", () => {
    expect(isActivePipelineStatus("DRAFT")).toBe(true);
    expect(isActivePipelineStatus("SUBMITTED")).toBe(true);
    expect(isActivePipelineStatus("CANCELLED")).toBe(false);
    expect(isActivePipelineStatus("ARCHIVED")).toBe(false);
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
        ownerId: "owner-1",
        dueAt: "2026-09-10T00:00:00.000Z",
      },
      owner: { id: "owner-1", name: "Owner One", email: "owner@example.invalid" },
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
      latestPackage: {
        id: "package-1",
        version: 2,
        status: "READY",
        failureReason: null,
        createdAt: "2026-08-26T00:00:00.000Z",
        completedAt: "2026-08-26T00:01:00.000Z",
      },
      latestSubmission: null,
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
    expect(summary.activeTenders[0]?.owner?.name).toBe("Owner One");
    expect(summary.activeTenders[0]?.latestPackage?.status).toBe("READY");
    expect(summary.attention[0]?.severity).toBe("CRITICAL");
    expect(summary.aiActivity?.aiAcceptanceRate).toBe(50);
    expect(summary.evidenceHealth?.coverageRate).toBe(60);
    expect(summary.errors).toHaveLength(1);
  });

  test("builds pipeline payload from the full item set", () => {
    const items = Array.from({ length: 3 }, (_, index) => ({
      tender: {
        id: `tender-${index + 1}`,
        name: `Authority ${index + 1}`,
        title: `Tender ${index + 1}`,
        referenceNumber: `RFP-${index + 1}`,
        status: index === 0 ? "IN_PROGRESS" : "REVIEW",
        ownerId: "owner-1",
        dueAt: null,
      },
      owner: { id: "owner-1", name: "Owner One", email: "owner@example.invalid" },
      readiness: 80,
      ready: true,
      issueCount: 0,
      blockingIssueCount: 0,
      highestIssue: null,
      pendingReviews: 0,
      totalReviews: 0,
      pipelineStageId: index === 0 ? "answering" as const : "review" as const,
      availableTransitions: [{ to: "REVIEW", label: "Review", description: "Send to review." }],
    }));

    const payload = buildPipelineSummary({
      generatedAt: "2026-08-26T00:00:00.000Z",
      pageSize: 1,
      tenders: items,
      items,
      knowledge: emptyKnowledge,
      aiActivity: null,
      evidenceHealth: null,
      errors: [],
    });

    expect(payload.items).toHaveLength(3);
    expect(payload.metrics.activeRfps).toBe(3);
    expect(payload.stages.find((stage) => stage.id === "answering")?.count).toBe(1);
    expect(payload.stages.find((stage) => stage.id === "review")?.count).toBe(2);
    expect(payload.items[0]?.owner?.name).toBe("Owner One");
    expect(payload.items[0]?.availableTransitions[0]?.label).toBe("Review");
    expect(payload).not.toHaveProperty("total");
    expect(payload).not.toHaveProperty("page");
    expect(payload).not.toHaveProperty("pageSize");
  });

  test("pages pipeline items while stages and metrics cover the full set", () => {
    const items = Array.from({ length: 5 }, (_, index) => ({
      tender: {
        id: `tender-${index + 1}`,
        name: `Authority ${index + 1}`,
        title: `Tender ${index + 1}`,
        referenceNumber: `RFP-${index + 1}`,
        status: index < 2 ? "IN_PROGRESS" : "REVIEW",
        ownerId: null,
        dueAt: null,
      },
      readiness: 50,
      ready: false,
      issueCount: 0,
      blockingIssueCount: 0,
      highestIssue: null,
      pendingReviews: 0,
      totalReviews: 0,
      pipelineStageId: index < 2 ? ("answering" as const) : ("review" as const),
      availableTransitions: [],
    }));
    const build = (pagination: { page?: number; pageSize?: number }) =>
      buildPipelineSummary({
        generatedAt: "2026-08-26T00:00:00.000Z",
        pageSize: items.length,
        tenders: items,
        items,
        pagination,
        knowledge: emptyKnowledge,
        aiActivity: null,
        evidenceHealth: null,
        errors: [],
      });

    const second = build({ page: 2, pageSize: 2 });
    expect(second.items.map((item) => item.tender.id)).toEqual(["tender-3", "tender-4"]);
    expect(second.total).toBe(5);
    expect(second.page).toBe(2);
    expect(second.pageSize).toBe(2);
    expect(second.metrics.activeRfps).toBe(5);
    expect(second.stages.find((stage) => stage.id === "answering")?.count).toBe(2);
    expect(second.stages.find((stage) => stage.id === "review")?.count).toBe(3);

    const firstByDefault = build({ pageSize: 2 });
    expect(firstByDefault.page).toBe(1);
    expect(firstByDefault.items.map((item) => item.tender.id)).toEqual(["tender-1", "tender-2"]);

    const pastEnd = build({ page: 4, pageSize: 2 });
    expect(pastEnd.items).toEqual([]);
    expect(pastEnd.total).toBe(5);

    const unpaged = build({ page: 2 });
    expect(unpaged.items).toHaveLength(5);
    expect(unpaged.total).toBeUndefined();
  });
});
