import { expect, test } from "bun:test";
import { ModelRouter } from "@rfp-os/ai";

import {
  GROUNDED_CLARIFICATION_MODEL,
  GROUNDED_TENDER_BRIEF_MODEL,
} from "../../../infrastructure/ai/ai.constants";
import { GroqAnswerProvider } from "../../../infrastructure/ai/grounded-answer.provider";
import { TenderAiService } from "./tender-ai.service";

const realGroqTest =
  process.env.GROQ_API_KEY && process.env.GROQ_MODEL && process.env.RUN_GROQ_SMOKE_TEST === "1"
    ? test
    : test.skip;

realGroqTest("returns a schema-valid tender brief from real Groq", async () => {
  const router = new ModelRouter();
  router.registerProvider(new GroqAnswerProvider(), [GROUNDED_TENDER_BRIEF_MODEL]);
  const service = new TenderAiService(router);

  const result = await service.getTenderBrief({
    tender: {
      id: "controlled-smoke-tender",
      name: "Controlled RFP",
      title: "Controlled RFP",
      tenderType: "DOCUMENT",
    },
    requirements: [],
    questions: [],
    documents: [{ id: "doc-1", name: "Controlled fixture.pdf", role: "PRIMARY" }],
    dates: [],
    evidence: [],
    missingInformation: ["No requirements were extracted from the controlled fixture."],
  });

  expect(result.overview.length).toBeGreaterThan(0);
  expect(result.questions).toEqual([]);
  expect(result.keyRequirements).toEqual([]);
});

realGroqTest("returns schema-valid clarifications from real Groq", async () => {
  const router = new ModelRouter();
  router.registerProvider(new GroqAnswerProvider(), [GROUNDED_CLARIFICATION_MODEL]);
  const service = new TenderAiService(router);

  const result = await service.generateClarifications({
    tender: {
      id: "controlled-smoke-tender",
      name: "Controlled RFP",
      title: "Controlled RFP",
      tenderType: "DOCUMENT",
    },
    requirement: null,
    evidence: [],
    missingInformation: ["Response deadline"],
  });

  expect(result.readiness).toBe("NEEDS_REVIEW");
  expect(result.missingInformation).toContain("Response deadline");
});
