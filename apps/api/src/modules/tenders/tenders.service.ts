import { createHash, randomUUID } from "node:crypto";
import { basename, extname } from "node:path";

import { ConflictException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DocxDocumentParser,
  PdfDocumentParser,
  SNIFF_LENGTH,
  contradictsDeclaredType,
  sniffFormat,
  type ExtractionResult,
} from "@rfp-os/document-processing";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
} from "drizzle-orm";
import {
  activities,
  assignments,
  files,
  knowledgeSources,
  organizationMembers,
  tenderAnswerEvidence,
  tenderAnswerReviews,
  tenderAnswerVersions,
  tenderAnswers,
  tenderDocumentContent,
  tenderDocumentExtractions,
  tenderDocuments,
  savedTenders,
  tenderQuestions,
  tenderQuestionRequirements,
  tenderRequirements,
  tenderSources,
  tenderValidationRuns,
  tenderStatusHistory,
  tenderAutomationRuns,
  tenderSubmissionPackages,
  tenderSubmissions,
  tenderMilestones,
  tenders,
  users,
  workspaces,
  withTransaction,
  type Database,
  type Transaction,
} from "@rfp-os/db";
import { ObjectStorage, tenderSourceObjectKey, sanitizeFilename } from "@rfp-os/storage";
import type { AuthContext, Permission } from "@rfp-os/types";
import { answerContentDigest, hasCurrentApproval } from "./domain/answer-review";

import {
  hasOrganizationPermission,
  hasWorkspacePermission,
} from "@rfp-os/types";
import { PolicyService } from "../../common/auth";
import { PinoLoggerService } from "../../common/logger/pino-logger.service";
import { DATABASE } from "../../infrastructure/database";
import { AuditService } from "../../infrastructure/audit";
import { ActivityService } from "../../infrastructure/activity";
import type { Env } from "../../config/env.schema";
import type {
  CreateTenderAnswerInput,
  SearchTenderRequirementEvidenceInput,
  CreateTenderQuestionInput,
  CreateTenderRequirementInput,
  CreateTenderReviewInput,
  CreateTenderInput,
  ListTendersInput,
  RequirementsQueueInput,
  ResponsesQueueInput,
  PipelineQueryInput,
  ReviewQueueInput,
  SubmissionsQueueInput,
  TransitionTenderInput,
  UpdateTenderAnswerInput,
  UpdateTenderQuestionInput,
  UpdateTenderRequirementInput,
  UpdateTenderReviewInput,
  UpdateTenderInput,
} from "./dto/tender.dto";
import type { CreateTenderSourceUploadIntentInput } from "./dto/tender-source.dto";
import { AnswerGenerationService } from "./answer-generation";
import { EvidenceRankingService } from "./evidence/evidence-ranking.service";
import { EvidenceRetrievalService } from "./evidence/evidence-retrieval.service";
import { EvidenceSelectionService } from "./evidence/evidence-selection.service";
import { TenderAiService } from "./ai";
import { normalizeEvidenceType, selectEvidenceCandidates } from "./evidence/evidence.logic";
import type { AnswerGenerationContext } from "./answer-generation/answer-generation.logic";
import {
  TenderAnswerFinalizationNotAllowedError,
  TenderAnswerNotFoundError,
  TenderEvidenceNotFoundError,
  TenderNotEditableError,
  TenderNotFoundError,
  TenderOwnerNotFoundError,
  TenderPermissionError,
  TenderSourceDuplicateError,
  TenderDocumentNotFoundError,
  TenderSourceInvalidFileError,
  TenderSourceNotFoundError,
  TenderSourceStorageNotConfiguredError,
  TenderSourceUploadIncompleteError,
  TenderQuestionNotFoundError,
  TenderRequirementNotFoundError,
  TenderReviewNotFoundError,
  TenderTransitionNotAllowedError,
  TenderWorkspaceNotFoundError,
} from "./domain/tender.errors";
import {
  allowedTransitionsFrom,
  canTransitionTender,
  permissionForTenderTransition,
  type TenderStatus,
} from "./domain/tender-state-machine";
import {
  buildDashboardSummary,
  buildPipelineSummary,
  isActivePipelineStatus,
  mapPipelineStage,
  type DashboardAiActivity,
  type DashboardEvidenceHealth,
  type DashboardKnowledgeHealth,
  type DashboardSectionError,
  type DashboardTenderCard,
  type PipelineTenderCard,
} from "../dashboard/dashboard-summary.logic";

type TenderRow = typeof tenders.$inferSelect;
type TenderQuestionRow = typeof tenderQuestions.$inferSelect;
type TenderRequirementRow = typeof tenderRequirements.$inferSelect;
type TenderAnswerRow = typeof tenderAnswers.$inferSelect;
type TenderReviewRow = typeof tenderAnswerReviews.$inferSelect;
type TenderSourceRow = typeof tenderSources.$inferSelect;
type TenderAnswerVersionRow = typeof tenderAnswerVersions.$inferSelect;
type TenderValidationRunRow = typeof tenderValidationRuns.$inferSelect;
type TenderSourceWithFileRow = { source: TenderSourceRow; file: typeof files.$inferSelect };
type TenderDocumentRow = typeof tenderDocuments.$inferSelect;
type TenderDocumentExtractionRow = typeof tenderDocumentExtractions.$inferSelect;
type TenderDocumentContentRow = typeof tenderDocumentContent.$inferSelect;
type TenderDocumentWithFileRow = {
  document: TenderDocumentRow;
  file: typeof files.$inferSelect;
  extraction: TenderDocumentExtractionRow | null;
};
type TenderTimelineRow = typeof activities.$inferSelect;
type TenderQueryRunner = Pick<Database, "select" | "insert" | "update" | "delete">;
type TenderDocumentStatus = "UPLOADED" | "PROCESSING" | "PROCESSED" | "FAILED";
type ValidationSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
type ValidationTone = "success" | "warning" | "danger" | "neutral";
type TenderValidationCategory = {
  id: string;
  label: string;
  value: number;
  total: number | null;
  tone: ValidationTone;
  hint: string;
};
type TenderValidationIssue = {
  id: string;
  severity: ValidationSeverity;
  title: string;
  detail: string;
  recommendation: string;
  blocking: boolean;
  questionId?: string;
  requirementId?: string;
  answerId?: string;
  evidenceId?: string;
};
type TenderValidationSnapshot = {
  score: number;
  ready: boolean;
  categories: TenderValidationCategory[];
  issues: TenderValidationIssue[];
};
type TenderValidationInputs = {
  questions: TenderQuestionRow[];
  requirements: TenderRequirementRow[];
  answers: TenderAnswerRow[];
  sources: TenderSourceRow[];
  reviews: TenderReviewRow[];
  evidence: Array<typeof tenderAnswerEvidence.$inferSelect>;
  links: Array<typeof tenderQuestionRequirements.$inferSelect>;
};
type TenderValidationSummary = {
  validation: TenderValidationSnapshot;
  reviews: TenderReviewRow[];
};
type SubmissionQueueActionState =
  | "VIEW_RECEIPT"
  | "RECORD_RECEIPT"
  | "APPROVE_PACKAGE"
  | "REBUILD_PACKAGE"
  | "BUILD_PACKAGE"
  | "RESOLVE_BLOCKERS";

const TENDER_ACTIVITY_ACTIONS = {
  CREATED: "tender.created",
  UPDATED: "tender.updated",
  STATUS_CHANGED: "tender.status_changed",
  QUESTION_CREATED: "question.created",
  QUESTION_UPDATED: "question.updated",
  QUESTION_ASSIGNED: "question.assigned",
  REQUIREMENT_CREATED: "requirement.created",
  REQUIREMENT_UPDATED: "requirement.updated",
  SOURCE_CREATED: "source.added",
  SOURCE_PARSED: "source.parsed",
  SOURCE_REMOVED: "source.removed",
  SAVED: "tender.saved",
  UNSAVED: "tender.unsaved",
  ANSWER_CREATED: "answer.created",
  ANSWER_UPDATED: "answer.updated",
  ANSWER_EVIDENCE_ADDED: "answer.evidence_added",
  ANSWER_EVIDENCE_REMOVED: "answer.evidence_removed",
  ANSWER_SUBMITTED_FOR_REVIEW: "answer.submitted_for_review",
  ANSWER_APPROVED: "answer.approved",
  ANSWER_REJECTED: "answer.rejected",
  REVIEW_CREATED: "review.created",
  REVIEW_COMPLETED: "review.completed",
  VALIDATION_RUN: "validation.run",
  APPROVED: "tender.approved",
  SUBMITTED: "tender.submitted",
} as const;

const TENDER_AUDIT_ACTIONS = {
  CREATED: "TENDER_CREATED",
  UPDATED: "TENDER_UPDATED",
  STATUS_CHANGED: "TENDER_STATUS_CHANGED",
  QUESTION_CREATED: "TENDER_QUESTION_CREATED",
  QUESTION_UPDATED: "TENDER_QUESTION_UPDATED",
  REQUIREMENT_CREATED: "TENDER_REQUIREMENT_CREATED",
  REQUIREMENT_UPDATED: "TENDER_REQUIREMENT_UPDATED",
  SOURCE_CREATED: "TENDER_SOURCE_CREATED",
  SOURCE_PARSED: "TENDER_SOURCE_PARSED",
  SOURCE_REMOVED: "TENDER_SOURCE_REMOVED",
  SAVED: "TENDER_SAVED",
  UNSAVED: "TENDER_UNSAVED",
  ANSWER_CREATED: "TENDER_ANSWER_CREATED",
  ANSWER_UPDATED: "TENDER_ANSWER_UPDATED",
  REVIEW_CREATED: "TENDER_REVIEW_CREATED",
  REVIEW_UPDATED: "TENDER_REVIEW_UPDATED",
  EVIDENCE_CREATED: "TENDER_ANSWER_EVIDENCE_CREATED",
  EVIDENCE_REMOVED: "TENDER_ANSWER_EVIDENCE_REMOVED",
  VALIDATION_RUN: "TENDER_VALIDATION_RUN_CREATED",
  APPROVED: "TENDER_APPROVED",
  SUBMITTED: "TENDER_SUBMITTED",
} as const;

const TENDER_AI_ACTIVITY_ACTIONS = {
  ANSWER_GENERATED: "ai.answer.generated",
  ANSWER_IMPROVED: "ai.answer.improved",
  ANSWER_ANALYZED: "ai.answer.analyzed",
  TENDER_BRIEF_GENERATED: "ai.tender.brief.generated",
  TENDER_ANALYZED: "ai.tender.analyzed",
} as const;

const ANSWER_EVIDENCE_MIN_FINAL_SCORE = 0.75;

const TENDER_AI_AUDIT_ACTIONS = {
  ANSWER_GENERATED: "TENDER_AI_ANSWER_GENERATED",
  ANSWER_IMPROVED: "TENDER_AI_ANSWER_IMPROVED",
  ANSWER_ANALYZED: "TENDER_AI_ANSWER_ANALYZED",
  TENDER_BRIEF_GENERATED: "TENDER_AI_TENDER_BRIEF_GENERATED",
  TENDER_ANALYZED: "TENDER_AI_TENDER_ANALYZED",
} as const;

type TenderSourceUploadFormat = {
  mimeTypes: readonly string[];
  extensions: readonly string[];
};

const TENDER_SOURCE_UPLOAD_FORMATS: TenderSourceUploadFormat[] = [
  {
    mimeTypes: ["application/pdf"],
    extensions: [".pdf"],
  },
  {
    mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    extensions: [".docx"],
  },
  {
    mimeTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    extensions: [".xlsx"],
  },
  {
    mimeTypes: ["text/csv", "application/csv"],
    extensions: [".csv"],
  },
  {
    mimeTypes: ["text/plain"],
    extensions: [".txt"],
  },
];

@Injectable()
export class TendersService {
  private readonly pdfParser = new PdfDocumentParser();
  private readonly docxParser = new DocxDocumentParser();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly storage: ObjectStorage,
    private readonly config: ConfigService<Env, true>,
    private readonly audit: AuditService,
    private readonly activity: ActivityService,
    private readonly policy: PolicyService,
    private readonly logger: PinoLoggerService,
    private readonly evidenceRetrieval: EvidenceRetrievalService,
    private readonly evidenceRanking: EvidenceRankingService,
    private readonly evidenceSelection: EvidenceSelectionService,
    private readonly answerGeneration: AnswerGenerationService,
    private readonly tenderAi: TenderAiService,
  ) {}

  async authorizeTender(auth: AuthContext, tenderId: string, permission: Permission) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    if (!hasOrganizationPermission(auth, permission) && !hasWorkspacePermission(auth, tender.workspaceId, permission)) throw new ForbiddenException({ code: "TENDER_ACCESS_DENIED", message: `Missing permission ${permission}.` });
    const action = permission.endsWith(":read") ? "read" : permission === "tender:approve" ? "approve" : permission === "tender:submit" ? "submit" : "update";
    await this.assertPolicyAllows(auth, action, tender);
    if (action !== "read") this.assertEditable(tender, action === "submit" ? "SUBMITTED" : undefined);
    return tender;
  }

  private async lockTenderMutation(tx: Transaction, organizationId: string, tenderId: string) {
    const [current] = await tx.select().from(tenders).where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, organizationId))).for("update");
    if (!current) throw new TenderNotFoundError();
    this.assertEditable(current);
    return current;
  }

  async invalidateResponseApproval(tx: Transaction, organizationId: string, tenderId: string, answerId?: string) {
    if (answerId) await tx.update(tenderAnswerReviews).set({ status: "PENDING", contentDigest: null, updatedAt: new Date() }).where(and(eq(tenderAnswerReviews.organizationId, organizationId), eq(tenderAnswerReviews.answerId, answerId)));
    await tx.update(tenderSubmissionPackages).set({ status: "STALE" }).where(and(eq(tenderSubmissionPackages.organizationId, organizationId), eq(tenderSubmissionPackages.tenderId, tenderId), inArray(tenderSubmissionPackages.status, ["READY", "APPROVED"])));
    const [reopened] = await tx.update(tenders).set({ status: "REVIEW", updatedAt: new Date() }).where(and(eq(tenders.organizationId, organizationId), eq(tenders.id, tenderId), eq(tenders.status, "APPROVED"))).returning();
    if (reopened) await tx.insert(tenderStatusHistory).values({ organizationId, workspaceId: reopened.workspaceId, tenderId, fromStatus: "APPROVED", toStatus: "REVIEW", reason: "Response content changed; approval is required again." });
  }

  async list(auth: AuthContext, filters: ListTendersInput) {
    const workspaceIds = this.resolveWorkspaceScope(auth, filters.workspaceId);
    const search = filters.q ?? filters.search;
    const where = and(
      eq(tenders.organizationId, auth.organizationId),
      workspaceIds && workspaceIds.length > 0 ? inArray(tenders.workspaceId, workspaceIds) : undefined,
      filters.status ? eq(tenders.status, filters.status) : undefined,
      filters.tenderType ? eq(tenders.tenderType, filters.tenderType) : undefined,
      filters.sourceType ? eq(tenders.sourceType, filters.sourceType) : undefined,
      filters.buyer ? ilike(tenders.buyerName, `%${filters.buyer}%`) : undefined,
      filters.location ? ilike(tenders.location, `%${filters.location}%`) : undefined,
      filters.minValue !== undefined ? gte(tenders.estimatedValue, filters.minValue.toString()) : undefined,
      filters.maxValue !== undefined ? lte(tenders.estimatedValue, filters.maxValue.toString()) : undefined,
      filters.deadlineFrom ? gte(tenders.dueAt, new Date(filters.deadlineFrom)) : undefined,
      filters.deadlineTo ? lte(tenders.dueAt, new Date(filters.deadlineTo)) : undefined,
      filters.saved ? sql`${savedTenders.tenderId} is not null` : undefined,
      search
        ? or(
            ilike(tenders.name, `%${search}%`),
            ilike(tenders.title, `%${search}%`),
            ilike(tenders.referenceNumber, `%${search}%`),
            ilike(tenders.description, `%${search}%`),
            ilike(tenders.buyerName, `%${search}%`),
            ilike(tenders.location, `%${search}%`),
          )
        : undefined,
      filters.includeArchived ? undefined : sql`${tenders.archivedAt} is null`,
    );

    if (await this.policy.hasActivePolicies(auth, "tender", "read")) {
      return this.listPolicyFiltered(auth, filters, where);
    }

    const [totalRow] = await this.db
      .select({ value: sql<number>`count(*)` })
      .from(tenders)
      .leftJoin(
        savedTenders,
        and(
          eq(savedTenders.organizationId, auth.organizationId),
          eq(savedTenders.workspaceId, tenders.workspaceId),
          eq(savedTenders.tenderId, tenders.id),
        ),
      )
      .where(where);
    const orderBy = this.tenderListOrder(filters.sort);
    const rows = await this.db
      .select({ tender: tenders, savedTenderId: savedTenders.tenderId })
      .from(tenders)
      .leftJoin(
        savedTenders,
        and(
          eq(savedTenders.organizationId, auth.organizationId),
          eq(savedTenders.workspaceId, tenders.workspaceId),
          eq(savedTenders.tenderId, tenders.id),
        ),
      )
      .where(where)
      .orderBy(...orderBy)
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize);

    return {
      items: rows.map((row) => serializeTender(row.tender, { saved: Boolean(row.savedTenderId) })),
      total: Number(totalRow?.value ?? 0),
      page: filters.page,
      pageSize: filters.pageSize,
    };
  }

  /**
   * `list()` when `tender:read` policies apply to the caller: SQL can't evaluate
   * them, so select the policy attributes of every matching row (same filters
   * and sort), keep the readable ones, page the ids in memory and then load
   * only that page. `total` is the readable count.
   */
  private async listPolicyFiltered(
    auth: AuthContext,
    filters: ListTendersInput,
    where: ReturnType<typeof and>,
  ) {
    const savedJoin = and(
      eq(savedTenders.organizationId, auth.organizationId),
      eq(savedTenders.workspaceId, tenders.workspaceId),
      eq(savedTenders.tenderId, tenders.id),
    );
    const candidates = await this.db
      .select({
        id: tenders.id,
        workspaceId: tenders.workspaceId,
        ownerId: tenders.ownerId,
        status: tenders.status,
        tenderType: tenders.tenderType,
        archivedAt: tenders.archivedAt,
      })
      .from(tenders)
      .leftJoin(savedTenders, savedJoin)
      .where(where)
      .orderBy(...this.tenderListOrder(filters.sort));
    const readable = await this.filterReadableTenders(auth, candidates);
    const start = (filters.page - 1) * filters.pageSize;
    const pageIds = readable.slice(start, start + filters.pageSize).map((row) => row.id);

    const pageRows =
      pageIds.length === 0
        ? []
        : await this.db
            .select({ tender: tenders, savedTenderId: savedTenders.tenderId })
            .from(tenders)
            .leftJoin(savedTenders, savedJoin)
            .where(and(eq(tenders.organizationId, auth.organizationId), inArray(tenders.id, pageIds)));
    const rowById = new Map(pageRows.map((row) => [row.tender.id, row]));

    return {
      items: pageIds.flatMap((id) => {
        const row = rowById.get(id);
        return row ? [serializeTender(row.tender, { saved: Boolean(row.savedTenderId) })] : [];
      }),
      total: readable.length,
      page: filters.page,
      pageSize: filters.pageSize,
    };
  }

  async getRequirementsQueue(auth: AuthContext, input: RequirementsQueueInput) {
    const workspaceIds = this.resolveRequirementWorkspaceScope(auth, input.workspaceId);
    const tenderRows = await this.db
      .select()
      .from(tenders)
      .where(
        and(
          eq(tenders.organizationId, auth.organizationId),
          workspaceIds ? inArray(tenders.workspaceId, workspaceIds) : undefined,
          input.includeArchived ? undefined : sql`${tenders.archivedAt} is null`,
        ),
      );
    const readableTenders = await this.filterReadableTenders(auth, tenderRows);
    const tenderIds = readableTenders.map((tender) => tender.id);
    const tenderById = new Map(readableTenders.map((tender) => [tender.id, tender]));

    if (tenderIds.length === 0) {
      return emptyRequirementsQueue(input);
    }

    const [requirementRows, linkRows, answerRows, reviewRows, evidenceRows] = await Promise.all([
      this.db
        .select()
        .from(tenderRequirements)
        .where(and(eq(tenderRequirements.organizationId, auth.organizationId), inArray(tenderRequirements.tenderId, tenderIds))),
      this.db
        .select()
        .from(tenderQuestionRequirements)
        .where(and(eq(tenderQuestionRequirements.organizationId, auth.organizationId), inArray(tenderQuestionRequirements.workspaceId, readableTenders.map((tender) => tender.workspaceId)))),
      this.db
        .select()
        .from(tenderAnswers)
        .where(and(eq(tenderAnswers.organizationId, auth.organizationId), inArray(tenderAnswers.tenderId, tenderIds))),
      this.db
        .select()
        .from(tenderAnswerReviews)
        .where(and(eq(tenderAnswerReviews.organizationId, auth.organizationId), inArray(tenderAnswerReviews.tenderId, tenderIds))),
      this.db
        .select()
        .from(tenderAnswerEvidence)
        .where(and(eq(tenderAnswerEvidence.organizationId, auth.organizationId), inArray(tenderAnswerEvidence.tenderId, tenderIds))),
    ]);

    const requirementIds = new Set(requirementRows.map((requirement) => requirement.id));
    const questionIdsByRequirement = new Map<string, string[]>();
    for (const link of linkRows) {
      if (!requirementIds.has(link.requirementId)) continue;
      const questionIds = questionIdsByRequirement.get(link.requirementId) ?? [];
      questionIds.push(link.questionId);
      questionIdsByRequirement.set(link.requirementId, questionIds);
    }

    const answersByQuestion = new Map<string, TenderAnswerRow[]>();
    for (const answer of answerRows) {
      const list = answersByQuestion.get(answer.questionId) ?? [];
      list.push(answer);
      answersByQuestion.set(answer.questionId, list);
    }

    const reviewsByAnswer = new Map<string, TenderReviewRow[]>();
    for (const review of reviewRows) {
      const list = reviewsByAnswer.get(review.answerId) ?? [];
      list.push(review);
      reviewsByAnswer.set(review.answerId, list);
    }

    const evidenceCountByAnswer = new Map<string, number>();
    for (const evidence of evidenceRows) {
      evidenceCountByAnswer.set(evidence.answerId, (evidenceCountByAnswer.get(evidence.answerId) ?? 0) + 1);
    }

    const rows = requirementRows
      .map((requirement) => {
        const tender = tenderById.get(requirement.tenderId);
        if (!tender) return null;
        const questionIds = questionIdsByRequirement.get(requirement.id) ?? [];
        const linkedAnswers = questionIds.flatMap((questionId) => answersByQuestion.get(questionId) ?? []);
        const linkedReviews = linkedAnswers.flatMap((answer) => reviewsByAnswer.get(answer.id) ?? []);
        const answered = linkedAnswers.some((answer) => answer.answerText.trim().length > 0);
        const pendingReview = linkedAnswers.some((answer) => /REVIEW|PENDING/i.test(answer.status))
          || linkedReviews.some((review) => review.status === "PENDING" || review.status === "CHANGES_REQUESTED");
        const approved = linkedAnswers.some((answer) => /APPROVED|FINAL/i.test(answer.status))
          || linkedReviews.some((review) => review.status === "APPROVED");
        const blocked = /BLOCKED|FAILED/i.test(requirement.status);
        const lowConfidence = linkedAnswers.some((answer) => Number(answer.confidence) < 0.65);
        const changesRequested = linkedReviews.some((review) => review.status === "CHANGES_REQUESTED");
        const highRisk = requirement.mandatory && (!answered || lowConfidence || blocked || changesRequested);
        const answerIds = linkedAnswers.map((answer) => answer.id);
        const evidenceCount = answerIds.reduce((total, answerId) => total + (evidenceCountByAnswer.get(answerId) ?? 0), 0);
        const answerUpdatedAt = latestDate(linkedAnswers.map((answer) => answer.updatedAt));
        const reviewUpdatedAt = latestDate(linkedReviews.map((review) => review.updatedAt));
        const lastActivityAt = latestDate([requirement.updatedAt, answerUpdatedAt, reviewUpdatedAt]);

        return {
          tender: serializeTender(tender),
          requirement: {
            ...serializeRequirement(requirement),
            questionIds,
          },
          questionIds,
          answerState: {
            answered,
            pendingReview,
            approved,
            lowConfidence,
            answerCount: linkedAnswers.length,
            answerIds,
            evidenceCount,
            latestStatus: linkedAnswers[0]?.status ?? null,
            updatedAt: answerUpdatedAt,
          },
          reviewState: {
            pendingReview,
            approved,
            changesRequested,
            reviewCount: linkedReviews.length,
            latestStatus: linkedReviews[0]?.status ?? null,
            updatedAt: reviewUpdatedAt,
          },
          riskState: {
            blocked,
            highRisk,
            lowConfidence,
          },
          lastActivityAt,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort(compareRequirementQueueRows);

    const counts = rows.reduce(
      (acc, row) => {
        acc.requirements += 1;
        if (row.requirement.mandatory) acc.mandatory += 1;
        if (!row.answerState.answered) acc.unanswered += 1;
        if (row.riskState.highRisk) acc.highRisk += 1;
        if (row.answerState.pendingReview) acc.pendingReview += 1;
        if (row.answerState.approved) acc.approved += 1;
        if (row.riskState.blocked) acc.blocked += 1;
        return acc;
      },
      {
        tenders: new Set(rows.map((row) => row.tender.id)).size,
        requirements: 0,
        mandatory: 0,
        unanswered: 0,
        highRisk: 0,
        pendingReview: 0,
        approved: 0,
        blocked: 0,
      },
    );
    const start = (input.page - 1) * input.pageSize;
    return {
      items: rows.slice(start, start + input.pageSize),
      counts,
      page: input.page,
      pageSize: input.pageSize,
      total: rows.length,
    };
  }

  async getResponsesQueue(auth: AuthContext, input: ResponsesQueueInput) {
    const workspaceIds = this.resolveAnswerWorkspaceScope(auth, input.workspaceId);
    const tenderRows = await this.db
      .select()
      .from(tenders)
      .where(
        and(
          eq(tenders.organizationId, auth.organizationId),
          workspaceIds && workspaceIds.length > 0 ? inArray(tenders.workspaceId, workspaceIds) : undefined,
          input.includeArchived ? undefined : sql`${tenders.archivedAt} is null`,
        ),
      );
    const readableTenders = await this.filterReadableTenders(auth, tenderRows);
    const tenderIds = readableTenders.map((tender) => tender.id);
    const tenderById = new Map(readableTenders.map((tender) => [tender.id, tender]));

    if (tenderIds.length === 0) {
      return emptyResponsesQueue(input);
    }

    const [answerRows, questionRows, requirementRows, linkRows, reviewRows, evidenceRows, versionRows] = await Promise.all([
      this.db
        .select()
        .from(tenderAnswers)
        .where(and(eq(tenderAnswers.organizationId, auth.organizationId), inArray(tenderAnswers.tenderId, tenderIds))),
      this.db
        .select()
        .from(tenderQuestions)
        .where(and(eq(tenderQuestions.organizationId, auth.organizationId), inArray(tenderQuestions.tenderId, tenderIds))),
      this.db
        .select()
        .from(tenderRequirements)
        .where(and(eq(tenderRequirements.organizationId, auth.organizationId), inArray(tenderRequirements.tenderId, tenderIds))),
      this.db
        .select()
        .from(tenderQuestionRequirements)
        .where(and(eq(tenderQuestionRequirements.organizationId, auth.organizationId), inArray(tenderQuestionRequirements.workspaceId, readableTenders.map((tender) => tender.workspaceId)))),
      this.db
        .select({ review: tenderAnswerReviews, reviewerName: users.name })
        .from(tenderAnswerReviews)
        .leftJoin(users, eq(users.id, tenderAnswerReviews.reviewerId))
        .where(and(eq(tenderAnswerReviews.organizationId, auth.organizationId), inArray(tenderAnswerReviews.tenderId, tenderIds)))
        .orderBy(desc(tenderAnswerReviews.updatedAt)),
      this.db
        .select({ answerId: tenderAnswerEvidence.answerId, id: tenderAnswerEvidence.id })
        .from(tenderAnswerEvidence)
        .where(and(eq(tenderAnswerEvidence.organizationId, auth.organizationId), inArray(tenderAnswerEvidence.tenderId, tenderIds))),
      this.db
        .select({ answerId: tenderAnswerVersions.answerId, id: tenderAnswerVersions.id })
        .from(tenderAnswerVersions)
        .where(and(eq(tenderAnswerVersions.organizationId, auth.organizationId), inArray(tenderAnswerVersions.tenderId, tenderIds))),
    ]);

    const questionById = new Map(questionRows.map((question) => [question.id, question]));
    const requirementById = new Map(requirementRows.map((requirement) => [requirement.id, requirement]));
    const requirementIdsByQuestion = new Map<string, string[]>();
    for (const link of linkRows) {
      if (!questionById.has(link.questionId) || !requirementById.has(link.requirementId)) continue;
      const ids = requirementIdsByQuestion.get(link.questionId) ?? [];
      ids.push(link.requirementId);
      requirementIdsByQuestion.set(link.questionId, ids);
    }

    const reviewsByAnswer = new Map<string, Array<{ review: TenderReviewRow; reviewerName: string | null }>>();
    for (const row of reviewRows) {
      const list = reviewsByAnswer.get(row.review.answerId) ?? [];
      list.push({ review: row.review, reviewerName: row.reviewerName ?? null });
      reviewsByAnswer.set(row.review.answerId, list);
    }

    const evidenceCountByAnswer = new Map<string, number>();
    for (const evidence of evidenceRows) {
      evidenceCountByAnswer.set(evidence.answerId, (evidenceCountByAnswer.get(evidence.answerId) ?? 0) + 1);
    }

    const versionCountByAnswer = new Map<string, number>();
    for (const version of versionRows) {
      versionCountByAnswer.set(version.answerId, (versionCountByAnswer.get(version.answerId) ?? 0) + 1);
    }

    const allRows = answerRows
      .map((answer) => {
        const tender = tenderById.get(answer.tenderId);
        const question = questionById.get(answer.questionId);
        if (!tender || !question) return null;
        const linkedRequirementIds = requirementIdsByQuestion.get(answer.questionId) ?? [];
        const requirement = linkedRequirementIds.map((id) => requirementById.get(id)).find(Boolean) ?? null;
        const reviews = reviewsByAnswer.get(answer.id) ?? [];
        const reviewSummary = buildResponseReviewSummary(reviews);
        const evidenceCount = evidenceCountByAnswer.get(answer.id) ?? 0;
        const versionCount = versionCountByAnswer.get(answer.id) ?? 0;
        const primaryHref = requirement ? `/tenders/${tender.id}/requirements/${requirement.id}` : `/apply/${tender.id}`;

        return {
          tender: serializeTender(tender),
          answer: {
            ...serializeAnswer(answer),
            versionCount,
            evidenceCount,
            reviewCount: reviews.length,
          },
          question: serializeQuestion(question),
          requirement: requirement ? serializeRequirement(requirement) : null,
          linkedRequirementCount: linkedRequirementIds.length,
          reviewSummary,
          navigation: {
            primaryHref,
            applyHref: `/apply/${tender.id}`,
            tenderHref: `/tenders/${tender.id}`,
          },
          lastActivityAt: latestDate([answer.updatedAt, reviewSummary.latest?.updatedAt ?? null])?.toISOString() ?? answer.updatedAt.toISOString(),
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    const searchedRows = input.q
      ? allRows.filter((row) => responseRowMatchesSearch(row, input.q ?? ""))
      : allRows;
    const counts = countResponseQueueRows(searchedRows);
    const filteredRows = searchedRows
      .filter((row) => responseRowMatchesFilters(row, input))
      .sort((left, right) => compareResponseQueueRows(left, right, input.sort));
    const start = (input.page - 1) * input.pageSize;

    return {
      items: filteredRows.slice(start, start + input.pageSize),
      counts,
      page: input.page,
      pageSize: input.pageSize,
      total: filteredRows.length,
    };
  }

  async getSubmissionsQueue(auth: AuthContext, input: SubmissionsQueueInput) {
    const workspaceIds = this.resolveWorkspaceScope(auth, input.workspaceId);
    const tenderRows = await this.db
      .select()
      .from(tenders)
      .where(
        and(
          eq(tenders.organizationId, auth.organizationId),
          workspaceIds && workspaceIds.length > 0 ? inArray(tenders.workspaceId, workspaceIds) : undefined,
          input.includeArchived ? undefined : sql`${tenders.archivedAt} is null`,
        ),
      );
    const readableTenders = await this.filterReadableTenders(auth, tenderRows);
    const tenderIds = readableTenders.map((tender) => tender.id);

    if (tenderIds.length === 0) {
      return emptySubmissionsQueue(input);
    }

    const [latestPackagesByTender, latestSubmissionsByTender] = await Promise.all([
      this.latestPackagesByTender(auth.organizationId, tenderIds),
      this.latestSubmissionsByTender(auth.organizationId, tenderIds),
    ]);

    const validationByTender = await this.validationSummariesByTender(auth.organizationId, readableTenders);

    const rows = readableTenders.map((tender) => {
      const latestPackage = latestPackagesByTender.get(tender.id) ?? null;
      const latestSubmission = latestSubmissionsByTender.get(tender.id) ?? null;
      const lastActivityAt = latestDate([
        tender.updatedAt,
        latestPackage?.completedAt ?? latestPackage?.createdAt,
        latestSubmission?.submittedAt ?? latestSubmission?.createdAt,
      ]);

      try {
        this.assertTenderWorkspacePermission(auth, tender.workspaceId, "tender:read");
        const validation = validationByTender.get(tender.id)?.validation;
        if (!validation) throw new TenderNotFoundError();
        const issues = validation.issues ?? [];
        const ready = validation.ready;
        return {
          tender: serializeTender(tender),
          readiness: validation.score,
          ready,
          issueCount: issues.length,
          blockingIssueCount: issues.filter((issue) => issue.blocking).length,
          latestPackage,
          latestSubmission,
          actionState: submissionActionState({ ready, latestPackage, latestSubmission }),
          lastActivityAt,
        };
      } catch {
        return {
          tender: serializeTender(tender),
          readiness: null,
          ready: false,
          issueCount: 0,
          blockingIssueCount: 0,
          latestPackage,
          latestSubmission,
          actionState: submissionActionState({ ready: false, latestPackage, latestSubmission }),
          lastActivityAt,
        };
      }
    });
    rows.sort(compareSubmissionQueueRows);

    const counts = rows.reduce(
      (acc, row) => {
        acc.tenders += 1;
        if (!row.latestPackage) acc.noPackage += 1;
        if (row.latestPackage?.status === "GENERATING") acc.generating += 1;
        if (row.latestPackage?.status === "READY") acc.ready += 1;
        if (row.latestPackage?.status === "APPROVED") acc.approved += 1;
        if (row.latestPackage?.status === "STALE" || row.latestPackage?.status === "FAILED") acc.needsRebuild += 1;
        if (row.latestSubmission) acc.submitted += 1;
        if (row.blockingIssueCount > 0 || row.actionState === "RESOLVE_BLOCKERS") acc.blocked += 1;
        return acc;
      },
      { tenders: 0, noPackage: 0, generating: 0, ready: 0, approved: 0, needsRebuild: 0, submitted: 0, blocked: 0 },
    );
    const start = (input.page - 1) * input.pageSize;
    return {
      items: rows.slice(start, start + input.pageSize),
      counts,
      page: input.page,
      pageSize: input.pageSize,
      total: rows.length,
    };
  }

  async getDashboard(auth: AuthContext, input: { pageSize: number }) {
    const errors: DashboardSectionError[] = [];
    const workspaceIds = this.resolveWorkspaceScope(auth);

    const scopedTenderRows = await this.db
      .select()
      .from(tenders)
      .where(
        and(
          eq(tenders.organizationId, auth.organizationId),
          workspaceIds && workspaceIds.length > 0 ? inArray(tenders.workspaceId, workspaceIds) : undefined,
          sql`${tenders.archivedAt} is null`,
        ),
      )
      .orderBy(desc(tenders.updatedAt));
    // Tenders a read policy denies are dropped before anything is derived from
    // them, so they never reach the cards, the counts or the AI/evidence stats.
    const tenderRows = await this.filterReadableTenders(auth, scopedTenderRows);

    const knowledgeRows = await this.db
      .select()
      .from(knowledgeSources)
      .where(eq(knowledgeSources.organizationId, auth.organizationId))
      .orderBy(desc(knowledgeSources.updatedAt));

    const knowledgeItems: DashboardKnowledgeHealth["items"] = knowledgeRows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      name: row.name,
      type: row.type,
      category: row.category,
      version: row.version,
      authority: row.authority,
      status: metadataStatus(row) as "DRAFT" | "ACTIVE" | "ARCHIVED",
      ownerId: row.ownerId,
      lastVerified: row.lastVerified,
      lastUpdated: row.lastUpdated,
      expiresAt: row.expiresAt,
      summary: row.summary,
      metadata: row.metadata,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    const knowledge: DashboardKnowledgeHealth = {
      counts: knowledgeItems.reduce(
        (acc, item) => {
          acc.total += 1;
          acc[item.status.toLowerCase() as "draft" | "active" | "archived"] += 1;
          if (item.lastVerified && isOlderThanDays(item.lastVerified, 180)) {
            acc.stale += 1;
          }
          return acc;
        },
        { total: 0, draft: 0, active: 0, archived: 0, stale: 0 },
      ),
      items: knowledgeItems.slice(0, 3),
      attention: knowledgeItems
        .filter((item) => item.status === "DRAFT" || (item.lastVerified && isOlderThanDays(item.lastVerified, 180)))
        .slice(0, 3),
    };

    const tenderIds = tenderRows.map((tender) => tender.id);
    const ownerIds = [...new Set(tenderRows.map((tender) => tender.ownerId).filter(Boolean))];
    const [latestRunsByTender, latestPackagesByTender, latestSubmissionsByTender] = await Promise.all([
      this.latestAutomationRunsByTender(auth.organizationId, tenderIds),
      this.latestPackagesByTender(auth.organizationId, tenderIds),
      this.latestSubmissionsByTender(auth.organizationId, tenderIds),
    ]);
    const ownersById = await this.dashboardOwnersById(auth.organizationId, ownerIds);
    const validationByTender = await this.tryValidationSummariesByTender(
      auth.organizationId,
      tenderRows,
      errors,
      "tenders",
    );

    const tenderDetails: DashboardTenderCard[] = tenderRows.map((tender) => {
      try {
        const summary = this.readableValidationSummary(auth, tender, validationByTender);
        return {
          tender: serializeTender(tender),
          owner: ownersById.get(tender.ownerId) ?? null,
          ...validationCardFields(summary),
          latestRun: latestRunsByTender.get(tender.id) ?? null,
          latestPackage: latestPackagesByTender.get(tender.id) ?? null,
          latestSubmission: latestSubmissionsByTender.get(tender.id) ?? null,
        };
      } catch (error) {
        this.reportSectionError(errors, "tenders", error, tender.id);
        return {
          tender: serializeTender(tender),
          owner: ownersById.get(tender.ownerId) ?? null,
          readiness: null,
          ready: false,
          issueCount: 0,
          blockingIssueCount: 0,
          highestIssue: null,
          pendingReviews: 0,
          totalReviews: 0,
          latestRun: latestRunsByTender.get(tender.id) ?? null,
          latestPackage: latestPackagesByTender.get(tender.id) ?? null,
          latestSubmission: latestSubmissionsByTender.get(tender.id) ?? null,
        };
      }
    });

    let aiActivity: DashboardAiActivity | null = null;
    let evidenceHealth: DashboardEvidenceHealth | null = null;

    if (tenderIds.length > 0) {
      try {
        const [answers, evidence] = await Promise.all([
          this.db
            .select({
              id: tenderAnswers.id,
              source: tenderAnswers.source,
              status: tenderAnswers.status,
            })
            .from(tenderAnswers)
            .where(
              and(
                eq(tenderAnswers.organizationId, auth.organizationId),
                inArray(tenderAnswers.tenderId, tenderIds),
              ),
            ),
          this.db
            .select({
              answerId: tenderAnswerEvidence.answerId,
              freshness: tenderAnswerEvidence.freshness,
            })
            .from(tenderAnswerEvidence)
            .where(
              and(
                eq(tenderAnswerEvidence.organizationId, auth.organizationId),
                inArray(tenderAnswerEvidence.tenderId, tenderIds),
              ),
            ),
        ]);

        const evidenceAnswerIds = new Set(evidence.map((row) => row.answerId));
        const freshnessCounts = evidence.reduce(
          (acc, row) => {
            acc[row.freshness.toLowerCase() as "fresh" | "aging" | "stale" | "expired" | "unknown"] += 1;
            return acc;
          },
          { fresh: 0, aging: 0, stale: 0, expired: 0, unknown: 0 },
        );
        const totalEvidence = evidence.length;
        const answersWithEvidence = evidenceAnswerIds.size;

        aiActivity = {
          totalAnswers: answers.length,
          aiGenerated: answers.filter((row) => row.source === "AI_GENERATED").length,
          imported: answers.filter((row) => row.source === "IMPORTED").length,
          manual: answers.filter((row) => row.source === "MANUAL").length,
          inReview: answers.filter((row) => row.status === "IN_REVIEW").length,
          approved: answers.filter((row) => row.status === "APPROVED").length,
          final: answers.filter((row) => row.status === "FINAL").length,
          aiAccepted: answers.filter(
            (row) => row.source === "AI_GENERATED" && (row.status === "APPROVED" || row.status === "FINAL"),
          ).length,
          aiAcceptanceRate:
            answers.filter((row) => row.source === "AI_GENERATED").length === 0
              ? null
              : Math.round(
                  (answers.filter(
                    (row) => row.source === "AI_GENERATED" && (row.status === "APPROVED" || row.status === "FINAL"),
                  ).length /
                    answers.filter((row) => row.source === "AI_GENERATED").length) *
                    100,
                ),
        };

        evidenceHealth = {
          total: totalEvidence,
          answerCount: answers.length,
          answersWithEvidence,
          answersWithoutEvidence: Math.max(0, answers.length - answersWithEvidence),
          fresh: freshnessCounts.fresh,
          aging: freshnessCounts.aging,
          stale: freshnessCounts.stale,
          expired: freshnessCounts.expired,
          unknown: freshnessCounts.unknown,
          coverageRate: answers.length === 0 ? null : Math.round((answersWithEvidence / answers.length) * 100),
          freshnessRate:
            totalEvidence === 0
              ? null
              : Math.round(((freshnessCounts.fresh + freshnessCounts.aging) / totalEvidence) * 100),
        };
      } catch (error) {
        this.reportSectionError(errors, "ai_activity", error);
      }
    }

    return buildDashboardSummary({
      generatedAt: new Date().toISOString(),
      pageSize: Math.max(1, Math.min(25, input.pageSize)),
      tenders: tenderDetails,
      knowledge,
      aiActivity,
      evidenceHealth,
      errors,
    });
  }

  async getPipeline(auth: AuthContext, input: PipelineQueryInput = {}) {
    const errors: DashboardSectionError[] = [];
    const workspaceIds = this.resolveWorkspaceScope(auth);

    const scopedTenderRows = await this.db
      .select()
      .from(tenders)
      .where(
        and(
          eq(tenders.organizationId, auth.organizationId),
          workspaceIds && workspaceIds.length > 0 ? inArray(tenders.workspaceId, workspaceIds) : undefined,
          sql`${tenders.archivedAt} is null`,
          sql`${tenders.status} not in ('CANCELLED', 'ARCHIVED')`,
        ),
      )
      .orderBy(desc(tenders.updatedAt));
    const tenderRows = await this.filterReadableTenders(auth, scopedTenderRows);

    const tenderIds = tenderRows.map((tender) => tender.id);
    const ownerIds = [...new Set(tenderRows.map((tender) => tender.ownerId).filter(Boolean))];
    const [latestRunsByTender, latestPackagesByTender, latestSubmissionsByTender, ownersById] = await Promise.all([
      this.latestAutomationRunsByTender(auth.organizationId, tenderIds),
      this.latestPackagesByTender(auth.organizationId, tenderIds),
      this.latestSubmissionsByTender(auth.organizationId, tenderIds),
      this.dashboardOwnersById(auth.organizationId, ownerIds),
    ]);

    const pipelineTenders = tenderRows.filter((tender) => isActivePipelineStatus(tender.status));
    const validationByTender = await this.tryValidationSummariesByTender(
      auth.organizationId,
      pipelineTenders,
      errors,
      "pipeline",
    );

    const items: PipelineTenderCard[] = pipelineTenders.map((tender) => {
      const base = {
        tender: serializeTender(tender),
        owner: ownersById.get(tender.ownerId) ?? null,
        latestRun: latestRunsByTender.get(tender.id) ?? null,
        latestPackage: latestPackagesByTender.get(tender.id) ?? null,
        latestSubmission: latestSubmissionsByTender.get(tender.id) ?? null,
        pipelineStageId: mapPipelineStage(tender.status),
        availableTransitions: allowedTransitionsFrom(tender.status as TenderStatus)
          .filter(
            (rule) =>
              hasOrganizationPermission(auth, rule.permission) ||
              hasWorkspacePermission(auth, tender.workspaceId, rule.permission),
          )
          .map((rule) => ({
            to: rule.to,
            label: formatStatusLabel(rule.to),
            description: rule.description,
          })),
      };
      try {
        const summary = this.readableValidationSummary(auth, tender, validationByTender);
        return { ...base, ...validationCardFields(summary) };
      } catch (error) {
        this.reportSectionError(errors, "pipeline", error, tender.id);
        return {
          ...base,
          readiness: null,
          ready: false,
          issueCount: 0,
          blockingIssueCount: 0,
          highestIssue: null,
          pendingReviews: 0,
          totalReviews: 0,
        };
      }
    });

    return buildPipelineSummary({
      generatedAt: new Date().toISOString(),
      pageSize: Math.max(1, items.length),
      tenders: items,
      items,
      pagination: { page: input.page, pageSize: input.pageSize },
      knowledge: emptyDashboardKnowledge(),
      aiActivity: null,
      evidenceHealth: null,
      errors,
    });
  }

  async getById(auth: AuthContext, tenderId: string) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "tender:read");
    await this.assertPolicyAllows(auth, "read", tender);
    return serializeTender(tender, { saved: await this.isTenderSaved(auth.organizationId, tender.workspaceId, tender.id) });
  }

  async create(auth: AuthContext, input: CreateTenderInput) {
    if (!hasWorkspacePermission(auth, input.workspaceId, "tender:create")) {
      throw new TenderPermissionError("tender:create");
    }
    await this.requireWorkspace(auth.organizationId, input.workspaceId);

    const ownerId = input.ownerId ?? auth.userId;
    await this.requireActiveMember(auth.organizationId, ownerId);

    const created = await withTransaction(async (tx) => {
      const [row] = await tx
        .insert(tenders)
        .values({
          organizationId: auth.organizationId,
          workspaceId: input.workspaceId,
          name: input.name,
          title: input.title,
          referenceNumber: input.referenceNumber ?? null,
          description: input.description ?? "",
          buyerName: input.buyerName ?? input.name,
          location: input.location ?? null,
          estimatedValue: input.estimatedValue !== undefined ? input.estimatedValue.toString() : null,
          currency: input.currency ?? "INR",
          tenderType: input.tenderType,
          sourceType: input.sourceType,
          sourceReference: input.sourceReference ?? {},
          sourceUrl: input.sourceUrl ?? null,
          status: "DRAFT",
          ownerId,
          createdBy: auth.userId,
          receivedAt: input.receivedAt ? new Date(input.receivedAt) : null,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          timezone: input.timezone ?? "UTC",
          metadata: input.metadata ?? {},
        })
        .returning();
      if (!row) throw new TenderNotFoundError();

      await tx.insert(tenderStatusHistory).values({
        organizationId: auth.organizationId,
        workspaceId: input.workspaceId,
        tenderId: row.id,
        fromStatus: null,
        toStatus: row.status,
        actorId: auth.userId,
        reason: "Tender created.",
        metadata: {},
      });

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: input.workspaceId,
          actorId: auth.userId,
          action: TENDER_AUDIT_ACTIONS.CREATED,
          entityType: "tender",
          entityId: row.id,
          newValue: serializeTender(row),
        },
        tx,
      );

      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: input.workspaceId,
          actorId: auth.userId,
          label: `Created tender ${row.title}`,
          action: TENDER_ACTIVITY_ACTIONS.CREATED,
          entityType: "tender",
          entityId: row.id,
          summary: `Created tender ${row.title}`,
        },
        tx,
      );

      return row;
    });

    return serializeTender(created);
  }

  async save(auth: AuthContext, tenderId: string) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "tender:update");
    await this.assertPolicyAllows(auth, "update", tender);

    await withTransaction(async (tx) => {
      const inserted = await tx
        .insert(savedTenders)
        .values({
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          tenderId,
          savedBy: auth.userId,
        })
        .onConflictDoNothing({
          target: [savedTenders.workspaceId, savedTenders.tenderId],
        })
        .returning();

      if (inserted.length === 0) return;

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          action: TENDER_AUDIT_ACTIONS.SAVED,
          entityType: "tender",
          entityId: tenderId,
          newValue: { saved: true },
        },
        tx,
      );

      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          label: `Saved tender ${tender.title}`,
          action: TENDER_ACTIVITY_ACTIONS.SAVED,
          entityType: "tender",
          entityId: tenderId,
          summary: `Saved tender ${tender.title}`,
        },
        tx,
      );
    });

    return serializeTender(tender, { saved: true });
  }

  async unsave(auth: AuthContext, tenderId: string) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "tender:update");
    await this.assertPolicyAllows(auth, "update", tender);

    await withTransaction(async (tx) => {
      const deleted = await tx
        .delete(savedTenders)
        .where(
          and(
            eq(savedTenders.organizationId, auth.organizationId),
            eq(savedTenders.workspaceId, tender.workspaceId),
            eq(savedTenders.tenderId, tenderId),
          ),
        )
        .returning();

      if (deleted.length === 0) return;

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          action: TENDER_AUDIT_ACTIONS.UNSAVED,
          entityType: "tender",
          entityId: tenderId,
          previousValue: { saved: true },
          newValue: { saved: false },
        },
        tx,
      );

      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          label: `Removed saved tender ${tender.title}`,
          action: TENDER_ACTIVITY_ACTIONS.UNSAVED,
          entityType: "tender",
          entityId: tenderId,
          summary: `Removed saved tender ${tender.title}`,
        },
        tx,
      );
    });

    return serializeTender(tender, { saved: false });
  }

  async update(auth: AuthContext, tenderId: string, input: UpdateTenderInput) {
    const existing = await this.requireTender(auth.organizationId, tenderId);
    this.assertEditable(existing);
    await this.assertPolicyAllows(auth, "update", existing);

    const workspaceId = existing.workspaceId;
    if (input.ownerId) {
      await this.requireActiveMember(auth.organizationId, input.ownerId);
    }

    const patch: Partial<typeof tenders.$inferInsert> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.title !== undefined) patch.title = input.title;
    if (input.referenceNumber !== undefined) patch.referenceNumber = input.referenceNumber;
    if (input.description !== undefined) patch.description = input.description;
    if (input.buyerName !== undefined) patch.buyerName = input.buyerName;
    if (input.location !== undefined) patch.location = input.location;
    if (input.estimatedValue !== undefined) {
      patch.estimatedValue = input.estimatedValue === null ? null : input.estimatedValue.toString();
    }
    if (input.currency !== undefined) patch.currency = input.currency;
    if (input.tenderType !== undefined) patch.tenderType = input.tenderType;
    if (input.sourceType !== undefined) patch.sourceType = input.sourceType;
    if (input.sourceReference !== undefined) patch.sourceReference = input.sourceReference;
    if (input.sourceUrl !== undefined) patch.sourceUrl = input.sourceUrl;
    if (input.ownerId !== undefined) patch.ownerId = input.ownerId;
    if (input.receivedAt !== undefined) patch.receivedAt = input.receivedAt ? new Date(input.receivedAt) : null;
    if (input.dueAt !== undefined) patch.dueAt = input.dueAt ? new Date(input.dueAt) : null;
    if (input.timezone !== undefined) patch.timezone = input.timezone;
    if (input.metadata !== undefined) patch.metadata = input.metadata;

    const changedFields = Object.keys(patch);
    const updated = await withTransaction(async (tx) => {
      await this.lockTenderMutation(tx, auth.organizationId, tenderId);
      await this.invalidateResponseApproval(tx, auth.organizationId, tenderId);
      const [row] = await tx
        .update(tenders)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, auth.organizationId)))
        .returning();
      if (!row) throw new TenderNotFoundError();
      if (input.dueAt !== undefined) {
        if (row.dueAt) {
          await tx.update(tenderMilestones).set({ dueAt: sql`${row.dueAt.toISOString()}::timestamptz - ${tenderMilestones.offsetDays} * interval '1 day'`, status: "PENDING", completedAt: null, updatedAt: new Date() }).where(and(eq(tenderMilestones.tenderId, tenderId), inArray(tenderMilestones.status, ["PENDING", "OVERDUE", "CANCELLED"])));
        } else await tx.update(tenderMilestones).set({ status: "CANCELLED", updatedAt: new Date() }).where(and(eq(tenderMilestones.tenderId, tenderId), inArray(tenderMilestones.status, ["PENDING", "OVERDUE"])));
      }

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId,
          actorId: auth.userId,
          action: TENDER_AUDIT_ACTIONS.UPDATED,
          entityType: "tender",
          entityId: tenderId,
          previousValue: pick(existing, changedFields),
          newValue: pick(row, changedFields),
          metadata: { changedFields },
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId,
          actorId: auth.userId,
          label: `Updated tender ${row.title}`,
          action: TENDER_ACTIVITY_ACTIONS.UPDATED,
          entityType: "tender",
          entityId: tenderId,
          summary: `Updated tender ${row.title}`,
          metadata: { changedFields },
        },
        tx,
      );
      return row;
    });

    return serializeTender(updated);
  }

  async transition(auth: AuthContext, tenderId: string, input: TransitionTenderInput) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertEditable(tender, input.to);
    const from = tender.status as TenderStatus;
    const to = input.to as TenderStatus;
    if (to === "APPROVED" || to === "SUBMITTED") throw new ConflictException({ code: "PACKAGE_WORKFLOW_REQUIRED", message: to === "APPROVED" ? "Approve a current submission package in the Apply workspace." : "Record submission of a current approved package in the Apply workspace." });

    if (!canTransitionTender(from, to)) {
      throw new TenderTransitionNotAllowedError(from, to);
    }

    const required = permissionForTenderTransition(from, to);
    if (!hasOrganizationPermission(auth, required) && !hasWorkspacePermission(auth, tender.workspaceId, required)) {
      throw new TenderPermissionError(required);
    }

    await this.assertPolicyAllows(auth, "transition", tender, { toStatus: to });

    const updated = await withTransaction(async (tx) => {
      const [current] = await tx.select().from(tenders).where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, auth.organizationId))).for("update");
      if (!current) throw new TenderNotFoundError();
      if (current.status !== from) throw new ConflictException({ code: "TENDER_STATE_CHANGED", message: "The tender state changed. Refresh before moving it." });
      this.assertEditable(current, to);
      await this.assertPolicyAllows(auth, "transition", current, { toStatus: to });
      const [row] = await tx
        .update(tenders)
        .set({ status: to, updatedAt: new Date() })
        .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, auth.organizationId)))
        .returning();
      if (!row) throw new TenderNotFoundError();

      await tx.insert(tenderStatusHistory).values({
        organizationId: auth.organizationId,
        workspaceId: tender.workspaceId,
        tenderId,
        fromStatus: from,
        toStatus: to,
        actorId: auth.userId,
        reason: input.reason ?? null,
        metadata: input.metadata ?? {},
      });

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          action: TENDER_AUDIT_ACTIONS.STATUS_CHANGED,
          entityType: "tender",
          entityId: tenderId,
          previousValue: { status: from },
          newValue: { status: to },
          metadata: { reason: input.reason ?? null },
        },
        tx,
      );

      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          label: `Tender moved to ${to}`,
          action: TENDER_ACTIVITY_ACTIONS.STATUS_CHANGED,
          entityType: "tender",
          entityId: tenderId,
          summary: `Tender moved from ${from} to ${to}`,
          metadata: { reason: input.reason ?? null },
        },
        tx,
      );

      return row;
    });

    return {
      id: updated.id,
      status: updated.status,
      previousStatus: from,
      reason: input.reason ?? null,
    };
  }

  async listQuestions(auth: AuthContext, tenderId: string) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "question:read");
    await this.assertPolicyAllows(auth, "read", tender);
    const rows = await this.db
      .select()
      .from(tenderQuestions)
      .where(and(eq(tenderQuestions.organizationId, auth.organizationId), eq(tenderQuestions.tenderId, tenderId)))
      .orderBy(tenderQuestions.sortOrder, tenderQuestions.createdAt);
    const links = await this.db
      .select()
      .from(tenderQuestionRequirements)
      .where(
        and(
          eq(tenderQuestionRequirements.organizationId, auth.organizationId),
          inArray(tenderQuestionRequirements.questionId, rows.map((row) => row.id)),
        ),
      );
    const requirementIdsByQuestion = new Map<string, string[]>();
    for (const link of links) {
      const list = requirementIdsByQuestion.get(link.questionId) ?? [];
      list.push(link.requirementId);
      requirementIdsByQuestion.set(link.questionId, list);
    }
    return {
      items: rows.map((row) => ({
        ...serializeQuestion(row),
        requirementIds: requirementIdsByQuestion.get(row.id) ?? [],
      })),
    };
  }

  async getQuestion(auth: AuthContext, tenderId: string, questionId: string) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "question:read");
    await this.assertPolicyAllows(auth, "read", tender);
    const row = await this.requireQuestion(auth.organizationId, tenderId, questionId);
    const links = await this.db
      .select()
      .from(tenderQuestionRequirements)
      .where(
        and(
          eq(tenderQuestionRequirements.organizationId, auth.organizationId),
          inArray(tenderQuestionRequirements.questionId, [questionId]),
          eq(tenderQuestionRequirements.questionId, questionId),
        ),
      );
    return {
      ...serializeQuestion(row),
      requirementIds: links.map((link) => link.requirementId),
    };
  }

  async createQuestion(auth: AuthContext, tenderId: string, input: CreateTenderQuestionInput) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertEditable(tender);
    if (!hasWorkspacePermission(auth, tender.workspaceId, "question:create")) {
      throw new TenderPermissionError("question:create");
    }

    const requirementIds = input.requirementIds ?? [];
    await this.requireRequirements(auth.organizationId, tenderId, requirementIds);

    const created = await withTransaction(async (tx) => {
      await this.lockTenderMutation(tx, auth.organizationId, tenderId);
      await this.invalidateResponseApproval(tx, auth.organizationId, tenderId);
      const [row] = await tx
        .insert(tenderQuestions)
        .values({
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          tenderId,
          questionNumber: input.questionNumber ?? null,
          section: input.section ?? "",
          questionText: input.questionText,
          questionType: input.questionType ?? "TEXT",
          required: input.required ?? false,
          status: input.status ?? "UNASSIGNED",
          sourceReference: input.sourceReference ?? {},
          sortOrder: input.sortOrder ?? 0,
          metadata: input.metadata ?? {},
        })
        .returning();
      if (!row) throw new TenderQuestionNotFoundError();

      if (requirementIds.length > 0) {
        await this.syncQuestionRequirements(tx, auth.organizationId, tender.workspaceId, row.id, requirementIds);
      }

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          action: TENDER_AUDIT_ACTIONS.QUESTION_CREATED,
          entityType: "tender_question",
          entityId: row.id,
          newValue: serializeQuestion(row),
          metadata: { tenderId },
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          label: `Created question ${row.id}`,
          action: TENDER_ACTIVITY_ACTIONS.QUESTION_CREATED,
          entityType: "tender_question",
          entityId: row.id,
          summary: `Created question on tender ${tenderId}`,
          metadata: { tenderId },
        },
        tx,
      );

      return row;
    });

    return serializeQuestion(created);
  }

  async updateQuestion(auth: AuthContext, tenderId: string, questionId: string, input: UpdateTenderQuestionInput) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertEditable(tender);
    const existing = await this.requireQuestion(auth.organizationId, tenderId, questionId);
    if (!hasWorkspacePermission(auth, tender.workspaceId, "question:update")) {
      throw new TenderPermissionError("question:update");
    }

    const requirementIds = input.requirementIds;
    if (requirementIds) {
      await this.requireRequirements(auth.organizationId, tenderId, requirementIds);
    }

    const patch: Partial<typeof tenderQuestions.$inferInsert> = {};
    if (input.questionNumber !== undefined) patch.questionNumber = input.questionNumber;
    if (input.section !== undefined) patch.section = input.section ?? "";
    if (input.questionText !== undefined) patch.questionText = input.questionText;
    if (input.questionType !== undefined) patch.questionType = input.questionType;
    if (input.required !== undefined) patch.required = input.required;
    if (input.status !== undefined) patch.status = input.status;
    if (input.sourceReference !== undefined) patch.sourceReference = input.sourceReference;
    if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
    if (input.metadata !== undefined) patch.metadata = input.metadata;

    const changedFields = Object.keys(patch);
    const updated = await withTransaction(async (tx) => {
      await this.lockTenderMutation(tx, auth.organizationId, tenderId);
      await this.invalidateResponseApproval(tx, auth.organizationId, tenderId);
      const [row] = await tx
        .update(tenderQuestions)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(tenderQuestions.id, questionId), eq(tenderQuestions.organizationId, auth.organizationId)))
        .returning();
      if (!row) throw new TenderQuestionNotFoundError();

      if (requirementIds) {
        await tx.delete(tenderQuestionRequirements).where(eq(tenderQuestionRequirements.questionId, questionId));
        await this.syncQuestionRequirements(tx, auth.organizationId, tender.workspaceId, questionId, requirementIds);
      }

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          action: TENDER_AUDIT_ACTIONS.QUESTION_UPDATED,
          entityType: "tender_question",
          entityId: questionId,
          previousValue: pick(existing, changedFields),
          newValue: pick(row, changedFields),
          metadata: { tenderId, changedFields },
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          label: `Updated question ${questionId}`,
          action: TENDER_ACTIVITY_ACTIONS.QUESTION_UPDATED,
          entityType: "tender_question",
          entityId: questionId,
          summary: `Updated question on tender ${tenderId}`,
          metadata: { changedFields },
        },
        tx,
      );

      return row;
    });

    return serializeQuestion(updated);
  }

  async listRequirements(auth: AuthContext, tenderId: string) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "requirement:read");
    await this.assertPolicyAllows(auth, "read", tender);
    const rows = await this.db
      .select()
      .from(tenderRequirements)
      .where(and(eq(tenderRequirements.organizationId, auth.organizationId), eq(tenderRequirements.tenderId, tenderId)))
      .orderBy(tenderRequirements.title, tenderRequirements.createdAt);
    const links = await this.db
      .select()
      .from(tenderQuestionRequirements)
      .where(
        and(
          eq(tenderQuestionRequirements.organizationId, auth.organizationId),
          inArray(tenderQuestionRequirements.requirementId, rows.map((row) => row.id)),
        ),
      );
    const questionIdsByRequirement = new Map<string, string[]>();
    for (const link of links) {
      const list = questionIdsByRequirement.get(link.requirementId) ?? [];
      list.push(link.questionId);
      questionIdsByRequirement.set(link.requirementId, list);
    }
    return {
      items: rows.map((row) => ({
        ...serializeRequirement(row),
        questionIds: questionIdsByRequirement.get(row.id) ?? [],
      })),
    };
  }

  async getRequirement(auth: AuthContext, tenderId: string, requirementId: string) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "requirement:read");
    await this.assertPolicyAllows(auth, "read", tender);
    const row = await this.requireRequirement(auth.organizationId, tenderId, requirementId);
    const links = await this.db
      .select()
      .from(tenderQuestionRequirements)
      .where(
        and(
          eq(tenderQuestionRequirements.organizationId, auth.organizationId),
          inArray(tenderQuestionRequirements.requirementId, [requirementId]),
          eq(tenderQuestionRequirements.requirementId, requirementId),
        ),
      );
    return {
      ...serializeRequirement(row),
      questionIds: links.map((link) => link.questionId),
    };
  }

  async createRequirement(auth: AuthContext, tenderId: string, input: CreateTenderRequirementInput) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertEditable(tender);
    if (!hasWorkspacePermission(auth, tender.workspaceId, "requirement:create")) {
      throw new TenderPermissionError("requirement:create");
    }

    const created = await withTransaction(async (tx) => {
      await this.lockTenderMutation(tx, auth.organizationId, tenderId);
      await this.invalidateResponseApproval(tx, auth.organizationId, tenderId);
      const [row] = await tx
        .insert(tenderRequirements)
        .values({
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          tenderId,
          requirementCode: input.requirementCode ?? null,
          title: input.title,
          description: input.description ?? "",
          requirementType: input.requirementType ?? "GENERAL",
          mandatory: input.mandatory ?? false,
          status: input.status ?? "UNASSIGNED",
          sourceReference: input.sourceReference ?? {},
          metadata: input.metadata ?? {},
        })
        .returning();
      if (!row) throw new TenderRequirementNotFoundError();

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          action: TENDER_AUDIT_ACTIONS.REQUIREMENT_CREATED,
          entityType: "tender_requirement",
          entityId: row.id,
          newValue: serializeRequirement(row),
          metadata: { tenderId },
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          label: `Created requirement ${row.title}`,
          action: TENDER_ACTIVITY_ACTIONS.REQUIREMENT_CREATED,
          entityType: "tender_requirement",
          entityId: row.id,
          summary: `Created requirement on tender ${tenderId}`,
        },
        tx,
      );
      return row;
    });

    return serializeRequirement(created);
  }

  async updateRequirement(auth: AuthContext, tenderId: string, requirementId: string, input: UpdateTenderRequirementInput) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertEditable(tender);
    const existing = await this.requireRequirement(auth.organizationId, tenderId, requirementId);
    if (!hasWorkspacePermission(auth, tender.workspaceId, "requirement:update")) {
      throw new TenderPermissionError("requirement:update");
    }

    const patch: Partial<typeof tenderRequirements.$inferInsert> = {};
    if (input.requirementCode !== undefined) patch.requirementCode = input.requirementCode;
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.requirementType !== undefined) patch.requirementType = input.requirementType;
    if (input.mandatory !== undefined) patch.mandatory = input.mandatory;
    if (input.status !== undefined) patch.status = input.status;
    if (input.sourceReference !== undefined) patch.sourceReference = input.sourceReference;
    if (input.metadata !== undefined) patch.metadata = input.metadata;

    const changedFields = Object.keys(patch);
    const updated = await withTransaction(async (tx) => {
      await this.lockTenderMutation(tx, auth.organizationId, tenderId);
      await this.invalidateResponseApproval(tx, auth.organizationId, tenderId);
      const [row] = await tx
        .update(tenderRequirements)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(tenderRequirements.id, requirementId), eq(tenderRequirements.organizationId, auth.organizationId)))
        .returning();
      if (!row) throw new TenderRequirementNotFoundError();

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          action: TENDER_AUDIT_ACTIONS.REQUIREMENT_UPDATED,
          entityType: "tender_requirement",
          entityId: requirementId,
          previousValue: pick(existing, changedFields),
          newValue: pick(row, changedFields),
          metadata: { changedFields },
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          label: `Updated requirement ${requirementId}`,
          action: TENDER_ACTIVITY_ACTIONS.REQUIREMENT_UPDATED,
          entityType: "tender_requirement",
          entityId: requirementId,
          summary: `Updated requirement on tender ${tenderId}`,
          metadata: { changedFields },
        },
        tx,
      );
      return row;
    });

    return serializeRequirement(updated);
  }

  async listAnswers(auth: AuthContext, tenderId: string) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "answer:read");
    await this.assertPolicyAllows(auth, "read", tender);
    const rows = await this.db
      .select()
      .from(tenderAnswers)
      .where(and(eq(tenderAnswers.organizationId, auth.organizationId), eq(tenderAnswers.tenderId, tenderId)))
      .orderBy(desc(tenderAnswers.createdAt));
    const versions = await this.db
      .select({ answerId: tenderAnswerVersions.answerId, versionNumber: tenderAnswerVersions.versionNumber })
      .from(tenderAnswerVersions)
      .where(
        and(
          eq(tenderAnswerVersions.organizationId, auth.organizationId),
          eq(tenderAnswerVersions.tenderId, tenderId),
        ),
      );
    const evidence = await this.db
      .select({ answerId: tenderAnswerEvidence.answerId, id: tenderAnswerEvidence.id })
      .from(tenderAnswerEvidence)
      .where(
        and(
          eq(tenderAnswerEvidence.organizationId, auth.organizationId),
          eq(tenderAnswerEvidence.tenderId, tenderId),
        ),
      );
    const reviewCounts = await this.db
      .select({ answerId: tenderAnswerReviews.answerId, count: sql<number>`count(*)` })
      .from(tenderAnswerReviews)
      .where(
        and(
          eq(tenderAnswerReviews.organizationId, auth.organizationId),
          eq(tenderAnswerReviews.tenderId, tenderId),
        ),
      )
      .groupBy(tenderAnswerReviews.answerId);

    const versionCountByAnswer = new Map<string, number>();
    for (const version of versions) {
      versionCountByAnswer.set(version.answerId, (versionCountByAnswer.get(version.answerId) ?? 0) + 1);
    }
    const evidenceCountByAnswer = new Map<string, number>();
    for (const item of evidence) {
      evidenceCountByAnswer.set(item.answerId, (evidenceCountByAnswer.get(item.answerId) ?? 0) + 1);
    }
    const reviewCountByAnswer = new Map<string, number>();
    for (const item of reviewCounts) {
      reviewCountByAnswer.set(item.answerId, Number(item.count ?? 0));
    }

    return {
      items: rows.map((row) => ({
        ...serializeAnswer(row),
        versionCount: versionCountByAnswer.get(row.id) ?? 0,
        evidenceCount: evidenceCountByAnswer.get(row.id) ?? 0,
        reviewCount: reviewCountByAnswer.get(row.id) ?? 0,
      })),
    };
  }

  async getAnswerVersions(auth: AuthContext, tenderId: string, answerId: string) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "answer:read");
    await this.assertPolicyAllows(auth, "read", tender);
    const answer = await this.requireAnswer(auth.organizationId, answerId);
    if (answer.tenderId !== tenderId) throw new TenderAnswerNotFoundError();

    const rows = await this.db
      .select()
      .from(tenderAnswerVersions)
      .where(
        and(
          eq(tenderAnswerVersions.organizationId, auth.organizationId),
          eq(tenderAnswerVersions.tenderId, tenderId),
          eq(tenderAnswerVersions.answerId, answerId),
        ),
      )
      .orderBy(desc(tenderAnswerVersions.versionNumber));

    return { items: rows.map(serializeAnswerVersion) };
  }

  async listAnswerEvidence(auth: AuthContext, tenderId: string, answerId: string) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "answer:read");
    await this.assertPolicyAllows(auth, "read", tender);
    const answer = await this.requireAnswer(auth.organizationId, answerId);
    if (answer.tenderId !== tenderId) throw new TenderAnswerNotFoundError();

    const rows = await this.db
      .select()
      .from(tenderAnswerEvidence)
      .where(
        and(
          eq(tenderAnswerEvidence.organizationId, auth.organizationId),
          eq(tenderAnswerEvidence.tenderId, tenderId),
          eq(tenderAnswerEvidence.answerId, answerId),
        ),
      )
      .orderBy(desc(tenderAnswerEvidence.createdAt));

    return { items: rows.map(serializeAnswerEvidence) };
  }

  async getRequirementEvidence(auth: AuthContext, tenderId: string, requirementId: string) {
    return this.searchRequirementEvidence(auth, tenderId, requirementId, { limit: 10 });
  }

  async generateRequirementAnswer(auth: AuthContext, tenderId: string, requirementId: string, assertActive?: (tx?: Transaction) => Promise<void>) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "answer:create");
    await this.assertPolicyAllows(auth, "update", tender);
    const requirement = await this.requireRequirement(auth.organizationId, tenderId, requirementId);
    const question = await this.requireQuestionForRequirement(auth.organizationId, tenderId, requirementId);

    const expectedAnswer = assertActive ? await this.findAnswerForQuestion(auth.organizationId, question.id) : undefined;
    const candidates = await this.evidenceRetrieval.retrieveRequirementEvidence(auth, tender, requirement);
    const selectedCandidates = selectEvidenceCandidates(candidates, {
      limit: 5,
      minFinalScore: ANSWER_EVIDENCE_MIN_FINAL_SCORE,
      includeStale: false,
    });
    const generationContext: AnswerGenerationContext = {
      tender: {
        id: tender.id,
        name: tender.name,
        title: tender.title,
        tenderType: tender.tenderType,
      },
      requirement: {
        requirementCode: requirement.requirementCode,
        title: requirement.title,
        description: requirement.description,
        requirementType: requirement.requirementType,
        mandatory: requirement.mandatory,
      },
      question: {
        id: question.id,
        questionNumber: question.questionNumber,
        section: question.section,
        questionText: question.questionText,
        questionType: question.questionType,
        required: question.required,
        status: question.status,
        sortOrder: question.sortOrder,
      },
      evidence: selectedCandidates.map(serializeEvidenceSummary),
    };

    const generated = await this.answerGeneration.generate(generationContext, {
      provider: "groq",
    });
    const evidenceState = generated.evidenceState ?? (selectedCandidates.length === 0 ? "NO_EVIDENCE" : "EVIDENCE_FOUND");

    if (generated.status === "INSUFFICIENT_EVIDENCE" || !generated.answer) {
      return {
        tender: serializeTender(tender),
        requirement: serializeRequirement(requirement),
        question: serializeQuestion(question),
        answer: null,
        generation: generated,
        evidenceState,
        reason: "No sufficient evidence found.",
        suggestedAction: "Assign to SME / Knowledge Owner",
        grounding: null,
      };
    }

    const existing = await this.findAnswerForQuestion(auth.organizationId, question.id);
    const grounding = await this.tenderAi.analyzeAnswer({
      tender: {
        id: tender.id,
        name: tender.name,
        title: tender.title,
        tenderType: tender.tenderType,
      },
      requirement: {
        id: requirement.id,
        requirementCode: requirement.requirementCode,
        title: requirement.title,
        description: requirement.description,
        requirementType: requirement.requirementType,
        mandatory: requirement.mandatory,
      },
      question: {
        id: question.id,
        questionNumber: question.questionNumber,
        section: question.section,
        questionText: question.questionText,
        questionType: question.questionType,
        required: question.required,
        status: question.status,
      },
      answer: generated.answer
        ? {
            id: existing?.id ?? "generated",
            answerText: generated.answer,
            status: generated.status,
            source: "AI_GENERATED",
            confidence: generated.confidence,
            metadata: generated.metadata,
          }
        : null,
      evidence: selectedCandidates.map(serializeEvidenceSummary),
    });
    const groundingStatus = deriveGroundingStatus(grounding);
    const groundingResult = {
      ...grounding,
      status: groundingStatus,
    };
    const answerStatus = groundingStatus === "SUPPORTED" && generated.status === "AI_DRAFT" ? "GENERATED" : "IN_REVIEW";
    const generationMetadata = buildAiEventMetadata("answer.generated", {
      provider: (generated.metadata.generation as { provider?: string }).provider,
      model: (generated.metadata.generation as { model?: string }).model,
      generatedAt: (generated.metadata.generation as { generatedAt?: string }).generatedAt,
      confidence: generated.confidence,
      evidenceIds: generated.evidenceIds,
      risk: generated.risk,
      status: answerStatus,
      evidenceState,
      groundingStatus,
      groundingCoverage: groundingResult.coverage,
      groundingSupportedClaims: groundingResult.supportedClaims,
      groundingUnsupportedClaims: groundingResult.unsupportedClaims,
    });
    await assertActive?.();
    const answer = await this.createAnswer(auth, tenderId, question.id, {
      answerText: generated.answer,
      source: "AI_GENERATED",
      confidence: generated.confidence,
      status: answerStatus,
      metadata: existing
        ? { ...existing.metadata, ...generated.metadata, ...generationMetadata, grounding: groundingResult, evidenceState }
        : { ...generated.metadata, ...generationMetadata, grounding: groundingResult, evidenceState },
    }, assertActive, expectedAnswer ?? (assertActive ? null : undefined));

    for (const evidence of selectedCandidates) {
      await this.addAnswerEvidence(auth, tenderId, answer.id, {
        evidenceType: evidence.evidenceType,
        evidenceId: evidence.evidenceId,
        sourceId: evidence.sourceId,
        sourceVersion: evidence.sourceVersion,
        relevance: evidence.relevanceScore,
        confidence: evidence.authorityScore,
        freshness: evidence.freshness,
        verifiedAt: evidence.verifiedAt,
        metadata: evidence.metadata,
      }, assertActive, new Date(answer.updatedAt));
    }

    return {
      tender: serializeTender(tender),
      requirement: serializeRequirement(requirement),
      question: serializeQuestion(question),
      answer,
      generation: {
        ...generated,
        status: answerStatus,
        evidenceState,
        grounding: groundingResult,
        metadata: {
          ...generated.metadata,
          generation: {
            ...(generated.metadata.generation as Record<string, unknown>),
            status: answerStatus,
            evidenceState,
            groundingStatus,
            groundingCoverage: groundingResult.coverage,
            groundingSupportedClaims: groundingResult.supportedClaims,
            groundingUnsupportedClaims: groundingResult.unsupportedClaims,
          },
        },
      },
      evidenceState,
      grounding: groundingResult,
      reason:
        groundingStatus === "SUPPORTED"
          ? null
          : groundingStatus === "PARTIALLY_SUPPORTED"
            ? "Only part of the question is supported by the selected evidence."
            : "The generated answer is not sufficiently grounded in the selected evidence.",
      suggestedAction: groundingStatus === "SUPPORTED" ? null : "Assign to SME / Knowledge Owner",
    };
  }

  async improveRequirementAnswer(
    auth: AuthContext,
    tenderId: string,
    requirementId: string,
    input: { transformation: string },
  ) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "answer:update");
    await this.assertPolicyAllows(auth, "update", tender);
    const requirement = await this.requireRequirement(auth.organizationId, tenderId, requirementId);
    const question = await this.requireQuestionForRequirement(auth.organizationId, tenderId, requirementId);
    const existing = await this.findAnswerForQuestion(auth.organizationId, question.id);
    const candidates = await this.evidenceRetrieval.retrieveRequirementEvidence(auth, tender, requirement);
    const selectedCandidates = selectEvidenceCandidates(candidates, {
      limit: 5,
      minFinalScore: ANSWER_EVIDENCE_MIN_FINAL_SCORE,
      includeStale: false,
    });

    if (!existing) {
      const generated = await this.generateRequirementAnswer(auth, tenderId, requirementId);
      if (!generated.answer) {
        return {
          tender: serializeTender(tender),
          requirement: serializeRequirement(requirement),
          question: serializeQuestion(question),
          answer: null,
          analysis: null,
        };
      }
    }

    const analysis = await this.tenderAi.analyzeAnswer({
      tender: {
        id: tender.id,
        name: tender.name,
        title: tender.title,
        tenderType: tender.tenderType,
      },
      requirement: {
        id: requirement.id,
        requirementCode: requirement.requirementCode,
        title: requirement.title,
        description: requirement.description,
        requirementType: requirement.requirementType,
        mandatory: requirement.mandatory,
      },
      question: {
        id: question.id,
        questionNumber: question.questionNumber,
        section: question.section,
        questionText: question.questionText,
        questionType: question.questionType,
        required: question.required,
        status: question.status,
      },
      answer: existing
        ? {
            id: existing.id,
            answerText: existing.answerText,
            status: existing.status,
            source: existing.source,
            confidence: Number(existing.confidence),
            metadata: existing.metadata,
          }
        : null,
      evidence: selectedCandidates.map(serializeEvidenceSummary),
    });

    const improved = await this.tenderAi.improveAnswer(
      {
        tender: {
          id: tender.id,
          name: tender.name,
          title: tender.title,
          tenderType: tender.tenderType,
        },
        requirement: {
          id: requirement.id,
          requirementCode: requirement.requirementCode,
          title: requirement.title,
          description: requirement.description,
          requirementType: requirement.requirementType,
          mandatory: requirement.mandatory,
        },
        question: {
          id: question.id,
          questionNumber: question.questionNumber,
          section: question.section,
          questionText: question.questionText,
          questionType: question.questionType,
          required: question.required,
          status: question.status,
        },
        answer: existing
          ? {
              id: existing.id,
              answerText: existing.answerText,
              status: existing.status,
              source: existing.source,
              confidence: Number(existing.confidence),
              metadata: existing.metadata,
            }
          : null,
        evidence: selectedCandidates.map(serializeEvidenceSummary),
      },
      input.transformation,
    );
    const improvementMetadata = buildAiEventMetadata("answer.improved", {
      provider: improved.metadata.provider ?? "tendyy-ai",
      model: improved.metadata.model ?? "unknown",
      transformation: input.transformation,
      evidenceIds: improved.evidenceIds,
      risk: improved.risk,
      status: improved.status,
      changes: improved.changes,
    });

    const answer = existing
      ? await this.updateAnswer(auth, tenderId, existing.id, {
          answerText: improved.answer ?? existing.answerText,
          source: "AI_GENERATED",
          confidence: improved.evidenceIds.length > 0 ? Math.max(improved.evidenceIds.length / 10, 0.3) : 0.3,
          status: improved.status === "AI_DRAFT" ? "GENERATED" : "IN_REVIEW",
          metadata: {
            ...existing.metadata,
            improvement: improved.metadata,
            changes: improved.changes,
            ...improvementMetadata,
          },
        })
      : await this.createAnswer(auth, tenderId, question.id, {
          answerText: improved.answer ?? "",
          source: "AI_GENERATED",
          confidence: improved.evidenceIds.length > 0 ? Math.max(improved.evidenceIds.length / 10, 0.3) : 0.3,
          status: improved.status === "AI_DRAFT" ? "GENERATED" : "IN_REVIEW",
          metadata: {
            improvement: improved.metadata,
            changes: improved.changes,
            ...improvementMetadata,
          },
        });

    if (selectedCandidates.length > 0) {
      const existingEvidence = await this.listAnswerEvidence(auth, tenderId, answer.id);
      const seen = new Set(existingEvidence.items.map((item) => item.evidenceId));
      for (const evidence of selectedCandidates) {
        if (seen.has(evidence.evidenceId)) continue;
        await this.addAnswerEvidence(auth, tenderId, answer.id, {
          evidenceType: evidence.evidenceType,
          evidenceId: evidence.evidenceId,
          sourceId: evidence.sourceId,
          sourceVersion: evidence.sourceVersion,
          relevance: evidence.relevanceScore,
          confidence: evidence.authorityScore,
          freshness: evidence.freshness,
          verifiedAt: evidence.verifiedAt,
          metadata: evidence.metadata,
        });
      }
    }

    return {
      tender: serializeTender(tender),
      requirement: serializeRequirement(requirement),
      question: serializeQuestion(question),
      answer,
      analysis,
      improvement: improved,
    };
  }

  async analyzeRequirementAnswer(auth: AuthContext, tenderId: string, requirementId: string) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "answer:read");
    await this.assertPolicyAllows(auth, "read", tender);
    const requirement = await this.requireRequirement(auth.organizationId, tenderId, requirementId);
    const question = await this.requireQuestionForRequirement(auth.organizationId, tenderId, requirementId);
    const answer = await this.findAnswerForQuestion(auth.organizationId, question.id);
    const candidates = await this.evidenceRetrieval.retrieveRequirementEvidence(auth, tender, requirement);
    const selectedCandidates = selectEvidenceCandidates(candidates, { limit: 5, minFinalScore: 0.55, includeStale: false });

    const analysis = await this.tenderAi.analyzeAnswer({
      tender: {
        id: tender.id,
        name: tender.name,
        title: tender.title,
        tenderType: tender.tenderType,
      },
      requirement: {
        id: requirement.id,
        requirementCode: requirement.requirementCode,
        title: requirement.title,
        description: requirement.description,
        requirementType: requirement.requirementType,
        mandatory: requirement.mandatory,
      },
      question: {
        id: question.id,
        questionNumber: question.questionNumber,
        section: question.section,
        questionText: question.questionText,
        questionType: question.questionType,
        required: question.required,
        status: question.status,
      },
      answer: answer
        ? {
            id: answer.id,
            answerText: answer.answerText,
            status: answer.status,
            source: answer.source,
            confidence: Number(answer.confidence),
            metadata: answer.metadata,
          }
        : null,
      evidence: selectedCandidates.map(serializeEvidenceSummary),
    });
    await this.recordAiAuditAndActivity(
      auth,
      {
        tenderId,
        workspaceId: tender.workspaceId,
        entityType: "tender_requirement",
        entityId: requirement.id,
        action: TENDER_AI_AUDIT_ACTIONS.ANSWER_ANALYZED,
        activityAction: TENDER_AI_ACTIVITY_ACTIONS.ANSWER_ANALYZED,
        label: `Analyzed answer for requirement ${requirement.title}`,
        summary: `Analyzed answer on tender ${tender.id}`,
        metadata: {
          requirementId: requirement.id,
          questionId: question.id,
          answerId: answer?.id ?? null,
          evidenceIds: selectedCandidates.map((item) => item.evidenceId),
          analysis,
        },
      },
    );

    return {
      tender: serializeTender(tender),
      requirement: serializeRequirement(requirement),
      question: serializeQuestion(question),
      answer: answer ? serializeAnswer(answer) : null,
      analysis,
      evidence: selectedCandidates.map(serializeEvidenceSummary),
    };
  }

  async getTenderBrief(auth: AuthContext, tenderId: string) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "tender:read");
    await this.assertPolicyAllows(auth, "read", tender);
    const [questions, requirements, sources, documents] = await Promise.all([
      this.listQuestions(auth, tenderId),
      this.listRequirements(auth, tenderId),
      this.listSources(auth, tenderId),
      this.db
        .select()
        .from(tenderDocuments)
        .where(and(eq(tenderDocuments.organizationId, auth.organizationId), eq(tenderDocuments.tenderId, tenderId))),
    ]);
    const firstRequirement = requirements.items[0];
    const evidence = firstRequirement
      ? await this.searchRequirementEvidence(auth, tenderId, firstRequirement.id, {
          limit: 5,
          includeStale: true,
          query: tender.title,
        })
      : { selected: [] as EvidenceCandidateLike[] };

    const brief = await this.tenderAi.getTenderBrief({
      tender: {
        id: tender.id,
        name: tender.name,
        title: tender.title,
        tenderType: tender.tenderType,
        referenceNumber: tender.referenceNumber,
        description: tender.description,
      },
      requirements: requirements.items.map((item) => ({
        id: item.id,
        requirementCode: item.requirementCode,
        title: item.title,
        description: item.description,
        requirementType: item.requirementType,
        mandatory: item.mandatory,
      })),
      questions: questions.items.map((item) => ({
        id: item.id,
        questionText: item.questionText,
        questionNumber: item.questionNumber,
        section: item.section,
      })),
      documents: documents.map((document) => ({
        id: document.id,
        name: `Document ${document.documentId}`,
        role: document.documentRole,
      })),
      dates: [
        { label: "Received", value: tender.receivedAt ? tender.receivedAt.toISOString() : null },
        { label: "Due", value: tender.dueAt ? tender.dueAt.toISOString() : null },
      ],
      evidence: evidence.selected.map((item) => serializeEvidenceSummary(item)),
      missingInformation: [
        tender.sourceUrl ? null : "source url",
        tender.dueAt ? null : "due date",
      ].filter((value): value is string => Boolean(value)),
    });
    await this.recordAiAuditAndActivity(
      auth,
      {
        tenderId,
        workspaceId: tender.workspaceId,
        entityType: "tender",
        entityId: tender.id,
        action: TENDER_AI_AUDIT_ACTIONS.TENDER_BRIEF_GENERATED,
        activityAction: TENDER_AI_ACTIVITY_ACTIONS.TENDER_BRIEF_GENERATED,
        label: `Generated brief for tender ${tender.title}`,
        summary: `Generated tender brief for ${tender.title}`,
        metadata: {
          brief,
          sectionCounts: {
            questions: questions.items.length,
            requirements: requirements.items.length,
            sources: sources.items.length,
          },
        },
      },
    );

    return {
      tender: serializeTender(tender),
      brief,
      sections: [
        { id: "questions", label: "Questions", items: questions.items.length },
        { id: "requirements", label: "Requirements", items: requirements.items.length },
        { id: "sources", label: "Sources", items: sources.items.length },
      ],
    };
  }

  async analyzeTender(auth: AuthContext, tenderId: string) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "ai.tender.analyze");
    await this.assertPolicyAllows(auth, "read", tender);

    const [overview, questions, requirements] = await Promise.all([
      this.getTenderBrief(auth, tenderId),
      this.listQuestions(auth, tenderId),
      this.listRequirements(auth, tenderId),
    ]);

    const requirementAnalyses = await Promise.all(
      requirements.items.map(async (requirement) => {
        const question = questions.items.find((item) => item.requirementIds.includes(requirement.id)) ?? null;
        const selectedQuestion = question
          ? {
              id: question.id,
              questionText: question.questionText,
              questionNumber: question.questionNumber,
              section: question.section,
            }
          : null;
        return {
          requirementId: requirement.id,
          analysis: await this.tenderAi.analyzeRequirement({
            tender: {
              id: tender.id,
              name: tender.name,
              title: tender.title,
              tenderType: tender.tenderType,
              referenceNumber: tender.referenceNumber,
              description: tender.description,
            },
            requirement: {
              id: requirement.id,
              requirementCode: requirement.requirementCode,
              title: requirement.title,
              description: requirement.description,
              requirementType: requirement.requirementType,
              mandatory: requirement.mandatory,
            },
            question: selectedQuestion,
            evidence: [],
          }),
        };
      }),
    );

    const missingInformation = Array.from(
      new Set([
        ...overview.brief.missingInformation,
        ...requirementAnalyses.flatMap((item) => item.analysis.missingInformation),
      ]),
    );
    const clarifications = await this.tenderAi.generateClarifications({
      tender: {
        id: tender.id,
        name: tender.name,
        title: tender.title,
        tenderType: tender.tenderType,
        referenceNumber: tender.referenceNumber,
        description: tender.description,
      },
      requirement: null,
      missingInformation,
      evidence: [],
    });
    await this.recordAiAuditAndActivity(
      auth,
      {
        tenderId,
        workspaceId: tender.workspaceId,
        entityType: "tender",
        entityId: tender.id,
        action: TENDER_AI_AUDIT_ACTIONS.TENDER_ANALYZED,
        activityAction: TENDER_AI_ACTIVITY_ACTIONS.TENDER_ANALYZED,
        label: `Analyzed tender ${tender.title}`,
        summary: `Analyzed tender ${tender.title}`,
        metadata: {
          brief: overview.brief,
          questionClassifications: questions.items.map((question) => ({
            id: question.id,
            questionText: question.questionText,
            group: classifyQuestionGroup(question.section, question.questionText),
          })),
          requirementAnalyses: requirementAnalyses.map((item) => ({
            requirementId: item.requirementId,
            analysis: item.analysis,
          })),
          missingInformation,
          clarifications,
        },
      },
    );

    return {
      tender: serializeTender(tender),
      brief: overview.brief,
      sections: overview.sections,
      questionClassifications: questions.items.map((question) => ({
        id: question.id,
        questionText: question.questionText,
        group: classifyQuestionGroup(question.section, question.questionText),
      })),
      requirementAnalyses,
      missingInformation,
      clarifications,
    };
  }

  async searchRequirementEvidence(
    auth: AuthContext,
    tenderId: string,
    requirementId: string,
    input: SearchTenderRequirementEvidenceInput,
  ) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "requirement:read");
    await this.assertPolicyAllows(auth, "read", tender);
    const requirement = await this.requireRequirement(auth.organizationId, tenderId, requirementId);

    const candidates = await this.evidenceRetrieval.retrieveRequirementEvidence(auth, tender, requirement, {
      query: input.query,
    });
    const ranked = this.evidenceRanking.rank(candidates);
    const selected = ranked.slice(0, input.limit ?? 10);

    return {
      requirement: serializeRequirement(requirement),
      candidates: ranked,
      selected,
      query: input.query ?? null,
    };
  }

  async addAnswerEvidence(
    auth: AuthContext,
    tenderId: string,
    answerId: string,
    input: {
      evidenceType: string;
      evidenceId: string;
      sourceId?: string | null;
      sourceVersion?: string | null;
      relevance?: number;
      confidence?: number;
      freshness?: string;
      verifiedAt?: string | null;
      metadata?: Record<string, unknown>;
    },
    assertActive?: (tx?: Transaction) => Promise<void>,
    expectedAnswerUpdatedAt?: Date,
  ) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "answer:update");
    this.assertEditable(tender);
    await this.assertPolicyAllows(auth, "update", tender);
    const answer = await this.requireAnswer(auth.organizationId, answerId);
    if (answer.tenderId !== tenderId) throw new TenderAnswerNotFoundError();
    const evidenceType = normalizeEvidenceType(input.evidenceType);

    const existing = await this.db
      .select()
      .from(tenderAnswerEvidence)
      .where(
        and(
          eq(tenderAnswerEvidence.organizationId, auth.organizationId),
          eq(tenderAnswerEvidence.tenderId, tenderId),
          eq(tenderAnswerEvidence.answerId, answerId),
          eq(tenderAnswerEvidence.evidenceType, evidenceType),
          eq(tenderAnswerEvidence.evidenceId, input.evidenceId),
        ),
      )
      .limit(1);
    if (existing[0]) return serializeAnswerEvidence(existing[0]);

    const resolved = await this.evidenceRetrieval.resolveEvidenceCandidate(auth, tender, {
      ...input,
      evidenceType,
    });
    if (!resolved) throw new TenderEvidenceNotFoundError();

    const evidence = this.evidenceSelection.select(answerId, [resolved], {
      limit: 1,
      minFinalScore: 0,
      includeStale: true,
    })[0];
    if (!evidence) throw new TenderEvidenceNotFoundError();

    const evidenceRow: typeof tenderAnswerEvidence.$inferInsert = {
      organizationId: auth.organizationId,
      workspaceId: tender.workspaceId,
      tenderId,
      answerId,
      sourceId: evidence.sourceId,
      sourceVersion: evidence.sourceVersion,
      evidenceType: evidence.evidenceType,
      evidenceId: evidence.evidenceId,
      relevance: String(evidence.relevance),
      confidence: String(evidence.confidence),
      freshness: evidence.freshness,
      verifiedAt: evidence.verifiedAt ? new Date(evidence.verifiedAt) : null,
      metadata: input.metadata ?? {},
    };

    const created = await withTransaction(async (tx) => {
      await this.lockTenderMutation(tx, auth.organizationId, tenderId);
      await assertActive?.(tx);
      if (expectedAnswerUpdatedAt) {
        const [current] = await tx.select().from(tenderAnswers).where(eq(tenderAnswers.id, answerId)).for("update");
        if (!current || current.updatedAt.getTime() !== expectedAnswerUpdatedAt.getTime()) throw new ConflictException({ code: "ANSWER_CHANGED", message: "The answer changed during generation; evidence was not modified." });
      }
      await this.invalidateResponseApproval(tx, auth.organizationId, tenderId, answerId);
      await tx.update(tenderAnswers).set({ status: "DRAFT", updatedAt: new Date() }).where(and(eq(tenderAnswers.id, answerId), inArray(tenderAnswers.status, ["APPROVED", "FINAL"])));
      const [row] = await tx
        .insert(tenderAnswerEvidence)
        .values(evidenceRow)
        .returning();
      if (!row) throw new TenderAnswerNotFoundError();

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          action: TENDER_AUDIT_ACTIONS.EVIDENCE_CREATED,
          entityType: "tender_answer_evidence",
          entityId: row.id,
          newValue: serializeAnswerEvidence(row),
          metadata: { answerId, evidenceType: row.evidenceType, evidenceId: row.evidenceId },
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          label: `Attached evidence ${row.evidenceType}:${row.evidenceId}`,
          action: TENDER_ACTIVITY_ACTIONS.ANSWER_EVIDENCE_ADDED,
          entityType: "tender_answer_evidence",
          entityId: row.id,
          kind: "evidence",
          summary: `Added answer evidence on tender ${tender.id}`,
          metadata: { answerId, evidenceType: row.evidenceType, evidenceId: row.evidenceId },
        },
        tx,
      );
      return row;
    });

    return serializeAnswerEvidence(created);
  }

  async removeAnswerEvidence(auth: AuthContext, tenderId: string, answerId: string, evidenceId: string) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "answer:update");
    this.assertEditable(tender);
    await this.assertPolicyAllows(auth, "update", tender);
    const answer = await this.requireAnswer(auth.organizationId, answerId);
    if (answer.tenderId !== tenderId) throw new TenderAnswerNotFoundError();

    const row = await this.db
      .select()
      .from(tenderAnswerEvidence)
      .where(
        and(
          eq(tenderAnswerEvidence.organizationId, auth.organizationId),
          eq(tenderAnswerEvidence.tenderId, tenderId),
          eq(tenderAnswerEvidence.answerId, answerId),
          eq(tenderAnswerEvidence.id, evidenceId),
        ),
      )
      .limit(1);
    if (!row[0]) throw new TenderAnswerNotFoundError();

    const removed = await withTransaction(async (tx) => {
      await this.lockTenderMutation(tx, auth.organizationId, tenderId);
      await this.invalidateResponseApproval(tx, auth.organizationId, tenderId, answerId);
      await tx.update(tenderAnswers).set({ status: "DRAFT", updatedAt: new Date() }).where(and(eq(tenderAnswers.id, answerId), inArray(tenderAnswers.status, ["APPROVED", "FINAL"])));
      const [deleted] = await tx
        .delete(tenderAnswerEvidence)
        .where(
          and(
            eq(tenderAnswerEvidence.organizationId, auth.organizationId),
            eq(tenderAnswerEvidence.tenderId, tenderId),
            eq(tenderAnswerEvidence.answerId, answerId),
            eq(tenderAnswerEvidence.id, evidenceId),
          ),
        )
        .returning();
      if (!deleted) throw new TenderAnswerNotFoundError();

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          action: TENDER_AUDIT_ACTIONS.EVIDENCE_REMOVED,
          entityType: "tender_answer_evidence",
          entityId: deleted.id,
          previousValue: serializeAnswerEvidence(deleted),
          metadata: { answerId },
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          label: `Removed evidence ${deleted.evidenceType}:${deleted.evidenceId}`,
          action: TENDER_ACTIVITY_ACTIONS.ANSWER_EVIDENCE_REMOVED,
          entityType: "tender_answer_evidence",
          entityId: deleted.id,
          kind: "evidence",
          summary: `Removed answer evidence on tender ${tender.id}`,
          metadata: { answerId, evidenceType: deleted.evidenceType, evidenceId: deleted.evidenceId },
        },
        tx,
      );
      return deleted;
    });

    return serializeAnswerEvidence(removed);
  }

  async listReviews(auth: AuthContext, tenderId: string) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "answer:read");
    await this.assertPolicyAllows(auth, "read", tender);

    const rows = await this.db
      .select({ review: tenderAnswerReviews, reviewerName: users.name })
      .from(tenderAnswerReviews)
      .leftJoin(users, eq(users.id, tenderAnswerReviews.reviewerId))
      .where(
        and(
          eq(tenderAnswerReviews.organizationId, auth.organizationId),
          eq(tenderAnswerReviews.tenderId, tenderId),
        ),
      )
      .orderBy(desc(tenderAnswerReviews.createdAt));

    return {
      items: rows.map((row) => ({
        ...serializeReview(row.review),
        reviewerName: row.reviewerName ?? null,
      })),
    };
  }

  async getReviewQueue(auth: AuthContext, input: ReviewQueueInput) {
    const workspaceIds = this.resolveAnswerWorkspaceScope(auth, input.workspaceId);
    const search = input.q ? `%${input.q}%` : null;
    const where = and(
      eq(tenderAnswerReviews.organizationId, auth.organizationId),
      workspaceIds ? inArray(tenderAnswerReviews.workspaceId, workspaceIds) : undefined,
      input.scope === "mine" ? eq(tenderAnswerReviews.reviewerId, auth.userId) : undefined,
      sql`${tenders.archivedAt} is null`,
      search
        ? or(
            ilike(tenders.title, search),
            ilike(tenders.name, search),
            ilike(tenders.referenceNumber, search),
            ilike(tenderQuestions.questionText, search),
            ilike(tenderAnswers.answerText, search),
          )
        : undefined,
    );

    const rows = await this.db
      .select({
        review: tenderAnswerReviews,
        tender: tenders,
        answer: tenderAnswers,
        question: tenderQuestions,
        reviewerId: users.id,
        reviewerName: users.name,
        reviewerEmail: users.email,
      })
      .from(tenderAnswerReviews)
      .innerJoin(tenders, eq(tenders.id, tenderAnswerReviews.tenderId))
      .innerJoin(tenderAnswers, eq(tenderAnswers.id, tenderAnswerReviews.answerId))
      .innerJoin(tenderQuestions, eq(tenderQuestions.id, tenderAnswers.questionId))
      .leftJoin(users, eq(users.id, tenderAnswerReviews.reviewerId))
      .where(where)
      .orderBy(asc(tenders.dueAt), asc(tenderAnswerReviews.createdAt));

    const readableRows = await this.filterReadableTenders(auth, rows, (row) => row.tender);

    const counts = {
      total: readableRows.length,
      actionable: 0,
      pending: 0,
      changesRequested: 0,
      approved: 0,
      rejected: 0,
    };
    for (const row of readableRows) {
      if (row.review.status === "PENDING") counts.pending += 1;
      if (row.review.status === "CHANGES_REQUESTED") counts.changesRequested += 1;
      if (row.review.status === "APPROVED") counts.approved += 1;
      if (row.review.status === "REJECTED") counts.rejected += 1;
      if (row.review.status === "PENDING" || row.review.status === "CHANGES_REQUESTED") counts.actionable += 1;
    }

    const visibleRows = readableRows.filter((row) => input.statuses.includes(row.review.status));
    const pageRows = visibleRows.slice((input.page - 1) * input.pageSize, input.page * input.pageSize);
    const answerIds = pageRows.map((row) => row.answer.id);
    const questionIds = [...new Set(pageRows.map((row) => row.question.id))];
    const [evidenceCounts, requirementRows] = await Promise.all([
      answerIds.length
        ? this.db
            .select({ answerId: tenderAnswerEvidence.answerId, count: sql<number>`count(*)` })
            .from(tenderAnswerEvidence)
            .where(and(eq(tenderAnswerEvidence.organizationId, auth.organizationId), inArray(tenderAnswerEvidence.answerId, answerIds)))
            .groupBy(tenderAnswerEvidence.answerId)
        : Promise.resolve([]),
      questionIds.length
        ? this.db
            .select({
              questionId: tenderQuestionRequirements.questionId,
              requirement: tenderRequirements,
            })
            .from(tenderQuestionRequirements)
            .innerJoin(tenderRequirements, eq(tenderRequirements.id, tenderQuestionRequirements.requirementId))
            .where(and(eq(tenderQuestionRequirements.organizationId, auth.organizationId), inArray(tenderQuestionRequirements.questionId, questionIds)))
            .orderBy(asc(tenderRequirements.requirementCode), asc(tenderRequirements.title))
        : Promise.resolve([]),
    ]);

    const evidenceCountByAnswer = new Map(evidenceCounts.map((row) => [row.answerId, Number(row.count ?? 0)]));
    const requirementByQuestion = new Map<string, TenderRequirementRow>();
    for (const row of requirementRows) {
      if (!requirementByQuestion.has(row.questionId)) requirementByQuestion.set(row.questionId, row.requirement);
    }

    return {
      generatedAt: new Date().toISOString(),
      items: pageRows.map((row) => {
        const requirement = requirementByQuestion.get(row.question.id) ?? null;
        const canAct =
          (row.review.status === "PENDING" || row.review.status === "CHANGES_REQUESTED") &&
          (hasOrganizationPermission(auth, "answer:review") || hasWorkspacePermission(auth, row.review.workspaceId, "answer:review"));
        return {
          review: {
            ...serializeReview(row.review),
            reviewerName: row.reviewerName ?? null,
          },
          tender: serializeTender(row.tender),
          answer: {
            ...serializeAnswer(row.answer),
            versionCount: 0,
            evidenceCount: evidenceCountByAnswer.get(row.answer.id) ?? 0,
            reviewCount: 1,
          },
          question: {
            ...serializeQuestion(row.question),
            requirementIds: requirement ? [requirement.id] : [],
          },
          requirement: requirement ? { ...serializeRequirement(requirement), questionIds: [row.question.id] } : null,
          reviewer: row.reviewerId
            ? {
                id: row.reviewerId,
                name: row.reviewerName ?? "Unknown reviewer",
                email: row.reviewerEmail ?? "",
              }
            : null,
          href: requirement ? `/tenders/${row.tender.id}/requirements/${requirement.id}` : `/apply/${row.tender.id}`,
          canAct,
        };
      }),
      counts,
      page: input.page,
      pageSize: input.pageSize,
      total: visibleRows.length,
    };
  }

  async getValidation(auth: AuthContext, tenderId: string) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "tender:read");
    await this.assertPolicyAllows(auth, "read", tender);

    const latest = await this.getLatestValidationRun(auth.organizationId, tenderId);
    const snapshot = await this.computeValidationSnapshot(auth, tender);

    return {
      tenderId,
      latestRun: latest ? serializeValidationRun(latest) : null,
      current: snapshot,
    };
  }

  async runValidation(auth: AuthContext, tenderId: string) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "tender:update");
    await this.assertPolicyAllows(auth, "update", tender);

    const snapshot = await this.computeValidationSnapshot(auth, tender);
    const created = await withTransaction(async (tx) => {
      const [row] = await tx
        .insert(tenderValidationRuns)
        .values({
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          tenderId,
          score: snapshot.score,
          ready: snapshot.ready,
          categories: snapshot.categories as unknown as Record<string, unknown>[],
          issues: snapshot.issues as unknown as Record<string, unknown>[],
          result: {
            tenderId,
            tenderStatus: tender.status,
            score: snapshot.score,
            ready: snapshot.ready,
            categories: snapshot.categories,
            issues: snapshot.issues,
          },
          createdBy: auth.userId,
        })
        .returning();
      if (!row) throw new TenderNotFoundError();

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          action: TENDER_AUDIT_ACTIONS.VALIDATION_RUN,
          entityType: "tender_validation_run",
          entityId: row.id,
          newValue: serializeValidationRun(row),
          metadata: { tenderId, score: snapshot.score, ready: snapshot.ready },
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          label: `Ran validation for tender ${tender.title}`,
          action: TENDER_ACTIVITY_ACTIONS.VALIDATION_RUN,
          entityType: "tender_validation_run",
          entityId: row.id,
          kind: "generated",
          summary: `Ran validation on tender ${tender.id}`,
          metadata: { score: snapshot.score, ready: snapshot.ready },
        },
        tx,
      );
      return row;
    });

    return serializeValidationRun(created);
  }

  async approveTender(auth: AuthContext, tenderId: string) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertEditable(tender, "APPROVED");
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "tender:approve");
    await this.assertPolicyAllows(auth, "approve", tender);

    const validation = await this.computeValidationSnapshot(auth, tender);
    if (!validation.ready) {
      throw new TenderTransitionNotAllowedError(tender.status, "APPROVED");
    }

    return this.transition(auth, tenderId, { to: "APPROVED", reason: "Validated and approved." });
  }

  async submitTender(auth: AuthContext, tenderId: string) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertEditable(tender, "SUBMITTED");
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "tender:submit");
    await this.assertPolicyAllows(auth, "submit", tender);

    const validation = await this.computeValidationSnapshot(auth, tender);
    if (!validation.ready && tender.status !== "APPROVED") {
      throw new TenderTransitionNotAllowedError(tender.status, "SUBMITTED");
    }

    return this.transition(auth, tenderId, { to: "SUBMITTED", reason: "Ready for submission." });
  }

  async getWorkspaceOverview(auth: AuthContext, tenderId: string) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "tender:read");
    await this.assertPolicyAllows(auth, "read", tender);

    const [questions, requirements, answers, sources, reviews, validation, documents, saved] = await Promise.all([
      this.listQuestions(auth, tenderId),
      this.listRequirements(auth, tenderId),
      this.listAnswers(auth, tenderId),
      this.listSources(auth, tenderId),
      this.listReviews(auth, tenderId),
      this.getValidation(auth, tenderId),
      this.listTenderDocumentRows(auth.organizationId, tenderId),
      this.isTenderSaved(auth.organizationId, tender.workspaceId, tender.id),
    ]);
    const timeline = await this.listTenderTimelineRows(auth, tender, [
      tender.id,
      ...sources.items.map((source) => source.id),
      ...requirements.items.map((requirement) => requirement.id),
      ...questions.items.map((question) => question.id),
      ...answers.items.map((answer) => answer.id),
      ...reviews.items.map((review) => review.id),
    ]);
    const serializedDocuments = documents.map(serializeTenderDocument);
    const processedDocuments = serializedDocuments.filter((document) => document.status === "PROCESSED").length;
    const pendingDocuments = serializedDocuments.filter((document) => document.status === "UPLOADED" || document.status === "PROCESSING").length;

    return {
      tender: serializeTender(tender, { saved }),
      counts: {
        questions: questions.items.length,
        requirements: requirements.items.length,
        answers: answers.items.length,
        sources: sources.items.length,
        documents: documents.length,
        processedDocuments,
        pendingDocuments,
        reviews: reviews.items.length,
        answeredQuestions: questions.items.filter((question) => answers.items.some((answer) => answer.questionId === question.id && answer.answerText.trim())).length,
        approvedAnswers: answers.items.filter((answer) => hasCurrentApproval(answer, reviews.items)).length,
      },
      sources: sources.items,
      documents: serializedDocuments,
      requirements: requirements.items,
      timeline: timeline.map(serializeTenderTimeline),
      validation,
      sections: [
        {
          id: "intake",
          label: "Intake",
          items: sources.items.length,
        },
        {
          id: "response",
          label: "Response",
          items: answers.items.length,
        },
        {
          id: "review",
          label: "Review",
          items: reviews.items.length,
        },
      ],
    };
  }

  async getTenderDocumentContent(auth: AuthContext, tenderId: string, documentId: string) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "tender:read");

    const [row] = await this.db
      .select({ document: tenderDocuments, file: files, extraction: tenderDocumentExtractions })
      .from(tenderDocuments)
      .innerJoin(files, eq(files.id, tenderDocuments.documentId))
      .leftJoin(
        tenderDocumentExtractions,
        and(
          eq(tenderDocumentExtractions.organizationId, auth.organizationId),
          eq(tenderDocumentExtractions.tenderDocumentId, tenderDocuments.id),
        ),
      )
      .where(
        and(
          eq(tenderDocuments.organizationId, auth.organizationId),
          eq(tenderDocuments.workspaceId, tender.workspaceId),
          eq(tenderDocuments.tenderId, tender.id),
          eq(tenderDocuments.id, documentId),
          eq(files.organizationId, auth.organizationId),
        ),
      )
      .limit(1);

    if (!row) throw new TenderDocumentNotFoundError();

    const content = row.extraction
      ? await this.db
          .select()
          .from(tenderDocumentContent)
          .where(
            and(
              eq(tenderDocumentContent.organizationId, auth.organizationId),
              eq(tenderDocumentContent.workspaceId, tender.workspaceId),
              eq(tenderDocumentContent.tenderId, tender.id),
              eq(tenderDocumentContent.tenderDocumentId, documentId),
              eq(tenderDocumentContent.extractionId, row.extraction.id),
            ),
          )
          .orderBy(asc(tenderDocumentContent.sequence))
      : [];

    return {
      document: serializeTenderDocument(row),
      extraction: row.extraction ? serializeTenderDocumentExtraction(row.extraction) : null,
      content: content.map(serializeTenderDocumentContent),
    };
  }

  private async listTenderDocumentRows(organizationId: string, tenderId: string) {
    return this.db
      .select({ document: tenderDocuments, file: files, extraction: tenderDocumentExtractions })
      .from(tenderDocuments)
      .innerJoin(files, eq(files.id, tenderDocuments.documentId))
      .leftJoin(
        tenderDocumentExtractions,
        and(
          eq(tenderDocumentExtractions.organizationId, organizationId),
          eq(tenderDocumentExtractions.tenderDocumentId, tenderDocuments.id),
        ),
      )
      .where(
        and(
          eq(tenderDocuments.organizationId, organizationId),
          eq(tenderDocuments.tenderId, tenderId),
          eq(files.organizationId, organizationId),
        ),
      )
      .orderBy(desc(tenderDocuments.createdAt));
  }

  private async listTenderTimelineRows(auth: AuthContext, tender: TenderRow, entityIds: string[]) {
    const uniqueEntityIds = Array.from(new Set(entityIds.filter(Boolean)));
    return this.db
      .select()
      .from(activities)
      .where(
        and(
          eq(activities.organizationId, auth.organizationId),
          eq(activities.workspaceId, tender.workspaceId),
          uniqueEntityIds.length > 1 ? inArray(activities.entityId, uniqueEntityIds) : eq(activities.entityId, tender.id),
        ),
      )
      .orderBy(desc(activities.createdAt))
      .limit(25);
  }

  private async ensureTenderDocumentForSource(source: TenderSourceRow, tx: Transaction, status: TenderDocumentStatus) {
    const metadata = source.metadata ?? {};
    const [inserted] = await tx
      .insert(tenderDocuments)
      .values({
        organizationId: source.organizationId,
        workspaceId: source.workspaceId,
        tenderId: source.tenderId,
        tenderSourceId: source.id,
        documentId: source.fileId,
        documentRole: "SOURCE_TENDER",
        status,
        failureReason: status === "FAILED" ? failureReasonFromMetadata(metadata) : null,
        processedAt: status === "PROCESSED" ? parsedAtFromSource(source) : null,
        metadata: {
          sourceId: source.id,
          sourceType: source.sourceType,
          sourceStatus: source.status,
          parseStatus: sourceParseStatus(source),
          ...metadata,
        },
      })
      .onConflictDoNothing({
        target: tenderDocuments.tenderSourceId,
      })
      .returning();

    if (inserted) return inserted;

    const [existing] = await tx
      .select()
      .from(tenderDocuments)
      .where(and(eq(tenderDocuments.organizationId, source.organizationId), eq(tenderDocuments.tenderSourceId, source.id)))
      .limit(1);
    if (!existing) throw new TenderSourceNotFoundError();
    return existing;
  }

  private async updateTenderDocumentStatusForSource(
    organizationId: string,
    sourceId: string,
    status: TenderDocumentStatus,
    failureReason: string | null,
    processedAt: Date | null,
    tx: Transaction,
  ) {
    await tx
      .update(tenderDocuments)
      .set({
        status,
        failureReason,
        processedAt,
        updatedAt: new Date(),
      })
      .where(and(eq(tenderDocuments.organizationId, organizationId), eq(tenderDocuments.tenderSourceId, sourceId)));
  }

  private async markTenderDocumentFailed(organizationId: string, sourceId: string, error: unknown) {
    await withTransaction(async (tx) => {
      await this.updateTenderDocumentStatusForSource(
        organizationId,
        sourceId,
        "FAILED",
        typeof error === "string" ? error : error instanceof Error ? error.message : "Document processing failed.",
        null,
        tx,
      );
    });
  }

  private async findTenderDocumentExtraction(organizationId: string, tenderDocumentId: string) {
    const [extraction] = await this.db
      .select()
      .from(tenderDocumentExtractions)
      .where(
        and(
          eq(tenderDocumentExtractions.organizationId, organizationId),
          eq(tenderDocumentExtractions.tenderDocumentId, tenderDocumentId),
        ),
      )
      .limit(1);
    return extraction ?? null;
  }

  private async saveTenderDocumentExtractionSuccess(
    tenderDocument: TenderDocumentRow,
    file: typeof files.$inferSelect,
    parsed: ExtractionResult,
    tx: Transaction,
  ) {
    const rows = tenderContentRowsFromExtraction(parsed);
    if (!rows.length) {
      throw new Error("No extractable text found. OCR is not currently supported for this document.");
    }

    const [extraction] = await tx
      .insert(tenderDocumentExtractions)
      .values({
        organizationId: tenderDocument.organizationId,
        workspaceId: tenderDocument.workspaceId,
        tenderId: tenderDocument.tenderId,
        tenderDocumentId: tenderDocument.id,
        extractor: parsed.extractor,
        status: "succeeded",
        pageCount: extractionPageCount(parsed),
        characterCount: rows.reduce((sum, row) => sum + row.text.length, 0),
        tableCount: parsed.tables.length,
        failureReason: null,
        metadata: {
          source: "tender.parseSource",
          mimeType: file.mimeType,
          filename: file.filename,
          contentBlocks: rows.length,
        },
        completedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: tenderDocumentExtractions.tenderDocumentId,
        set: {
          extractor: parsed.extractor,
          status: "succeeded",
          pageCount: extractionPageCount(parsed),
          characterCount: rows.reduce((sum, row) => sum + row.text.length, 0),
          tableCount: parsed.tables.length,
          failureReason: null,
          metadata: {
            source: "tender.parseSource",
            mimeType: file.mimeType,
            filename: file.filename,
            contentBlocks: rows.length,
          },
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!extraction) throw new Error("Failed to persist tender document extraction.");

    await tx.delete(tenderDocumentContent).where(eq(tenderDocumentContent.extractionId, extraction.id));
    await tx.insert(tenderDocumentContent).values(
      rows.map((row) => ({
        organizationId: tenderDocument.organizationId,
        workspaceId: tenderDocument.workspaceId,
        tenderId: tenderDocument.tenderId,
        tenderDocumentId: tenderDocument.id,
        extractionId: extraction.id,
        sequence: row.sequence,
        pageNumber: row.pageNumber,
        section: row.section,
        kind: row.kind,
        text: row.text,
        contentHash: row.contentHash,
        metadata: row.metadata,
      })),
    );
  }

  private async saveTenderDocumentExtractionFailure(
    tenderDocument: TenderDocumentRow,
    file: typeof files.$inferSelect,
    reason: string,
  ) {
    await withTransaction(async (tx) => {
      const [extraction] = await tx
        .insert(tenderDocumentExtractions)
        .values({
          organizationId: tenderDocument.organizationId,
          workspaceId: tenderDocument.workspaceId,
          tenderId: tenderDocument.tenderId,
          tenderDocumentId: tenderDocument.id,
          extractor: "tender.parseSource",
          status: "failed",
          pageCount: null,
          characterCount: 0,
          tableCount: 0,
          failureReason: reason,
          metadata: {
            mimeType: file.mimeType,
            filename: file.filename,
          },
          completedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: tenderDocumentExtractions.tenderDocumentId,
          set: {
            extractor: "tender.parseSource",
            status: "failed",
            pageCount: null,
            characterCount: 0,
            tableCount: 0,
            failureReason: reason,
            metadata: {
              mimeType: file.mimeType,
              filename: file.filename,
            },
            completedAt: new Date(),
            updatedAt: new Date(),
          },
        })
        .returning();

      if (extraction) {
        await tx.delete(tenderDocumentContent).where(eq(tenderDocumentContent.extractionId, extraction.id));
      }
    });
  }

  private selectTenderParser(mimeType: string, filename: string) {
    const normalized = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
    const extension = extname(filename).toLowerCase();
    if (normalized === "application/pdf" || extension === ".pdf") return this.pdfParser;
    if (
      normalized === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      extension === ".docx"
    ) {
      return this.docxParser;
    }
    return null;
  }

  private async markTenderSourceParseFailed(
    organizationId: string,
    tenderId: string,
    sourceId: string,
    metadata: Record<string, unknown>,
    error: unknown,
  ) {
    await this.db
      .update(tenderSources)
      .set({
        metadata: {
          ...metadata,
          parseStatus: "FAILED",
          failureReason: typeof error === "string" ? error : error instanceof Error ? error.message : "Document processing failed.",
        },
        updatedAt: new Date(),
      })
      .where(and(eq(tenderSources.organizationId, organizationId), eq(tenderSources.tenderId, tenderId), eq(tenderSources.id, sourceId)));
  }

  async exportTender(auth: AuthContext, tenderId: string) {
    const [tender, questions, requirements, answers, sources, reviews, validation] = await Promise.all([
      this.getById(auth, tenderId),
      this.listQuestions(auth, tenderId),
      this.listRequirements(auth, tenderId),
      this.listAnswers(auth, tenderId),
      this.listSources(auth, tenderId),
      this.listReviews(auth, tenderId),
      this.getValidation(auth, tenderId),
    ]);

    return {
      tender,
      questions,
      requirements,
      answers,
      sources,
      reviews,
      validation,
    };
  }

  async listSources(auth: AuthContext, tenderId: string) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "tender:source:read");
    await this.assertSourcePolicyAllows(auth, "read", tender);

    const rows = await this.db
      .select()
      .from(tenderSources)
      .where(and(eq(tenderSources.organizationId, auth.organizationId), eq(tenderSources.tenderId, tenderId)))
      .orderBy(desc(tenderSources.createdAt));

    return { items: rows.filter((source) => source.status !== "REMOVED").map(serializeSource) };
  }

  async createSourceUploadIntent(
    auth: AuthContext,
    tenderId: string,
    input: CreateTenderSourceUploadIntentInput,
  ) {
    this.assertStorageConfigured();
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "tender:source:create");
    await this.assertSourcePolicyAllows(auth, "create", tender, {
      sourceType: input.sourceType,
      filename: input.filename,
      mimeType: input.mimeType,
    });

    if (input.sourceType !== "DOCUMENT") {
      throw new TenderSourceInvalidFileError("Only DOCUMENT tender sources are supported in Phase 1.", {
        sourceType: input.sourceType,
      });
    }

    const { extension, mimeType, name } = this.validateSourceUpload(
      input.filename,
      input.mimeType,
      input.sizeBytes,
    );
    const sourceId = randomUUID();
    const fileId = randomUUID();
    const objectKey = tenderSourceObjectKey({
      organizationId: auth.organizationId,
      workspaceId: tender.workspaceId,
      tenderId,
      sourceId,
      filename: name,
    });

    const source = await withTransaction(async (tx) => {
      await tx.insert(files).values({
        id: fileId,
        organizationId: auth.organizationId,
        bucket: this.storage.bucket,
        objectKey,
        filename: name,
        mimeType,
        sizeBytes: input.sizeBytes,
        checksumSha256: null,
        uploadedBy: auth.userId,
      });

      const [row] = await tx
        .insert(tenderSources)
        .values({
          id: sourceId,
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          tenderId,
          sourceType: input.sourceType,
          name: input.name ?? name,
          externalReference: input.externalReference ?? null,
          sourceUrl: input.sourceUrl ?? null,
          fileId,
          mimeType,
          fileSize: input.sizeBytes,
          checksumSha256: null,
          status: "REGISTERED",
          createdBy: auth.userId,
          metadata: input.metadata ?? {},
        })
        .returning();

      if (!row) throw new TenderSourceNotFoundError();
      return row;
    });

    const ttl = this.config.get("UPLOAD_URL_TTL_SECONDS", { infer: true });
    const uploadUrl = await this.storage.presignPut({
      objectKey,
      mimeType,
      expiresInSeconds: ttl,
    });

    return {
      sourceId: source.id,
      fileId,
      uploadUrl,
      objectKey,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
      source: serializeSource(source),
      extension,
    };
  }

  async getSourceById(auth: AuthContext, tenderId: string, sourceId: string) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "tender:source:read");
    await this.assertSourcePolicyAllows(auth, "read", tender);

    const source = await this.requireSource(auth.organizationId, tenderId, sourceId);
    return serializeSource(source);
  }

  async completeSourceUpload(auth: AuthContext, tenderId: string, sourceId: string) {
    this.assertStorageConfigured();
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "tender:source:create");

    const row = await this.requireSourceWithFile(auth.organizationId, tenderId, sourceId);
    if (row.source.status === "REMOVED") throw new TenderSourceNotFoundError();
    if (row.source.status === "READY") {
      await withTransaction(async (tx) => {
        await this.ensureTenderDocumentForSource(row.source, tx, sourceParseStatus(row.source) === "PARSED" ? "PROCESSED" : "UPLOADED");
      });
      return serializeSource(row.source);
    }

    await this.assertSourcePolicyAllows(auth, "create", tender, {
      sourceType: row.source.sourceType,
      sourceId: row.source.id,
    });

    const head = await this.storage.headObject(row.file.objectKey);
    if (!head) throw new TenderSourceUploadIncompleteError();
    if (head.sizeBytes !== row.source.fileSize) {
      throw new TenderSourceInvalidFileError("The uploaded object size does not match the declared size.", {
        declaredBytes: row.source.fileSize,
        actualBytes: head.sizeBytes,
      });
    }

    const bytes = await this.storage.readObject(row.file.objectKey);
    if (!bytes) throw new TenderSourceUploadIncompleteError();
    void bytes;
    const checksum = createHash("sha256").update(bytes).digest("hex");

    const duplicate = await this.db
      .select({ id: tenderSources.id })
      .from(tenderSources)
      .where(
        and(
          eq(tenderSources.organizationId, auth.organizationId),
          eq(tenderSources.tenderId, tenderId),
          eq(tenderSources.checksumSha256, checksum),
          eq(tenderSources.status, "READY"),
        ),
      )
      .limit(1);

    if (duplicate[0]) {
      await withTransaction(async (tx) => {
      await tx
        .update(tenderSources)
        .set({
          status: "REMOVED",
          checksumSha256: null,
          removedAt: new Date(),
          updatedAt: new Date(),
        })
          .where(
            and(
              eq(tenderSources.organizationId, auth.organizationId),
              eq(tenderSources.id, sourceId),
              eq(tenderSources.tenderId, tenderId),
            ),
          );
      });

      try {
        await this.storage.deleteObject(row.file.objectKey);
      } catch (error) {
        this.logger.warn(
          `failed to clean up duplicate tender source object ${row.file.objectKey}: ${(error as Error).message}`,
          "TendersService",
        );
      }

      throw new TenderSourceDuplicateError();
    }

    const completed = await withTransaction(async (tx) => {
      const [updatedSource] = await tx
        .update(tenderSources)
        .set({
          status: "READY",
          checksumSha256: checksum,
          mimeType: row.file.mimeType ?? row.source.mimeType,
          fileSize: head.sizeBytes,
          metadata: {
            ...(row.source.metadata ?? {}),
            parseStatus: "UPLOADED",
            uploadedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tenderSources.organizationId, auth.organizationId),
            eq(tenderSources.id, sourceId),
            eq(tenderSources.tenderId, tenderId),
            eq(tenderSources.status, "REGISTERED"),
          ),
        )
        .returning();
      if (!updatedSource) throw new TenderSourceNotFoundError();

      await tx
        .update(files)
        .set({ checksumSha256: checksum })
        .where(and(eq(files.organizationId, auth.organizationId), eq(files.id, row.file.id)));

      await this.ensureTenderDocumentForSource(updatedSource, tx, "UPLOADED");

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          action: TENDER_AUDIT_ACTIONS.SOURCE_CREATED,
          entityType: "tender_source",
          entityId: updatedSource.id,
          newValue: serializeSource(updatedSource),
        },
        tx,
      );

      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          label: `Added source ${updatedSource.name}`,
          action: TENDER_ACTIVITY_ACTIONS.SOURCE_CREATED,
          entityType: "tender_source",
          entityId: updatedSource.id,
          summary: `Added source to tender ${tender.id}`,
          metadata: { tenderId, sourceId: updatedSource.id },
        },
        tx,
      );

      return updatedSource;
    });

    return serializeSource(completed);
  }

  async parseSource(auth: AuthContext, tenderId: string, sourceId: string) {
    this.assertStorageConfigured();
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "tender:source:create");

    const row = await this.requireSourceWithFile(auth.organizationId, tenderId, sourceId);
    if (row.source.status === "REMOVED") throw new TenderSourceNotFoundError();
    if (row.source.status !== "READY") throw new TenderSourceUploadIncompleteError();

    const metadata = row.source.metadata ?? {};
    let tenderDocument = await withTransaction(async (tx) => this.ensureTenderDocumentForSource(row.source, tx, "UPLOADED"));
    if (sourceParseStatus(row.source) === "PARSED") {
      const existingExtraction = await this.findTenderDocumentExtraction(auth.organizationId, tenderDocument.id);
      if (existingExtraction?.status === "succeeded") {
        await withTransaction(async (tx) => {
          await this.updateTenderDocumentStatusForSource(auth.organizationId, sourceId, "PROCESSED", null, parsedAtFromSource(row.source), tx);
        });
        return serializeSource(row.source);
      }
    }

    await withTransaction(async (tx) => {
      tenderDocument = await this.ensureTenderDocumentForSource(row.source, tx, "UPLOADED");
      await this.updateTenderDocumentStatusForSource(auth.organizationId, sourceId, "PROCESSING", null, null, tx);
    });

    let parsedContent: ExtractionResult;
    try {
      const prefix = await this.storage.readObjectPrefix(row.file.objectKey, SNIFF_LENGTH);
      if (!prefix) throw new TenderSourceUploadIncompleteError();

      const sniffed = sniffFormat(prefix);
      if (contradictsDeclaredType(sniffed, row.file.mimeType)) {
        throw new Error(`Content is ${sniffed} but the upload declared ${row.file.mimeType}.`);
      }

      const bytes = await this.storage.readObject(row.file.objectKey);
      if (!bytes) throw new TenderSourceUploadIncompleteError();

      const parser = this.selectTenderParser(row.file.mimeType, row.file.filename);
      if (!parser) {
        throw new Error("Unsupported document format. Supported formats are PDF and DOCX.");
      }

      parsedContent = await parser.parse(bytes);
      const contentRows = tenderContentRowsFromExtraction(parsedContent);
      if (!contentRows.length) {
        throw new Error("No extractable text found. OCR is not currently supported for this document.");
      }
    } catch (error) {
      const reason = userSafeTenderParseFailure(error);
      await this.markTenderDocumentFailed(auth.organizationId, sourceId, reason);
      await this.saveTenderDocumentExtractionFailure(tenderDocument, row.file, reason);
      await this.markTenderSourceParseFailed(auth.organizationId, tenderId, sourceId, metadata, reason);
      if (error instanceof TenderSourceUploadIncompleteError) throw error;
      throw new TenderSourceInvalidFileError(reason);
    }

    const parsedAt = new Date();
    const parsedSource = await withTransaction(async (tx) => {
      const { failureReason, processingError, parseError, ...successfulMetadata } = metadata;
      void failureReason;
      void processingError;
      void parseError;
      const [updatedSource] = await tx
        .update(tenderSources)
        .set({
          metadata: {
            ...successfulMetadata,
            parseStatus: "PARSED",
            parsedAt: parsedAt.toISOString(),
          },
          updatedAt: parsedAt,
        })
        .where(
          and(
            eq(tenderSources.organizationId, auth.organizationId),
            eq(tenderSources.id, sourceId),
            eq(tenderSources.tenderId, tenderId),
          ),
        )
        .returning();
      if (!updatedSource) throw new TenderSourceNotFoundError();

      await this.saveTenderDocumentExtractionSuccess(tenderDocument, row.file, parsedContent, tx);
      await this.updateTenderDocumentStatusForSource(auth.organizationId, sourceId, "PROCESSED", null, parsedAt, tx);

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          action: TENDER_AUDIT_ACTIONS.SOURCE_PARSED,
          entityType: "tender_source",
          entityId: updatedSource.id,
          previousValue: serializeSource(row.source),
          newValue: serializeSource(updatedSource),
          metadata: {
            tenderId,
            sourceId: updatedSource.id,
            parsedAt: parsedAt.toISOString(),
          },
        },
        tx,
      );

      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          label: `Parsed source ${updatedSource.name}`,
          action: TENDER_ACTIVITY_ACTIONS.SOURCE_PARSED,
          entityType: "tender_source",
          entityId: updatedSource.id,
          summary: `Parsed source for tender ${tender.id}`,
          metadata: {
            tenderId,
            sourceId: updatedSource.id,
            parsedAt: parsedAt.toISOString(),
          },
        },
        tx,
      );

      return updatedSource;
    });

    return serializeSource(parsedSource);
  }

  async removeSource(auth: AuthContext, tenderId: string, sourceId: string) {
    this.assertStorageConfigured();
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "tender:source:delete");

    const row = await this.requireSourceWithFile(auth.organizationId, tenderId, sourceId);
    if (row.source.status === "REMOVED") return serializeSource(row.source);

    await this.assertSourcePolicyAllows(auth, "delete", tender, {
      sourceType: row.source.sourceType,
      sourceId: row.source.id,
    });

    const removed = await withTransaction(async (tx) => {
      const [updatedSource] = await tx
        .update(tenderSources)
        .set({
          status: "REMOVED",
          removedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tenderSources.organizationId, auth.organizationId),
            eq(tenderSources.id, sourceId),
            eq(tenderSources.tenderId, tenderId),
          ),
        )
        .returning();
      if (!updatedSource) throw new TenderSourceNotFoundError();

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          action: TENDER_AUDIT_ACTIONS.SOURCE_REMOVED,
          entityType: "tender_source",
          entityId: updatedSource.id,
          previousValue: serializeSource(row.source),
          newValue: serializeSource(updatedSource),
        },
        tx,
      );

      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          label: `Removed source ${updatedSource.name}`,
          action: TENDER_ACTIVITY_ACTIONS.SOURCE_REMOVED,
          entityType: "tender_source",
          entityId: updatedSource.id,
          summary: `Removed source from tender ${tender.id}`,
          metadata: { tenderId, sourceId: updatedSource.id },
        },
        tx,
      );

      return updatedSource;
    });

    try {
      await this.storage.deleteObject(row.file.objectKey);
    } catch (error) {
      this.logger.warn(
        `failed to delete tender source object ${row.file.objectKey}: ${(error as Error).message}`,
        "TendersService",
      );
    }

    return serializeSource(removed);
  }

  async createAnswer(auth: AuthContext, tenderId: string, questionId: string, input: CreateTenderAnswerInput, assertActive?: (tx?: Transaction) => Promise<void>, expectedAnswer?: { id: string; updatedAt: Date } | null) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertEditable(tender);
    const question = await this.requireQuestion(auth.organizationId, tenderId, questionId);
    if (!hasWorkspacePermission(auth, tender.workspaceId, "answer:create")) {
      throw new TenderPermissionError("answer:create");
    }
    if (input.status === "FINAL" || input.status === "APPROVED") {
      throw new TenderAnswerFinalizationNotAllowedError();
    }

    await this.assertPolicyAllows(auth, "update", tender);
    const created = await withTransaction(async (tx) => {
      await this.lockTenderMutation(tx, auth.organizationId, tenderId);
      await assertActive?.(tx);
      const [existing] = await tx.select().from(tenderAnswers).where(and(eq(tenderAnswers.organizationId, auth.organizationId), eq(tenderAnswers.questionId, questionId))).for("update");
      if (expectedAnswer !== undefined && (expectedAnswer === null ? Boolean(existing) : !existing || existing.id !== expectedAnswer.id || existing.updatedAt.getTime() !== expectedAnswer.updatedAt.getTime())) throw new ConflictException({ code: "ANSWER_CHANGED", message: "The answer changed during generation; the current response was preserved." });
      await this.invalidateResponseApproval(tx, auth.organizationId, tenderId, existing?.id);
      if (existing) {
        const [row] = await tx
          .update(tenderAnswers)
          .set({
            answerText: input.answerText ?? existing.answerText,
            source: input.source ?? existing.source,
            confidence: input.confidence !== undefined ? input.confidence.toString() : existing.confidence,
            status: input.status ?? "DRAFT",
            updatedBy: auth.userId,
            metadata: input.metadata ?? existing.metadata,
            updatedAt: new Date(),
          })
          .where(and(eq(tenderAnswers.id, existing.id), eq(tenderAnswers.organizationId, auth.organizationId)))
          .returning();
        if (!row) throw new TenderAnswerNotFoundError();
        const version = await this.appendAnswerVersion(tx, row, auth.userId, input, existing);
        await this.audit.record(
          {
            organizationId: auth.organizationId,
            workspaceId: tender.workspaceId,
            actorId: auth.userId,
            action: TENDER_AUDIT_ACTIONS.ANSWER_UPDATED,
            entityType: "tender_answer",
            entityId: row.id,
            previousValue: serializeAnswer(existing),
            newValue: serializeAnswer(row),
          },
          tx,
        );
        await this.activity.record(
          {
            organizationId: auth.organizationId,
            workspaceId: tender.workspaceId,
            actorId: auth.userId,
            label: `Updated answer for question ${questionId}`,
            action: TENDER_ACTIVITY_ACTIONS.ANSWER_UPDATED,
            entityType: "tender_answer",
            entityId: row.id,
            summary: `Updated answer on tender ${tenderId}`,
          },
          tx,
        );
        await this.recordAiAnswerMutation(tx, auth, tender, question, existing, row, input, version);
        return row;
      }

      const [row] = await tx
        .insert(tenderAnswers)
        .values({
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          tenderId,
          questionId,
          answerText: input.answerText ?? "",
          status: input.status ?? (input.source === "AI_GENERATED" ? "GENERATED" : "DRAFT"),
          source: input.source ?? "MANUAL",
          confidence: input.confidence !== undefined ? input.confidence.toString() : "0",
          createdBy: auth.userId,
          updatedBy: auth.userId,
          metadata: input.metadata ?? {},
        })
        .returning();
      if (!row) throw new TenderAnswerNotFoundError();
      const [version] = await tx.insert(tenderAnswerVersions).values({
        organizationId: auth.organizationId,
        workspaceId: tender.workspaceId,
        tenderId,
        answerId: row.id,
        versionNumber: 1,
        content: row.answerText,
        source: row.source,
        createdBy: auth.userId,
        metadata: input.metadata ?? {},
      }).returning();
      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          action: TENDER_AUDIT_ACTIONS.ANSWER_CREATED,
          entityType: "tender_answer",
          entityId: row.id,
          newValue: serializeAnswer(row),
          metadata: { questionId },
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          label: `Created answer for question ${question.questionText}`,
          action: TENDER_ACTIVITY_ACTIONS.ANSWER_CREATED,
          entityType: "tender_answer",
          entityId: row.id,
          summary: `Created answer on tender ${tenderId}`,
          metadata: { questionId },
        },
          tx,
        );
      await this.recordAiAnswerMutation(tx, auth, tender, question, null, row, input, version ?? null);
      return row;
    });

    return serializeAnswer(created);
  }

  async updateAnswer(auth: AuthContext, tenderId: string, answerId: string, input: UpdateTenderAnswerInput) {
    const existing = await this.requireAnswer(auth.organizationId, answerId);
    if (existing.tenderId !== tenderId) {
      throw new TenderAnswerNotFoundError();
    }
    const tender = await this.requireTender(auth.organizationId, existing.tenderId);
    this.assertEditable(tender);
    if (!hasWorkspacePermission(auth, tender.workspaceId, "answer:update")) {
      throw new TenderPermissionError("answer:update");
    }

    await this.assertPolicyAllows(auth, "update", tender);
    if (input.status === "APPROVED") throw new TenderAnswerFinalizationNotAllowedError();

    const patch: Partial<typeof tenderAnswers.$inferInsert> = {};
    if (input.answerText !== undefined) patch.answerText = input.answerText;
    if (input.source !== undefined) patch.source = input.source;
    if (input.confidence !== undefined) patch.confidence = input.confidence.toString();
    if (input.status !== undefined) patch.status = input.status;
    if (input.metadata !== undefined) patch.metadata = input.metadata;

    const changedFields = Object.keys(patch);
    const updated = await withTransaction(async (tx) => {
      await this.lockTenderMutation(tx, auth.organizationId, tenderId);
      const [current] = await tx.select().from(tenderAnswers).where(eq(tenderAnswers.id, answerId)).for("update");
      if (!current) throw new TenderAnswerNotFoundError();
      const contentChanged = (input.answerText !== undefined && input.answerText !== current.answerText) || (input.source !== undefined && input.source !== current.source);
      if (input.status === "FINAL") {
        const reviews = await tx.select().from(tenderAnswerReviews).where(eq(tenderAnswerReviews.answerId, answerId));
        if (contentChanged || !hasCurrentApproval(current, reviews)) throw new TenderAnswerFinalizationNotAllowedError();
      }
      if (contentChanged) {
        patch.status = input.status === "GENERATED" || input.status === "IN_REVIEW" ? input.status : "DRAFT";
        await this.invalidateResponseApproval(tx, auth.organizationId, tenderId, answerId);
      }
      const [row] = await tx
        .update(tenderAnswers)
        .set({ ...patch, updatedBy: auth.userId, updatedAt: new Date() })
        .where(and(eq(tenderAnswers.id, answerId), eq(tenderAnswers.organizationId, auth.organizationId)))
        .returning();
      if (!row) throw new TenderAnswerNotFoundError();

      if (changedFields.length > 0) {
        const version = await this.appendAnswerVersion(tx, row, auth.userId, input, existing);
        await this.recordAiAnswerMutation(tx, auth, tender, null, existing, row, input, version);
      }

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          action: TENDER_AUDIT_ACTIONS.ANSWER_UPDATED,
          entityType: "tender_answer",
          entityId: answerId,
          previousValue: pick(existing, changedFields),
          newValue: pick(row, changedFields),
          metadata: { changedFields },
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          label: `Updated answer ${answerId}`,
          action: TENDER_ACTIVITY_ACTIONS.ANSWER_UPDATED,
          entityType: "tender_answer",
          entityId: answerId,
          summary: `Updated answer on tender ${tender.id}`,
          metadata: { changedFields },
        },
        tx,
      );
      return row;
    });

    return serializeAnswer(updated);
  }

  async createReview(auth: AuthContext, answerId: string, input: CreateTenderReviewInput) {
    const answer = await this.requireAnswer(auth.organizationId, answerId);
    const tender = await this.requireTender(auth.organizationId, answer.tenderId);
    if (!hasWorkspacePermission(auth, tender.workspaceId, "answer:review")) {
      throw new TenderPermissionError("answer:review");
    }

    this.assertEditable(tender);
    await this.assertPolicyAllows(auth, "update", tender);
    const reviewerId = input.reviewerId ?? auth.userId;
    await this.requireActiveMember(auth.organizationId, reviewerId);

    const existingReview = await this.db
      .select()
      .from(tenderAnswerReviews)
      .where(
        and(
          eq(tenderAnswerReviews.organizationId, auth.organizationId),
          eq(tenderAnswerReviews.answerId, answerId),
          eq(tenderAnswerReviews.reviewerId, reviewerId),
        ),
      )
      .limit(1);

    const created = await withTransaction(async (tx) => {
      await this.lockTenderMutation(tx, auth.organizationId, tender.id);
      if (input.status) await this.invalidateResponseApproval(tx, auth.organizationId, tender.id);
      const [currentAnswer] = await tx.select().from(tenderAnswers).where(eq(tenderAnswers.id, answerId)).for("update");
      if (!currentAnswer) throw new TenderAnswerNotFoundError();
      if (existingReview[0]) {
        const [row] = await tx
          .update(tenderAnswerReviews)
          .set({
            status: input.status ?? existingReview[0].status,
            ...(input.status ? { contentDigest: input.status === "APPROVED" ? answerContentDigest(currentAnswer) : null } : {}),
            comment: input.comment ?? existingReview[0].comment,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(tenderAnswerReviews.id, existingReview[0].id),
              eq(tenderAnswerReviews.organizationId, auth.organizationId),
            ),
          )
          .returning();
        if (!row) throw new TenderReviewNotFoundError();

        if (input.status && row.status === "PENDING") {
          await tx
            .update(tenderAnswers)
            .set({ status: "IN_REVIEW", updatedBy: auth.userId, updatedAt: new Date() })
            .where(eq(tenderAnswers.id, answerId));
        } else if (input.status) {
          await tx
            .update(tenderAnswers)
            .set({
              status:
                row.status === "APPROVED"
                  ? "APPROVED"
                  : row.status === "CHANGES_REQUESTED"
                    ? "CHANGES_REQUESTED"
                    : "REJECTED",
              updatedBy: auth.userId,
              updatedAt: new Date(),
            })
            .where(eq(tenderAnswers.id, answerId));
        }

        await this.audit.record(
          {
            organizationId: auth.organizationId,
            workspaceId: tender.workspaceId,
            actorId: auth.userId,
            action: TENDER_AUDIT_ACTIONS.REVIEW_UPDATED,
            entityType: "tender_answer_review",
            entityId: row.id,
            previousValue: serializeReview(existingReview[0]),
            newValue: serializeReview(row),
          },
          tx,
        );
        await this.activity.record(
          {
            organizationId: auth.organizationId,
            workspaceId: tender.workspaceId,
            actorId: auth.userId,
            label: `Updated review for answer ${answerId}`,
            action: TENDER_ACTIVITY_ACTIONS.REVIEW_COMPLETED,
            entityType: "tender_answer_review",
            entityId: row.id,
            summary: `Updated review on tender ${tender.id}`,
          },
          tx,
        );
        return row;
      }

      const [row] = await tx
        .insert(tenderAnswerReviews)
        .values({
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          tenderId: tender.id,
          answerId,
          reviewerId,
          status: input.status ?? "PENDING",
          contentDigest: input.status === "APPROVED" ? answerContentDigest(currentAnswer) : null,
          comment: input.comment ?? "",
        })
        .returning();
      if (!row) throw new TenderReviewNotFoundError();

      {
        await tx
          .update(tenderAnswers)
          .set({ status: row.status === "APPROVED" ? "APPROVED" : row.status === "CHANGES_REQUESTED" ? "CHANGES_REQUESTED" : row.status === "REJECTED" ? "REJECTED" : "IN_REVIEW", updatedBy: auth.userId, updatedAt: new Date() })
          .where(eq(tenderAnswers.id, answerId));
      }

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          action: TENDER_AUDIT_ACTIONS.REVIEW_CREATED,
          entityType: "tender_answer_review",
          entityId: row.id,
          newValue: serializeReview(row),
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          label: `Created review for answer ${answerId}`,
          action: TENDER_ACTIVITY_ACTIONS.REVIEW_CREATED,
          entityType: "tender_answer_review",
          entityId: row.id,
          summary: `Created review on tender ${tender.id}`,
        },
        tx,
      );
      return row;
    });

    return serializeReview(created);
  }

  async updateReview(auth: AuthContext, reviewId: string, input: UpdateTenderReviewInput) {
    const review = await this.requireReview(auth.organizationId, reviewId);
    const tender = await this.requireTender(auth.organizationId, review.tenderId);
    if (!hasWorkspacePermission(auth, tender.workspaceId, "answer:review")) {
      throw new TenderPermissionError("answer:review");
    }

    this.assertEditable(tender);
    await this.assertPolicyAllows(auth, "update", tender);
    const patch: Partial<typeof tenderAnswerReviews.$inferInsert> = {};
    if (input.comment !== undefined) patch.comment = input.comment;
    if (input.status !== undefined) patch.status = input.status;

    const changedFields = Object.keys(patch);
    const updated = await withTransaction(async (tx) => {
      await this.lockTenderMutation(tx, auth.organizationId, tender.id);
      if (input.status) await this.invalidateResponseApproval(tx, auth.organizationId, tender.id);
      const [answer] = await tx.select().from(tenderAnswers).where(eq(tenderAnswers.id, review.answerId)).for("update");
      if (!answer) throw new TenderAnswerNotFoundError();
      if (input.status) patch.contentDigest = input.status === "APPROVED" ? answerContentDigest(answer) : null;
      const [row] = await tx
        .update(tenderAnswerReviews)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(tenderAnswerReviews.id, reviewId), eq(tenderAnswerReviews.organizationId, auth.organizationId)))
        .returning();
      if (!row) throw new TenderReviewNotFoundError();

      if (input.status) {
        await tx
          .update(tenderAnswers)
          .set({
            status:
              input.status === "APPROVED"
                ? "APPROVED"
                : input.status === "CHANGES_REQUESTED"
                  ? "CHANGES_REQUESTED"
                  : input.status === "PENDING" ? "IN_REVIEW" : "REJECTED",
            updatedBy: auth.userId,
            updatedAt: new Date(),
          })
          .where(eq(tenderAnswers.id, row.answerId));
      }

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          action: TENDER_AUDIT_ACTIONS.REVIEW_UPDATED,
          entityType: "tender_answer_review",
          entityId: reviewId,
          previousValue: pick(review, changedFields),
          newValue: pick(row, changedFields),
          metadata: { changedFields },
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: tender.workspaceId,
          actorId: auth.userId,
          label: `Updated review ${reviewId}`,
          action: TENDER_ACTIVITY_ACTIONS.REVIEW_COMPLETED,
          entityType: "tender_answer_review",
          entityId: reviewId,
          summary: `Updated review on tender ${tender.id}`,
          metadata: { changedFields },
        },
        tx,
      );
      return row;
    });

    return serializeReview(updated);
  }

  async getAvailableTransitions(auth: AuthContext, tenderId: string) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    return {
      status: tender.status,
      transitions: allowedTransitionsFrom(tender.status as TenderStatus).map((rule) => ({
        to: rule.to,
        description: rule.description,
        requiresPermission: rule.permission,
        permitted:
          hasOrganizationPermission(auth, rule.permission) ||
          hasWorkspacePermission(auth, tender.workspaceId, rule.permission),
      })),
    };
  }

  private assertStorageConfigured(): void {
    if (!this.config.get("STORAGE_ENDPOINT", { infer: true })) {
      throw new TenderSourceStorageNotConfiguredError();
    }
  }

  private validateSourceUpload(filename: string, mimeType: string, sizeBytes: number) {
    const normalizedName = filename.trim();
    if (normalizedName.length === 0) {
      throw new TenderSourceInvalidFileError("Source filename cannot be empty.");
    }
    if (basename(normalizedName) !== normalizedName) {
      throw new TenderSourceInvalidFileError("Source filename must not contain path separators.");
    }

    const safeName = sanitizeFilename(normalizedName);
    const extension = extname(safeName).toLowerCase();
    const normalizedMime = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
    const format = TENDER_SOURCE_UPLOAD_FORMATS.find((entry) => entry.mimeTypes.includes(normalizedMime));
    if (!format) {
      throw new TenderSourceInvalidFileError(`${mimeType} is not an accepted tender source type.`, {
        accepted: TENDER_SOURCE_UPLOAD_FORMATS.flatMap((entry) => entry.mimeTypes),
      });
    }
    if (!format.extensions.includes(extension)) {
      throw new TenderSourceInvalidFileError(
        `The filename extension ${extension || "(none)"} does not match the declared MIME type.`,
        {
          filename: normalizedName,
          mimeType: normalizedMime,
          extensions: format.extensions,
        },
      );
    }

    const maxBytes = this.config.get("UPLOAD_MAX_BYTES", { infer: true });
    if (sizeBytes > maxBytes) {
      throw new TenderSourceInvalidFileError("That source is too large.", {
        sizeBytes,
        maxBytes,
      });
    }

    return { name: safeName, mimeType: normalizedMime, extension };
  }

  private async assertSourcePolicyAllows(
    auth: AuthContext,
    action: string,
    tender: TenderRow,
    extra: Record<string, unknown> = {},
  ) {
    const decision = await this.policy.evaluate(auth, "tender_source", action, {
      tenderId: tender.id,
      workspaceId: tender.workspaceId,
      ownerId: tender.ownerId,
      sourceType: tender.sourceType,
      ...extra,
    });
    if (!decision.allowed) {
      throw new ForbiddenException({
        code: "TENDER_SOURCE_ACCESS_DENIED",
        message: decision.reason ?? "You do not have access to this tender source.",
      });
    }
  }

  private async appendAnswerVersion(
    tx: Transaction,
    row: TenderAnswerRow,
    createdBy: string,
    input: Partial<CreateTenderAnswerInput | UpdateTenderAnswerInput>,
    previous?: TenderAnswerRow,
  ): Promise<TenderAnswerVersionRow | null> {
    const [latest] = await tx
      .select({ versionNumber: tenderAnswerVersions.versionNumber })
      .from(tenderAnswerVersions)
      .where(eq(tenderAnswerVersions.answerId, row.id))
      .orderBy(desc(tenderAnswerVersions.versionNumber))
      .limit(1);

    const [version] = await tx.insert(tenderAnswerVersions).values({
      organizationId: row.organizationId,
      workspaceId: row.workspaceId,
      tenderId: row.tenderId,
      answerId: row.id,
      versionNumber: (latest?.versionNumber ?? 0) + 1,
      content: row.answerText,
      source: row.source,
      createdBy,
      metadata: (input as { metadata?: Record<string, unknown> }).metadata ?? previous?.metadata ?? {},
    }).returning();

    return version ?? null;
  }

  private async requireQuestionForRequirement(organizationId: string, tenderId: string, requirementId: string) {
    const [row] = await this.db
      .select({ question: tenderQuestions })
      .from(tenderQuestionRequirements)
      .innerJoin(tenderQuestions, eq(tenderQuestions.id, tenderQuestionRequirements.questionId))
      .where(
        and(
          eq(tenderQuestionRequirements.organizationId, organizationId),
          eq(tenderQuestionRequirements.requirementId, requirementId),
          eq(tenderQuestions.organizationId, organizationId),
          eq(tenderQuestions.tenderId, tenderId),
        ),
      )
      .orderBy(asc(tenderQuestions.sortOrder), asc(tenderQuestions.createdAt))
      .limit(1);

    if (!row?.question) {
      throw new TenderQuestionNotFoundError();
    }

    return row.question;
  }

  private async getLatestValidationRun(organizationId: string, tenderId: string) {
    const [row] = await this.db
      .select()
      .from(tenderValidationRuns)
      .where(and(eq(tenderValidationRuns.organizationId, organizationId), eq(tenderValidationRuns.tenderId, tenderId)))
      .orderBy(desc(tenderValidationRuns.createdAt))
      .limit(1);
    return row ?? null;
  }

  private async latestAutomationRunsByTender(organizationId: string, tenderIds: string[]) {
    const latest = new Map<string, {
      id: string;
      status: string;
      failureReason: string | null;
      createdAt: string;
      completedAt: string | null;
    }>();
    if (tenderIds.length === 0) return latest;
    const rows = await this.db
      .select()
      .from(tenderAutomationRuns)
      .where(and(eq(tenderAutomationRuns.organizationId, organizationId), inArray(tenderAutomationRuns.tenderId, tenderIds)))
      .orderBy(desc(tenderAutomationRuns.createdAt));
    for (const row of rows) {
      if (latest.has(row.tenderId)) continue;
      latest.set(row.tenderId, {
        id: row.id,
        status: row.status,
        failureReason: row.failureReason,
        createdAt: row.createdAt.toISOString(),
        completedAt: row.completedAt?.toISOString() ?? null,
      });
    }
    return latest;
  }

  private async dashboardOwnersById(organizationId: string, ownerIds: string[]) {
    const owners = new Map<string, { id: string; name: string; email: string }>();
    if (ownerIds.length === 0) return owners;
    const rows = await this.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.status, "active"),
          inArray(organizationMembers.userId, ownerIds),
        ),
      );
    for (const row of rows) owners.set(row.id, row);
    return owners;
  }

  private async latestPackagesByTender(organizationId: string, tenderIds: string[]) {
    const latest = new Map<string, {
      id: string;
      version: number;
      status: "GENERATING" | "READY" | "FAILED" | "STALE" | "APPROVED";
      failureReason: string | null;
      createdAt: string;
      completedAt: string | null;
    }>();
    if (tenderIds.length === 0) return latest;
    const rows = await this.db
      .select()
      .from(tenderSubmissionPackages)
      .where(and(eq(tenderSubmissionPackages.organizationId, organizationId), inArray(tenderSubmissionPackages.tenderId, tenderIds)))
      .orderBy(desc(tenderSubmissionPackages.version));
    for (const row of rows) {
      if (latest.has(row.tenderId)) continue;
      latest.set(row.tenderId, {
        id: row.id,
        version: row.version,
        status: row.status,
        failureReason: row.failureReason,
        createdAt: row.createdAt.toISOString(),
        completedAt: row.completedAt?.toISOString() ?? null,
      });
    }
    return latest;
  }

  private async latestSubmissionsByTender(organizationId: string, tenderIds: string[]) {
    const latest = new Map<string, {
      id: string;
      packageId: string;
      portal: string;
      portalReference: string;
      submittedAt: string;
      notes: string;
      createdAt: string;
    }>();
    if (tenderIds.length === 0) return latest;
    const rows = await this.db
      .select()
      .from(tenderSubmissions)
      .where(and(eq(tenderSubmissions.organizationId, organizationId), inArray(tenderSubmissions.tenderId, tenderIds)))
      .orderBy(desc(tenderSubmissions.submittedAt));
    for (const row of rows) {
      if (latest.has(row.tenderId)) continue;
      latest.set(row.tenderId, {
        id: row.id,
        packageId: row.packageId,
        portal: row.portal,
        portalReference: row.portalReference,
        submittedAt: row.submittedAt.toISOString(),
        notes: row.notes,
        createdAt: row.createdAt.toISOString(),
      });
    }
    return latest;
  }

  private async computeValidationSnapshot(auth: AuthContext, tender: TenderRow): Promise<TenderValidationSnapshot> {
    const inputsByTender = await this.loadValidationInputs(auth.organizationId, [tender.id]);
    return scoreValidation(tender, inputsByTender.get(tender.id) ?? emptyValidationInputs());
  }

  /**
   * Loads everything `scoreValidation` needs for a set of tenders in a fixed
   * number of queries (six child tables plus the question-requirement links),
   * grouped by tender. The single-tender `getValidation` path and the
   * dashboard / pipeline / submissions batch path share this loader.
   */
  private async loadValidationInputs(
    organizationId: string,
    tenderIds: string[],
  ): Promise<Map<string, TenderValidationInputs>> {
    const inputsByTender = new Map<string, TenderValidationInputs>(
      tenderIds.map((tenderId) => [tenderId, emptyValidationInputs()]),
    );
    if (tenderIds.length === 0) return inputsByTender;

    const [questions, requirements, answers, sources, reviews, evidenceRows] = await Promise.all([
      this.db
        .select()
        .from(tenderQuestions)
        .where(and(eq(tenderQuestions.organizationId, organizationId), inArray(tenderQuestions.tenderId, tenderIds))),
      this.db
        .select()
        .from(tenderRequirements)
        .where(and(eq(tenderRequirements.organizationId, organizationId), inArray(tenderRequirements.tenderId, tenderIds))),
      this.db
        .select()
        .from(tenderAnswers)
        .where(and(eq(tenderAnswers.organizationId, organizationId), inArray(tenderAnswers.tenderId, tenderIds))),
      this.db
        .select()
        .from(tenderSources)
        .where(and(eq(tenderSources.organizationId, organizationId), inArray(tenderSources.tenderId, tenderIds))),
      this.db
        .select()
        .from(tenderAnswerReviews)
        .where(and(eq(tenderAnswerReviews.organizationId, organizationId), inArray(tenderAnswerReviews.tenderId, tenderIds))),
      this.db
        .select()
        .from(tenderAnswerEvidence)
        .where(
          and(
            eq(tenderAnswerEvidence.organizationId, organizationId),
            inArray(tenderAnswerEvidence.tenderId, tenderIds),
          ),
        ),
    ]);

    const inputsFor = (tenderId: string) => {
      let inputs = inputsByTender.get(tenderId);
      if (!inputs) {
        inputs = emptyValidationInputs();
        inputsByTender.set(tenderId, inputs);
      }
      return inputs;
    };
    for (const row of questions) inputsFor(row.tenderId).questions.push(row);
    for (const row of requirements) inputsFor(row.tenderId).requirements.push(row);
    for (const row of answers) inputsFor(row.tenderId).answers.push(row);
    for (const row of sources) inputsFor(row.tenderId).sources.push(row);
    for (const row of reviews) inputsFor(row.tenderId).reviews.push(row);
    for (const row of evidenceRows) inputsFor(row.tenderId).evidence.push(row);

    const questionIds = questions.map((question) => question.id);
    const requirementIds = requirements.map((requirement) => requirement.id);
    if (questionIds.length === 0 && requirementIds.length === 0) return inputsByTender;

    const links = await this.db
      .select()
      .from(tenderQuestionRequirements)
      .where(
        and(
          eq(tenderQuestionRequirements.organizationId, organizationId),
          or(
            questionIds.length > 0 ? inArray(tenderQuestionRequirements.questionId, questionIds) : undefined,
            requirementIds.length > 0 ? inArray(tenderQuestionRequirements.requirementId, requirementIds) : undefined,
          ),
        ),
      );

    // A link belongs to a tender under the same rule the single-tender query
    // used: its question is one of the tender's questions (when it has any)
    // AND its requirement is one of the tender's requirements (when it has any).
    for (const inputs of inputsByTender.values()) {
      if (inputs.questions.length === 0 && inputs.requirements.length === 0) continue;
      const tenderQuestionIds = new Set(inputs.questions.map((question) => question.id));
      const tenderRequirementIds = new Set(inputs.requirements.map((requirement) => requirement.id));
      inputs.links = links.filter(
        (link) =>
          (tenderQuestionIds.size === 0 || tenderQuestionIds.has(link.questionId)) &&
          (tenderRequirementIds.size === 0 || tenderRequirementIds.has(link.requirementId)),
      );
    }
    return inputsByTender;
  }

  private async requireSource(organizationId: string, tenderId: string, sourceId: string): Promise<TenderSourceRow> {
    const [row] = await this.db
      .select()
      .from(tenderSources)
      .where(and(eq(tenderSources.organizationId, organizationId), eq(tenderSources.id, sourceId)));
    if (!row || row.tenderId !== tenderId) throw new TenderSourceNotFoundError();
    return row;
  }

  private async requireSourceWithFile(
    organizationId: string,
    tenderId: string,
    sourceId: string,
  ): Promise<TenderSourceWithFileRow> {
    const [row] = await this.db
      .select({ source: tenderSources, file: files })
      .from(tenderSources)
      .innerJoin(files, eq(files.id, tenderSources.fileId))
      .where(and(eq(tenderSources.organizationId, organizationId), eq(tenderSources.id, sourceId)))
      .limit(1);
    if (!row || row.source.tenderId !== tenderId) throw new TenderSourceNotFoundError();
    return row;
  }

  private async requireTender(organizationId: string, tenderId: string): Promise<TenderRow> {
    const [row] = await this.db
      .select()
      .from(tenders)
      .where(and(eq(tenders.organizationId, organizationId), eq(tenders.id, tenderId)));
    if (!row) throw new TenderNotFoundError();
    return row;
  }

  private async isTenderSaved(organizationId: string, workspaceId: string, tenderId: string) {
    const [row] = await this.db
      .select({ tenderId: savedTenders.tenderId })
      .from(savedTenders)
      .where(
        and(
          eq(savedTenders.organizationId, organizationId),
          eq(savedTenders.workspaceId, workspaceId),
          eq(savedTenders.tenderId, tenderId),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  private tenderListOrder(sort: ListTendersInput["sort"]) {
    if (sort === "deadline") return [asc(tenders.dueAt), desc(tenders.createdAt)];
    if (sort === "title") return [asc(tenders.title), desc(tenders.createdAt)];
    if (sort === "value") return [desc(tenders.estimatedValue), desc(tenders.createdAt)];
    if (sort === "created") return [desc(tenders.createdAt)];
    return [desc(tenders.updatedAt), desc(tenders.createdAt)];
  }

  private async requireWorkspace(organizationId: string, workspaceId: string) {
    const [row] = await this.db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.organizationId, organizationId), eq(workspaces.id, workspaceId)));
    if (!row) throw new TenderWorkspaceNotFoundError();
    return row;
  }

  private async requireActiveMember(organizationId: string, userId: string) {
    const [row] = await this.db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.status, "active"),
        ),
      );
    if (!row) throw new TenderOwnerNotFoundError();
    return row;
  }

  private async requireQuestion(organizationId: string, tenderId: string, questionId: string) {
    const [row] = await this.db
      .select()
      .from(tenderQuestions)
      .where(
        and(
          eq(tenderQuestions.organizationId, organizationId),
          eq(tenderQuestions.tenderId, tenderId),
          eq(tenderQuestions.id, questionId),
        ),
      );
    if (!row) throw new TenderQuestionNotFoundError();
    return row;
  }

  private async requireRequirement(organizationId: string, tenderId: string, requirementId: string) {
    const [row] = await this.db
      .select()
      .from(tenderRequirements)
      .where(
        and(
          eq(tenderRequirements.organizationId, organizationId),
          eq(tenderRequirements.tenderId, tenderId),
          eq(tenderRequirements.id, requirementId),
        ),
      );
    if (!row) throw new TenderRequirementNotFoundError();
    return row;
  }

  private async requireRequirements(organizationId: string, tenderId: string, requirementIds: string[]) {
    if (requirementIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(tenderRequirements)
      .where(
        and(
          eq(tenderRequirements.organizationId, organizationId),
          eq(tenderRequirements.tenderId, tenderId),
          inArray(tenderRequirements.id, requirementIds),
        ),
      );
    if (rows.length !== requirementIds.length) throw new TenderRequirementNotFoundError();
    return rows;
  }

  private async requireAnswer(organizationId: string, answerId: string) {
    const [row] = await this.db
      .select()
      .from(tenderAnswers)
      .where(and(eq(tenderAnswers.organizationId, organizationId), eq(tenderAnswers.id, answerId)));
    if (!row) throw new TenderAnswerNotFoundError();
    return row;
  }

  private async requireReview(organizationId: string, reviewId: string) {
    const [row] = await this.db
      .select()
      .from(tenderAnswerReviews)
      .where(and(eq(tenderAnswerReviews.organizationId, organizationId), eq(tenderAnswerReviews.id, reviewId)));
    if (!row) throw new TenderReviewNotFoundError();
    return row;
  }

  private async findAnswerForQuestion(organizationId: string, questionId: string) {
    const [row] = await this.db
      .select()
      .from(tenderAnswers)
      .where(and(eq(tenderAnswers.organizationId, organizationId), eq(tenderAnswers.questionId, questionId)));
    return row ?? null;
  }

  private assertEditable(tender: TenderRow, targetStatus?: TenderStatus) {
    if (tender.status === "SUBMITTED" && !targetStatus) throw new TenderNotEditableError();
    if (["ARCHIVED", "CANCELLED", "CLOSED"].includes(tender.status) && targetStatus !== "ARCHIVED") {
      throw new TenderNotEditableError();
    }
  }

  /**
   * Validation snapshots and review rows for many tenders at once, for the
   * list views. Same loader and scorer as `getValidation`, so a tender scores
   * identically here and on its own page, at a fixed query count instead of
   * a dozen queries per tender.
   */
  private async validationSummariesByTender(
    organizationId: string,
    tenderRows: TenderRow[],
  ): Promise<Map<string, TenderValidationSummary>> {
    const inputsByTender = await this.loadValidationInputs(
      organizationId,
      tenderRows.map((tender) => tender.id),
    );
    return new Map(
      tenderRows.map((tender) => {
        const inputs = inputsByTender.get(tender.id) ?? emptyValidationInputs();
        return [tender.id, { validation: scoreValidation(tender, inputs), reviews: inputs.reviews }];
      }),
    );
  }

  /** As `validationSummariesByTender`, but a failure degrades the section instead of failing the page. */
  private async tryValidationSummariesByTender(
    organizationId: string,
    tenderRows: TenderRow[],
    errors: DashboardSectionError[],
    section: string,
  ): Promise<Map<string, TenderValidationSummary>> {
    try {
      return await this.validationSummariesByTender(organizationId, tenderRows);
    } catch (error) {
      this.reportSectionError(errors, section, error);
      return new Map();
    }
  }

  /**
   * The summary for one card, after the same permission checks the per-tender
   * `getValidation` and `listReviews` calls used to apply. The `read` policy
   * has already been applied to the whole list by `filterReadableTenders`.
   */
  private readableValidationSummary(
    auth: AuthContext,
    tender: TenderRow,
    summaries: Map<string, TenderValidationSummary>,
  ): TenderValidationSummary {
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "tender:read");
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "answer:read");
    const summary = summaries.get(tender.id);
    if (!summary) throw new Error(`Validation data for tender ${tender.id} is unavailable.`);
    return summary;
  }

  /**
   * Logs the real failure server-side and adds one generic entry per section to
   * the response, so internal error text never reaches the client.
   */
  private reportSectionError(
    errors: DashboardSectionError[],
    section: string,
    error: unknown,
    tenderId?: string,
  ) {
    this.logger.warn(
      `dashboard section ${section} degraded${tenderId ? ` for tender ${tenderId}` : ""}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "TendersService",
    );
    if (errors.some((entry) => entry.section === section)) return;
    errors.push({
      section,
      message: section === "ai_activity" ? "AI activity could not be loaded." : "Some tender details could not be loaded.",
    });
  }

  /**
   * Drops rows whose tender a `tender:read` policy denies to the caller. One
   * batched policy evaluation for the whole list, so list endpoints stay at a
   * fixed number of policy queries however many tenders they return.
   */
  private async filterReadableTenders<T>(
    auth: AuthContext,
    rows: T[],
    tenderOf: (row: T) => TenderPolicySubject = (row) => row as unknown as TenderPolicySubject,
  ): Promise<T[]> {
    if (rows.length === 0) return rows;
    const decisions = await this.policy.evaluateMany(
      auth,
      "tender",
      "read",
      rows.map((row) => tenderPolicyAttributes(tenderOf(row))),
    );
    return rows.filter((_, index) => decisions[index]?.allowed !== false);
  }

  private async assertPolicyAllows(
    auth: AuthContext,
    action: string,
    tender: TenderRow,
    extra: Record<string, unknown> = {},
  ) {
    const decision = await this.policy.evaluate(auth, "tender", action, {
      ...tenderPolicyAttributes(tender),
      ...extra,
    });
    if (!decision.allowed) {
      throw new ForbiddenException({
        code: "TENDER_ACCESS_DENIED",
        message: decision.reason ?? "You do not have access to this tender.",
      });
    }
  }

  private assertTenderWorkspacePermission(
    auth: AuthContext,
    workspaceId: string,
    permission:
      | "tender:read"
      | "tender:update"
      | "tender:approve"
      | "tender:submit"
      | "tender:source:read"
      | "tender:source:create"
      | "tender:source:delete"
      | "question:read"
      | "question:create"
      | "question:update"
      | "requirement:read"
      | "requirement:create"
      | "requirement:update"
      | "answer:read"
      | "answer:create"
      | "answer:update"
      | "answer:review"
      | "ai.tender.analyze",
  ) {
    if (hasOrganizationPermission(auth, permission)) return;
    if (hasWorkspacePermission(auth, workspaceId, permission)) return;

    throw new TenderPermissionError(permission);
  }

  private resolveWorkspaceScope(auth: AuthContext, workspaceId?: string) {
    if (workspaceId) {
      if (
        !hasOrganizationPermission(auth, "tender:read") &&
        !hasWorkspacePermission(auth, workspaceId, "tender:read")
      ) {
        throw new TenderPermissionError("tender:read");
      }
      return [workspaceId];
    }

    if (hasOrganizationPermission(auth, "tender:read")) {
      return null;
    }

    const workspaceIds = auth.workspaceIds ?? [];
    if (workspaceIds.length === 0) {
      throw new TenderPermissionError("tender:read");
    }
    return workspaceIds;
  }

  private resolveRequirementWorkspaceScope(auth: AuthContext, workspaceId?: string) {
    if (workspaceId) {
      if (!hasWorkspacePermission(auth, workspaceId, "requirement:read")) {
        throw new TenderPermissionError("requirement:read");
      }
      return [workspaceId];
    }

    if (hasOrganizationPermission(auth, "requirement:read")) {
      return null;
    }

    const workspaceIds = (auth.workspaceIds ?? []).filter((id) => hasWorkspacePermission(auth, id, "requirement:read"));
    if (workspaceIds.length === 0) {
      throw new TenderPermissionError("requirement:read");
    }
    return workspaceIds;
  }

  private resolveAnswerWorkspaceScope(auth: AuthContext, workspaceId?: string) {
    if (workspaceId) {
      if (!hasOrganizationPermission(auth, "answer:read") && !hasWorkspacePermission(auth, workspaceId, "answer:read")) {
        throw new TenderPermissionError("answer:read");
      }
      return [workspaceId];
    }

    if (hasOrganizationPermission(auth, "answer:read")) {
      return null;
    }

    const workspaceIds = (auth.workspaceIds ?? []).filter((id) => hasWorkspacePermission(auth, id, "answer:read"));
    if (workspaceIds.length === 0) {
      throw new TenderPermissionError("answer:read");
    }
    return workspaceIds;
  }

  private async syncQuestionRequirements(
    tx: TenderQueryRunner,
    organizationId: string,
    workspaceId: string,
    questionId: string,
    requirementIds: string[],
  ) {
    if (requirementIds.length === 0) return;
    const rows = await tx
      .insert(tenderQuestionRequirements)
      .values(
        requirementIds.map((requirementId) => ({
          organizationId,
          workspaceId,
          questionId,
          requirementId,
        })),
      );
    void rows;
  }

  private async recordAiAnswerMutation(
    tx: Transaction,
    auth: AuthContext,
    tender: TenderRow,
    question: TenderQuestionRow | null,
    previous: TenderAnswerRow | null,
    current: TenderAnswerRow,
    input: Partial<CreateTenderAnswerInput | UpdateTenderAnswerInput>,
    version: TenderAnswerVersionRow | null,
  ) {
    const operation = extractAiOperation(input.metadata);
    if (!operation) return;

    const action =
      operation === "answer.improved"
        ? TENDER_AI_AUDIT_ACTIONS.ANSWER_IMPROVED
        : TENDER_AI_AUDIT_ACTIONS.ANSWER_GENERATED;
    const activityAction =
      operation === "answer.improved"
        ? TENDER_AI_ACTIVITY_ACTIONS.ANSWER_IMPROVED
        : TENDER_AI_ACTIVITY_ACTIONS.ANSWER_GENERATED;

    const metadata = {
      operation,
      versionId: version?.id ?? null,
      versionNumber: version?.versionNumber ?? null,
      questionId: question?.id ?? null,
      answerId: current.id,
      tenderId: tender.id,
      ...extractRecord(input.metadata?.ai),
    };

    await this.audit.record(
      {
        organizationId: auth.organizationId,
        workspaceId: tender.workspaceId,
        actorId: auth.userId,
        actorType: "ai_agent",
        action,
        entityType: "tender_answer",
        entityId: current.id,
        previousValue: previous ? serializeAnswer(previous) : null,
        newValue: serializeAnswer(current),
        metadata,
      },
      tx,
    );

    await this.activity.record(
      {
        organizationId: auth.organizationId,
        workspaceId: tender.workspaceId,
        actorId: auth.userId,
        actorType: "ai_agent",
        actorLabel: "TENDYY AI",
        kind: "generated",
        label:
          operation === "answer.improved"
            ? `Improved answer for ${question?.questionText ?? "requirement"}`
            : `Generated answer for ${question?.questionText ?? "requirement"}`,
        action: activityAction,
        entityType: "tender_answer",
        entityId: current.id,
        summary:
          operation === "answer.improved"
            ? `Improved answer on tender ${tender.id}`
            : `Generated answer on tender ${tender.id}`,
        metadata,
      },
      tx,
    );
  }

  private async recordAiAuditAndActivity(
    auth: AuthContext,
    input: {
      tenderId: string;
      workspaceId: string;
      entityType: string;
      entityId: string;
      action: (typeof TENDER_AI_AUDIT_ACTIONS)[keyof typeof TENDER_AI_AUDIT_ACTIONS];
      activityAction: (typeof TENDER_AI_ACTIVITY_ACTIONS)[keyof typeof TENDER_AI_ACTIVITY_ACTIONS];
      label: string;
      summary: string;
      metadata: Record<string, unknown>;
    },
  ) {
    await this.audit.record({
      organizationId: auth.organizationId,
      workspaceId: input.workspaceId,
      actorId: auth.userId,
      actorType: "ai_agent",
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: {
        tenderId: input.tenderId,
        ...input.metadata,
      },
    });

    await this.activity.record({
      organizationId: auth.organizationId,
      workspaceId: input.workspaceId,
      actorId: auth.userId,
      actorType: "ai_agent",
      actorLabel: "TENDYY AI",
      kind: "generated",
      label: input.label,
      action: input.activityAction,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      metadata: {
        tenderId: input.tenderId,
        ...input.metadata,
      },
    });
  }
}

function pick(row: Record<string, unknown>, fields: string[]) {
  return Object.fromEntries(fields.map((field) => [field, row[field]]));
}

function extractRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function extractAiOperation(metadata: Record<string, unknown> | undefined) {
  const ai = extractRecord(metadata?.ai);
  const operation = ai.operation;
  return typeof operation === "string" ? operation : null;
}

function buildAiEventMetadata(operation: string, details: Record<string, unknown>) {
  return {
    ai: {
      operation,
      generationId: randomUUID(),
      ...details,
    },
  };
}

function deriveGroundingStatus(analysis: {
  coverage: number;
  supportedClaims: number;
  unsupportedClaims: number;
  contradictions: Array<{ claim: string; evidenceIds: string[]; reason: string }>;
}) {
  if (analysis.supportedClaims === 0 || analysis.contradictions.length > 0) {
    return "UNSUPPORTED" as const;
  }
  if (analysis.coverage < 1 || analysis.unsupportedClaims > 0) {
    return "PARTIALLY_SUPPORTED" as const;
  }
  return "SUPPORTED" as const;
}

type TenderPolicySubject = Pick<TenderRow, "id" | "workspaceId" | "ownerId" | "status" | "tenderType" | "archivedAt">;

/** The attributes `tender` access policies are evaluated against. */
function tenderPolicyAttributes(tender: TenderPolicySubject) {
  return {
    tenderId: tender.id,
    workspaceId: tender.workspaceId,
    ownerId: tender.ownerId,
    status: tender.status,
    tenderType: tender.tenderType,
    archived: tender.archivedAt !== null,
  };
}

function serializeTender(row: TenderRow, options: { saved?: boolean } = {}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    name: row.name,
    title: row.title,
    referenceNumber: row.referenceNumber,
    description: row.description,
    buyerName: row.buyerName,
    location: row.location,
    estimatedValue: row.estimatedValue === null ? null : Number(row.estimatedValue),
    currency: row.currency,
    tenderType: row.tenderType,
    sourceType: row.sourceType,
    sourceReference: row.sourceReference,
    sourceUrl: row.sourceUrl,
    status: row.status,
    ownerId: row.ownerId,
    createdBy: row.createdBy,
    receivedAt: row.receivedAt,
    dueAt: row.dueAt,
    timezone: row.timezone,
    metadata: row.metadata,
    archivedAt: row.archivedAt,
    saved: options.saved ?? false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function emptyDashboardKnowledge(): DashboardKnowledgeHealth {
  return {
    counts: { total: 0, draft: 0, active: 0, archived: 0, stale: 0 },
    items: [],
    attention: [],
  };
}

function formatStatusLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/**
 * Pure readiness scoring for one tender. Every validation read path — the
 * single-tender endpoint and the batched dashboard / pipeline / submissions
 * views — goes through this function so their numbers cannot drift apart.
 */
function scoreValidation(tender: TenderRow, inputs: TenderValidationInputs): TenderValidationSnapshot {
  const { questions, requirements, answers, sources, reviews, links } = inputs;
  const evidenceRows = inputs.evidence;

  const answerByQuestionId = new Map(answers.map((answer) => [answer.questionId, answer]));
  const requirementById = new Map(requirements.map((requirement) => [requirement.id, requirement]));
  const requirementIdsByQuestion = new Map<string, string[]>();
  const questionIdsByRequirement = new Map<string, string[]>();
  for (const link of links) {
    const requirementsForQuestion = requirementIdsByQuestion.get(link.questionId) ?? [];
    requirementsForQuestion.push(link.requirementId);
    requirementIdsByQuestion.set(link.questionId, requirementsForQuestion);

    const questionsForRequirement = questionIdsByRequirement.get(link.requirementId) ?? [];
    questionsForRequirement.push(link.questionId);
    questionIdsByRequirement.set(link.requirementId, questionsForRequirement);
  }

  const evidenceCountByAnswer = new Map<string, number>();
  for (const evidence of evidenceRows) {
    evidenceCountByAnswer.set(evidence.answerId, (evidenceCountByAnswer.get(evidence.answerId) ?? 0) + 1);
  }
  const reviewCountByAnswer = new Map<string, number>();
  const latestReviewByAnswer = new Map<string, typeof tenderAnswerReviews.$inferSelect>();
  for (const review of reviews) {
    reviewCountByAnswer.set(review.answerId, (reviewCountByAnswer.get(review.answerId) ?? 0) + 1);
    const current = latestReviewByAnswer.get(review.answerId);
    if (!current || current.createdAt < review.createdAt) {
      latestReviewByAnswer.set(review.answerId, review);
    }
  }

  const mandatoryRequirements = requirements.filter((requirement) => requirement.mandatory);
  const requirementIsApproved = (requirement: typeof tenderRequirements.$inferSelect) => {
    const linkedQuestionIds = questionIdsByRequirement.get(requirement.id) ?? [];
    return linkedQuestionIds.length > 0 && linkedQuestionIds.every((questionId) => { const answer = answerByQuestionId.get(questionId); return answer ? hasCurrentApproval(answer, reviews) : false; });
  };
  const approvedMandatory = mandatoryRequirements.filter(requirementIsApproved);
  const answeredQuestions = questions.filter((question) => answerByQuestionId.has(question.id));
  const answeredWithEvidence = answers.filter((answer) => (evidenceCountByAnswer.get(answer.id) ?? 0) > 0);
  const reviewedAnswers = answers.filter((answer) => hasCurrentApproval(answer, reviews));
  const readySources = sources.filter((source) => source.status === "READY");

  let score = 100;
  const issues: TenderValidationIssue[] = [];
  const addIssue = (issue: TenderValidationIssue, weight: number) => {
    issues.push(issue);
    score -= weight;
  };

  const categories: TenderValidationCategory[] = [
    validationCategory(
      "questionCoverage",
      "Questions answered",
      answeredQuestions.length,
      questions.length,
      answeredQuestions.length === questions.length ? "success" : "warning",
      "Every question should have a linked answer before the tender is approved.",
    ),
    validationCategory(
      "mandatory",
      "Mandatory requirements approved",
      approvedMandatory.length,
      mandatoryRequirements.length,
      mandatoryRequirements.length === 0 || approvedMandatory.length === mandatoryRequirements.length
        ? "success"
        : "danger",
      "Mandatory requirements must be approved before submission.",
    ),
    validationCategory(
      "evidence",
      "Answers backed by evidence",
      answeredWithEvidence.length,
      answers.length,
      answers.length === 0 || answeredWithEvidence.length / Math.max(answers.length, 1) > 0.8 ? "success" : "warning",
      "Linked evidence keeps answers traceable during review.",
    ),
    validationCategory(
      "reviews",
      "Answers reviewed",
      reviewedAnswers.length,
      answers.length,
      reviewedAnswers.length === answers.length ? "success" : "warning",
      "Reviewed answers are easier to finalize and submit.",
    ),
    validationCategory(
      "sources",
      "Source files ready",
      readySources.length,
      sources.length,
      sources.length === 0 || readySources.length === sources.length ? "success" : "warning",
      "Document and intake sources should be uploaded and marked ready.",
    ),
  ];

  for (const requirement of mandatoryRequirements) {
    if (requirementIsApproved(requirement)) continue;
    addIssue(
      {
        id: `requirement-${requirement.id}-not-approved`,
        severity: "HIGH",
        title: `Mandatory requirement ${requirement.title} is not approved`,
        detail: "A mandatory requirement still needs approval before this tender can be submitted.",
        recommendation: "Assign a reviewer and approve every answer linked to this requirement.",
        blocking: true,
        requirementId: requirement.id,
      },
      25,
    );
  }

  for (const question of questions) {
    const answer = answerByQuestionId.get(question.id);
    if (answer) continue;
    addIssue(
      {
        id: `question-${question.id}-unanswered`,
        severity: question.required ? "MEDIUM" : "LOW",
        title: `Question ${question.questionText} has no answer`,
        detail: "The workspace still has an unanswered question.",
        recommendation: "Draft an answer and link supporting evidence if the question is material.",
        blocking: Boolean(question.required),
        questionId: question.id,
      },
      question.required ? 10 : 3,
    );
  }

  for (const answer of answers) {
    const evidenceCount = evidenceCountByAnswer.get(answer.id) ?? 0;
    const latestReview = latestReviewByAnswer.get(answer.id);
    if (questions.find((question) => question.id === answer.questionId)?.required && !hasCurrentApproval(answer, reviews)) {
      addIssue({ id: `answer-${answer.id}-unapproved-content`, severity: "HIGH", title: "Required answer needs a current approved review", detail: "Approval must match the current answer content.", recommendation: "Review the latest answer and approve it.", blocking: true, answerId: answer.id, questionId: answer.questionId }, 15);
    }
    if (evidenceCount === 0) {
      const relatedRequirementIds = requirementIdsByQuestion.get(answer.questionId) ?? [];
      const relatedMandatory = relatedRequirementIds.some((requirementId) => requirementById.get(requirementId)?.mandatory);
      addIssue(
        {
          id: `answer-${answer.id}-no-evidence`,
          severity: relatedMandatory ? "HIGH" : "MEDIUM",
          title: `Answer ${answer.id} has no evidence`,
          detail: "Answers should be traceable to evidence before approval.",
          recommendation: "Attach a source, document, or note that supports this answer.",
          blocking: relatedMandatory,
          answerId: answer.id,
          questionId: answer.questionId,
        },
        relatedMandatory ? 15 : 6,
      );
    }

    if (latestReview?.status === "PENDING" || latestReview?.status === "CHANGES_REQUESTED") {
      addIssue(
        {
          id: `answer-${answer.id}-needs-review`,
          severity: latestReview.status === "PENDING" ? "MEDIUM" : "HIGH",
          title: `Answer ${answer.id} still needs review`,
          detail:
            latestReview.status === "PENDING"
              ? "A review has been opened but not completed."
              : "Changes were requested and still need resolution.",
          recommendation: "Resolve the reviewer feedback and run validation again.",
          blocking: latestReview.status === "CHANGES_REQUESTED",
          answerId: answer.id,
          questionId: answer.questionId,
        },
        latestReview.status === "PENDING" ? 5 : 12,
      );
    }
  }

  if (tender.tenderType === "DOCUMENT" && readySources.length === 0) {
    addIssue(
      {
        id: "tender-document-source-missing",
        severity: "MEDIUM",
        title: "Document tender has no ready source material",
        detail: "Document tenders should carry at least one ready source before they are approved.",
        recommendation: "Upload or complete the source file and mark it ready.",
        blocking: false,
      },
      8,
    );
  }

  if (tender.tenderType === "ONLINE" && !tender.sourceUrl && Object.keys(tender.sourceReference ?? {}).length === 0) {
    addIssue(
      {
        id: "tender-online-source-missing",
        severity: "MEDIUM",
        title: "Online tender is missing source reference details",
        detail: "Online tenders should preserve the portal or source reference that defined the request.",
        recommendation: "Add the portal URL or a structured source reference to the tender metadata.",
        blocking: false,
      },
      8,
    );
  }

  score = Math.max(0, Math.min(100, score));
  const ready = issues.filter((issue) => issue.blocking).length === 0 && score >= 75;

  return {
    score,
    ready,
    categories,
    issues,
  };
}

/** The readiness / issue / review fields shared by dashboard and pipeline cards. */
function validationCardFields({ validation, reviews }: TenderValidationSummary) {
  const issues = validation.issues ?? [];
  const highestIssue = issues.reduce<TenderValidationIssue | null>((best, issue) => {
    if (!best) return issue;
    const issueScore = rankSeverity(issue.severity);
    const bestScore = rankSeverity(best.severity);
    return issueScore > bestScore ? issue : best;
  }, null);
  return {
    readiness: validation.score,
    ready: validation.ready,
    highestIssue,
    issueCount: issues.length,
    blockingIssueCount: issues.filter((issue) => issue.blocking).length,
    pendingReviews: reviews.filter((review) => review.status === "PENDING" || review.status === "CHANGES_REQUESTED")
      .length,
    totalReviews: reviews.length,
  };
}

function emptyValidationInputs(): TenderValidationInputs {
  return { questions: [], requirements: [], answers: [], sources: [], reviews: [], evidence: [], links: [] };
}

function validationCategory(
  id: string,
  label: string,
  value: number,
  total: number | null,
  tone: ValidationTone,
  hint: string,
): TenderValidationCategory {
  return { id, label, value, total, tone, hint };
}

function serializeValidationRun(row: TenderValidationRunRow) {
  return {
    id: row.id,
    score: row.score,
    ready: row.ready,
    categories: Array.isArray(row.categories) ? row.categories : [],
    issues: Array.isArray(row.issues) ? row.issues : [],
    result: row.result,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

function emptyRequirementsQueue(input: RequirementsQueueInput) {
  return {
    items: [],
    counts: {
      tenders: 0,
      requirements: 0,
      mandatory: 0,
      unanswered: 0,
      highRisk: 0,
      pendingReview: 0,
      approved: 0,
      blocked: 0,
    },
    page: input.page,
    pageSize: input.pageSize,
    total: 0,
  };
}

function emptyResponsesQueue(input: ResponsesQueueInput) {
  return {
    items: [],
    counts: {
      total: 0,
      draft: 0,
      needsReview: 0,
      missingEvidence: 0,
      lowConfidence: 0,
      changesRequested: 0,
      final: 0,
    },
    page: input.page,
    pageSize: input.pageSize,
    total: 0,
  };
}

function emptySubmissionsQueue(input: SubmissionsQueueInput) {
  return {
    items: [],
    counts: {
      tenders: 0,
      noPackage: 0,
      generating: 0,
      ready: 0,
      approved: 0,
      needsRebuild: 0,
      submitted: 0,
      blocked: 0,
    },
    page: input.page,
    pageSize: input.pageSize,
    total: 0,
  };
}

function latestDate(values: Array<Date | string | null | undefined>) {
  const dates = values
    .filter((value): value is Date | string => Boolean(value))
    .map((value) => (value instanceof Date ? value : new Date(value)))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());
  return dates[0] ?? null;
}

function buildResponseReviewSummary(rows: Array<{ review: TenderReviewRow; reviewerName: string | null }>) {
  const counts = rows.reduce(
    (acc, row) => {
      acc.total += 1;
      if (row.review.status === "PENDING") acc.pending += 1;
      if (row.review.status === "CHANGES_REQUESTED") acc.changesRequested += 1;
      if (row.review.status === "APPROVED") acc.approved += 1;
      if (row.review.status === "REJECTED") acc.rejected += 1;
      return acc;
    },
    { total: 0, pending: 0, changesRequested: 0, approved: 0, rejected: 0 },
  );
  const latest = rows[0] ? { ...serializeReview(rows[0].review), reviewerName: rows[0].reviewerName } : null;
  return {
    latest,
    counts,
    latestStatus: latest?.status ?? null,
    latestComment: latest?.comment ?? null,
    latestReviewerName: latest?.reviewerName ?? null,
  };
}

type ResponseQueueRow = {
  tender: ReturnType<typeof serializeTender>;
  answer: ReturnType<typeof serializeAnswer> & { versionCount: number; evidenceCount: number; reviewCount: number };
  question: ReturnType<typeof serializeQuestion>;
  requirement: ReturnType<typeof serializeRequirement> | null;
  linkedRequirementCount: number;
  reviewSummary: ReturnType<typeof buildResponseReviewSummary>;
  navigation: { primaryHref: string; applyHref: string; tenderHref: string };
  lastActivityAt: string;
};

function countResponseQueueRows(rows: ResponseQueueRow[]) {
  return rows.reduce(
    (acc, row) => {
      acc.total += 1;
      if (/DRAFT/i.test(row.answer.status)) acc.draft += 1;
      if (responseNeedsReview(row)) acc.needsReview += 1;
      if (row.answer.evidenceCount === 0) acc.missingEvidence += 1;
      if (row.answer.confidence < 0.65) acc.lowConfidence += 1;
      if (row.reviewSummary.counts.changesRequested > 0) acc.changesRequested += 1;
      if (/FINAL|APPROVED/i.test(row.answer.status)) acc.final += 1;
      return acc;
    },
    { total: 0, draft: 0, needsReview: 0, missingEvidence: 0, lowConfidence: 0, changesRequested: 0, final: 0 },
  );
}

function responseNeedsReview(row: ResponseQueueRow) {
  return /REVIEW|PENDING|CHANGES_REQUESTED/i.test(row.answer.status)
    || row.reviewSummary.counts.pending > 0
    || row.reviewSummary.counts.changesRequested > 0;
}

function responseRowMatchesSearch(row: ResponseQueueRow, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    row.answer.answerText,
    row.tender.title,
    row.tender.name,
    row.tender.buyerName,
    row.question.questionText,
    row.question.section,
    row.requirement?.title,
    row.requirement?.description,
    row.reviewSummary.latestComment,
    row.reviewSummary.latestReviewerName,
  ].filter(Boolean).join("\n").toLowerCase();
  return haystack.includes(needle);
}

function responseRowMatchesFilters(row: ResponseQueueRow, input: ResponsesQueueInput) {
  if (input.status !== "all" && row.answer.status !== input.status) return false;
  if (input.source !== "all" && row.answer.source !== input.source) return false;
  if (input.evidence === "missing" && row.answer.evidenceCount > 0) return false;
  if (input.evidence === "linked" && row.answer.evidenceCount === 0) return false;
  if (input.confidence === "low" && row.answer.confidence >= 0.65) return false;
  if (input.confidence === "medium" && (row.answer.confidence < 0.65 || row.answer.confidence >= 0.85)) return false;
  if (input.confidence === "high" && row.answer.confidence < 0.85) return false;
  if (input.review === "not_sent" && row.reviewSummary.counts.total > 0) return false;
  if (input.review === "pending" && row.reviewSummary.counts.pending === 0) return false;
  if (input.review === "changes_requested" && row.reviewSummary.counts.changesRequested === 0) return false;
  if (input.review === "approved" && row.reviewSummary.counts.approved === 0) return false;
  if (input.review === "rejected" && row.reviewSummary.counts.rejected === 0) return false;
  return true;
}

function compareResponseQueueRows(left: ResponseQueueRow, right: ResponseQueueRow, sort: ResponsesQueueInput["sort"]) {
  if (sort === "updated_asc") return dateValue(left.answer.updatedAt) - dateValue(right.answer.updatedAt);
  if (sort === "confidence_asc") return left.answer.confidence - right.answer.confidence;
  if (sort === "confidence_desc") return right.answer.confidence - left.answer.confidence;
  if (sort === "evidence_asc") return left.answer.evidenceCount - right.answer.evidenceCount || dateValue(right.answer.updatedAt) - dateValue(left.answer.updatedAt);
  if (sort === "review_urgency") {
    const urgency = responseReviewUrgency(left) - responseReviewUrgency(right);
    if (urgency !== 0) return urgency;
  }
  return dateValue(right.answer.updatedAt) - dateValue(left.answer.updatedAt);
}

function responseReviewUrgency(row: ResponseQueueRow) {
  if (row.reviewSummary.counts.changesRequested > 0) return 0;
  if (row.reviewSummary.counts.pending > 0 || /REVIEW|PENDING/i.test(row.answer.status)) return 1;
  if (row.answer.evidenceCount === 0) return 2;
  if (row.answer.confidence < 0.65) return 3;
  return 4;
}

function dateValue(value: Date | string | null | undefined) {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function submissionActionState(input: {
  ready: boolean;
  latestPackage: { status: "GENERATING" | "READY" | "FAILED" | "STALE" | "APPROVED" } | null;
  latestSubmission: { id: string } | null;
}): SubmissionQueueActionState {
  if (input.latestSubmission) return "VIEW_RECEIPT";
  if (input.latestPackage?.status === "APPROVED") return "RECORD_RECEIPT";
  if (input.latestPackage?.status === "READY") return "APPROVE_PACKAGE";
  if (input.latestPackage?.status === "STALE" || input.latestPackage?.status === "FAILED") return "REBUILD_PACKAGE";
  return input.ready ? "BUILD_PACKAGE" : "RESOLVE_BLOCKERS";
}

function compareSubmissionQueueRows(
  left: {
    tender: ReturnType<typeof serializeTender>;
    ready: boolean;
    blockingIssueCount: number;
    latestPackage: { status: "GENERATING" | "READY" | "FAILED" | "STALE" | "APPROVED" } | null;
    latestSubmission: { id: string } | null;
  },
  right: {
    tender: ReturnType<typeof serializeTender>;
    ready: boolean;
    blockingIssueCount: number;
    latestPackage: { status: "GENERATING" | "READY" | "FAILED" | "STALE" | "APPROVED" } | null;
    latestSubmission: { id: string } | null;
  },
) {
  const leftRank = submissionQueueRank(left);
  const rightRank = submissionQueueRank(right);
  if (leftRank !== rightRank) return leftRank - rightRank;
  const leftDue = left.tender.dueAt ? new Date(left.tender.dueAt).getTime() : Number.POSITIVE_INFINITY;
  const rightDue = right.tender.dueAt ? new Date(right.tender.dueAt).getTime() : Number.POSITIVE_INFINITY;
  if (leftDue !== rightDue) return leftDue - rightDue;
  return left.tender.title.localeCompare(right.tender.title);
}

function submissionQueueRank(row: {
  ready: boolean;
  blockingIssueCount: number;
  latestPackage: { status: "GENERATING" | "READY" | "FAILED" | "STALE" | "APPROVED" } | null;
  latestSubmission: { id: string } | null;
}) {
  if (row.blockingIssueCount > 0 || (!row.ready && !row.latestSubmission)) return 0;
  if (row.latestPackage?.status === "STALE" || row.latestPackage?.status === "FAILED") return 1;
  if (row.latestPackage?.status === "APPROVED" && !row.latestSubmission) return 2;
  if (row.latestPackage?.status === "READY") return 3;
  return 4;
}

function compareRequirementQueueRows(
  left: {
    tender: ReturnType<typeof serializeTender>;
    requirement: ReturnType<typeof serializeRequirement> & { questionIds: string[] };
    riskState: { highRisk: boolean };
  },
  right: {
    tender: ReturnType<typeof serializeTender>;
    requirement: ReturnType<typeof serializeRequirement> & { questionIds: string[] };
    riskState: { highRisk: boolean };
  },
) {
  if (left.riskState.highRisk !== right.riskState.highRisk) return left.riskState.highRisk ? -1 : 1;
  if (left.requirement.mandatory !== right.requirement.mandatory) return left.requirement.mandatory ? -1 : 1;
  const leftDue = left.tender.dueAt ? new Date(left.tender.dueAt).getTime() : Number.POSITIVE_INFINITY;
  const rightDue = right.tender.dueAt ? new Date(right.tender.dueAt).getTime() : Number.POSITIVE_INFINITY;
  if (leftDue !== rightDue) return leftDue - rightDue;
  return left.requirement.title.localeCompare(right.requirement.title);
}

function serializeAnswerVersion(row: typeof tenderAnswerVersions.$inferSelect) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    tenderId: row.tenderId,
    answerId: row.answerId,
    versionNumber: row.versionNumber,
    content: row.content,
    source: row.source,
    createdBy: row.createdBy,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeAnswerEvidence(row: typeof tenderAnswerEvidence.$inferSelect) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    tenderId: row.tenderId,
    answerId: row.answerId,
    sourceId: row.sourceId,
    sourceVersion: row.sourceVersion,
    evidenceType: row.evidenceType,
    evidenceId: row.evidenceId,
    relevance: Number(row.relevance ?? 0),
    confidence: Number(row.confidence ?? 0),
    freshness: row.freshness,
    verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeSource(row: TenderSourceRow) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    tenderId: row.tenderId,
    sourceType: row.sourceType,
    name: row.name,
    externalReference: row.externalReference,
    sourceUrl: row.sourceUrl,
    fileId: row.fileId,
    mimeType: row.mimeType,
    fileSize: Number(row.fileSize),
    checksum: row.checksumSha256,
    status: row.status,
    parseStatus: sourceParseStatus(row),
    parsedAt: sourceParsedAt(row),
    createdBy: row.createdBy,
    metadata: row.metadata,
    removedAt: row.removedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function serializeTenderDocument(row: TenderDocumentWithFileRow) {
  return {
    id: row.document.id,
    organizationId: row.document.organizationId,
    workspaceId: row.document.workspaceId,
    tenderId: row.document.tenderId,
    tenderSourceId: row.document.tenderSourceId,
    documentId: row.document.documentId,
    documentRole: row.document.documentRole,
    name: row.file.filename,
    filename: row.file.filename,
    mimeType: row.file.mimeType,
    fileSize: Number(row.file.sizeBytes),
    checksum: row.file.checksumSha256,
    status: row.document.status,
    failureReason: row.document.failureReason,
    processedAt: row.document.processedAt,
    pageCount: row.extraction?.pageCount ?? null,
    contentBlocks: row.extraction?.status === "succeeded" ? extractionContentBlocks(row.extraction) : 0,
    extractionStatus: row.extraction?.status ?? null,
    extractionId: row.extraction?.id ?? null,
    metadata: row.document.metadata,
    uploadedBy: row.file.uploadedBy,
    createdAt: row.document.createdAt,
    updatedAt: row.document.updatedAt,
    uploadedAt: row.file.createdAt,
  };
}

function serializeTenderDocumentExtraction(row: TenderDocumentExtractionRow) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    tenderId: row.tenderId,
    tenderDocumentId: row.tenderDocumentId,
    extractor: row.extractor,
    status: row.status,
    pageCount: row.pageCount,
    characterCount: row.characterCount,
    tableCount: row.tableCount,
    failureReason: row.failureReason,
    metadata: row.metadata,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function serializeTenderDocumentContent(row: TenderDocumentContentRow) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    tenderId: row.tenderId,
    tenderDocumentId: row.tenderDocumentId,
    extractionId: row.extractionId,
    sequence: row.sequence,
    pageNumber: row.pageNumber,
    section: row.section,
    kind: row.kind,
    text: row.text,
    contentHash: row.contentHash,
    metadata: row.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function extractionContentBlocks(row: TenderDocumentExtractionRow) {
  const metadata = row.metadata as Record<string, unknown> | null | undefined;
  const contentBlocks = metadata?.contentBlocks;
  return typeof contentBlocks === "number" && Number.isFinite(contentBlocks) ? contentBlocks : row.pageCount ?? 0;
}

function serializeTenderTimeline(row: TenderTimelineRow) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    actorId: row.actorId,
    actorType: row.actorType,
    actorLabel: row.actorLabel,
    kind: row.kind,
    label: row.label,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    summary: row.summary,
    metadata: row.metadata,
    createdAt: row.createdAt,
  };
}

function sourceParseStatus(row: TenderSourceRow) {
  const metadata = row.metadata as Record<string, unknown> | null | undefined;
  const parseStatus = metadata?.parseStatus;
  if (parseStatus === "PARSED" || parseStatus === "UPLOADED" || parseStatus === "REGISTERED" || parseStatus === "FAILED") {
    return parseStatus;
  }
  if (row.status === "REMOVED") return "REMOVED";
  if (row.status === "READY") return "UPLOADED";
  return "REGISTERED";
}

function sourceParsedAt(row: TenderSourceRow) {
  const metadata = row.metadata as Record<string, unknown> | null | undefined;
  const parsedAt = metadata?.parsedAt;
  return typeof parsedAt === "string" ? parsedAt : null;
}

function parsedAtFromSource(row: TenderSourceRow) {
  const parsedAt = sourceParsedAt(row);
  return parsedAt ? new Date(parsedAt) : null;
}

function failureReasonFromMetadata(metadata: Record<string, unknown>) {
  const reason = metadata.failureReason ?? metadata.processingError ?? metadata.parseError;
  return typeof reason === "string" && reason.trim() ? reason : null;
}

type TenderContentRowInput = {
  sequence: number;
  pageNumber: number | null;
  section: string | null;
  kind: "page" | "heading" | "paragraph" | "listItem" | "table";
  text: string;
  contentHash: string;
  metadata: Record<string, unknown>;
};

function tenderContentRowsFromExtraction(parsed: ExtractionResult): TenderContentRowInput[] {
  const blockRows: TenderContentRowInput[] = [];
  for (const [index, block] of parsed.blocks?.entries() ?? []) {
    const text = normalizeExtractedText(block.kind === "table" ? serializeTenderContentTable(block.cells ?? []) : block.text ?? "");
    if (!text) continue;
    const section = block.headingPath.length ? block.headingPath.join(" > ") : null;
    const sequence = index + 1;
    blockRows.push({
      sequence,
      pageNumber: null,
      section,
      kind: block.kind,
      text,
      contentHash: tenderContentHash({ sequence, pageNumber: null, kind: block.kind, text }),
      metadata: {
        headingPath: block.headingPath,
        sourceRef: block.sourceRef,
      },
    });
  }

  if (blockRows.length) return blockRows;

  const pageRows: TenderContentRowInput[] = [];
  for (const [index, page] of parsed.pages.entries()) {
    const text = normalizeExtractedText(page.text);
    if (!text) continue;
    const sequence = index + 1;
    pageRows.push({
      sequence,
      pageNumber: page.pageNumber,
      section: page.label?.trim() || null,
      kind: "page",
      text,
      contentHash: tenderContentHash({ sequence, pageNumber: page.pageNumber, kind: "page", text }),
      metadata: page.label ? { label: page.label } : {},
    });
  }
  return pageRows;
}

function extractionPageCount(parsed: ExtractionResult) {
  const explicit = (parsed as ExtractionResult & { pageCount?: unknown }).pageCount;
  if (typeof explicit === "number" && Number.isFinite(explicit)) return explicit;
  const pageNumbers = new Set(parsed.pages.map((page) => page.pageNumber).filter((pageNumber) => Number.isFinite(pageNumber)));
  return pageNumbers.size || parsed.pages.length || null;
}

function normalizeExtractedText(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function serializeTenderContentTable(cells: string[][]) {
  return cells.map((row) => row.join("\t")).join("\n");
}

function tenderContentHash(input: { sequence: number; pageNumber: number | null; kind: string; text: string }) {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}

function userSafeTenderParseFailure(error: unknown) {
  if (error instanceof TenderSourceUploadIncompleteError) return "File could not be retrieved from storage.";
  if (!(error instanceof Error)) return "Document parser failed.";
  if (error.message.includes("Unsupported document format")) return error.message;
  if (error.message.includes("No extractable text found")) return error.message;
  if (error.message.includes("Content is ")) return "Uploaded file content does not match the declared document type.";
  if (error.message.includes("Encrypted or password-protected")) return "Encrypted or password-protected DOCX files are not supported.";
  if (error.message.includes("Invalid DOCX") || error.message.includes("Malformed DOCX")) return "Document parser failed.";
  if (error.message.includes("Invalid PDF") || error.message.includes("PDF")) return "Document parser failed.";
  return "Document parser failed.";
}

function serializeQuestion(row: TenderQuestionRow) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    tenderId: row.tenderId,
    questionNumber: row.questionNumber,
    section: row.section,
    questionText: row.questionText,
    questionType: row.questionType,
    required: row.required,
    status: row.status,
    sourceReference: row.sourceReference,
    sortOrder: row.sortOrder,
    metadata: row.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function serializeEvidenceSummary(row: EvidenceCandidateLike) {
  return {
    evidenceId: row.evidenceId,
    sourceId: row.sourceId,
    sourceVersion: row.sourceVersion,
    evidenceType: row.evidenceType,
    title: row.title,
    content: [row.snippet, stringifyJson(row.metadata)].filter(Boolean).join("\n"),
    freshness: row.freshness,
    relevance: row.relevanceScore,
    authority: row.authorityScore,
    verifiedAt: row.verifiedAt ?? null,
    sourceTitle: row.sourceTitle ?? row.title,
    sourceAuthority: row.sourceAuthority ?? null,
  };
}

function serializeRequirement(row: TenderRequirementRow) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    tenderId: row.tenderId,
    requirementCode: row.requirementCode,
    title: row.title,
    description: row.description,
    requirementType: row.requirementType,
    mandatory: row.mandatory,
    status: row.status,
    sourceReference: row.sourceReference,
    metadata: row.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function serializeAnswer(row: TenderAnswerRow) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    tenderId: row.tenderId,
    questionId: row.questionId,
    answerText: row.answerText,
    status: row.status,
    source: row.source,
    confidence: Number(row.confidence),
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    metadata: row.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

type EvidenceCandidateLike = {
  evidenceId: string;
  sourceId: string;
  sourceVersion: string | null;
  evidenceType: string;
  title: string;
  snippet: string;
  freshness: string;
  relevanceScore: number;
  authorityScore: number;
  verifiedAt?: string | null;
  sourceTitle?: string | null;
  sourceAuthority?: string | null;
  metadata: Record<string, unknown>;
};

function stringifyJson(value: unknown): string {
  try {
    return typeof value === "string" ? value : JSON.stringify(value ?? {});
  } catch {
    return "";
  }
}

function metadataStatus(row: { metadata: unknown }) {
  const status = (row.metadata as Record<string, unknown> | null | undefined)?.lifecycleStatus;
  if (status === "DRAFT" || status === "ACTIVE" || status === "ARCHIVED") return status;
  return "ACTIVE";
}

function isOlderThanDays(value: string | Date | null, days: number) {
  if (!value) return false;
  const diffDays = Math.round((Date.now() - (value instanceof Date ? value.getTime() : new Date(value).getTime())) / (1000 * 60 * 60 * 24));
  return diffDays > days;
}

function rankSeverity(severity: string | null | undefined) {
  if (severity === "CRITICAL") return 4;
  if (severity === "HIGH") return 3;
  if (severity === "MEDIUM") return 2;
  if (severity === "LOW") return 1;
  return 0;
}

function classifyQuestionGroup(section: string | null | undefined, questionText: string) {
  const text = `${section ?? ""} ${questionText}`.toLowerCase();
  if (/security|identity|access|encryption|audit/.test(text)) return "Security";
  if (/legal|contract|liability|indemn/.test(text)) return "Legal";
  if (/price|pricing|commercial|fee|cost/.test(text)) return "Commercial";
  if (/support|sla|service/.test(text)) return "Support";
  if (/implementation|technical|api|integration|architecture/.test(text)) return "Technical";
  return "General";
}

function serializeReview(row: TenderReviewRow) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    tenderId: row.tenderId,
    answerId: row.answerId,
    reviewerId: row.reviewerId,
    status: row.status,
    contentDigest: row.contentDigest,
    comment: row.comment,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
