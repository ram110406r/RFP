/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";

import { classifyApplication, matchesApplyQueue } from "./apply-queues";
import type { DashboardTenderCard, TenderSubmissionPackage, TenderSummary } from "./models";

describe("apply queue classification", () => {
  test("READY package in REVIEW is awaiting approval", () => {
    const state = classifyApplication(row({ status: "REVIEW" }), pkg("READY"));

    expect(state.needsApproval).toBe(true);
    expect(state.readyToSubmit).toBe(false);
    expect(matchesApplyQueue("approval", state)).toBe(true);
  });

  test("approved tender and approved package are ready to submit", () => {
    const state = classifyApplication(row({ status: "APPROVED" }), pkg("APPROVED"));

    expect(state.readyToSubmit).toBe(true);
    expect(state.needsApproval).toBe(false);
    expect(matchesApplyQueue("ready", state)).toBe(true);
  });

  test("stale packages and blocking issues are blocked", () => {
    expect(classifyApplication(row({ blockingIssueCount: 0 }), pkg("STALE")).blocked).toBe(true);
    expect(classifyApplication(row({ blockingIssueCount: 2 }), null).blocked).toBe(true);
  });

  test("submitted tenders only match submitted terminal queue", () => {
    const state = classifyApplication(row({ status: "SUBMITTED", pendingReviews: 3, blockingIssueCount: 4 }), pkg("STALE"));

    expect(state.submitted).toBe(true);
    expect(state.blocked).toBe(false);
    expect(state.needsReview).toBe(false);
    expect(matchesApplyQueue("submitted", state)).toBe(true);
  });
});

function row(overrides: Partial<DashboardTenderCard & { status: string }> = {}): DashboardTenderCard {
  return {
    tender: tender(overrides.status ?? "IN_PROGRESS"),
    readiness: 60,
    ready: false,
    issueCount: overrides.issueCount ?? 0,
    blockingIssueCount: overrides.blockingIssueCount ?? 0,
    highestIssue: null,
    pendingReviews: overrides.pendingReviews ?? 0,
    totalReviews: overrides.totalReviews ?? 0,
  };
}

function tender(status: string): TenderSummary {
  return {
    id: "tender-1",
    organizationId: "org-1",
    workspaceId: "workspace-1",
    name: "Buyer",
    title: "Tender",
    referenceNumber: null,
    description: null,
    buyerName: null,
    location: null,
    estimatedValue: null,
    currency: "INR",
    tenderType: "DOCUMENT",
    sourceType: "MANUAL",
    sourceReference: {},
    sourceUrl: null,
    status,
    ownerId: "user-1",
    createdBy: "user-1",
    receivedAt: null,
    dueAt: null,
    timezone: "UTC",
    metadata: {},
    archivedAt: null,
    saved: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function pkg(status: TenderSubmissionPackage["status"]): TenderSubmissionPackage {
  return {
    id: `pkg-${status}`,
    version: 1,
    status,
    contentDigest: "digest",
    generatorVersion: "test",
    failureReason: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:00.000Z",
    artifacts: [],
  };
}
