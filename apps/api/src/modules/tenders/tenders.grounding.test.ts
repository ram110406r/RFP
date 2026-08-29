import { describe, expect, test } from "bun:test";

import { TendersService } from "./tenders.service";
import type { EvidenceRetrievalResult } from "@rfp-os/types";
import type { AuthContext } from "@rfp-os/types";

describe("TendersService grounding boundary", () => {
  test("downgrades partial grounding to review state without approval", async () => {
    const service = buildServiceHarness();
    const result = await service.generateRequirementAnswer(buildAuth(), "tender-1", "req-1");

    expect(result.answer?.status).toBe("IN_REVIEW");
    expect(result.generation.status).toBe("IN_REVIEW");
    expect(result.reason).toContain("Only part of the question is supported");
    expect(result.suggestedAction).toBe("Assign to SME / Knowledge Owner");
    expect((result.generation.metadata as any).generation.groundingStatus).toBe("PARTIALLY_SUPPORTED");
  });

  test("downgrades contradictory grounding to review state without approval", async () => {
    const service = buildServiceHarness({
      grounding: {
        coverage: 0.2,
        supportedClaims: 0,
        unsupportedClaims: 1,
        contradictions: [{ claim: "SCIM support", evidenceIds: ["ev-1"], reason: "Conflicts with the source pack." }],
        missingEvidence: ["SCIM confirmation"],
        risk: "HIGH",
        readiness: "NEEDS_REVIEW",
        warnings: [],
        claims: [],
        metadata: {},
      },
      generatedAnswer: "SCIM and SAML are supported.",
    });

    const result = await service.generateRequirementAnswer(buildAuth(), "tender-1", "req-1");

    expect(result.answer?.status).toBe("IN_REVIEW");
    expect(result.generation.status).toBe("IN_REVIEW");
    expect(result.reason).toContain("not sufficiently grounded");
    expect(result.suggestedAction).toBe("Assign to SME / Knowledge Owner");
    expect((result.generation.metadata as any).generation.groundingStatus).toBe("UNSUPPORTED");
  });
});

function buildServiceHarness(overrides: {
  grounding?: Record<string, unknown>;
  generatedAnswer?: string;
} = {}) {
  const service = new TendersService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  ) as any;

  const candidate: EvidenceRetrievalResult = {
    evidenceId: "ev-1",
    sourceId: "source-1",
    sourceVersion: "v1",
    evidenceType: "KNOWLEDGE",
    title: "Identity policy",
    snippet: "SCIM is supported through the approved identity workflow.",
    relevanceScore: 0.95,
    authorityScore: 0.95,
    freshnessScore: 1,
    freshness: "FRESH",
    authority: "APPROVED_POLICY",
    verifiedAt: "2026-08-27T00:00:00.000Z",
    expiresAt: null,
    ownerId: "owner-1",
    metadata: {},
  };

  const generatedAnswer = overrides.generatedAnswer ?? "SCIM is supported through the approved identity workflow.";
  const grounding =
    overrides.grounding ??
    ({
      coverage: 0.5,
      supportedClaims: 1,
      unsupportedClaims: 1,
      contradictions: [],
      missingEvidence: ["SCIM detail"],
      risk: "MEDIUM",
      readiness: "NEEDS_REVIEW",
      warnings: [],
      claims: [],
      metadata: {},
    } as const);

  Object.assign(service, {
    requireTender: async () => ({
      id: "tender-1",
      organizationId: "org-1",
      workspaceId: "workspace-1",
      name: "Tender One",
      title: "Tender One",
      tenderType: "DOCUMENT",
      sourceType: "DOCUMENT_UPLOAD",
      sourceReference: {},
      sourceUrl: null,
      status: "READY",
      ownerId: "owner-1",
      createdBy: "owner-1",
      receivedAt: new Date("2026-08-27T00:00:00.000Z"),
      dueAt: null,
      timezone: "UTC",
      metadata: {},
      archivedAt: null,
      createdAt: new Date("2026-08-27T00:00:00.000Z"),
      updatedAt: new Date("2026-08-27T00:00:00.000Z"),
    }),
    requireRequirement: async () => ({
      id: "req-1",
      organizationId: "org-1",
      workspaceId: "workspace-1",
      tenderId: "tender-1",
      requirementCode: "REQ-1",
      title: "Provide SCIM support details",
      description: "Describe the capability.",
      requirementType: "SECURITY",
      mandatory: true,
      status: "ASSIGNED",
      sourceReference: {},
      metadata: {},
      createdAt: new Date("2026-08-27T00:00:00.000Z"),
      updatedAt: new Date("2026-08-27T00:00:00.000Z"),
    }),
    requireQuestionForRequirement: async () => ({
      id: "question-1",
      organizationId: "org-1",
      workspaceId: "workspace-1",
      tenderId: "tender-1",
      questionNumber: "1",
      section: "Security",
      questionText: "Does your platform support SCIM?",
      questionType: "LONG_TEXT",
      required: true,
      status: "ASSIGNED",
      sourceReference: {},
      sortOrder: 1,
      metadata: {},
      createdAt: new Date("2026-08-27T00:00:00.000Z"),
      updatedAt: new Date("2026-08-27T00:00:00.000Z"),
    }),
    evidenceRetrieval: {
      retrieveRequirementEvidence: async () => [candidate],
    },
    answerGeneration: {
      generate: async () => ({
        answer: generatedAnswer,
        confidence: 0.84,
        evidenceIds: ["ev-1"],
        risk: "LOW",
        status: "AI_DRAFT",
        metadata: {
          generation: {
            provider: "mock-router",
            model: "mock-model",
            generatedAt: "2026-08-27T00:00:00.000Z",
          },
        },
        evidence: [candidate],
        prompt: "PROMPT",
      }),
    },
    tenderAi: {
      analyzeAnswer: async () => grounding,
    },
    findAnswerForQuestion: async () => null,
    createAnswer: async (_auth: unknown, _tenderId: string, _questionId: string, input: Record<string, unknown>) => ({
      id: "answer-1",
      organizationId: "org-1",
      workspaceId: "workspace-1",
      tenderId: "tender-1",
      questionId: "question-1",
      answerText: input.answerText,
      status: input.status,
      source: input.source,
      confidence: input.confidence,
      createdBy: "owner-1",
      updatedBy: "owner-1",
      metadata: input.metadata ?? {},
      createdAt: new Date("2026-08-27T00:00:00.000Z"),
      updatedAt: new Date("2026-08-27T00:00:00.000Z"),
      versionCount: 1,
      evidenceCount: 1,
      reviewCount: 0,
    }),
    addAnswerEvidence: async () => undefined,
    assertTenderWorkspacePermission: async () => undefined,
    assertPolicyAllows: async () => undefined,
  });

  return service as TendersService;
}

function buildAuth(): AuthContext {
  return {
    organizationId: "org-1",
    userId: "owner-1",
    role: "OWNER",
    permissions: [],
    organizationPermissions: [],
    sessionId: "session-1",
  };
}
