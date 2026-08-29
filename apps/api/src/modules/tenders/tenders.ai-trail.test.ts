import { describe, expect, test } from "bun:test";

import { TendersService } from "./tenders.service";

describe("TendersService AI trail", () => {
  function createService() {
    const auditEntries: any[] = [];
    const activityEntries: any[] = [];
    const audit = {
      record: async (entry: any) => {
        auditEntries.push(entry);
      },
    };
    const activity = {
      record: async (entry: any) => {
        activityEntries.push(entry);
      },
    };

    const service = new TendersService(
      {} as any,
      {} as any,
      {} as any,
      audit as any,
      activity as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    return { service, auditEntries, activityEntries };
  }

  test("records AI answer generation metadata on answer writes", async () => {
    const { service, auditEntries, activityEntries } = createService();
    const auth = { organizationId: "org-1", userId: "user-1" } as any;
    const tender = {
      id: "tender-1",
      workspaceId: "workspace-1",
      title: "Tender One",
      name: "Tender One",
      tenderType: "ONLINE",
    } as any;
    const question = {
      id: "question-1",
      questionText: "Can you support SCIM?",
    } as any;
    const previous = {
      id: "answer-0",
      organizationId: "org-1",
      workspaceId: "workspace-1",
      tenderId: "tender-1",
      questionId: "question-1",
      answerText: "Draft answer",
      status: "DRAFT",
      source: "MANUAL",
      confidence: "0.4",
      createdBy: "user-1",
      updatedBy: "user-1",
      metadata: {},
      createdAt: new Date("2026-08-26T00:00:00.000Z"),
      updatedAt: new Date("2026-08-26T00:00:00.000Z"),
    } as any;
    const current = {
      ...previous,
      id: "answer-1",
      answerText: "Generated answer",
      status: "GENERATED",
      source: "AI_GENERATED",
      confidence: "0.9",
      metadata: {
        generation: {
          provider: "mock-router",
          model: "mock-model",
          generatedAt: "2026-08-26T00:00:00.000Z",
          confidence: 0.9,
          evidenceIds: ["ev-1"],
        },
        ai: {
          operation: "answer.generated",
          generationId: "gen-1",
          provider: "mock-router",
          model: "mock-model",
        },
      },
      updatedAt: new Date("2026-08-26T00:01:00.000Z"),
    } as any;
    const version = {
      id: "version-1",
      organizationId: "org-1",
      workspaceId: "workspace-1",
      tenderId: "tender-1",
      answerId: "answer-1",
      versionNumber: 2,
      content: "Generated answer",
      source: "AI_GENERATED",
      createdBy: "user-1",
      metadata: current.metadata,
      createdAt: new Date("2026-08-26T00:01:00.000Z"),
    } as any;

    await (service as any).recordAiAnswerMutation(
      {} as any,
      auth,
      tender,
      question,
      previous,
      current,
      { metadata: current.metadata },
      version,
    );

    expect(auditEntries).toHaveLength(1);
    expect(activityEntries).toHaveLength(1);
    expect(auditEntries[0].action).toBe("TENDER_AI_ANSWER_GENERATED");
    expect(auditEntries[0].metadata.operation).toBe("answer.generated");
    expect(auditEntries[0].metadata.versionId).toBe("version-1");
    expect(activityEntries[0].action).toBe("ai.answer.generated");
    expect(activityEntries[0].actorType).toBe("ai_agent");
    expect(activityEntries[0].metadata.answerId).toBe("answer-1");
  });

  test("records AI answer improvement metadata on answer writes", async () => {
    const { service, auditEntries, activityEntries } = createService();
    const auth = { organizationId: "org-1", userId: "user-1" } as any;
    const tender = {
      id: "tender-1",
      workspaceId: "workspace-1",
      title: "Tender One",
      name: "Tender One",
      tenderType: "ONLINE",
    } as any;
    const current = {
      id: "answer-2",
      organizationId: "org-1",
      workspaceId: "workspace-1",
      tenderId: "tender-1",
      questionId: "question-1",
      answerText: "Improved answer",
      status: "IN_REVIEW",
      source: "AI_GENERATED",
      confidence: "0.7",
      createdBy: "user-1",
      updatedBy: "user-1",
      metadata: {
        improvement: { provider: "mock-router", model: "mock-model" },
        changes: ["Refined wording"],
        ai: {
          operation: "answer.improved",
          generationId: "gen-2",
          provider: "mock-router",
          model: "mock-model",
        },
      },
      createdAt: new Date("2026-08-26T00:01:00.000Z"),
      updatedAt: new Date("2026-08-26T00:02:00.000Z"),
    } as any;
    const version = {
      id: "version-2",
      organizationId: "org-1",
      workspaceId: "workspace-1",
      tenderId: "tender-1",
      answerId: "answer-2",
      versionNumber: 3,
      content: "Improved answer",
      source: "AI_GENERATED",
      createdBy: "user-1",
      metadata: current.metadata,
      createdAt: new Date("2026-08-26T00:02:00.000Z"),
    } as any;

    await (service as any).recordAiAnswerMutation(
      {} as any,
      auth,
      tender,
      null,
      null,
      current,
      { metadata: current.metadata },
      version,
    );

    expect(auditEntries).toHaveLength(1);
    expect(activityEntries).toHaveLength(1);
    expect(auditEntries[0].action).toBe("TENDER_AI_ANSWER_IMPROVED");
    expect(auditEntries[0].metadata.operation).toBe("answer.improved");
    expect(activityEntries[0].action).toBe("ai.answer.improved");
    expect(activityEntries[0].summary).toContain("Improved answer");
  });

  test("records tender-level AI activity and audit for read-only analysis", async () => {
    const { service, auditEntries, activityEntries } = createService();
    const auth = { organizationId: "org-1", userId: "user-1" } as any;

    await (service as any).recordAiAuditAndActivity(auth, {
      tenderId: "tender-1",
      workspaceId: "workspace-1",
      entityType: "tender",
      entityId: "tender-1",
      action: "TENDER_AI_TENDER_BRIEF_GENERATED",
      activityAction: "ai.tender.brief.generated",
      label: "Generated brief for tender Tender One",
      summary: "Generated tender brief for Tender One",
      metadata: {
        brief: { overview: "Overview" },
        sectionCounts: { questions: 1, requirements: 2, sources: 3 },
      },
    });

    expect(auditEntries).toHaveLength(1);
    expect(activityEntries).toHaveLength(1);
    expect(auditEntries[0].actorType).toBe("ai_agent");
    expect(auditEntries[0].entityType).toBe("tender");
    expect(activityEntries[0].action).toBe("ai.tender.brief.generated");
    expect(activityEntries[0].metadata.tenderId).toBe("tender-1");
  });
});
