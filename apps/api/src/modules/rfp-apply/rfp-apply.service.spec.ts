import { describe, expect, it } from "bun:test";

import type { AuthContext } from "@rfp-os/types";

import { RfpApplyService } from "./rfp-apply.service";

const auth = { organizationId: "org-1", userId: "user-1" } as AuthContext;

function overview(status = "DRAFT") {
  return {
    tender: { id: "tender-1", status },
    counts: { questions: 2, requirements: 2, answers: 2, sources: 1, reviews: 2 },
    validation: {
      tenderId: "tender-1",
      latestRun: { id: "validation-1" },
      current: { score: 100, ready: true, categories: [], issues: [] },
    },
    sections: [],
  };
}

describe("RfpApplyService", () => {
  it("derives progress from the existing tender overview", async () => {
    const tenders = {
      getWorkspaceOverview: async () => overview(),
    };
    const service = new RfpApplyService(tenders as never);

    await expect(service.getProgress(auth, "tender-1")).resolves.toEqual({
      tenderId: "tender-1",
      status: "DRAFT",
      phases: {
        intake: { status: "COMPLETE", count: 1 },
        analysis: { status: "READY", count: 2 },
        response: { status: "COMPLETE", count: 2 },
        review: { status: "COMPLETE", count: 2 },
        validation: { status: "COMPLETE", score: 100, ready: true, issueCount: 0 },
        approval: { status: "PENDING" },
        submission: { status: "PENDING" },
      },
    });
  });

  it("runs full preparation in order and leaves approval explicit", async () => {
    const calls: string[] = [];
    const tenders = {
      analyzeTender: async () => {
        calls.push("analyze");
        return { analyzed: true };
      },
      listRequirements: async () => ({ items: [{ id: "requirement-1" }] }),
      generateRequirementAnswer: async () => {
        calls.push("generate");
        return { generated: true };
      },
      runValidation: async () => {
        calls.push("validate");
        return { ready: true };
      },
      getWorkspaceOverview: async () => overview(),
    };
    const service = new RfpApplyService(tenders as never);

    const result = await service.run(auth, "tender-1", { phase: "FULL", limit: 10 });

    expect(calls).toEqual(["analyze", "generate", "validate"]);
    expect(result.nextAction).toBe("REVIEW_THEN_USE_TENDER_APPROVE_ENDPOINT");
  });

  it("returns item-level generation failures without hiding successful items", async () => {
    const tenders = {
      listRequirements: async () => ({ items: [{ id: "requirement-1" }, { id: "requirement-2" }] }),
      generateRequirementAnswer: async (_auth: AuthContext, _tenderId: string, id: string) => {
        if (id === "requirement-2") throw new Error("provider unavailable");
        return { generated: true };
      },
      getWorkspaceOverview: async () => overview(),
    };
    const service = new RfpApplyService(tenders as never);

    const result = await service.run(auth, "tender-1", { phase: "GENERATE", limit: 10 });

    expect(result.generated).toEqual([
      { requirementId: "requirement-1", result: { generated: true } },
      { requirementId: "requirement-2", error: "provider unavailable" },
    ]);
  });
});
