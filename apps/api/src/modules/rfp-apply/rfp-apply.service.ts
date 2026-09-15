import { HttpException, Injectable, Optional } from "@nestjs/common";
import type { AuthContext } from "@rfp-os/types";

import { TendersService } from "../tenders/tenders.service";
import type { RunRfpApplyInput } from "./dto/rfp-apply.dto";
import { ApplyAutomationService } from "./apply-automation.service";

type WorkspaceOverview = Awaited<ReturnType<TendersService["getWorkspaceOverview"]>>;

@Injectable()
export class RfpApplyService {
  constructor(private readonly tenders: TendersService, @Optional() private readonly automation?: ApplyAutomationService) {}

  async getProgress(auth: AuthContext, tenderId: string) {
    const overview = await this.tenders.getWorkspaceOverview(auth, tenderId);
    const base = this.toProgress(overview);
    if (!this.automation) return base;
    const [runs, packages, milestones, submissions] = await Promise.all([
      this.automation.listRuns(auth, tenderId),
      this.automation.listPackages(auth, tenderId),
      this.automation.listMilestones(auth, tenderId),
      this.automation.listSubmissions(auth, tenderId),
    ]);
    return { ...base, latestRun: runs.items[0] ?? null, latestPackage: packages.items[0] ?? null, milestones: milestones.items, submissions: submissions.items };
  }

  async run(auth: AuthContext, tenderId: string, input: RunRfpApplyInput) {
    if (input.phase === "FULL" && this.automation) {
      const run = await this.automation.createRun(auth, tenderId, { includePackage: false, requirementIds: input.requirementIds, limit: input.limit });
      return { phase: input.phase, result: run, generated: run.items ?? [], progress: await this.getProgress(auth, tenderId), nextAction: "REVIEW_THEN_BUILD_AND_APPROVE_PACKAGE" };
    }
    const generated: Array<{ requirementId: string; result?: unknown; error?: string }> = [];
    let result: unknown = null;

    if (input.phase === "ANALYZE" || input.phase === "FULL") {
      result = await this.tenders.analyzeTender(auth, tenderId);
    }

    if (input.phase === "GENERATE" || input.phase === "FULL") {
      const requirements = await this.tenders.listRequirements(auth, tenderId);
      const selectedIds = input.requirementIds?.length
        ? input.requirementIds.slice(0, input.limit)
        : requirements.items.slice(0, input.limit).map((requirement) => requirement.id);

      for (const requirementId of selectedIds) {
        try {
          generated.push({
            requirementId,
            result: await this.tenders.generateRequirementAnswer(auth, tenderId, requirementId),
          });
        } catch (error) {
          if (error instanceof HttpException) throw error;
          generated.push({
            requirementId,
            error: error instanceof Error ? error.message : "Answer generation failed.",
          });
        }
      }
      result = generated;
    }

    if (input.phase === "VALIDATE" || input.phase === "FULL") {
      result = await this.tenders.runValidation(auth, tenderId);
    }

    return {
      phase: input.phase,
      result,
      generated,
      progress: await this.getProgress(auth, tenderId),
      nextAction: input.phase === "FULL" ? "REVIEW_THEN_USE_TENDER_APPROVE_ENDPOINT" : null,
    };
  }

  private toProgress(overview: WorkspaceOverview) {
    const { counts, validation, tender } = overview;
    const hasRequirements = counts.requirements > 0;
    const answeredAllRequirements = counts.questions > 0 && counts.answeredQuestions === counts.questions;
    const reviewComplete = counts.answers > 0 && counts.approvedAnswers === counts.answers;

    return {
      tenderId: tender.id,
      status: tender.status,
      phases: {
        intake: { status: counts.sources > 0 && counts.processedDocuments === counts.documents && counts.pendingDocuments === 0 ? "COMPLETE" : "PENDING", count: counts.sources },
        analysis: { status: hasRequirements ? "READY" : "PENDING", count: counts.requirements },
        response: { status: answeredAllRequirements ? "COMPLETE" : "IN_PROGRESS", count: counts.answers },
        review: { status: reviewComplete ? "COMPLETE" : "IN_PROGRESS", count: counts.reviews },
        validation: {
          status: validation.latestRun ? (validation.current.ready ? "COMPLETE" : "FAILED") : "PENDING",
          score: validation.current.score,
          ready: validation.current.ready,
          issueCount: validation.current.issues.length,
        },
        approval: { status: tender.status === "APPROVED" || tender.status === "SUBMITTED" ? "COMPLETE" : "PENDING" },
        submission: { status: tender.status === "SUBMITTED" ? "COMPLETE" : "PENDING" },
      },
    };
  }
}
