import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, max } from "drizzle-orm";
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
} from "@rfp-os/db";
import { ObjectStorage } from "@rfp-os/storage";
import { hasOrganizationPermission, hasWorkspacePermission, type AuthContext, type Permission } from "@rfp-os/types";

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
import { generateSubmissionArtifacts, type PackageAnswerRow } from "./submission-package";

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
    const [active] = await this.db.select().from(tenderAutomationRuns).where(and(
      eq(tenderAutomationRuns.tenderId, tenderId), inArray(tenderAutomationRuns.status, ["QUEUED", "RUNNING"]),
    )).limit(1);
    if (active) return this.getRun(auth, tenderId, active.id);
    const idempotencyKey = input.idempotencyKey ?? randomUUID();
    const run = await withTransaction(async (tx) => {
      const [created] = await tx.insert(tenderAutomationRuns).values({
        organizationId: auth.organizationId, workspaceId: tender.workspaceId, tenderId, requestedBy: auth.userId,
        idempotencyKey, configuration: input, status: "QUEUED",
      }).onConflictDoNothing().returning();
      const row = created ?? (await tx.select().from(tenderAutomationRuns).where(and(eq(tenderAutomationRuns.tenderId, tenderId), eq(tenderAutomationRuns.idempotencyKey, idempotencyKey))).limit(1))[0];
      if (!row) throw new Error("Unable to create automation run.");
      await tx.insert(tenderAutomationSteps).values(STEP_KINDS.map((kind, sequence) => ({ organizationId: auth.organizationId, workspaceId: tender.workspaceId, tenderId, runId: row.id, kind, sequence }))).onConflictDoNothing();
      return row;
    });
    await this.executeRun(auth, run.id, input);
    await this.record(auth, tender, "TENDER_AUTOMATION_RUN_STARTED", "tender_automation_run", run.id, { configuration: input });
    return this.getRun(auth, tenderId, run.id);
  }

  async listRuns(auth: AuthContext, tenderId: string) {
    await this.requireTender(auth, tenderId, "tender:read");
    const items = await this.db.select().from(tenderAutomationRuns).where(and(eq(tenderAutomationRuns.organizationId, auth.organizationId), eq(tenderAutomationRuns.tenderId, tenderId))).orderBy(desc(tenderAutomationRuns.createdAt));
    return { items: items.map(serializeDates) };
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
    return this.createRun(auth, tenderId, { ...(prior.configuration as CreateAutomationRunInput), idempotencyKey: `${runId}:retry:${Date.now()}` });
  }

  async cancelRun(auth: AuthContext, tenderId: string, runId: string) {
    await this.requireTender(auth, tenderId, "tender:update");
    const [run] = await this.db.update(tenderAutomationRuns).set({ status: "CANCELLED", completedAt: new Date(), updatedAt: new Date() }).where(and(eq(tenderAutomationRuns.organizationId, auth.organizationId), eq(tenderAutomationRuns.tenderId, tenderId), eq(tenderAutomationRuns.id, runId), inArray(tenderAutomationRuns.status, ["QUEUED", "RUNNING", "BLOCKED", "WAITING_FOR_INPUT"]))).returning();
    if (!run) throw new ConflictException({ code: "RUN_NOT_CANCELLABLE", message: "Automation run cannot be cancelled in its current state." });
    return serializeDates(run);
  }

  async createPackage(auth: AuthContext, tenderId: string) {
    const tender = await this.requireTender(auth, tenderId, "tender:update");
    const snapshot = await this.packageSnapshot(auth, tenderId);
    const digest = sha(JSON.stringify(snapshot.digestInput));
    await this.refreshPackageFreshness(auth.organizationId, tenderId, digest);
    const [same] = await this.db.select().from(tenderSubmissionPackages).where(and(eq(tenderSubmissionPackages.tenderId, tenderId), eq(tenderSubmissionPackages.contentDigest, digest))).limit(1);
    if (same && same.status !== "FAILED") return this.serializePackage(same);
    const [versionRow] = await this.db.select({ value: max(tenderSubmissionPackages.version) }).from(tenderSubmissionPackages).where(eq(tenderSubmissionPackages.tenderId, tenderId));
    const highest = versionRow?.value ?? 0;
    const [record] = same?.status === "FAILED"
      ? await this.db.update(tenderSubmissionPackages).set({ status: "GENERATING", failureReason: null, completedAt: null }).where(eq(tenderSubmissionPackages.id, same.id)).returning()
      : await this.db.insert(tenderSubmissionPackages).values({ organizationId: auth.organizationId, workspaceId: tender.workspaceId, tenderId, version: Number(highest ?? 0) + 1, contentDigest: digest, generatorVersion: "tendyy-package@1", validationRunId: snapshot.validation.latestRun?.id ?? null, validationSnapshot: snapshot.validation.current as unknown as Record<string, unknown>, createdBy: auth.userId }).returning();
    if (!record) throw new Error("Unable to create submission package.");
    try {
      if (same?.status === "FAILED") await this.db.delete(tenderSubmissionArtifacts).where(eq(tenderSubmissionArtifacts.packageId, record.id));
      const attachments = await this.packageAttachments(auth.organizationId, tenderId);
      const artifacts = generateSubmissionArtifacts({ ...snapshot.packageInput, attachments });
      for (const artifact of artifacts) {
        const checksum = sha(artifact.bytes);
        const objectKey = `organizations/${auth.organizationId}/workspaces/${tender.workspaceId}/tenders/${tenderId}/packages/v${record.version}/${artifact.filename}`;
        await this.storage.putObject({ objectKey, mimeType: artifact.mimeType, bytes: artifact.bytes });
        const [file] = await this.db.insert(files).values({ organizationId: auth.organizationId, bucket: this.storage.bucket, objectKey, filename: artifact.filename, mimeType: artifact.mimeType, sizeBytes: artifact.bytes.length, checksumSha256: checksum, uploadedBy: auth.userId }).returning();
        if (!file) throw new Error("Unable to persist generated artifact.");
        await this.db.insert(tenderSubmissionArtifacts).values({ organizationId: auth.organizationId, workspaceId: tender.workspaceId, tenderId, packageId: record.id, fileId: file.id, kind: artifact.kind, checksumSha256: checksum });
      }
      const [ready] = await this.db.update(tenderSubmissionPackages).set({ status: "READY", completedAt: new Date() }).where(eq(tenderSubmissionPackages.id, record.id)).returning();
      await this.record(auth, tender, "TENDER_SUBMISSION_PACKAGE_CREATED", "tender_submission_package", record.id, { version: record.version, contentDigest: digest });
      return this.serializePackage(ready!);
    } catch (error) {
      await this.db.update(tenderSubmissionPackages).set({ status: "FAILED", failureReason: safeError(error), completedAt: new Date() }).where(eq(tenderSubmissionPackages.id, record.id));
      throw error;
    }
  }

  async listPackages(auth: AuthContext, tenderId: string) {
    await this.requireTender(auth, tenderId, "tender:read");
    const snapshot = await this.packageSnapshot(auth, tenderId);
    await this.refreshPackageFreshness(auth.organizationId, tenderId, sha(JSON.stringify(snapshot.digestInput)));
    const rows = await this.db.select().from(tenderSubmissionPackages).where(and(eq(tenderSubmissionPackages.organizationId, auth.organizationId), eq(tenderSubmissionPackages.tenderId, tenderId))).orderBy(desc(tenderSubmissionPackages.version));
    return { items: await Promise.all(rows.map((row) => this.serializePackage(row))) };
  }

  async packageDownload(auth: AuthContext, tenderId: string, packageId: string) {
    await this.requireTender(auth, tenderId, "tender:read");
    const [row] = await this.db.select({ artifact: tenderSubmissionArtifacts, file: files }).from(tenderSubmissionArtifacts).innerJoin(files, eq(files.id, tenderSubmissionArtifacts.fileId)).where(and(eq(tenderSubmissionArtifacts.organizationId, auth.organizationId), eq(tenderSubmissionArtifacts.tenderId, tenderId), eq(tenderSubmissionArtifacts.packageId, packageId), eq(tenderSubmissionArtifacts.kind, "PACKAGE_ZIP"))).limit(1);
    if (!row) throw new NotFoundException({ code: "PACKAGE_NOT_FOUND", message: "Submission package was not found." });
    return { url: await this.storage.presignGet({ objectKey: row.file.objectKey, expiresInSeconds: 300, downloadFilename: row.file.filename }), expiresInSeconds: 300 };
  }

  async approvePackage(auth: AuthContext, tenderId: string, packageId: string, input: ApprovePackageInput) {
    const tender = await this.requireTender(auth, tenderId, "tender:approve");
    const snapshot = await this.packageSnapshot(auth, tenderId);
    const digest = sha(JSON.stringify(snapshot.digestInput));
    const [pkg] = await this.db.select().from(tenderSubmissionPackages).where(and(eq(tenderSubmissionPackages.organizationId, auth.organizationId), eq(tenderSubmissionPackages.tenderId, tenderId), eq(tenderSubmissionPackages.id, packageId))).limit(1);
    if (!pkg || !["READY", "APPROVED"].includes(pkg.status)) throw new ConflictException({ code: "PACKAGE_NOT_READY", message: "Only a current ready package can be approved." });
    if (pkg.contentDigest !== digest) throw new ConflictException({ code: "PACKAGE_STALE", message: "Application content changed. Rebuild the package before approval." });
    this.assertApprovalReady(snapshot);
    await withTransaction(async (tx) => {
      await tx.insert(tenderPackageApprovals).values({ organizationId: auth.organizationId, workspaceId: tender.workspaceId, tenderId, packageId, approvedBy: auth.userId, comment: input.comment, validationSnapshot: snapshot.validation.current as unknown as Record<string, unknown> }).onConflictDoNothing();
      await tx.update(tenderSubmissionPackages).set({ status: "APPROVED" }).where(eq(tenderSubmissionPackages.id, packageId));
    });
    if (tender.status === "REVIEW") await this.tendersService.approveTender(auth, tenderId);
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
    const pkg = await this.getPackageRow(auth.organizationId, tenderId, input.packageId);
    const snapshot = await this.packageSnapshot(auth, tenderId);
    if (pkg.status !== "APPROVED" || pkg.contentDigest !== sha(JSON.stringify(snapshot.digestInput))) throw new ConflictException({ code: "APPROVED_CURRENT_PACKAGE_REQUIRED", message: "Submission requires a current approved package." });
    if (tender.status !== "APPROVED" && tender.status !== "SUBMITTED") throw new ConflictException({ code: "TENDER_NOT_APPROVED", message: "Approve the tender package before recording submission." });
    if (input.receiptFileIds.length) {
      const receiptFiles = await this.db.select().from(files).where(and(eq(files.organizationId, auth.organizationId), inArray(files.id, input.receiptFileIds)));
      if (receiptFiles.length !== new Set(input.receiptFileIds).size) throw new NotFoundException({ code: "RECEIPT_FILE_NOT_FOUND", message: "One or more receipt files were not found." });
    }
    const submission = await withTransaction(async (tx) => {
      const [row] = await tx.insert(tenderSubmissions).values({ organizationId: auth.organizationId, workspaceId: tender.workspaceId, tenderId, packageId: pkg.id, portal: input.portal, portalReference: input.portalReference, submittedAt: new Date(input.submittedAt), submittedBy: auth.userId, notes: input.notes }).onConflictDoNothing().returning();
      const existing = row ?? (await tx.select().from(tenderSubmissions).where(and(eq(tenderSubmissions.tenderId, tenderId), eq(tenderSubmissions.portalReference, input.portalReference))).limit(1))[0];
      if (!existing) throw new Error("Unable to record submission.");
      if (input.receiptFileIds.length) await tx.insert(tenderSubmissionReceipts).values(input.receiptFileIds.map((fileId) => ({ submissionId: existing.id, fileId, organizationId: auth.organizationId }))).onConflictDoNothing();
      if (tender.status === "APPROVED") {
        await tx.update(tenders).set({ status: "SUBMITTED", updatedAt: new Date() }).where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, auth.organizationId)));
        await tx.insert(tenderStatusHistory).values({ organizationId: auth.organizationId, workspaceId: tender.workspaceId, tenderId, fromStatus: "APPROVED", toStatus: "SUBMITTED", actorId: auth.userId, reason: `Submitted through ${input.portal}.`, metadata: { submissionId: existing.id, packageId: pkg.id } });
      }
      await tx.update(tenderMilestones).set({ status: "COMPLETE", completedAt: new Date(), updatedAt: new Date() }).where(and(eq(tenderMilestones.tenderId, tenderId), eq(tenderMilestones.kind, "SUBMISSION")));
      return existing;
    });
    await this.record(auth, tender, "TENDER_SUBMISSION_RECORDED", "tender_submission", submission.id, { packageId: pkg.id, portal: input.portal, portalReference: input.portalReference });
    return serializeDates(submission);
  }

  async listSubmissions(auth: AuthContext, tenderId: string) {
    await this.requireTender(auth, tenderId, "tender:read");
    const items = await this.db.select().from(tenderSubmissions).where(and(eq(tenderSubmissions.organizationId, auth.organizationId), eq(tenderSubmissions.tenderId, tenderId))).orderBy(desc(tenderSubmissions.submittedAt));
    return { items: items.map(serializeDates) };
  }

  private async executeRun(auth: AuthContext, runId: string, input: CreateAutomationRunInput) {
    const [run] = await this.db.update(tenderAutomationRuns).set({ status: "RUNNING", startedAt: new Date(), updatedAt: new Date() }).where(eq(tenderAutomationRuns.id, runId)).returning();
    if (!run) return;
    let failures = 0;
    try {
      await this.runStep(run, "ANALYSIS", () => this.tendersService.analyzeTender(auth, run.tenderId));
      await this.runStep(run, "EVIDENCE_RETRIEVAL", async () => ({ mode: "performed-per-requirement-during-generation" }));
      const requirements = await this.tendersService.listRequirements(auth, run.tenderId);
      const selected = input.requirementIds?.length ? requirements.items.filter((item) => input.requirementIds!.includes(item.id)) : requirements.items;
      if (selected.length === 0) {
        await this.db.update(tenderAutomationRuns).set({ status: "WAITING_FOR_INPUT", summary: { reason: "No accepted requirements are available." }, completedAt: new Date(), updatedAt: new Date() }).where(eq(tenderAutomationRuns.id, runId));
        return;
      }
      await this.runStep(run, "ANSWER_GENERATION", async (stepId) => {
        const existingAnswers = (await this.tendersService.listAnswers(auth, run.tenderId)).items;
        for (const requirement of selected) {
          const key = `requirement:${requirement.id}`;
          const existing = existingAnswers.find((answer) => requirement.questionIds.includes(answer.questionId));
          if (existing && (existing.source !== "AI_GENERATED" || ["IN_REVIEW", "APPROVED", "FINAL"].includes(existing.status))) {
            await this.saveRunItem(run, stepId, requirement.id, key, "SUCCEEDED", { skipped: true, reason: "Protected existing answer", answerId: existing.id });
            continue;
          }
          try {
            const result = await this.tendersService.generateRequirementAnswer(auth, run.tenderId, requirement.id);
            if (!result.answer) {
              failures++;
              await this.ensureSmeAssignment(auth, run, requirement.id);
              await this.saveRunItem(run, stepId, requirement.id, key, "BLOCKED", { reason: result.reason ?? "Insufficient evidence" });
            } else await this.saveRunItem(run, stepId, requirement.id, key, "SUCCEEDED", { answerId: result.answer.id, evidenceState: result.evidenceState });
          } catch (error) {
            failures++;
            await this.saveRunItem(run, stepId, requirement.id, key, "FAILED", {}, safeError(error));
          }
        }
        return { total: selected.length, failures };
      });
      await this.runStep(run, "VALIDATION", () => this.tendersService.runValidation(auth, run.tenderId));
      if (input.includePackage && failures === 0) await this.createPackage(auth, run.tenderId);
      await this.db.update(tenderAutomationRuns).set({ status: failures ? "PARTIAL" : "SUCCEEDED", summary: { requirements: selected.length, failures }, completedAt: new Date(), updatedAt: new Date() }).where(eq(tenderAutomationRuns.id, runId));
    } catch (error) {
      await this.db.update(tenderAutomationRuns).set({ status: "FAILED", failureReason: safeError(error), completedAt: new Date(), updatedAt: new Date() }).where(eq(tenderAutomationRuns.id, runId));
    }
  }

  private async runStep(run: typeof tenderAutomationRuns.$inferSelect, kind: typeof STEP_KINDS[number], work: (stepId: string) => Promise<unknown>) {
    const [step] = await this.db.update(tenderAutomationSteps).set({ status: "RUNNING", attempt: 1, startedAt: new Date(), updatedAt: new Date() }).where(and(eq(tenderAutomationSteps.runId, run.id), eq(tenderAutomationSteps.kind, kind))).returning();
    if (!step) throw new Error(`Automation step ${kind} is missing.`);
    try {
      const result = await work(step.id);
      await this.db.update(tenderAutomationSteps).set({ status: "SUCCEEDED", result: asRecord(result), completedAt: new Date(), updatedAt: new Date() }).where(eq(tenderAutomationSteps.id, step.id));
    } catch (error) {
      await this.db.update(tenderAutomationSteps).set({ status: "FAILED", failureReason: safeError(error), completedAt: new Date(), updatedAt: new Date() }).where(eq(tenderAutomationSteps.id, step.id));
      throw error;
    }
  }

  private async saveRunItem(run: typeof tenderAutomationRuns.$inferSelect, stepId: string, requirementId: string, itemKey: string, status: "SUCCEEDED" | "BLOCKED" | "FAILED", result: Record<string, unknown>, failureReason?: string) {
    await this.db.insert(tenderAutomationItems).values({ organizationId: run.organizationId, workspaceId: run.workspaceId, tenderId: run.tenderId, runId: run.id, stepId, requirementId, itemKey, status, result, failureReason, startedAt: new Date(), completedAt: new Date() }).onConflictDoUpdate({ target: [tenderAutomationItems.runId, tenderAutomationItems.itemKey], set: { status, result, failureReason, completedAt: new Date() } });
  }

  private async ensureSmeAssignment(auth: AuthContext, run: typeof tenderAutomationRuns.$inferSelect, requirementId: string) {
    const [existing] = await this.db.select().from(assignments).where(and(eq(assignments.organizationId, auth.organizationId), eq(assignments.workspaceId, run.workspaceId), eq(assignments.resourceType, "tender_requirement"), eq(assignments.resourceId, requirementId), inArray(assignments.status, ["pending", "in_progress"]))).limit(1);
    if (!existing) await this.assignmentsService.create(auth, { workspaceId: run.workspaceId, resourceType: "tender_requirement", resourceId: requirementId, assigneeType: "user", assigneeId: (await this.getTenderRow(auth.organizationId, run.tenderId)).ownerId, assignmentRole: "SME / Knowledge Owner" });
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
    const rows: PackageAnswerRow[] = requirements.map((requirement) => {
      const questionId = links.find((link) => link.requirementId === requirement.id)?.questionId;
      const question = questions.find((item) => item.id === questionId);
      const answer = answers.find((item) => item.questionId === questionId);
      return { requirement: requirement.title, question: question?.questionText ?? requirement.description, answer: answer?.answerText ?? "", mandatory: requirement.mandatory, status: answer?.status ?? "UNANSWERED", evidence: evidence.filter((item) => item.answerId === answer?.id).map((item) => `${item.evidenceType}:${item.evidenceId}`) };
    });
    const attachmentRows = await this.db.select({ document: tenderDocuments, file: files }).from(tenderDocuments).innerJoin(files, eq(files.id, tenderDocuments.documentId)).where(and(eq(tenderDocuments.organizationId, auth.organizationId), eq(tenderDocuments.tenderId, tenderId), inArray(tenderDocuments.documentRole, ["ATTACHMENT", "RESPONSE_DOCUMENT"])));
    const approvedAttachments = attachmentRows.filter(({ document }) => document.documentRole === "RESPONSE_DOCUMENT" || document.metadata.approvedForSubmission === true);
    const digestInput = { tender: { id: tender.id, title: tender.title, referenceNumber: tender.referenceNumber, buyerName: tender.buyerName, dueAt: tender.dueAt?.toISOString() ?? null }, requirements: requirements.map((item) => [item.id, item.updatedAt.toISOString(), item.status]), questions: questions.map((item) => [item.id, item.updatedAt.toISOString(), item.status]), answers: answers.map((item) => [item.id, item.updatedAt.toISOString(), item.status, item.answerText]).sort(byFirst), reviews: reviews.map((item) => [item.id, item.updatedAt.toISOString(), item.status]).sort(byFirst), evidence: evidence.map((item) => [item.id, item.evidenceId, item.sourceVersion]).sort(byFirst), attachments: approvedAttachments.map(({ document, file }) => [document.id, file.checksumSha256, file.filename]).sort(byFirst) };
    return { tender, requirements, questions, answers, reviews, evidence, validation, digestInput, packageInput: { title: tender.title, reference: tender.referenceNumber ?? tender.id, buyer: tender.buyerName ?? tender.name, deadline: tender.dueAt?.toISOString() ?? "Not set", rows, blockers: validation.current.issues.filter((item) => item.blocking).map((item) => item.title) } };
  }

  private assertApprovalReady(snapshot: Awaited<ReturnType<ApplyAutomationService["packageSnapshot"]>>) {
    if (!snapshot.validation.current.ready) throw new ConflictException({ code: "VALIDATION_BLOCKED", message: "Resolve validation blockers before final approval.", issues: snapshot.validation.current.issues });
    const requiredQuestions = snapshot.questions.filter((item) => item.required);
    for (const question of requiredQuestions) {
      const answer = snapshot.answers.find((item) => item.questionId === question.id);
      if (!answer || answer.status !== "APPROVED") throw new ConflictException({ code: "ANSWER_REVIEW_REQUIRED", message: "Every required answer needs an approved review." });
    }
  }

  private async refreshPackageFreshness(organizationId: string, tenderId: string, digest: string) {
    const approvedBefore = await this.db.select({ id: tenderSubmissionPackages.id }).from(tenderSubmissionPackages).where(and(eq(tenderSubmissionPackages.organizationId, organizationId), eq(tenderSubmissionPackages.tenderId, tenderId), eq(tenderSubmissionPackages.status, "APPROVED")));
    await this.db.update(tenderSubmissionPackages).set({ status: "STALE" }).where(and(eq(tenderSubmissionPackages.organizationId, organizationId), eq(tenderSubmissionPackages.tenderId, tenderId), inArray(tenderSubmissionPackages.status, ["READY", "APPROVED"]), /* digest differs below */));
    await this.db.update(tenderSubmissionPackages).set({ status: "READY" }).where(and(eq(tenderSubmissionPackages.organizationId, organizationId), eq(tenderSubmissionPackages.tenderId, tenderId), eq(tenderSubmissionPackages.contentDigest, digest), eq(tenderSubmissionPackages.status, "STALE")));
    const [approval] = await this.db.select().from(tenderPackageApprovals).innerJoin(tenderSubmissionPackages, eq(tenderSubmissionPackages.id, tenderPackageApprovals.packageId)).where(and(eq(tenderPackageApprovals.organizationId, organizationId), eq(tenderPackageApprovals.tenderId, tenderId), eq(tenderSubmissionPackages.contentDigest, digest))).limit(1);
    if (approval) await this.db.update(tenderSubmissionPackages).set({ status: "APPROVED" }).where(eq(tenderSubmissionPackages.id, approval.tender_submission_packages.id));
    const approvedStillCurrent = approval?.tender_submission_packages.id;
    if (approvedBefore.some((item) => item.id !== approvedStillCurrent)) {
      const [tender] = await this.db.select().from(tenders).where(and(eq(tenders.organizationId, organizationId), eq(tenders.id, tenderId))).limit(1);
      if (tender?.status === "APPROVED") await withTransaction(async (tx) => {
        await tx.update(tenders).set({ status: "REVIEW", updatedAt: new Date() }).where(eq(tenders.id, tenderId));
        await tx.insert(tenderStatusHistory).values({ organizationId, workspaceId: tender.workspaceId, tenderId, fromStatus: "APPROVED", toStatus: "REVIEW", actorId: null, reason: "Approved package became stale after response content changed.", metadata: { automated: true } });
      });
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
      if (bytes) result.push({ filename: file.filename, bytes });
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
  private async requireTender(auth: AuthContext, tenderId: string, permission: Permission) { const tender = await this.getTenderRow(auth.organizationId, tenderId); if (!hasOrganizationPermission(auth, permission) && !hasWorkspacePermission(auth, tender.workspaceId, permission)) throw new ForbiddenException({ code: "TENDER_ACCESS_DENIED", message: `Missing permission ${permission}.` }); return tender; }
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
