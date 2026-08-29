import { describe, expect, test } from "bun:test";
import { ModelRouter } from "@rfp-os/ai";

import { AnswerGenerationService } from "./answer-generation.service";
import type { AnswerGenerationContext } from "./answer-generation.logic";

describe("AnswerGenerationService", () => {
  test("short-circuits when no evidence is available", async () => {
    let called = false;
    const router = {
      complete: async () => {
        called = true;
        throw new Error("should not be called");
      },
      embed: async () => {
        throw new Error("unused");
      },
    } as unknown as ModelRouter;

    const service = new AnswerGenerationService(router);
    const result = await service.generate(buildContext([]));

    expect(called).toBe(false);
    expect(result.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.answer).toBeNull();
    expect(result.evidenceIds).toEqual([]);
    expect(result.evidenceState).toBe("NO_EVIDENCE");
    expect((result.metadata as { generation?: { evidenceState?: string } }).generation?.evidenceState).toBe("NO_EVIDENCE");
  });

  test("sends authoritative evidence details into the grounded prompt and metadata", async () => {
    let requestContent = "";
    const router = {
      complete: async (request: { messages: Array<{ content: string }> }) => {
        requestContent = request.messages.at(-1)?.content ?? "";
        return {
          content: JSON.stringify({
            answer: "Draft answer",
            confidence: 0.9,
            evidenceIds: ["evidence-a"],
            risk: "LOW",
            status: "AI_DRAFT",
            metadata: {},
          }),
          model: "tendyy-grounded-draft-v1",
        };
      },
      embed: async () => {
        throw new Error("unused");
      },
    } as unknown as ModelRouter;

    const service = new AnswerGenerationService(router);
    const result = await service.generate(
      buildContext([
        {
          ...buildEvidence("evidence-a"),
          sourceTitle: "Identity policy",
          verifiedAt: "2026-08-27T00:00:00.000Z",
        },
      ]),
    );

    expect(requestContent).toContain("AUTHORITATIVE EVIDENCE:");
    expect(requestContent).toContain('"evidenceId":"evidence-a"');
    expect(requestContent).toContain('"sourceTitle":"Identity policy"');
    expect(requestContent).toContain('"sourceAuthority":"APPROVED_POLICY"');
    expect(requestContent).toContain('"authority":0.95');
    expect(requestContent).toContain('"verifiedAt":"2026-08-27T00:00:00.000Z"');
    expect(requestContent).toContain("INSTRUCTIONS:");
    expect(requestContent).toContain("Answer using only the supplied evidence.");
    expect(((result.metadata as any).generation?.selectedEvidence?.[0] ?? {})).toMatchObject({
      evidenceId: "evidence-a",
      sourceId: "source-a",
      sourceTitle: "Identity policy",
      sourceAuthority: "APPROVED_POLICY",
      sourceVersion: "1.0",
    });
  });

  test("rejects model evidence ids that were not selected", async () => {
    const router = {
      complete: async () => ({
        content: JSON.stringify({
          answer: "Draft answer",
          confidence: 0.9,
          evidenceIds: ["fake-id"],
          risk: "LOW",
          status: "AI_DRAFT",
          metadata: {},
        }),
        model: "tendyy-grounded-draft-v1",
      }),
      embed: async () => {
        throw new Error("unused");
      },
    } as unknown as ModelRouter;

    const service = new AnswerGenerationService(router);
    await expect(service.generate(buildContext([buildEvidence("evidence-a")]))).rejects.toThrow(
      /unsupported evidence ids/i,
    );
  });
});

function buildContext(evidence: AnswerGenerationContext["evidence"]): AnswerGenerationContext {
  return {
    tender: {
      id: "tender-a",
      name: "Tender A",
      title: "Tender A",
      tenderType: "DOCUMENT",
    },
    requirement: {
      requirementCode: "REQ-1",
      title: "Provide SCIM support details",
      description: "Describe the capability.",
      requirementType: "SECURITY",
      mandatory: true,
    },
    question: {
      id: "question-a",
      questionText: "Does your platform support SCIM?",
      questionType: "LONG_TEXT",
      required: true,
      status: "ASSIGNED",
      sortOrder: 1,
    },
    evidence,
  };
}

function buildEvidence(evidenceId: string) {
  return {
    evidenceId,
    sourceId: "source-a",
    sourceVersion: "1.0",
    evidenceType: "KNOWLEDGE",
    title: "Identity policy",
    content: "SCIM support is approved.",
    freshness: "FRESH",
    relevance: 0.9,
    authority: 0.95,
    sourceAuthority: "APPROVED_POLICY",
  };
}
