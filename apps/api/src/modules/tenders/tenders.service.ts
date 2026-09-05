import { createHash, randomUUID } from "node:crypto";
import { basename, extname } from "node:path";

import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
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
  tenders,
  users,
  workspaces,
  withTransaction,
  type Database,
  type Transaction,
} from "@rfp-os/db";
import { ObjectStorage, tenderSourceObjectKey, sanitizeFilename } from "@rfp-os/storage";
import type { AuthContext } from "@rfp-os/types";

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
import { buildDashboardSummary, type DashboardAiActivity, type DashboardEvidenceHealth, type DashboardKnowledgeHealth, type DashboardSectionError, type DashboardTenderCard } from "../dashboard/dashboard-summary.logic";

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

  async getDashboard(auth: AuthContext, input: { pageSize: number }) {
    const errors: DashboardSectionError[] = [];
    const workspaceIds = this.resolveWorkspaceScope(auth);

    const tenderRows = await this.db
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

    const tenderDetails: DashboardTenderCard[] = await Promise.all(
      tenderRows.map(async (tender) => {
        try {
          const [validation, reviews] = await Promise.all([
            this.getValidation(auth, tender.id),
            this.listReviews(auth, tender.id),
          ]);
          const issues = validation.current.issues ?? [];
          const highestIssue = issues.reduce<TenderValidationIssue | null>((best, issue) => {
            if (!best) return issue;
            const issueScore = rankSeverity(issue.severity);
            const bestScore = rankSeverity(best.severity);
            return issueScore > bestScore ? issue : best;
          }, null);
          return {
            tender: serializeTender(tender),
            readiness: validation.current.score,
            ready: validation.current.ready,
            highestIssue,
            issueCount: issues.length,
            blockingIssueCount: issues.filter((issue) => issue.blocking).length,
            pendingReviews: reviews.items.filter(
              (review) => review.status === "PENDING" || review.status === "CHANGES_REQUESTED",
            ).length,
            totalReviews: reviews.items.length,
          };
        } catch (error) {
          errors.push({
            section: "tenders",
            message: error instanceof Error ? error.message : "Failed to load tender dashboard data.",
          });
          return {
            tender: serializeTender(tender),
            readiness: null,
            ready: false,
            issueCount: 0,
            blockingIssueCount: 0,
            highestIssue: null,
            pendingReviews: 0,
            totalReviews: 0,
          };
        }
      }),
    );

    const tenderIds = tenderRows.map((tender) => tender.id);
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
        errors.push({
          section: "ai_activity",
          message: error instanceof Error ? error.message : "Failed to load AI activity summary.",
        });
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
      const [row] = await tx
        .update(tenders)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, auth.organizationId)))
        .returning();
      if (!row) throw new TenderNotFoundError();

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

    if (!canTransitionTender(from, to)) {
      throw new TenderTransitionNotAllowedError(from, to);
    }

    const required = permissionForTenderTransition(from, to);
    if (!hasOrganizationPermission(auth, required) && !hasWorkspacePermission(auth, tender.workspaceId, required)) {
      throw new TenderPermissionError(required);
    }

    await this.assertPolicyAllows(auth, "transition", tender, { toStatus: to });

    const updated = await withTransaction(async (tx) => {
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

  async generateRequirementAnswer(auth: AuthContext, tenderId: string, requirementId: string) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "answer:create");
    await this.assertPolicyAllows(auth, "update", tender);
    const requirement = await this.requireRequirement(auth.organizationId, tenderId, requirementId);
    const question = await this.requireQuestionForRequirement(auth.organizationId, tenderId, requirementId);

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
    const answer = await this.createAnswer(auth, tenderId, question.id, {
      answerText: generated.answer,
      source: "AI_GENERATED",
      confidence: generated.confidence,
      status: answerStatus,
      metadata: existing
        ? { ...existing.metadata, ...generated.metadata, ...generationMetadata, grounding: groundingResult, evidenceState }
        : { ...generated.metadata, ...generationMetadata, grounding: groundingResult, evidenceState },
    });

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
      });
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
  ) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertTenderWorkspacePermission(auth, tender.workspaceId, "answer:update");
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
        pageCount: rows.length,
        characterCount: rows.reduce((sum, row) => sum + row.text.length, 0),
        tableCount: parsed.tables.length,
        failureReason: null,
        metadata: {
          source: "tender.parseSource",
          mimeType: file.mimeType,
          filename: file.filename,
        },
        completedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: tenderDocumentExtractions.tenderDocumentId,
        set: {
          extractor: parsed.extractor,
          status: "succeeded",
          pageCount: rows.length,
          characterCount: rows.reduce((sum, row) => sum + row.text.length, 0),
          tableCount: parsed.tables.length,
          failureReason: null,
          metadata: {
            source: "tender.parseSource",
            mimeType: file.mimeType,
            filename: file.filename,
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

  async createAnswer(auth: AuthContext, tenderId: string, questionId: string, input: CreateTenderAnswerInput) {
    const tender = await this.requireTender(auth.organizationId, tenderId);
    this.assertEditable(tender);
    const question = await this.requireQuestion(auth.organizationId, tenderId, questionId);
    if (!hasWorkspacePermission(auth, tender.workspaceId, "answer:create")) {
      throw new TenderPermissionError("answer:create");
    }
    if (input.status === "FINAL") {
      throw new TenderAnswerFinalizationNotAllowedError();
    }

    const existing = await this.findAnswerForQuestion(auth.organizationId, questionId);
    const created = await withTransaction(async (tx) => {
      if (existing) {
        const [row] = await tx
          .update(tenderAnswers)
          .set({
            answerText: input.answerText ?? existing.answerText,
            source: input.source ?? existing.source,
            confidence: input.confidence !== undefined ? input.confidence.toString() : existing.confidence,
            status: input.status ?? existing.status,
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

    if (input.status === "FINAL") {
      const approved = await this.hasApprovedReview(answerId);
      if (!approved) throw new TenderAnswerFinalizationNotAllowedError();
    }

    const patch: Partial<typeof tenderAnswers.$inferInsert> = {};
    if (input.answerText !== undefined) patch.answerText = input.answerText;
    if (input.source !== undefined) patch.source = input.source;
    if (input.confidence !== undefined) patch.confidence = input.confidence.toString();
    if (input.status !== undefined) patch.status = input.status;
    if (input.metadata !== undefined) patch.metadata = input.metadata;

    const changedFields = Object.keys(patch);
    const updated = await withTransaction(async (tx) => {
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
      if (existingReview[0]) {
        const [row] = await tx
          .update(tenderAnswerReviews)
          .set({
            status: input.status ?? existingReview[0].status,
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

        if (row.status === "PENDING") {
          await tx
            .update(tenderAnswers)
            .set({ status: "IN_REVIEW", updatedBy: auth.userId, updatedAt: new Date() })
            .where(eq(tenderAnswers.id, answerId));
        } else {
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
          comment: input.comment ?? "",
        })
        .returning();
      if (!row) throw new TenderReviewNotFoundError();

      if (row.status === "PENDING") {
        await tx
          .update(tenderAnswers)
          .set({ status: "IN_REVIEW", updatedBy: auth.userId, updatedAt: new Date() })
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

    const patch: Partial<typeof tenderAnswerReviews.$inferInsert> = {};
    if (input.comment !== undefined) patch.comment = input.comment;
    if (input.status !== undefined) patch.status = input.status;

    const changedFields = Object.keys(patch);
    const updated = await withTransaction(async (tx) => {
      const [row] = await tx
        .update(tenderAnswerReviews)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(tenderAnswerReviews.id, reviewId), eq(tenderAnswerReviews.organizationId, auth.organizationId)))
        .returning();
      if (!row) throw new TenderReviewNotFoundError();

      if (input.status && input.status !== "PENDING") {
        await tx
          .update(tenderAnswers)
          .set({
            status:
              input.status === "APPROVED"
                ? "APPROVED"
                : input.status === "CHANGES_REQUESTED"
                  ? "CHANGES_REQUESTED"
                  : "REJECTED",
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

  private async computeValidationSnapshot(auth: AuthContext, tender: TenderRow): Promise<TenderValidationSnapshot> {
    const [questions, requirements, answers, sources, reviews, evidenceRows] = await Promise.all([
      this.db
        .select()
        .from(tenderQuestions)
        .where(and(eq(tenderQuestions.organizationId, auth.organizationId), eq(tenderQuestions.tenderId, tender.id))),
      this.db
        .select()
        .from(tenderRequirements)
        .where(and(eq(tenderRequirements.organizationId, auth.organizationId), eq(tenderRequirements.tenderId, tender.id))),
      this.db
        .select()
        .from(tenderAnswers)
        .where(and(eq(tenderAnswers.organizationId, auth.organizationId), eq(tenderAnswers.tenderId, tender.id))),
      this.db
        .select()
        .from(tenderSources)
        .where(and(eq(tenderSources.organizationId, auth.organizationId), eq(tenderSources.tenderId, tender.id))),
      this.db
        .select()
        .from(tenderAnswerReviews)
        .where(and(eq(tenderAnswerReviews.organizationId, auth.organizationId), eq(tenderAnswerReviews.tenderId, tender.id))),
      this.db
        .select()
        .from(tenderAnswerEvidence)
        .where(
          and(
            eq(tenderAnswerEvidence.organizationId, auth.organizationId),
            eq(tenderAnswerEvidence.tenderId, tender.id),
          ),
        ),
    ]);

    const questionIds = questions.map((question) => question.id);
    const requirementIds = requirements.map((requirement) => requirement.id);
    const linkConditions = [eq(tenderQuestionRequirements.organizationId, auth.organizationId)];
    if (questionIds.length > 0) {
      linkConditions.push(inArray(tenderQuestionRequirements.questionId, questionIds));
    }
    if (requirementIds.length > 0) {
      linkConditions.push(inArray(tenderQuestionRequirements.requirementId, requirementIds));
    }
    const links =
      linkConditions.length === 1
        ? []
        : await this.db.select().from(tenderQuestionRequirements).where(and(...linkConditions));

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
    const approvedMandatory = mandatoryRequirements.filter((requirement) => requirement.status === "APPROVED");
    const answeredQuestions = questions.filter((question) => answerByQuestionId.has(question.id));
    const answeredWithEvidence = answers.filter((answer) => (evidenceCountByAnswer.get(answer.id) ?? 0) > 0);
    const reviewedAnswers = answers.filter((answer) => (reviewCountByAnswer.get(answer.id) ?? 0) > 0);
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
      if (requirement.status === "APPROVED") continue;
      addIssue(
        {
          id: `requirement-${requirement.id}-not-approved`,
          severity: "HIGH",
          title: `Mandatory requirement ${requirement.title} is not approved`,
          detail: "A mandatory requirement still needs approval before this tender can be submitted.",
          recommendation: "Assign a reviewer, resolve comments, and move the requirement to APPROVED.",
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

  private async hasApprovedReview(answerId: string) {
    const [row] = await this.db
      .select({ id: tenderAnswerReviews.id })
      .from(tenderAnswerReviews)
      .where(and(eq(tenderAnswerReviews.answerId, answerId), eq(tenderAnswerReviews.status, "APPROVED")));
    return Boolean(row);
  }

  private assertEditable(tender: TenderRow, targetStatus?: TenderStatus) {
    if (["ARCHIVED", "CANCELLED", "CLOSED"].includes(tender.status) && targetStatus !== "ARCHIVED") {
      throw new TenderNotEditableError();
    }
  }

  private async assertPolicyAllows(
    auth: AuthContext,
    action: string,
    tender: TenderRow,
    extra: Record<string, unknown> = {},
  ) {
    const decision = await this.policy.evaluate(auth, "tender", action, {
      tenderId: tender.id,
      workspaceId: tender.workspaceId,
      ownerId: tender.ownerId,
      status: tender.status,
      tenderType: tender.tenderType,
      archived: tender.archivedAt !== null,
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
    contentBlocks: row.extraction?.status === "succeeded" ? row.extraction.pageCount ?? 0 : 0,
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
    comment: row.comment,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
