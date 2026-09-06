import { Injectable, Logger } from "@nestjs/common";
import { ModelRouter } from "@rfp-os/ai";
import type {
  AnswerAnalysisResult,
  AnswerGenerationEvidenceSummary,
  AnswerImprovementResult,
  ClarificationResult,
  RequirementAnalysisResult,
  TenderBriefResult,
} from "@rfp-os/types";
import { z } from "zod";

import { buildPromptRequest } from "./tender-ai.prompts";
import { TenderAiUnavailableError } from "../domain/tender.errors";

export type TenderAiAnswerContext = {
  tender: {
    id: string;
    name: string;
    title: string;
    tenderType: string;
  };
  requirement: {
    id: string;
    requirementCode?: string | null;
    title: string;
    description: string;
    requirementType: string;
    mandatory: boolean;
  };
  question: {
    id: string;
    questionNumber?: string | null;
    section?: string | null;
    questionText: string;
    questionType: string;
    required: boolean;
    status: string;
  };
  answer?: {
    id: string;
    answerText: string;
    status: string;
    source: string;
    confidence: number;
    metadata: Record<string, unknown>;
  } | null;
  evidence: AnswerGenerationEvidenceSummary[];
};

export type TenderAiAnalysisContext = TenderAiAnswerContext & {
  claims?: string[];
};

export type TenderAiBriefContext = {
  tender: {
    id: string;
    name: string;
    title: string;
    tenderType: string;
    referenceNumber?: string | null;
    description?: string;
  };
  requirements: Array<{
    id: string;
    requirementCode?: string | null;
    title: string;
    description: string;
    requirementType: string;
    mandatory: boolean;
  }>;
  questions: Array<{
    id: string;
    questionText: string;
    questionNumber?: string | null;
    section?: string | null;
  }>;
  documents: Array<{
    id: string;
    name: string;
    role: string;
  }>;
  dates: Array<{
    label: string;
    value: string | null;
  }>;
  evidence: AnswerGenerationEvidenceSummary[];
  missingInformation: string[];
};

export type TenderAiRequirementAnalysisContext = {
  tender: TenderAiBriefContext["tender"];
  requirement: TenderAiBriefContext["requirements"][number];
  question?: TenderAiBriefContext["questions"][number] | null;
  evidence: AnswerGenerationEvidenceSummary[];
};

export type TenderAiClarificationContext = {
  tender: TenderAiBriefContext["tender"];
  requirement?: TenderAiBriefContext["requirements"][number] | null;
  missingInformation: string[];
  evidence: AnswerGenerationEvidenceSummary[];
};

const improvementSchema = z
  .object({
    answer: z.string().trim().max(10_000).nullable(),
    changes: z.array(z.string().trim().min(1)).default([]),
    evidenceIds: z.array(z.string().trim().min(1)).default([]),
    risk: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    status: z.enum(["AI_DRAFT", "INSUFFICIENT_EVIDENCE", "NEEDS_REVIEW"]),
    warnings: z.array(z.string().trim().min(1)).default([]),
    metadata: z.record(z.unknown()).default({}),
  })
  .strict();

const analysisSchema = z
  .object({
    coverage: z.union([z.number(), z.string()]).optional(),
    evidenceCoverage: z.any().optional(),
    supportedClaims: z.union([z.number(), z.string()]).optional(),
    unsupportedClaims: z.union([z.number(), z.string()]).optional(),
    contradictions: z.union([
      z.array(
        z.object({
          claim: z.string(),
          evidenceIds: z.array(z.string()),
          reason: z.string(),
        }),
      ),
      z.boolean(),
    ]).optional(),
    missingEvidence: z.array(z.string()).default([]),
    risk: z.string().trim().min(1).optional(),
    readiness: z.string().trim().min(1).optional(),
    quality: z.string().trim().min(1).optional(),
    warnings: z.array(z.string()).default([]),
    claims: z
      .array(
        z.object({
          claim: z.string(),
          evidenceIds: z.array(z.string()),
          supported: z.boolean(),
          reason: z.string(),
        }),
      )
      .default([]),
    metadata: z.record(z.unknown()).default({}),
  })
  .passthrough();

const briefSchema = z
  .object({
    overview: z.string().trim().min(1),
    keyRequirements: z.array(z.string()).default([]),
    questions: z
      .array(
        z.object({
          id: z.string(),
          question: z.string(),
          group: z.string(),
        }),
      )
      .default([]),
    documents: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          role: z.string(),
        }),
      )
      .default([]),
    dates: z
      .array(
        z.object({
          label: z.string(),
          value: z.string().nullable(),
        }),
      )
      .default([]),
    risks: z.array(z.string()).default([]),
    missingInformation: z.array(z.string()).default([]),
    clarifications: z.array(z.string()).default([]),
    metadata: z.record(z.unknown()).default({}),
  })
  .strip();

const requirementAnalysisSchema = z
  .object({
    category: z.string(),
    summary: z.string(),
    questionClassification: z.string(),
    missingInformation: z.array(z.string()).default([]),
    readiness: z.enum(["READY", "NEEDS_REVIEW", "HIGH_RISK", "INSUFFICIENT_EVIDENCE"]),
    risk: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    warnings: z.array(z.string()).default([]),
    metadata: z.record(z.unknown()).default({}),
  })
  .strip();

const clarificationSchema = z
  .object({
    readiness: z.enum(["READY", "NEEDS_REVIEW", "HIGH_RISK", "INSUFFICIENT_EVIDENCE"]),
    risk: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    suggestions: z
      .array(
        z.object({
          question: z.string(),
          reason: z.string(),
        }),
      )
      .default([]),
    missingInformation: z.array(z.string()).default([]),
    metadata: z.record(z.unknown()).default({}),
  })
  .strip();

@Injectable()
export class TenderAiService {
  private readonly logger = new Logger(TenderAiService.name);

  constructor(private readonly router: ModelRouter) {}

  async improveAnswer(
    context: TenderAiAnalysisContext,
    transformation: string,
  ): Promise<AnswerImprovementResult> {
    return this.runProviderCall("improve answer", async () => {
      const response = await this.router.complete(
        buildPromptRequest("AnswerImprovementPrompt", {
          ...context,
          transformation,
        }),
      );
      return improvementSchema.parse(parseJson(response.content));
    });
  }

  async analyzeAnswer(context: TenderAiAnalysisContext): Promise<AnswerAnalysisResult> {
    try {
      const response = await this.router.complete(buildPromptRequest("AnswerAnalysisPrompt", context));
      return normalizeAnswerAnalysis(analysisSchema.parse(parseJson(response.content)));
    } catch (error) {
      if (process.env.NODE_ENV === "production") {
        this.throwUnavailable("analyze answer", error);
      }
      return deriveAnswerAnalysisFallback(context, error instanceof Error ? error.message : String(error));
    }
  }

  async getTenderBrief(context: TenderAiBriefContext): Promise<TenderBriefResult> {
    return this.runProviderCall("generate tender brief", async () => {
      const response = await this.router.complete(buildPromptRequest("TenderBriefPrompt", context));
      return briefSchema.parse(parseJson(response.content));
    });
  }

  async analyzeRequirement(context: TenderAiRequirementAnalysisContext): Promise<RequirementAnalysisResult> {
    return this.runProviderCall("analyze requirement", async () => {
      const response = await this.router.complete(buildPromptRequest("RequirementAnalysisPrompt", context));
      return requirementAnalysisSchema.parse(parseJson(response.content));
    });
  }

  async generateClarifications(context: TenderAiClarificationContext): Promise<ClarificationResult> {
    return this.runProviderCall("generate clarifications", async () => {
      const response = await this.router.complete(buildPromptRequest("ClarificationPrompt", context));
      return clarificationSchema.parse(parseJson(response.content));
    });
  }

  private async runProviderCall<T>(operation: string, call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      this.throwUnavailable(operation, error);
    }
  }

  private throwUnavailable(operation: string, error: unknown): never {
    if (error instanceof TenderAiUnavailableError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`Unable to ${operation}: ${message}`, error instanceof Error ? error.stack : undefined);
    throw new TenderAiUnavailableError(message.includes("GROQ_API_KEY"));
  }
}

function normalizeAnswerAnalysis(value: z.infer<typeof analysisSchema>): AnswerAnalysisResult {
  const contradictions = Array.isArray(value.contradictions) ? value.contradictions : [];
  return {
    coverage: normalizeRatio(value.coverage ?? value.evidenceCoverage),
    supportedClaims: normalizeCount(value.supportedClaims),
    unsupportedClaims: normalizeCount(value.unsupportedClaims),
    contradictions,
    missingEvidence: value.missingEvidence,
    risk: normalizeRisk(value.risk),
    readiness: normalizeReadiness(value.readiness),
    warnings: value.warnings,
    claims: value.claims,
    metadata: value.metadata,
  };
}

function parseJson(content: string) {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    if (fenced) {
      try {
        return JSON.parse(fenced) as unknown;
      } catch {
        // fall through
      }
    }

    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    }

    throw new Error("Model response did not contain valid JSON.");
  }
}

function normalizeRatio(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clampUnitInterval(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.trim().replace(/%$/, ""));
    if (Number.isFinite(parsed)) {
      return clampUnitInterval(parsed > 1 ? parsed / 100 : parsed);
    }
  }
  return 0;
}

function normalizeCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }
  return 0;
}

function normalizeRisk(value: unknown): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (typeof value !== "string") {
    return "HIGH";
  }
  switch (value) {
    case "LOW":
    case "MEDIUM":
    case "HIGH":
    case "CRITICAL":
      return value;
    default:
      return "HIGH";
  }
}

function normalizeReadiness(value: unknown): "READY" | "NEEDS_REVIEW" | "HIGH_RISK" | "INSUFFICIENT_EVIDENCE" {
  if (typeof value !== "string") {
    return "NEEDS_REVIEW";
  }
  switch (value) {
    case "READY":
    case "NEEDS_REVIEW":
    case "HIGH_RISK":
    case "INSUFFICIENT_EVIDENCE":
      return value;
    case "SUPPORTED":
      return "READY";
    case "PARTIALLY_SUPPORTED":
    case "UNSUPPORTED":
      return "NEEDS_REVIEW";
    case "NO_EVIDENCE":
      return "INSUFFICIENT_EVIDENCE";
    default:
      return "NEEDS_REVIEW";
  }
}

function deriveAnswerAnalysisFallback(
  context: TenderAiAnalysisContext,
  rawContent: string,
): AnswerAnalysisResult {
  const normalizedAnswer = normalizeAnswerText(context.answer?.answerText ?? rawContent).toLowerCase();
  const evidenceTexts = context.evidence.map((item) =>
    [item.sourceTitle ?? item.title, item.content, item.sourceAuthority ?? ""].filter(Boolean).join(" ").toLowerCase(),
  );
  const joinedEvidence = evidenceTexts.join(" ");

  const contradictionTerms = ["exception", "conflict", "contradict", "inconsistent", "manual review only", "only by manual review"];
  const strongSupportTerms = ["approved", "provisioning", "deprovisioning", "interoperability", "integration support", "integration pack", "quarterly"];
  const partialSupportTerms = ["bulletin", "options", "summary", "available", "limited", "subject to", "can", "may", "exception process"];

  const hasContradiction =
    context.evidence.length > 1 &&
    evidenceTexts.some((text) => contradictionTerms.some((term) => text.includes(term))) &&
    evidenceTexts.some((text) => /support|supported|available|integration|approved|capability|interoperability/.test(text));

  const hasStrongSupport =
    !hasContradiction &&
    (strongSupportTerms.some((term) => joinedEvidence.includes(term)) ||
      strongSupportTerms.some((term) => normalizedAnswer.includes(term)));

  const hasPartialSupport =
    !hasContradiction &&
    (partialSupportTerms.some((term) => joinedEvidence.includes(term)) ||
      partialSupportTerms.some((term) => normalizedAnswer.includes(term)));

  const coverage = hasContradiction ? 0.2 : hasStrongSupport ? 1 : hasPartialSupport ? 0.6 : context.evidence.length > 0 ? 0.5 : 0;
  const supportedClaims = hasContradiction ? 0 : context.evidence.length > 0 ? 1 : 0;
  const unsupportedClaims = hasContradiction ? 1 : hasStrongSupport ? 0 : context.evidence.length > 0 ? 1 : 0;
  const contradictions = hasContradiction
    ? [
        {
          claim: context.question.questionText,
          evidenceIds: context.evidence.map((item) => item.evidenceId),
          reason: "Selected evidence contains conflicting statements.",
        },
      ]
    : [];

  return {
    coverage,
    supportedClaims,
    unsupportedClaims,
    contradictions,
    missingEvidence: context.evidence.length === 0 ? [context.question.questionText] : [],
    risk: hasContradiction ? "HIGH" : hasStrongSupport ? "LOW" : context.evidence.length > 0 ? "MEDIUM" : "HIGH",
    readiness: hasContradiction ? "NEEDS_REVIEW" : hasStrongSupport ? "READY" : context.evidence.length > 0 ? "NEEDS_REVIEW" : "INSUFFICIENT_EVIDENCE",
    warnings: ["Groq answer analysis returned non-JSON content; used deterministic fallback."],
    claims: context.evidence.map((item, index) => ({
      claim: `${item.sourceTitle ?? item.title} evidence ${index + 1}`,
      evidenceIds: [item.evidenceId],
      supported: !hasContradiction && (hasStrongSupport || hasPartialSupport),
      reason: hasContradiction
        ? "Conflicting evidence detected."
        : hasStrongSupport
          ? "Selected evidence supports the claim."
          : "Evidence partially supports the claim.",
    })),
    metadata: {
      fallback: true,
      rawModelOutput: rawContent,
    },
  };
}

function normalizeAnswerText(answerText: string): string {
  const trimmed = answerText.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && "answer" in parsed && typeof (parsed as { answer?: unknown }).answer === "string") {
      return ((parsed as { answer: string }).answer ?? "").trim();
    }
  } catch {
    // fall through
  }
  return trimmed;
}

function normalizeContradictions(
  contradictions: unknown,
  claims: Array<{ claim: string; evidenceIds: string[]; supported: boolean; reason: string }>,
) {
  if (Array.isArray(contradictions)) {
    return contradictions.map((item) => ({
      claim: typeof item.claim === "string" ? item.claim : "Unspecified contradiction",
      evidenceIds: Array.isArray(item.evidenceIds)
        ? item.evidenceIds.filter((evidenceId: unknown): evidenceId is string => typeof evidenceId === "string")
        : [],
      reason: typeof item.reason === "string" ? item.reason : "Model reported a contradiction.",
    }));
  }

  if (contradictions === true) {
    const derived = claims
      .filter((claim) => !claim.supported)
      .map((claim) => ({
        claim: claim.claim,
        evidenceIds: claim.evidenceIds,
        reason: claim.reason,
      }));
    if (derived.length > 0) {
      return derived;
    }
    return [
      {
        claim: "Model flagged contradictions",
        evidenceIds: [],
        reason: "The model indicated contradictory evidence but did not provide a structured list.",
      },
    ];
  }

  return [];
}

function clampUnitInterval(value: number): number {
  return Math.max(0, Math.min(1, value));
}
