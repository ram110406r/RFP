import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, max, ne, sql } from "drizzle-orm";
import {
  assignments,
  files,
  tenderAnswerEvidence,
  tenderAnswerReviews,
  tenderAnswers,
  tenderAutomationItems,
  tenderAutomationRuns,
  tenderAutomationSteps,
  tenderDocumentContent,
  tenderDocumentExtractions,
  tenderDocuments,
  tenderMilestones,
  tenderPackageApprovals,
  tenderQuestionRequirements,
  tenderQuestions,
  tenderRequirementCandidates,
  tenderRequirementExtractionRuns,
  tenderRequirements,
  tenderStatusHistory,
  tenderSubmissionArtifacts,
  tenderSubmissionPackages,
  tenderSubmissionReceipts,
  tenderSubmissions,
  tenders,
  withTransaction,
  type Database,
  type Transaction,
} from "@rfp-os/db";
import { ObjectStorage } from "@rfp-os/storage";
import { type AuthContext, type Permission } from "@rfp-os/types";

import { DATABASE } from "../../infrastructure/database";
import { AuditService } from "../../infrastructure/audit";
import { ActivityService } from "../../infrastructure/activity";
import { AssignmentsService } from "../assignments/assignments.service";
import { TendersService } from "../tenders/tenders.service";
import type {
  ApprovePackageInput,
  CreateAutomationRunInput,
  CreateSubmissionInput,
  DecideRequirementCandidatesInput,
  UpdateMilestonesInput,
} from "./dto/apply-automation.dto";
import { generateSubmissionArtifacts } from "./submission-package";
import { projectPackageRows } from "./package-rows";
import { hasCurrentApproval } from "../tenders/domain/answer-review";

const STEP_KINDS = ["ANALYSIS", "EVIDENCE_RETRIEVAL", "ANSWER_GENERATION", "VALIDATION"] as const;
const MILESTONE_DEFAULTS = { REVIEW: 7, APPROVAL: 3, PACKAGE: 2, SUBMISSION: 1 } as const;

@Injectable()
export class ApplyAutomationService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly tendersService: TendersService,
    private readonly assignmentsService: AssignmentsService,
    private readonly storage: ObjectStorage,
    private readonly audit: AuditService,
    private readonly activity: ActivityService,
  ) {}

  async extractRequirements(auth: AuthContext, tenderId: string) {
    const tender = await this.requireTender(auth, tenderId, "requirement:create");
    const documents = await this.db.select().from(tenderDocuments).where(and(
      eq(tenderDocuments.organizationId, auth.organizationId), eq(tenderDocuments.tenderId, tenderId), eq(tenderDocuments.status, "PROCESSED"),
    ));
    if (documents.length === 0) throw new ConflictException({ code: "NO_PROCESSED_DOCUMENTS", message: "Process at least one tender document before extracting requirements." });

    let created = 0;
    let reused = 0;
    for (const document of documents) {
      const [extraction] = await this.db.select().from(tenderDocumentExtractions).where(and(
        eq(tenderDocumentExtractions.organizationId, auth.organizationId), eq(tenderDocumentExtractions.tenderDocumentId, document.id), eq(tenderDocumentExtractions.status, "succeeded"),
      )).limit(1);
      if (!extraction) continue;
      const content = await this.db.select().from(tenderDocumentContent).where(and(
        eq(tenderDocumentContent.organizationId, auth.organizationId), eq(tenderDocumentContent.extractionId, extraction.id),
      )).orderBy(asc(tenderDocumentContent.sequence));
      const inputHash = sha(content.map((row) => row.contentHash).join("|"));
      const [existing] = await this.db.select().from(tenderRequirementExtractionRuns).where(and(
        eq(tenderRequirementExtractionRuns.tenderDocumentId, document.id), eq(tenderRequirementExtractionRuns.inputHash, inputHash),
      )).limit(1);
      if (existing?.status === "SUCCEEDED") { reused += existing.candidateCount; continue; }

      const candidates = content.flatMap((row) => extractCandidateRows(row)).slice(0, 1000);
      await withTransaction(async (tx) => {
        const priorRuns = await tx.select({ id: tenderRequirementExtractionRuns.id }).from(tenderRequirementExtractionRuns).where(and(eq(tenderRequirementExtractionRuns.tenderDocumentId, document.id), eq(tenderRequirementExtractionRuns.organizationId, auth.organizationId)));
        if (priorRuns.length) await tx.update(tenderRequirementCandidates).set({ status: "SUPERSEDED", updatedAt: new Date() }).where(and(eq(tenderRequirementCandidates.status, "PENDING"), inArray(tenderRequirementCandidates.extractionRunId, priorRuns.map((item) => item.id))));
        const [run] = await tx.insert(tenderRequirementExtractionRuns).values({
          organizationId: auth.organizationId, workspaceId: tender.workspaceId, tenderId, tenderDocumentId: document.id,
          documentExtractionId: extraction.id, extractor: "tendyy-deterministic@1", inputHash, status: "SUCCEEDED",
          candidateCount: candidates.length, createdBy: auth.userId, startedAt: new Date(), completedAt: new Date(),
        }).onConflictDoUpdate({
          target: [tenderRequirementExtractionRuns.tenderDocumentId, tenderRequirementExtractionRuns.inputHash],
          set: { status: "SUCCEEDED", candidateCount: candidates.length, failureReason: null, completedAt: new Date(), updatedAt: new Date() },
        }).returning();
        if (!run) return;
        if (candidates.length) await tx.insert(tenderRequirementCandidates).values(candidates.map((candidate) => ({
          organizationId: auth.organizationId, workspaceId: tender.workspaceId, tenderId, extractionRunId: run.id,
          contentId: candidate.contentId, candidateKey: candidate.key, candidateType: candidate.type, title: candidate.title,
          description: candidate.description, sourceExcerpt: candidate.excerpt, contentHash: candidate.hash,
          confidence: String(candidate.confidence), mandatory: candidate.mandatory, metadata: candidate.metadata,
        }))).onConflictDoNothing();
      });
      created += candidates.length;
    }
    await this.record(auth, tender, "TENDER_REQUIREMENTS_EXTRACTED", "tender", tenderId, { created, reused });
    return { tenderId, created, reused, candidates: await this.listRequirementCandidates(auth, tenderId) };
  }

  async listRequirementCandidates(auth: AuthContext, tenderId: string) {
    await this.requireTender(auth, tenderId, "requirement:read");
    const items = await this.db.select().from(tenderRequirementCandidates).where(and(
      eq(tenderRequirementCandidates.organizationId, auth.organizationId), eq(tenderRequirementCandidates.tenderId, tenderId),
    )).orderBy(asc(tenderRequirementCandidates.createdAt));
    return { items: items.map(serializeDates) };
  }

  async decideRequirementCandidates(auth: AuthContext, tenderId: string, input: DecideRequirementCandidatesInput) {
    const tender = await this.requireTender(auth, tenderId, "requirement:create");
    const ids = input.decisions.map((item) => item.candidateId);
    const candidates = await this.db.select().from(tenderRequirementCandidates).where(and(
      eq(tenderRequirementCandidates.organizationId, auth.organizationId), eq(tenderRequirementCandidates.tenderId, tenderId), inArray(tenderRequirementCandidates.id, ids),
    ));
    if (candidates.length !== new Set(ids).size) throw new NotFoundException({ code: "CANDIDATE_NOT_FOUND", message: "One or more requirement candidates were not found." });

    const decisions = new Map(input.decisions.map((item) => [item.candidateId, item.decision]));
    await withTransaction(async (tx) => {
      await tx.select({ id: tenders.id }).from(tenders).where(eq(tenders.id, tenderId)).for("update");
      await this.requireTender(auth, tenderId, "requirement:create");
      if (candidates.some((candidate) => decisions.get(candidate.id) === "ACCEPTED" && candidate.status !== "ACCEPTED")) await this.tendersService.invalidateResponseApproval(tx, auth.organizationId, tenderId);
      for (const candidate of candidates) {
        const decision = decisions.get(candidate.id)!;
        if (candidate.status === decision && (decision === "REJECTED" || candidate.acceptedRequirementId)) continue;
        if (candidate.status === "ACCEPTED" && decision === "REJECTED") throw new ConflictException({ code: "CANDIDATE_ALREADY_PROMOTED", message: "Accepted requirements cannot be rejected; edit the canonical requirement instead." });
        if (decision === "REJECTED") {
          await tx.update(tenderRequirementCandidates).set({ status: "REJECTED", decidedBy: auth.userId, decidedAt: new Date(), updatedAt: new Date() }).where(eq(tenderRequirementCandidates.id, candidate.id));
          continue;
        }
        const requirementCode = `EXT-${candidate.contentHash.slice(0, 12).toUpperCase()}`;
        let [requirement] = await tx.select().from(tenderRequirements).where(and(eq(tenderRequirements.tenderId, tenderId), eq(tenderRequirements.requirementCode, requirementCode))).limit(1);
        if (!requirement) [requirement] = await tx.insert(tenderRequirements).values({
          organizationId: auth.organizationId, workspaceId: tender.workspaceId, tenderId, requirementCode,
          title: candidate.title, description: candidate.description, requirementType: mapRequirementType(candidate.candidateType),
          mandatory: candidate.mandatory, status: "UNASSIGNED", sourceReference: { candidateId: candidate.id, contentId: candidate.contentId, excerpt: candidate.sourceExcerpt },
          metadata: { extractionRunId: candidate.extractionRunId, confidence: candidate.confidence },
        }).returning();
        if (!requirement) throw new Error("Unable to promote requirement candidate.");
        let [question] = await tx.select().from(tenderQuestions).where(and(eq(tenderQuestions.tenderId, tenderId), eq(tenderQuestions.questionText, candidate.description))).limit(1);
        if (!question) [question] = await tx.insert(tenderQuestions).values({
          organizationId: auth.organizationId, workspaceId: tender.workspaceId, tenderId, questionText: candidate.description,
          section: candidate.candidateType, required: candidate.mandatory, sourceReference: { candidateId: candidate.id, contentId: candidate.contentId },
          sortOrder: 0,
        }).returning();
        if (!question) throw new Error("Unable to create extracted question.");
        await tx.insert(tenderQuestionRequirements).values({ organizationId: auth.organizationId, workspaceId: tender.workspaceId, questionId: question.id, requirementId: requirement.id }).onConflictDoNothing();
        await tx.update(tenderRequirementCandidates).set({ status: "ACCEPTED", acceptedRequirementId: requirement.id, acceptedQuestionId: question.id, decidedBy: auth.userId, decidedAt: new Date(), updatedAt: new Date() }).where(eq(tenderRequirementCandidates.id, candidate.id));
      }
    });
    await this.record(auth, tender, "TENDER_REQUIREMENT_CANDIDATES_DECIDED", "tender", tenderId, { decisions: input.decisions });
    return this.listRequirementCandidates(auth, tenderId);
  }

  async createRun(auth: AuthContext, tenderId: string, input: CreateAutomationRunInput) {
    const tender = await this.requireTender(auth, tenderId, "tender:update");
    const idempotencyKey = input.idempotencyKey ?? randomUUID();
    const run = await this.db.transaction(async (tx) => {
      // Serialize creation per tender; the database constraint remains the final backstop.
      await tx.select({ id: tenders.id }).from(tenders).where(eq(tenders.id, tenderId)).for("update");
      const [existing] = await tx.select().from(tenderAutomationRuns).where(and(
        eq(tenderAutomationRuns.tenderId, tenderId), eq(tenderAutomationRuns.idempotencyKey, idempotencyKey),
      )).limit(1);
      if (existing) {
        const { idempotencyKey: _key, ...configuration } = input;
        const { idempotencyKey: _oldKey, ...previous } = existing.configuration;
        if (JSON.stringify(configuration) !== JSON.stringify(previous)) throw new ConflictException({ code: "IDEMPOTENCY_CONFLICT", message: "This idempotency key belongs to a different request." });
        return existing;
      }
      const [active] = await tx.select().from(tenderAutomationRuns).where(and(eq(tenderAutomationRuns.tenderId, tenderId), inArray(tenderAutomationRuns.status, ["QUEUED", "RUNNING"]))).limit(1);
      if (active) return active;
      const [created] = await tx.insert(tenderAutomationRuns).values({
        organizationId: auth.organizationId, workspaceId: tender.workspaceId, tenderId, requestedBy: auth.userId,
        idempotencyKey, configuration: input, status: "QUEUED",
      }).returning();
      if (!created) throw new Error("Unable to create automation run.");
      await tx.insert(tenderAutomationSteps).values(STEP_KINDS.map((kind, sequence) => ({ organizationId: auth.organizationId, workspaceId: tender.workspaceId, tenderId, runId: created.id, kind, sequence })));
      await this.audit.record({ organizationId: auth.organizationId, workspaceId: tender.workspaceId, actorId: auth.userId, action: "TENDER_AUTOMATION_QUEUED", entityType: "tender_automation_run", entityId: created.id }, tx);
      return created;
    });

    return this.getRun(auth, tenderId, run.id);
  }

  async listRuns(auth: AuthContext, tenderId: string) {
    await this.requireTender(auth, tenderId, "tender:read");
    const items = await this.db.select().from(tenderAutomationRuns).where(and(eq(tenderAutomationRuns.organizationId, auth.organizationId), eq(tenderAutomationRuns.tenderId, tenderId))).orderBy(desc(tenderAutomationRuns.createdAt));
    return { items: await Promise.all(items.map((item) => this.getRun(auth, tenderId, item.id))) };
  }

  async getRun(auth: AuthContext, tenderId: string, runId: string) {
    await this.requireTender(auth, tenderId, "tender:read");
    const [run] = await this.db.select().from(tenderAutomationRuns).where(and(eq(tenderAutomationRuns.organizationId, auth.organizationId), eq(tenderAutomationRuns.tenderId, tenderId), eq(tenderAutomationRuns.id, runId))).limit(1);
    if (!run) throw new NotFoundException({ code: "AUTOMATION_RUN_NOT_FOUND", message: "Automation run not found." });
    const [steps, items] = await Promise.all([
      this.db.select().from(tenderAutomationSteps).where(eq(tenderAutomationSteps.runId, runId)).orderBy(asc(tenderAutomationSteps.sequence)),
      this.db.select().from(tenderAutomationItems).where(eq(tenderAutomationItems.runId, runId)),
    ]);
    return { ...serializeDates(run), steps: steps.map(serializeDates), items: items.map(serializeDates) };
  }

  async retryRun(auth: AuthContext, tenderId: string, runId: string) {
    const prior = await this.getRun(auth, tenderId, runId);
    if (!["FAILED", "PARTIAL", "BLOCKED", "WAITING_FOR_INPUT"].includes(prior.status)) throw new ConflictException({ code: "RUN_NOT_RETRYABLE", message: "Only blocked, partial, or failed runs can be retried." });
    const unfinished = prior.items.filter((item) => item.status !== "SUCCEEDED").map((item) => item.requirementId).filter((id): id is string => Boolean(id));
    return this.createRun(auth, tenderId, { ...(prior.configuration as CreateAutomationRunInput), ...(unfinished.length ? { requirementIds: unfinished } : {}), idempotencyKey: `${runId}:retry:${Date.now()}` });
  }

  async cancelRun(auth: AuthContext, tenderId: string, runId: string) {
    await this.requireTender(auth, tenderId, "tender:update");
    const run = await this.db.transaction(async (tx) => {
    const [run] = await tx.update(tenderAutomationRuns).set({ status: "CANCELLED", completedAt: new Date(), updatedAt: new Date() }).where(and(eq(tenderAutomationRuns.organizationId, auth.organizationId), eq(tenderAutomationRuns.tenderId, tenderId), eq(tenderAutomationRuns.id, runId), inArray(tenderAutomationRuns.status, ["QUEUED", "RUNNING", "BLOCKED", "WAITING_FOR_INPUT"]))).returning();
    if (!run) throw new ConflictException({ code: "RUN_NOT_CANCELLABLE", message: "Automation run cannot be cancelled in its current state." });
      await tx.update(tenderAutomationSteps).set({ status: "CANCELLED", completedAt: new Date(), updatedAt: new Date() }).where(and(eq(tenderAutomationSteps.runId, runId), inArray(tenderAutomationSteps.status, ["QUEUED", "RUNNING", "WAITING_FOR_INPUT", "BLOCKED"])));
      return run;
    });
    return serializeDates(run);
  }

  async createPackage(auth: AuthContext, tenderId: string) {
    const tender = await this.requireTender(auth, tenderId, "tender:update");
    const claim = await this.db.transaction(async (tx) => {
      await tx.select({ id: tenders.id }).from(tenders).where(eq(tenders.id, tenderId)).for("update");
      await this.requireTender(auth, tenderId, "tender:update");
      const snapshot = await this.packageSnapshot(auth, tenderId);
      const digest = sha(JSON.stringify(snapshot.digestInput));
      await tx.update(tenderSubmissionPackages).set({ status: "STALE" }).where(and(eq(tenderSubmissionPackages.tenderId, tenderId), ne(tenderSubmissionPackages.contentDigest, digest), inArray(tenderSubmissionPackages.status, ["READY", "APPROVED"])));
      const [same] = await tx.select().from(tenderSubmissionPackages).where(and(eq(tenderSubmissionPackages.tenderId, tenderId), eq(tenderSubmissionPackages.contentDigest, digest))).limit(1);
      if (same && !["FAILED", "GENERATING"].includes(same.status)) {
        if (same.status === "STALE") await tx.update(tenderSubmissionPackages).set({ status: "READY" }).where(eq(tenderSubmissionPackages.id, same.id));
        return { record: same.status === "STALE" ? { ...same, status: "READY" as const } : same, snapshot, digest, generate: false, retry: false };
      }
      if (same?.status === "GENERATING") return { record: same, snapshot, digest, generate: true, retry: true };
      const [versionRow] = await tx.select({ value: max(tenderSubmissionPackages.version) }).from(tenderSubmissionPackages).where(eq(tenderSubmissionPackages.tenderId, tenderId));
      const [record] = same
        ? await tx.update(tenderSubmissionPackages).set({ status: "GENERATING", failureReason: null, completedAt: null }).where(eq(tenderSubmissionPackages.id, same.id)).returning()
        : await tx.insert(tenderSubmissionPackages).values({ organizationId: auth.organizationId, workspaceId: tender.workspaceId, tenderId, version: Number(versionRow?.value ?? 0) + 1, contentDigest: digest, generatorVersion: "tendyy-package@2", validationRunId: snapshot.validation.latestRun?.id ?? null, validationSnapshot: snapshot.validation.current as unknown as Record<string, unknown>, createdBy: auth.userId }).returning();
      if (!record) throw new Error("Unable to create submission package.");
      return { record, snapshot, digest, generate: true, retry: Boolean(same) };
    });
    const { record, snapshot, digest } = claim;
    if (!claim.generate) return this.serializePackage(record);
    try {
      const ready = await this.db.transaction(async (tx) => {
        // Keep artifact records and completion atomic. The row lock also lets a
        // restarted request recover GENERATING without racing another builder.
        const [locked] = await tx.select().from(tenderSubmissionPackages).where(eq(tenderSubmissionPackages.id, record.id)).for("update");
        if (!locked) throw new Error("Submission package no longer exists.");
        if (locked.status !== "GENERATING" && locked.status !== "FAILED") return locked;
        if (claim.retry) await tx.delete(tenderSubmissionArtifacts).where(eq(tenderSubmissionArtifacts.packageId, record.id));
        const attachments = await this.packageAttachments(auth.organizationId, tenderId);
        const artifacts = generateSubmissionArtifacts({ ...snapshot.packageInput, attachments });
        for (const artifact of artifacts) {
          const checksum = sha(artifact.bytes);
          const objectKey = `organizations/${auth.organizationId}/workspaces/${tender.workspaceId}/tenders/${tenderId}/packages/v${record.version}/${artifact.filename}`;
          await this.storage.putObject({ objectKey, mimeType: artifact.mimeType, bytes: artifact.bytes });
          const [file] = await tx.insert(files).values({ organizationId: auth.organizationId, bucket: this.storage.bucket, objectKey, filename: artifact.filename, mimeType: artifact.mimeType, sizeBytes: artifact.bytes.length, checksumSha256: checksum, uploadedBy: auth.userId }).onConflictDoUpdate({ target: [files.bucket, files.objectKey], set: { checksumSha256: checksum, sizeBytes: artifact.bytes.length, updatedAt: new Date() } }).returning();
          if (!file) throw new Error("Unable to persist generated artifact.");
          await tx.insert(tenderSubmissionArtifacts).values({ organizationId: auth.organizationId, workspaceId: tender.workspaceId, tenderId, packageId: record.id, fileId: file.id, kind: artifact.kind, checksumSha256: checksum });
        }
        const [completed] = await tx.update(tenderSubmissionPackages).set({ status: "READY", failureReason: null, completedAt: new Date() }).where(eq(tenderSubmissionPackages.id, record.id)).returning();
        return completed!;
      });
      await this.record(auth, tender, "TENDER_SUBMISSION_PACKAGE_CREATED", "tender_submission_package", record.id, { version: record.version, contentDigest: digest });
      return this.serializePackage(ready!);
    } catch (error) {
      await this.db.update(tenderSubmissionPackages).set({ status: "FAILED", failureReason: safeError(error), completedAt: new Date() }).where(and(eq(tenderSubmissionPackages.id, record.id), eq(tenderSubmissionPackages.status, "GENERATING")));
      throw error;
    }
  }

  async listPackages(auth: AuthContext, tenderId: string) {
    await this.requireTender(auth, tenderId, "tender:read");
    const snapshot = await this.packageSnapshot(auth, tenderId);
    const digest = sha(JSON.stringify(snapshot.digestInput));
    const rows = await this.db.select().from(tenderSubmissionPackages).where(and(eq(tenderSubmissionPackages.organizationId, auth.organizationId), eq(tenderSubmissionPackages.tenderId, tenderId))).orderBy(desc(tenderSubmissionPackages.version));
    return { items: await Promise.all(rows.map((row) => this.serializePackage(["READY", "APPROVED"].includes(row.status) && row.contentDigest !== digest ? { ...row, status: "STALE" } : row))) };
  }

  async packageDownload(auth: AuthContext, tenderId: string, packageId: string) {
    const tender = await this.requireTender(auth, tenderId, "tender:read");
    const [row] = await this.db.select({ artifact: tenderSubmissionArtifacts, file: files }).from(tenderSubmissionArtifacts).innerJoin(files, eq(files.id, tenderSubmissionArtifacts.fileId)).where(and(eq(tenderSubmissionArtifacts.organizationId, auth.organizationId), eq(tenderSubmissionArtifacts.tenderId, tenderId), eq(tenderSubmissionArtifacts.packageId, packageId), eq(tenderSubmissionArtifacts.kind, "PACKAGE_ZIP"))).limit(1);
    if (!row) throw new NotFoundException({ code: "PACKAGE_NOT_FOUND", message: "Submission package was not found." });
    await this.record(auth, tender, "TENDER_PACKAGE_DOWNLOAD_REQUESTED", "tender_submission_package", packageId, { artifactId: row.artifact.id, fileId: row.file.id });
    return { url: await this.storage.presignGet({ objectKey: row.file.objectKey, expiresInSeconds: 300, downloadFilename: row.file.filename }), expiresInSeconds: 300 };
  }

  async approvePackage(auth: AuthContext, tenderId: string, packageId: string, input: ApprovePackageInput) {
    const tender = await this.requireTender(auth, tenderId, "tender:approve");
    await this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(tenders).where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, auth.organizationId))).for("update");
      if (!current || !["REVIEW", "APPROVED"].includes(current.status)) throw new ConflictException({ code: "TENDER_REVIEW_REQUIRED", message: "Move the tender to review before approving its package." });
      await this.requireTender(auth, tenderId, "tender:approve");
      const snapshot = await this.packageSnapshot(auth, tenderId);
      const digest = sha(JSON.stringify(snapshot.digestInput));
      const [pkg] = await tx.select().from(tenderSubmissionPackages).where(and(eq(tenderSubmissionPackages.organizationId, auth.organizationId), eq(tenderSubmissionPackages.tenderId, tenderId), eq(tenderSubmissionPackages.id, packageId))).for("update");
      if (!pkg || !["READY", "APPROVED"].includes(pkg.status)) throw new ConflictException({ code: "PACKAGE_NOT_READY", message: "Only a current ready package can be approved." });
      if (pkg.contentDigest !== digest) throw new ConflictException({ code: "PACKAGE_STALE", message: "Application content changed. Rebuild the package before approval." });
      this.assertApprovalReady(snapshot);
      await tx.insert(tenderPackageApprovals).values({ organizationId: auth.organizationId, workspaceId: tender.workspaceId, tenderId, packageId, approvedBy: auth.userId, comment: input.comment, validationSnapshot: snapshot.validation.current as unknown as Record<string, unknown> }).onConflictDoUpdate({ target: tenderPackageApprovals.packageId, set: { approvedBy: auth.userId, comment: input.comment, validationSnapshot: snapshot.validation.current as unknown as Record<string, unknown> } });
      await tx.update(tenderSubmissionPackages).set({ status: "APPROVED" }).where(eq(tenderSubmissionPackages.id, packageId));
      if (current.status === "REVIEW") {
        await tx.update(tenders).set({ status: "APPROVED", updatedAt: new Date() }).where(eq(tenders.id, tenderId));
        await tx.insert(tenderStatusHistory).values({ organizationId: auth.organizationId, workspaceId: tender.workspaceId, tenderId, fromStatus: "REVIEW", toStatus: "APPROVED", actorId: auth.userId, reason: "Current response package approved.", metadata: { packageId } });
      }
      await tx.update(tenderMilestones).set({ status: "COMPLETE", completedAt: new Date(), updatedAt: new Date() }).where(and(eq(tenderMilestones.tenderId, tenderId), inArray(tenderMilestones.kind, ["REVIEW", "APPROVAL", "PACKAGE"])));
      await this.audit.record({ organizationId: auth.organizationId, workspaceId: tender.workspaceId, actorId: auth.userId, action: "TENDER_SUBMISSION_PACKAGE_APPROVED", entityType: "tender_submission_package", entityId: packageId }, tx);
    });
    await this.record(auth, tender, "TENDER_SUBMISSION_PACKAGE_APPROVED", "tender_submission_package", packageId, { comment: input.comment });
    return this.getPackage(auth, tenderId, packageId);
  }

  async listMilestones(auth: AuthContext, tenderId: string) {
    const tender = await this.requireTender(auth, tenderId, "tender:read");
    await this.ensureMilestones(tender);
    const items = await this.db.select().from(tenderMilestones).where(and(eq(tenderMilestones.organizationId, auth.organizationId), eq(tenderMilestones.tenderId, tenderId))).orderBy(desc(tenderMilestones.offsetDays));
    return { items: items.map(serializeDates) };
  }

  async updateMilestones(auth: AuthContext, tenderId: string, input: UpdateMilestonesInput) {
    const tender = await this.requireTender(auth, tenderId, "tender:update");
    if (!tender.dueAt) throw new ConflictException({ code: "DEADLINE_REQUIRED", message: "Set the tender deadline before configuring milestones." });
    await withTransaction(async (tx) => {
      for (const milestone of input.milestones) await tx.insert(tenderMilestones).values({ organizationId: auth.organizationId, workspaceId: tender.workspaceId, tenderId, kind: milestone.kind, offsetDays: milestone.offsetDays, dueAt: daysBefore(tender.dueAt!, milestone.offsetDays) }).onConflictDoUpdate({ target: [tenderMilestones.tenderId, tenderMilestones.kind], set: { offsetDays: milestone.offsetDays, dueAt: daysBefore(tender.dueAt!, milestone.offsetDays), status: "PENDING", updatedAt: new Date() } });
    });
    await this.record(auth, tender, "TENDER_MILESTONES_UPDATED", "tender", tenderId, { milestones: input.milestones });
    return this.listMilestones(auth, tenderId);
  }

  async createSubmission(auth: AuthContext, tenderId: string, input: CreateSubmissionInput) {
    const tender = await this.requireTender(auth, tenderId, "tender:submit");
    if (input.receiptFileIds.length) {
      const receiptFiles = await this.db.select().from(files).where(and(eq(files.organizationId, auth.organizationId), inArray(files.id, input.receiptFileIds)));
      if (receiptFiles.length !== new Set(input.receiptFileIds).size) throw new NotFoundException({ code: "RECEIPT_FILE_NOT_FOUND", message: "One or more receipt files were not found." });
    }
    const submission = await this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(tenders).where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, auth.organizationId))).for("update");
      if (!current || !["APPROVED", "SUBMITTED"].includes(current.status)) throw new ConflictException({ code: "TENDER_NOT_APPROVED", message: "Approve the current package before recording submission." });
      await this.requireTender(auth, tenderId, "tender:submit");
    const pkg = await this.getPackageRow(auth.organizationId, tenderId, input.packageId);
    const snapshot = await this.packageSnapshot(auth, tenderId);
    if (pkg.status !== "APPROVED" || pkg.contentDigest !== sha(JSON.stringify(snapshot.digestInput))) throw new ConflictException({ code: "APPROVED_CURRENT_PACKAGE_REQUIRED", message: "Submission requires a current approved package." });
    if (tender.status !== "APPROVED" && tender.status !== "SUBMITTED") throw new ConflictException({ code: "TENDER_NOT_APPROVED", message: "Approve the tender package before recording submission." });
      this.assertApprovalReady(snapshot);
      const [row] = await tx.insert(tenderSubmissions).values({ organizationId: auth.organizationId, workspaceId: tender.workspaceId, tenderId, packageId: pkg.id, portal: input.portal, portalReference: input.portalReference, submittedAt: new Date(input.submittedAt), submittedBy: auth.userId, notes: input.notes }).onConflictDoNothing().returning();
      const existing = row ?? (await tx.select().from(tenderSubmissions).where(and(eq(tenderSubmissions.tenderId, tenderId), eq(tenderSubmissions.portalReference, input.portalReference))).limit(1))[0];
      if (!existing) throw new Error("Unable to record submission.");
      if (existing.packageId !== pkg.id || existing.portal !== input.portal) throw new ConflictException({ code: "SUBMISSION_REFERENCE_CONFLICT", message: "This acknowledgement already belongs to a different submission." });
      if (input.receiptFileIds.length) await tx.insert(tenderSubmissionReceipts).values(input.receiptFileIds.map((fileId) => ({ submissionId: existing.id, fileId, organizationId: auth.organizationId }))).onConflictDoNothing();
      if (current.status === "APPROVED") {
        await tx.update(tenders).set({ status: "SUBMITTED", updatedAt: new Date() }).where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, auth.organizationId)));
        await tx.insert(tenderStatusHistory).values({ organizationId: auth.organizationId, workspaceId: tender.workspaceId, tenderId, fromStatus: "APPROVED", toStatus: "SUBMITTED", actorId: auth.userId, reason: `Submitted through ${input.portal}.`, metadata: { submissionId: existing.id, packageId: pkg.id } });
      }
      await tx.update(tenderMilestones).set({ status: "COMPLETE", completedAt: new Date(), updatedAt: new Date() }).where(and(eq(tenderMilestones.tenderId, tenderId), eq(tenderMilestones.kind, "SUBMISSION")));
      return existing;
    });
    await this.record(auth, tender, "TENDER_SUBMISSION_RECORDED", "tender_submission", submission.id, { packageId: input.packageId, portal: input.portal, portalReference: input.portalReference, receiptFileIds: input.receiptFileIds });
    return serializeDates(submission);
  }

  async listSubmissions(auth: AuthContext, tenderId: string) {
    await this.requireTender(auth, tenderId, "tender:read");
    const items = await this.db.select().from(tenderSubmissions).where(and(eq(tenderSubmissions.organizationId, auth.organizationId), eq(tenderSubmissions.tenderId, tenderId))).orderBy(desc(tenderSubmissions.submittedAt));
    return { items: items.map(serializeDates) };
  }

  async executeRun(auth: AuthContext, run: typeof tenderAutomationRuns.$inferSelect) {
    const runId = run.id;
    const input = run.configuration as CreateAutomationRunInput;
    let failures = 0;
    try {
      await this.requireTender(auth, run.tenderId, "tender:update");
      await this.assertRunActive(run);
      await this.runStep(run, "ANALYSIS", () => this.tendersService.analyzeTender(auth, run.tenderId));
      await this.runStep(run, "EVIDENCE_RETRIEVAL", async () => ({ mode: "performed-per-requirement-during-generation" }));
      const requirements = await this.tendersService.listRequirements(auth, run.tenderId);
      if (input.requirementIds?.some((id) => !requirements.items.some((item) => item.id === id))) throw new NotFoundException("A requested requirement does not belong to this tender.");
      const selected = (input.requirementIds ? requirements.items.filter((item) => input.requirementIds!.includes(item.id)) : requirements.items).slice(0, input.limit ?? 500);
      if (selected.length === 0) {
        await this.db.update(tenderAutomationRuns).set({ status: "WAITING_FOR_INPUT", summary: { reason: "No accepted requirements are available." }, completedAt: new Date(), updatedAt: new Date() }).where(this.runFence(run));
        return;
      }
      await this.runStep(run, "ANSWER_GENERATION", async (stepId) => {
        const completed = await this.db.select().from(tenderAutomationItems).where(and(eq(tenderAutomationItems.runId, runId), eq(tenderAutomationItems.status, "SUCCEEDED")));
        for (const requirement of selected) {
          await this.assertRunActive(run);
          if (completed.some((item) => item.requirementId === requirement.id)) continue;
          const existingAnswers = (await this.tendersService.listAnswers(auth, run.tenderId)).items;
          const key = `requirement:${requirement.id}`;
          const existing = existingAnswers.find((answer) => requirement.questionIds.includes(answer.questionId));
          if (existing && (existing.source !== "AI_GENERATED" || ["IN_REVIEW", "APPROVED", "FINAL"].includes(existing.status))) {
            await this.saveRunItem(run, stepId, requirement.id, key, "SUCCEEDED", { skipped: true, reason: "Protected existing answer", answerId: existing.id });
            continue;
          }
          try {
            const result = await this.tendersService.generateRequirementAnswer(auth, run.tenderId, requirement.id, (tx) => this.assertRunActive(run, tx));
            if (!result.answer) {
              failures++;
              await this.ensureSmeAssignment(auth, run, requirement.id);
              await this.saveRunItem(run, stepId, requirement.id, key, "BLOCKED", { reason: result.reason ?? "Insufficient evidence" });
            } else await this.saveRunItem(run, stepId, requirement.id, key, "SUCCEEDED", { answerId: result.answer.id, evidenceState: result.evidenceState });
          } catch (error) {
            await this.assertRunActive(run);
            failures++;
            await this.saveRunItem(run, stepId, requirement.id, key, "FAILED", {}, safeError(error));
          }
        }
        return { total: selected.length, failures };
      });
      await this.runStep(run, "VALIDATION", () => this.tendersService.runValidation(auth, run.tenderId));
      await this.assertRunActive(run);
      if (input.includePackage && failures === 0) await this.createPackage(auth, run.tenderId);
      await this.db.update(tenderAutomationRuns).set({ status: failures ? "PARTIAL" : "SUCCEEDED", summary: { requirements: selected.length, failures }, completedAt: new Date(), updatedAt: new Date() }).where(this.runFence(run));
    } catch (error) {
      await this.db.update(tenderAutomationRuns).set({ status: "FAILED", failureReason: safeError(error), completedAt: new Date(), updatedAt: new Date() }).where(this.runFence(run));
    }
  }

  private runFence(run: typeof tenderAutomationRuns.$inferSelect) {
    return and(eq(tenderAutomationRuns.id, run.id), eq(tenderAutomationRuns.status, "RUNNING"), eq(tenderAutomationRuns.leaseOwner, run.leaseOwner!), sql`${tenderAutomationRuns.leaseExpiresAt} > now()`);
  }

  async assertRunActive(run: typeof tenderAutomationRuns.$inferSelect, tx?: Transaction) {
    const query = (tx ?? this.db).select({ id: tenderAutomationRuns.id }).from(tenderAutomationRuns).where(this.runFence(run)).limit(1);
    const [current] = await (tx ? query.for("update") : query);
    if (!current) throw new ConflictException({ code: "AUTOMATION_STOPPED", message: "Automation was cancelled or its execution lease expired." });
  }

  private async runStep(run: typeof tenderAutomationRuns.$inferSelect, kind: typeof STEP_KINDS[number], work: (stepId: string) => Promise<unknown>) {
    await this.assertRunActive(run);
    const [step] = await this.db.update(tenderAutomationSteps).set({ status: "RUNNING", failureReason: null, attempt: sql`${tenderAutomationSteps.attempt} + 1`, startedAt: new Date(), updatedAt: new Date() }).where(and(eq(tenderAutomationSteps.runId, run.id), eq(tenderAutomationSteps.kind, kind))).returning();
    if (!step) throw new Error(`Automation step ${kind} is missing.`);
    try {
      const result = await work(step.id);
      await this.assertRunActive(run);
      await this.db.update(tenderAutomationSteps).set({ status: Number(asRecord(result).failures ?? 0) > 0 ? "PARTIAL" : "SUCCEEDED", result: asRecord(result), completedAt: new Date(), updatedAt: new Date() }).where(eq(tenderAutomationSteps.id, step.id));
    } catch (error) {
      await this.assertRunActive(run);
      await this.db.update(tenderAutomationSteps).set({ status: "FAILED", failureReason: safeError(error), completedAt: new Date(), updatedAt: new Date() }).where(eq(tenderAutomationSteps.id, step.id));
      throw error;
    }
  }

  private async saveRunItem(run: typeof tenderAutomationRuns.$inferSelect, stepId: string, requirementId: string, itemKey: string, status: "SUCCEEDED" | "BLOCKED" | "FAILED", result: Record<string, unknown>, failureReason?: string) {
    await this.assertRunActive(run);
    await this.db.insert(tenderAutomationItems).values({ organizationId: run.organizationId, workspaceId: run.workspaceId, tenderId: run.tenderId, runId: run.id, stepId, requirementId, itemKey, status, result, failureReason, startedAt: new Date(), completedAt: new Date() }).onConflictDoUpdate({ target: [tenderAutomationItems.runId, tenderAutomationItems.itemKey], set: { status, result, failureReason, completedAt: new Date() } });
  }

  private async ensureSmeAssignment(auth: AuthContext, run: typeof tenderAutomationRuns.$inferSelect, requirementId: string) {
    const [existing] = await this.db.select().from(assignments).where(and(eq(assignments.organizationId, auth.organizationId), eq(assignments.workspaceId, run.workspaceId), eq(assignments.resourceType, "tender_requirement"), eq(assignments.resourceId, requirementId), inArray(assignments.status, ["pending", "in_progress"]))).limit(1);
    if (!existing) await this.assignmentsService.create(auth, { workspaceId: run.workspaceId, resourceType: "tender_requirement", resourceId: requirementId, assigneeType: "user", assigneeId: (await this.getTenderRow(auth.organizationId, run.tenderId)).ownerId, assignmentRole: "SME / Knowledge Owner" }, (tx) => this.assertRunActive(run, tx));
  }

  private async packageSnapshot(auth: AuthContext, tenderId: string) {
    const [tender, requirements, questions, answers, reviews, evidence, validation] = await Promise.all([
      this.getTenderRow(auth.organizationId, tenderId),
      this.db.select().from(tenderRequirements).where(and(eq(tenderRequirements.organizationId, auth.organizationId), eq(tenderRequirements.tenderId, tenderId))).orderBy(asc(tenderRequirements.createdAt)),
      this.db.select().from(tenderQuestions).where(and(eq(tenderQuestions.organizationId, auth.organizationId), eq(tenderQuestions.tenderId, tenderId))).orderBy(asc(tenderQuestions.sortOrder)),
      this.db.select().from(tenderAnswers).where(and(eq(tenderAnswers.organizationId, auth.organizationId), eq(tenderAnswers.tenderId, tenderId))),
      this.db.select().from(tenderAnswerReviews).where(and(eq(tenderAnswerReviews.organizationId, auth.organizationId), eq(tenderAnswerReviews.tenderId, tenderId))),
      this.db.select().from(tenderAnswerEvidence).where(and(eq(tenderAnswerEvidence.organizationId, auth.organizationId), eq(tenderAnswerEvidence.tenderId, tenderId))),
      this.tendersService.getValidation(auth, tenderId),
    ]);
    const links = await this.db.select().from(tenderQuestionRequirements).where(and(eq(tenderQuestionRequirements.organizationId, auth.organizationId), inArray(tenderQuestionRequirements.requirementId, requirements.map((item) => item.id))));
    const rows = projectPackageRows(requirements, questions, answers, links, evidence);
    const attachmentRows = await this.db.select({ document: tenderDocuments, file: files }).from(tenderDocuments).innerJoin(files, eq(files.id, tenderDocuments.documentId)).where(and(eq(tenderDocuments.organizationId, auth.organizationId), eq(tenderDocuments.tenderId, tenderId), inArray(tenderDocuments.documentRole, ["ATTACHMENT", "RESPONSE_DOCUMENT"])));
    const approvedAttachments = attachmentRows.filter(({ document }) => document.documentRole === "RESPONSE_DOCUMENT" || document.metadata.approvedForSubmission === true);
    const digestInput = { generatorVersion: "tendyy-package@2", links: links.map((item) => [item.questionId, item.requirementId]).sort((a, b) => a.join(":").localeCompare(b.join(":"))), tender: { id: tender.id, title: tender.title, referenceNumber: tender.referenceNumber, buyerName: tender.buyerName, dueAt: tender.dueAt?.toISOString() ?? null }, requirements: requirements.map((item) => [item.id, item.updatedAt.toISOString(), item.status]), questions: questions.map((item) => [item.id, item.updatedAt.toISOString(), item.status]), answers: answers.map((item) => [item.id, item.updatedAt.toISOString(), item.status, item.answerText]).sort(byFirst), reviews: reviews.map((item) => [item.id, item.updatedAt.toISOString(), item.status]).sort(byFirst), evidence: evidence.map((item) => [item.id, item.evidenceId, item.sourceVersion]).sort(byFirst), attachments: approvedAttachments.map(({ document, file }) => [document.id, file.checksumSha256, file.filename]).sort(byFirst) };
    return { tender, requirements, questions, answers, reviews, evidence, validation, digestInput, packageInput: { title: tender.title, reference: tender.referenceNumber ?? tender.id, buyer: tender.buyerName ?? tender.name, deadline: tender.dueAt?.toISOString() ?? "Not set", rows, blockers: validation.current.issues.filter((item) => item.blocking).map((item) => item.title) } };
  }

  private assertApprovalReady(snapshot: Awaited<ReturnType<ApplyAutomationService["packageSnapshot"]>>) {
    if (!snapshot.validation.current.ready) throw new ConflictException({ code: "VALIDATION_BLOCKED", message: "Resolve validation blockers before final approval.", issues: snapshot.validation.current.issues });
    const requiredQuestions = snapshot.questions.filter((item) => item.required);
    for (const question of requiredQuestions) {
      const answer = snapshot.answers.find((item) => item.questionId === question.id);
      if (!answer || !hasCurrentApproval(answer, snapshot.reviews)) throw new ConflictException({ code: "ANSWER_REVIEW_REQUIRED", message: "Every required answer needs an approved review." });
    }
  }

  private async serializePackage(row: typeof tenderSubmissionPackages.$inferSelect) {
    const artifacts = await this.db.select({ artifact: tenderSubmissionArtifacts, file: files }).from(tenderSubmissionArtifacts).innerJoin(files, eq(files.id, tenderSubmissionArtifacts.fileId)).where(eq(tenderSubmissionArtifacts.packageId, row.id));
    return { ...serializeDates(row), artifacts: artifacts.map(({ artifact, file }) => ({ ...serializeDates(artifact), filename: file.filename, mimeType: file.mimeType, sizeBytes: file.sizeBytes })) };
  }

  private async packageAttachments(organizationId: string, tenderId: string) {
    const rows = await this.db.select({ document: tenderDocuments, file: files }).from(tenderDocuments).innerJoin(files, eq(files.id, tenderDocuments.documentId)).where(and(eq(tenderDocuments.organizationId, organizationId), eq(tenderDocuments.tenderId, tenderId), inArray(tenderDocuments.documentRole, ["ATTACHMENT", "RESPONSE_DOCUMENT"])));
    const result: Array<{ filename: string; bytes: Uint8Array }> = [];
    for (const { document, file } of rows) {
      if (document.documentRole !== "RESPONSE_DOCUMENT" && document.metadata.approvedForSubmission !== true) continue;
      const bytes = await this.storage.readObject(file.objectKey);
      if (!bytes) throw new ConflictException({ code: "PACKAGE_ATTACHMENT_MISSING", message: `Unable to read submission attachment ${file.filename}.` });
      if (file.checksumSha256 && sha(bytes) !== file.checksumSha256) throw new ConflictException({ code: "PACKAGE_ATTACHMENT_CHANGED", message: `Submission attachment ${file.filename} changed in storage.` });
      result.push({ filename: file.filename, bytes });
    }
    return result;
  }
  private async record(auth: AuthContext, tender: typeof tenders.$inferSelect, action: string, entityType: string, entityId: string, metadata: Record<string, unknown>) {
    await Promise.all([
      this.audit.record({ organizationId: auth.organizationId, workspaceId: tender.workspaceId, actorId: auth.userId, action, entityType, entityId, metadata }),
      this.activity.record({ organizationId: auth.organizationId, workspaceId: tender.workspaceId, actorId: auth.userId, action, entityType, entityId, label: action.toLowerCase().replace(/_/g, " "), metadata }),
    ]);
  }

  private async getPackage(auth: AuthContext, tenderId: string, packageId: string) { return this.serializePackage(await this.getPackageRow(auth.organizationId, tenderId, packageId)); }
  private async getPackageRow(organizationId: string, tenderId: string, packageId: string) { const [row] = await this.db.select().from(tenderSubmissionPackages).where(and(eq(tenderSubmissionPackages.organizationId, organizationId), eq(tenderSubmissionPackages.tenderId, tenderId), eq(tenderSubmissionPackages.id, packageId))).limit(1); if (!row) throw new NotFoundException({ code: "PACKAGE_NOT_FOUND", message: "Submission package was not found." }); return row; }
  private async ensureMilestones(tender: typeof tenders.$inferSelect) { if (!tender.dueAt) return; await this.db.insert(tenderMilestones).values(Object.entries(MILESTONE_DEFAULTS).map(([kind, offsetDays]) => ({ organizationId: tender.organizationId, workspaceId: tender.workspaceId, tenderId: tender.id, kind: kind as keyof typeof MILESTONE_DEFAULTS, offsetDays, dueAt: daysBefore(tender.dueAt!, offsetDays) }))).onConflictDoNothing(); }
  private async getTenderRow(organizationId: string, tenderId: string) { const [row] = await this.db.select().from(tenders).where(and(eq(tenders.organizationId, organizationId), eq(tenders.id, tenderId))).limit(1); if (!row) throw new NotFoundException({ code: "TENDER_NOT_FOUND", message: "Tender not found." }); return row; }
  private async requireTender(auth: AuthContext, tenderId: string, permission: Permission) {
    return this.tendersService.authorizeTender(auth, tenderId, permission);
  }
}

function extractCandidateRows(row: typeof tenderDocumentContent.$inferSelect) {
  const parts = row.text.split(/(?:\r?\n)+|(?<=[.;])\s+(?=[A-Z0-9])/).map((part) => part.trim()).filter((part) => part.length >= 25 && part.length <= 2000);
  return parts.filter((part) => /\b(shall|must|required|should|submit|provide|eligible|qualification|deadline|compliance)\b/i.test(part)).map((part, index) => {
    const mandatory = /\b(shall|must|required|mandatory)\b/i.test(part);
    const type = /\b(deadline|due date|no later than)\b/i.test(part) ? "deadline" : /\b(eligible|qualification|experience|turnover)\b/i.test(part) ? "qualification" : /\b(submit|provide|deliverable|document)\b/i.test(part) ? "deliverable" : "explicit_requirement";
    const hash = sha(part.toLowerCase().replace(/\s+/g, " "));
    return { contentId: row.id, key: `${row.sequence}:${index}:${hash.slice(0, 16)}`, type, title: part.slice(0, 140), description: part, excerpt: part.slice(0, 500), hash, confidence: mandatory ? 0.9 : 0.72, mandatory, metadata: { pageNumber: row.pageNumber, sequence: row.sequence, section: row.section, kind: row.kind } };
  });
}
function mapRequirementType(value: string): "COMPLIANCE" | "TECHNICAL" | "LEGAL" | "COMMERCIAL" | "SECURITY" | "DOCUMENTATION" | "GENERAL" { if (value === "qualification") return "COMPLIANCE"; if (value === "deadline") return "COMMERCIAL"; if (value === "deliverable") return "DOCUMENTATION"; return "GENERAL"; }
function sha(value: string | Uint8Array) { return createHash("sha256").update(value).digest("hex"); }
function daysBefore(date: Date, days: number) { return new Date(date.getTime() - days * 86_400_000); }
function safeError(error: unknown) { return error instanceof Error ? error.message.slice(0, 1000) : "Automation failed."; }
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : { value }; }
function serializeDates<T extends Record<string, unknown>>(row: T): T { return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value])) as T; }
function byFirst(left: unknown[], right: unknown[]) { return String(left[0]).localeCompare(String(right[0])); }
