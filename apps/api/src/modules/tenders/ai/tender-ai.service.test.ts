import { describe, expect, test } from "bun:test";
import { ModelRouter } from "@rfp-os/ai";

import { TenderAiService } from "./tender-ai.service";
import { buildPromptRequest } from "./tender-ai.prompts";
import { TenderAiUnavailableError } from "../domain/tender.errors";

describe("Tender AI prompts", () => {
  test("wraps the prompt name and JSON context in a stable request shape", () => {
    const request = buildPromptRequest("TenderAnswerPrompt", { hello: "world" });
    expect(request.model).toBe("tendyy-grounded-draft-v1");
    expect(request.messages[0]?.content).toContain("PROMPT: TenderAnswerPrompt");
    expect(request.messages[1]?.content).toContain('"hello":"world"');
  });

  test("includes the exact tender brief response shape in the model request", () => {
    const request = buildPromptRequest("TenderBriefPrompt", { tender: { id: "t-1" } });
    const systemPrompt = request.messages[0]?.content ?? "";

    expect(systemPrompt).toContain("OUTPUT_JSON_SHAPE:");
    expect(systemPrompt).toContain('"overview":"string"');
    expect(systemPrompt).toContain('"questions":[{"id":"string","question":"string","group":"string"}]');
    expect(systemPrompt).toContain("Use only facts present in CONTEXT_JSON");
  });

  test("includes exact requirement and clarification response shapes", () => {
    const requirementPrompt = buildPromptRequest("RequirementAnalysisPrompt", {});
    const clarificationPrompt = buildPromptRequest("ClarificationPrompt", {});

    expect(requirementPrompt.messages[0]?.content).toContain(
      '"readiness":"READY|NEEDS_REVIEW|HIGH_RISK|INSUFFICIENT_EVIDENCE"',
    );
    expect(requirementPrompt.messages[0]?.content).toContain('"risk":"LOW|MEDIUM|HIGH|CRITICAL"');
    expect(clarificationPrompt.messages[0]?.content).toContain(
      '"suggestions":[{"question":"string","reason":"string"}]',
    );
  });
});

describe("TenderAiService", () => {
  test("returns a service-unavailable error when the provider is not configured", async () => {
    const router = {
      complete: async () => {
        throw new Error("GROQ_API_KEY is required to call the real GroqCloud provider.");
      },
    } as unknown as Pick<ModelRouter, "complete">;

    const service = new TenderAiService(router as ModelRouter);
    const request = service.getTenderBrief({
      tender: { id: "t-1", name: "Tender", title: "Tender", tenderType: "DOCUMENT" },
      requirements: [],
      questions: [],
      documents: [],
      dates: [],
      evidence: [],
      missingInformation: [],
    });

    await expect(request).rejects.toBeInstanceOf(TenderAiUnavailableError);
    await request.catch((error: TenderAiUnavailableError) => {
      expect(error.getStatus()).toBe(503);
      expect(error.getResponse()).toMatchObject({ code: "TENDER_AI_NOT_CONFIGURED" });
    });
  });

  test("returns a service-unavailable error for invalid provider output", async () => {
    const router = {
      complete: async () => ({ content: "not-json", model: "test-model" }),
    } as unknown as Pick<ModelRouter, "complete">;

    const service = new TenderAiService(router as ModelRouter);
    const request = service.generateClarifications({
      tender: { id: "t-1", name: "Tender", title: "Tender", tenderType: "DOCUMENT" },
      requirement: null,
      evidence: [],
      missingInformation: [],
    });

    await request.catch((error: TenderAiUnavailableError) => {
      expect(error).toBeInstanceOf(TenderAiUnavailableError);
      expect(error.getStatus()).toBe(503);
      expect(error.getResponse()).toMatchObject({ code: "TENDER_AI_UNAVAILABLE" });
    });
  });

  test("parses clarifications and strips unrecognized model fields", async () => {
    const router = {
      complete: async () => ({
        content: JSON.stringify({
          readiness: "NEEDS_REVIEW",
          risk: "MEDIUM",
          suggestions: [{ question: "Confirm the response deadline.", reason: "No deadline was supplied." }],
          missingInformation: ["Response deadline"],
          metadata: { source: "context" },
          clarificationSummary: "This extra model field is ignored.",
        }),
        model: "tendyy-clarification-v1",
      }),
    } as unknown as Pick<ModelRouter, "complete">;

    const service = new TenderAiService(router as ModelRouter);
    const result = await service.generateClarifications({
      tender: { id: "t-1", name: "Tender", title: "Tender", tenderType: "DOCUMENT" },
      requirement: null,
      evidence: [],
      missingInformation: ["Response deadline"],
    });

    expect(result.readiness).toBe("NEEDS_REVIEW");
    expect(result.suggestions[0]?.question).toBe("Confirm the response deadline.");
    expect(result).not.toHaveProperty("clarificationSummary");
  });

  test("parses a tender brief and strips unrecognized model fields", async () => {
    const router = {
      complete: async () => ({
        content: JSON.stringify({
          overview: "A concise, grounded tender overview.",
          keyRequirements: [],
          questions: [],
          documents: [],
          dates: [],
          risks: [],
          missingInformation: ["No requirements were extracted."],
          clarifications: [],
          metadata: { source: "context" },
          summary: "This extra model field is ignored.",
        }),
        model: "tendyy-tender-brief-v1",
      }),
    } as unknown as Pick<ModelRouter, "complete">;

    const service = new TenderAiService(router as ModelRouter);
    const brief = await service.getTenderBrief({
      tender: { id: "t-1", name: "Tender", title: "Tender", tenderType: "DOCUMENT" },
      requirements: [],
      questions: [],
      documents: [],
      dates: [],
      evidence: [],
      missingInformation: ["No requirements were extracted."],
    });

    expect(brief.overview).toBe("A concise, grounded tender overview.");
    expect(brief.missingInformation).toEqual(["No requirements were extracted."]);
    expect(brief).not.toHaveProperty("summary");
  });

  test("rejects an empty tender brief instead of returning a fake result", async () => {
    const router = {
      complete: async () => ({ content: JSON.stringify({ overview: "" }), model: "tendyy-tender-brief-v1" }),
    } as unknown as Pick<ModelRouter, "complete">;

    const service = new TenderAiService(router as ModelRouter);
    const request = service.getTenderBrief({
      tender: { id: "t-1", name: "Tender", title: "Tender", tenderType: "DOCUMENT" },
      requirements: [],
      questions: [],
      documents: [],
      dates: [],
      evidence: [],
      missingInformation: [],
    });

    await expect(request).rejects.toThrow();
  });

  test("parses structured improvement and analysis results through the shared router", async () => {
    const router = {
      complete: async (request: { model: string }) => {
        if (request.model === "tendyy-grounded-improve-v1") {
          return {
            content: JSON.stringify({
              answer: "Improved answer.",
              changes: ["Refined wording."],
              evidenceIds: ["ev-1"],
              risk: "LOW",
              status: "AI_DRAFT",
              warnings: [],
              metadata: { model: request.model },
            }),
            model: request.model,
          };
        }
        return {
          content: JSON.stringify({
            coverage: 1,
            supportedClaims: 1,
            unsupportedClaims: 0,
            contradictions: [],
            missingEvidence: [],
            risk: "LOW",
            readiness: "READY",
            warnings: [],
            claims: [{ claim: "Claim", evidenceIds: ["ev-1"], supported: true, reason: "Supported." }],
            metadata: { model: request.model },
          }),
          model: request.model,
        };
      },
    } as unknown as Pick<ModelRouter, "complete">;

    const service = new TenderAiService(router as ModelRouter);
    const improved = await service.improveAnswer(
      {
        tender: { id: "t-1", name: "Tender", title: "Tender", tenderType: "ONLINE" },
        requirement: {
          id: "r-1",
          title: "Requirement",
          description: "Requirement",
          requirementType: "SECURITY",
          mandatory: true,
        },
        question: {
          id: "q-1",
          questionText: "Question",
          questionType: "TEXT",
          required: true,
          status: "UNASSIGNED",
        },
        answer: {
          id: "a-1",
          answerText: "Draft answer.",
          status: "DRAFT",
          source: "MANUAL",
          confidence: 0.5,
          metadata: {},
        },
        evidence: [
          {
            evidenceId: "ev-1",
            sourceId: "source-1",
            sourceVersion: "1.0",
            evidenceType: "KNOWLEDGE",
            title: "Approved claim",
            content: "Claim.",
            freshness: "FRESH",
            relevance: 0.95,
            authority: 0.95,
            verifiedAt: "2026-08-27T00:00:00.000Z",
            sourceTitle: "Approved claim",
            sourceAuthority: "APPROVED_POLICY",
          },
        ],
      },
      "formal",
    );
    expect(improved.answer).toBe("Improved answer.");
    expect(improved.changes).toContain("Refined wording.");

    const analysis = await service.analyzeAnswer({
      tender: { id: "t-1", name: "Tender", title: "Tender", tenderType: "ONLINE" },
      requirement: {
        id: "r-1",
        title: "Requirement",
        description: "Requirement",
        requirementType: "SECURITY",
        mandatory: true,
      },
      question: {
        id: "q-1",
        questionText: "Question",
        questionType: "TEXT",
        required: true,
        status: "UNASSIGNED",
      },
      answer: {
        id: "a-1",
        answerText: "Claim.",
        status: "GENERATED",
        source: "AI_GENERATED",
        confidence: 0.7,
        metadata: {},
      },
      evidence: [
        {
          evidenceId: "ev-1",
          sourceId: "source-1",
          sourceVersion: "1.0",
          evidenceType: "KNOWLEDGE",
          title: "Approved claim",
          content: "Claim.",
          freshness: "FRESH",
          relevance: 0.95,
          authority: 0.95,
          verifiedAt: "2026-08-27T00:00:00.000Z",
          sourceTitle: "Approved claim",
          sourceAuthority: "APPROVED_POLICY",
        },
      ],
    });
    expect(analysis.readiness).toBe("READY");
    expect(analysis.coverage).toBe(1);
  });

  test("falls back to deterministic grounding when the model returns plain text", async () => {
    const router = {
      complete: async () => ({
        content: "SCIM is supported through the approved identity workflow.",
        model: "tendyy-grounded-analysis-v1",
      }),
    } as unknown as Pick<ModelRouter, "complete">;

    const service = new TenderAiService(router as ModelRouter);
    const analysis = await service.analyzeAnswer({
      tender: { id: "t-1", name: "Tender", title: "Tender", tenderType: "ONLINE" },
      requirement: {
        id: "r-1",
        title: "Requirement",
        description: "Requirement",
        requirementType: "SECURITY",
        mandatory: true,
      },
      question: {
        id: "q-1",
        questionText: "Question",
        questionType: "TEXT",
        required: true,
        status: "UNASSIGNED",
      },
      answer: {
        id: "a-1",
        answerText: "SCIM is supported through the approved identity workflow.",
        status: "GENERATED",
        source: "AI_GENERATED",
        confidence: 0.7,
        metadata: {},
      },
      evidence: [
        {
          evidenceId: "ev-1",
          sourceId: "source-1",
          sourceVersion: "1.0",
          evidenceType: "KNOWLEDGE",
          title: "Identity policy",
          content: "SCIM support is approved through the identity workflow.",
          freshness: "FRESH",
          relevance: 0.95,
          authority: 0.95,
          verifiedAt: "2026-08-27T00:00:00.000Z",
          sourceTitle: "Identity policy",
          sourceAuthority: "APPROVED_POLICY",
        },
      ],
    });

    expect(analysis.coverage).toBe(1);
    expect(analysis.supportedClaims).toBe(1);
    expect(analysis.unsupportedClaims).toBe(0);
    expect(analysis.readiness).toBe("READY");
    expect(analysis.metadata).toMatchObject({ fallback: true });
  });
});
