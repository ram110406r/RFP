import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { files } from "./files";
import { users } from "./identity";
import { organizations } from "./organization";
import {
  tenderAnswers,
  tenderDocumentContent,
  tenderDocumentExtractions,
  tenderDocuments,
  tenderQuestions,
  tenderRequirements,
  tenderValidationRuns,
  tenders,
} from "./tender";
import { workspaces } from "./foundation";

export const tenderRequirementCandidateStatusEnum = pgEnum("tender_requirement_candidate_status", [
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "SUPERSEDED",
]);
export const tenderAutomationStatusEnum = pgEnum("tender_automation_status", [
  "QUEUED",
  "RUNNING",
  "WAITING_FOR_INPUT",
  "BLOCKED",
  "SUCCEEDED",
  "PARTIAL",
  "FAILED",
  "CANCELLED",
]);
export const tenderAutomationStepKindEnum = pgEnum("tender_automation_step_kind", [
  "REQUIREMENT_EXTRACTION",
  "ANALYSIS",
  "EVIDENCE_RETRIEVAL",
  "ANSWER_GENERATION",
  "VALIDATION",
  "PACKAGE_GENERATION",
  "REMINDER_RECONCILIATION",
]);
export const tenderPackageStatusEnum = pgEnum("tender_package_status", [
  "GENERATING",
  "READY",
  "FAILED",
  "STALE",
  "APPROVED",
]);
export const tenderPackageArtifactKindEnum = pgEnum("tender_package_artifact_kind", [
  "NARRATIVE_DOCX",
  "COMPLIANCE_XLSX",
  "EVIDENCE_MANIFEST",
  "SUBMISSION_CHECKLIST",
  "PACKAGE_ZIP",
]);
export const tenderMilestoneKindEnum = pgEnum("tender_milestone_kind", [
  "REVIEW",
  "APPROVAL",
  "PACKAGE",
  "SUBMISSION",
]);
export const tenderMilestoneStatusEnum = pgEnum("tender_milestone_status", [
  "PENDING",
  "COMPLETE",
  "OVERDUE",
  "CANCELLED",
]);

const ownership = {
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  tenderId: uuid("tender_id").notNull().references(() => tenders.id, { onDelete: "cascade" }),
};

export const tenderRequirementExtractionRuns = pgTable("tender_requirement_extraction_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  ...ownership,
  tenderDocumentId: uuid("tender_document_id").notNull().references(() => tenderDocuments.id, { onDelete: "cascade" }),
  documentExtractionId: uuid("document_extraction_id").notNull().references(() => tenderDocumentExtractions.id, { onDelete: "cascade" }),
  extractor: text("extractor").notNull(),
  inputHash: text("input_hash").notNull(),
  status: tenderAutomationStatusEnum("status").notNull().default("QUEUED"),
  candidateCount: integer("candidate_count").notNull().default(0),
  failureReason: text("failure_reason"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("tender_req_extract_document_hash_uq").on(t.tenderDocumentId, t.inputHash),
  index("tender_req_extract_tender_idx").on(t.tenderId, t.createdAt),
]);

export const tenderRequirementCandidates = pgTable("tender_requirement_candidates", {
  id: uuid("id").primaryKey().defaultRandom(),
  ...ownership,
  extractionRunId: uuid("extraction_run_id").notNull().references(() => tenderRequirementExtractionRuns.id, { onDelete: "cascade" }),
  contentId: uuid("content_id").references(() => tenderDocumentContent.id, { onDelete: "set null" }),
  candidateKey: text("candidate_key").notNull(),
  candidateType: text("candidate_type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  sourceExcerpt: text("source_excerpt").notNull(),
  contentHash: text("content_hash").notNull(),
  confidence: text("confidence").notNull().default("0"),
  mandatory: boolean("mandatory").notNull().default(false),
  status: tenderRequirementCandidateStatusEnum("status").notNull().default("PENDING"),
  acceptedRequirementId: uuid("accepted_requirement_id").references(() => tenderRequirements.id, { onDelete: "set null" }),
  acceptedQuestionId: uuid("accepted_question_id").references(() => tenderQuestions.id, { onDelete: "set null" }),
  decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("tender_req_candidates_run_key_uq").on(t.extractionRunId, t.candidateKey),
  index("tender_req_candidates_tender_status_idx").on(t.tenderId, t.status),
]);

export const tenderAutomationRuns = pgTable("tender_automation_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  ...ownership,
  status: tenderAutomationStatusEnum("status").notNull().default("QUEUED"),
  requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
  idempotencyKey: text("idempotency_key").notNull(),
  leaseOwner: uuid("lease_owner"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  configuration: jsonb("configuration").$type<Record<string, unknown>>().notNull().default({}),
  summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default({}),
  failureReason: text("failure_reason"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("tender_automation_runs_tender_key_uq").on(t.tenderId, t.idempotencyKey),
  uniqueIndex("tender_automation_runs_active_uq").on(t.tenderId).where(sql`${t.status} IN ('QUEUED', 'RUNNING')`),
  index("tender_automation_runs_tender_created_idx").on(t.tenderId, t.createdAt),
  index("tender_automation_runs_claim_idx").on(t.status, t.leaseExpiresAt, t.createdAt),
]);

export const tenderAutomationSteps = pgTable("tender_automation_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  ...ownership,
  runId: uuid("run_id").notNull().references(() => tenderAutomationRuns.id, { onDelete: "cascade" }),
  kind: tenderAutomationStepKindEnum("kind").notNull(),
  sequence: integer("sequence").notNull(),
  status: tenderAutomationStatusEnum("status").notNull().default("QUEUED"),
  attempt: integer("attempt").notNull().default(0),
  result: jsonb("result").$type<Record<string, unknown>>().notNull().default({}),
  failureReason: text("failure_reason"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("tender_automation_steps_run_kind_uq").on(t.runId, t.kind),
  index("tender_automation_steps_run_sequence_idx").on(t.runId, t.sequence),
]);

export const tenderAutomationItems = pgTable("tender_automation_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  ...ownership,
  runId: uuid("run_id").notNull().references(() => tenderAutomationRuns.id, { onDelete: "cascade" }),
  stepId: uuid("step_id").notNull().references(() => tenderAutomationSteps.id, { onDelete: "cascade" }),
  requirementId: uuid("requirement_id").references(() => tenderRequirements.id, { onDelete: "cascade" }),
  answerId: uuid("answer_id").references(() => tenderAnswers.id, { onDelete: "set null" }),
  itemKey: text("item_key").notNull(),
  status: tenderAutomationStatusEnum("status").notNull().default("QUEUED"),
  result: jsonb("result").$type<Record<string, unknown>>().notNull().default({}),
  failureReason: text("failure_reason"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("tender_automation_items_run_key_uq").on(t.runId, t.itemKey),
  index("tender_automation_items_step_status_idx").on(t.stepId, t.status),
]);

export const tenderSubmissionPackages = pgTable("tender_submission_packages", {
  id: uuid("id").primaryKey().defaultRandom(),
  ...ownership,
  version: integer("version").notNull(),
  status: tenderPackageStatusEnum("status").notNull().default("GENERATING"),
  contentDigest: text("content_digest").notNull(),
  generatorVersion: text("generator_version").notNull(),
  validationRunId: uuid("validation_run_id").references(() => tenderValidationRuns.id, { onDelete: "set null" }),
  validationSnapshot: jsonb("validation_snapshot").$type<Record<string, unknown>>().notNull().default({}),
  failureReason: text("failure_reason"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("tender_submission_packages_version_uq").on(t.tenderId, t.version),
  uniqueIndex("tender_submission_packages_digest_uq").on(t.tenderId, t.contentDigest),
  index("tender_submission_packages_tender_created_idx").on(t.tenderId, t.createdAt),
]);

export const tenderSubmissionArtifacts = pgTable("tender_submission_artifacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  ...ownership,
  packageId: uuid("package_id").notNull().references(() => tenderSubmissionPackages.id, { onDelete: "cascade" }),
  fileId: uuid("file_id").notNull().references(() => files.id, { onDelete: "restrict" }),
  kind: tenderPackageArtifactKindEnum("kind").notNull(),
  checksumSha256: text("checksum_sha256").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("tender_submission_artifacts_package_kind_uq").on(t.packageId, t.kind),
]);

export const tenderPackageApprovals = pgTable("tender_package_approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  ...ownership,
  packageId: uuid("package_id").notNull().references(() => tenderSubmissionPackages.id, { onDelete: "restrict" }),
  approvedBy: uuid("approved_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  decision: text("decision").notNull().default("APPROVED"),
  comment: text("comment").notNull().default(""),
  validationSnapshot: jsonb("validation_snapshot").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("tender_package_approvals_package_uq").on(t.packageId)]);

export const tenderMilestones = pgTable("tender_milestones", {
  id: uuid("id").primaryKey().defaultRandom(),
  ...ownership,
  kind: tenderMilestoneKindEnum("kind").notNull(),
  offsetDays: integer("offset_days").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  status: tenderMilestoneStatusEnum("status").notNull().default("PENDING"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("tender_milestones_tender_kind_uq").on(t.tenderId, t.kind),
  index("tender_milestones_due_status_idx").on(t.dueAt, t.status),
]);

export const tenderSubmissions = pgTable("tender_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  ...ownership,
  packageId: uuid("package_id").notNull().references(() => tenderSubmissionPackages.id, { onDelete: "restrict" }),
  portal: text("portal").notNull(),
  portalReference: text("portal_reference").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
  submittedBy: uuid("submitted_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  notes: text("notes").notNull().default(""),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("tender_submissions_tender_reference_uq").on(t.tenderId, t.portalReference),
  index("tender_submissions_tender_created_idx").on(t.tenderId, t.createdAt),
]);

export const tenderSubmissionReceipts = pgTable("tender_submission_receipts", {
  submissionId: uuid("submission_id").notNull().references(() => tenderSubmissions.id, { onDelete: "cascade" }),
  fileId: uuid("file_id").notNull().references(() => files.id, { onDelete: "restrict" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("tender_submission_receipts_submission_file_uq").on(t.submissionId, t.fileId)]);
