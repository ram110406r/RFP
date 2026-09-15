import { Injectable } from "@nestjs/common";
import { ModelRouter } from "@rfp-os/ai";
import type {
  AnswerGenerationEvidenceSummary,
  AnswerGenerationResult,
  AnswerGenerationRisk,
  AnswerGenerationStatus,
} from "@rfp-os/types";

import { AnswerGenerationContext, buildAnswerGenerationRequest, buildGenerationMetadata, classifyAnswerRisk, classifyAnswerStatus, deriveGenerationConfidence, parseAnswerGenerationResponse, validateEvidenceIds } from "./answer-generation.logic";

@Injectable()
export class AnswerGenerationService {
  constructor(private readonly router: ModelRouter) {}

  async generate(
    context: AnswerGenerationContext,
    options: { provider: string; generatedAt?: Date } = { provider: "groq" },
  ): Promise<AnswerGenerationResult & { evidence: AnswerGenerationEvidenceSummary[]; prompt: string }> {
    const risk = classifyAnswerRisk(context);
    const status = classifyAnswerStatus(risk, context.evidence.length);
    const confidence = deriveGenerationConfidence(context);
    const generatedAt = (options.generatedAt ?? new Date()).toISOString();

    if (context.evidence.length === 0) {
      return {
        answer: null,
        confidence: 0,
        evidenceIds: [],
        risk: "HIGH",
        status: "INSUFFICIENT_EVIDENCE",
        evidenceState: "NO_EVIDENCE",
        metadata: buildGenerationMetadata(context, {
          provider: options.provider,
          model: "none",
          risk: "HIGH",
          status: "INSUFFICIENT_EVIDENCE",
          confidence: 0,
          evidenceIds: [],
          evidenceState: "NO_EVIDENCE",
          generatedAt,
          modelConfidence: 0,
          modelStatus: "INSUFFICIENT_EVIDENCE",
          generationMode: "blocked",
        }),
        evidence: context.evidence,
        prompt: "",
      };
    }

    const request = buildAnswerGenerationRequest(context, {
      targetRisk: risk,
      targetStatus: status,
      providerName: options.provider,
    });

    let completion: { content: string; model: string } | null = null;
    let modelFallbackReason: string | null = null;
    try {
      completion = await this.router.complete(request);
    } catch (error) {
      modelFallbackReason = error instanceof Error ? error.message : String(error);
    }

    if (completion) {
      try {
        const parsed = parseAnswerGenerationResponse(completion.content);
        const evidenceIds = validateEvidenceIds(context.evidence, parsed.evidenceIds);

        return {
          answer: parsed.answer,
          confidence: confidence,
          evidenceIds,
          risk,
          status,
          evidenceState: "EVIDENCE_FOUND",
          metadata: buildGenerationMetadata(context, {
            provider: options.provider,
            model: completion.model,
            risk,
            status,
            confidence,
            evidenceIds,
            evidenceState: "EVIDENCE_FOUND",
            generatedAt,
            modelConfidence: typeof parsed.confidence === "number" ? parsed.confidence : confidence,
            modelStatus: parsed.status,
            generationMode: "model",
          }),
          evidence: context.evidence,
          prompt: request.messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n\n"),
        };
      } catch (error) {
        if (error instanceof Error && /unsupported evidence ids/i.test(error.message)) {
          throw error;
        }
        modelFallbackReason = error instanceof Error ? error.message : String(error);
      }
    }

    if (process.env.NODE_ENV === "production") {
      throw new Error(
        modelFallbackReason
          ? `AI answer generation unavailable: ${modelFallbackReason}`
          : "AI answer generation returned an invalid response.",
      );
    }

    const fallback = buildDeterministicFallbackAnswer(context, {
      risk,
      status,
      confidence,
      generatedAt,
      provider: options.provider,
      model: typeof completion?.model === "string" ? completion.model : "fallback",
      fallbackReason: modelFallbackReason,
    });

    return fallback;
  }
}

function buildDeterministicFallbackAnswer(
  context: AnswerGenerationContext,
  options: {
    provider: string;
    model: string;
    risk: AnswerGenerationRisk;
    status: AnswerGenerationStatus;
    confidence: number;
    generatedAt: string;
    fallbackReason: string | null;
  },
): AnswerGenerationResult & { evidence: AnswerGenerationEvidenceSummary[]; prompt: string } {
  const evidenceSummary = context.evidence
    .slice(0, 2)
    .map((item) => item.sourceTitle ?? item.title)
    .filter((value, index, values) => value && values.indexOf(value) === index)
    .join("; ");
  const answer =
    options.status === "INSUFFICIENT_EVIDENCE"
      ? null
      : options.status === "AI_DRAFT"
        ? `${context.question.questionText} is supported by ${evidenceSummary || "the selected evidence"}.`
        : `${context.question.questionText} is partially supported by ${evidenceSummary || "the selected evidence"} and should be reviewed.`;

  const evidenceIds = context.evidence.map((item) => item.evidenceId);
  return {
    answer,
    confidence: options.confidence,
    evidenceIds,
    risk: options.risk,
    status: options.status,
    evidenceState: "EVIDENCE_FOUND",
    metadata: buildGenerationMetadata(context, {
      provider: options.provider,
      model: options.model,
      risk: options.risk,
      status: options.status,
      confidence: options.confidence,
      evidenceIds,
      evidenceState: "EVIDENCE_FOUND",
      generatedAt: options.generatedAt,
      modelConfidence: options.confidence,
      modelStatus: options.status,
      generationMode: "deterministic_fallback",
      fallbackReason: options.fallbackReason,
    }),
    evidence: context.evidence,
    prompt: [
      "QUESTION:",
      context.question.questionText,
      "",
      "REQUIREMENT:",
      `${context.requirement.requirementCode ? `${context.requirement.requirementCode} ` : ""}${context.requirement.title}`,
      context.requirement.description,
      "",
      "AUTHORITATIVE EVIDENCE:",
      "Use only the evidence in CONTEXT_JSON.",
      "",
      "INSTRUCTIONS:",
      "Answer using only the supplied evidence.",
      "Return JSON with answer, confidence, evidenceIds, risk, status, metadata.",
      "",
      "CONTEXT_JSON:",
      "```json",
      JSON.stringify({
        question: context.question.questionText,
        requirement: {
          code: context.requirement.requirementCode,
          title: context.requirement.title,
          description: context.requirement.description,
          type: context.requirement.requirementType,
          mandatory: context.requirement.mandatory,
        },
        evidence: context.evidence.slice(0, 3).map((item) => ({
          evidenceId: item.evidenceId,
          sourceId: item.sourceId,
          sourceVersion: item.sourceVersion,
          evidenceType: item.evidenceType,
          title: item.title,
          content: item.content,
          freshness: item.freshness,
          relevance: item.relevance,
          authority: item.authority,
          verifiedAt: item.verifiedAt ?? null,
          sourceTitle: item.sourceTitle ?? item.title,
          sourceAuthority: item.sourceAuthority ?? null,
        })),
        targetRisk: options.risk,
        targetStatus: options.status,
        provider: options.provider,
      }),
      "```",
      options.fallbackReason ? `FALLBACK_REASON: ${options.fallbackReason}` : "",
    ]
      .filter((part) => part.length > 0)
      .join("\n"),
  };
}
