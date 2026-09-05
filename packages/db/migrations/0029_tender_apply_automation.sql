CREATE TYPE "tender_requirement_candidate_status" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED');--> statement-breakpoint
CREATE TYPE "tender_automation_status" AS ENUM ('QUEUED', 'RUNNING', 'WAITING_FOR_INPUT', 'BLOCKED', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "tender_automation_step_kind" AS ENUM ('REQUIREMENT_EXTRACTION', 'ANALYSIS', 'EVIDENCE_RETRIEVAL', 'ANSWER_GENERATION', 'VALIDATION', 'PACKAGE_GENERATION', 'REMINDER_RECONCILIATION');--> statement-breakpoint
CREATE TYPE "tender_package_status" AS ENUM ('GENERATING', 'READY', 'FAILED', 'STALE', 'APPROVED');--> statement-breakpoint
CREATE TYPE "tender_package_artifact_kind" AS ENUM ('NARRATIVE_DOCX', 'COMPLIANCE_XLSX', 'EVIDENCE_MANIFEST', 'SUBMISSION_CHECKLIST', 'PACKAGE_ZIP');--> statement-breakpoint
CREATE TYPE "tender_milestone_kind" AS ENUM ('REVIEW', 'APPROVAL', 'PACKAGE', 'SUBMISSION');--> statement-breakpoint
CREATE TYPE "tender_milestone_status" AS ENUM ('PENDING', 'COMPLETE', 'OVERDUE', 'CANCELLED');--> statement-breakpoint

CREATE TABLE "tender_requirement_extraction_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade, "tender_id" uuid NOT NULL REFERENCES "tenders"("id") ON DELETE cascade,
  "tender_document_id" uuid NOT NULL REFERENCES "tender_documents"("id") ON DELETE cascade,
  "document_extraction_id" uuid NOT NULL REFERENCES "tender_document_extractions"("id") ON DELETE cascade,
  "extractor" text NOT NULL, "input_hash" text NOT NULL, "status" "tender_automation_status" NOT NULL DEFAULT 'QUEUED',
  "candidate_count" integer NOT NULL DEFAULT 0, "failure_reason" text, "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "started_at" timestamptz, "completed_at" timestamptz, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "tender_req_extract_document_hash_uq" ON "tender_requirement_extraction_runs" ("tender_document_id", "input_hash");--> statement-breakpoint
CREATE INDEX "tender_req_extract_tender_idx" ON "tender_requirement_extraction_runs" ("tender_id", "created_at");--> statement-breakpoint

CREATE TABLE "tender_requirement_candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade, "tender_id" uuid NOT NULL REFERENCES "tenders"("id") ON DELETE cascade,
  "extraction_run_id" uuid NOT NULL REFERENCES "tender_requirement_extraction_runs"("id") ON DELETE cascade,
  "content_id" uuid REFERENCES "tender_document_content"("id") ON DELETE set null, "candidate_key" text NOT NULL, "candidate_type" text NOT NULL,
  "title" text NOT NULL, "description" text NOT NULL, "source_excerpt" text NOT NULL, "content_hash" text NOT NULL,
  "confidence" text NOT NULL DEFAULT '0', "mandatory" boolean NOT NULL DEFAULT false,
  "status" "tender_requirement_candidate_status" NOT NULL DEFAULT 'PENDING',
  "accepted_requirement_id" uuid REFERENCES "tender_requirements"("id") ON DELETE set null,
  "accepted_question_id" uuid REFERENCES "tender_questions"("id") ON DELETE set null,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE set null, "decided_at" timestamptz,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "tender_req_candidates_run_key_uq" ON "tender_requirement_candidates" ("extraction_run_id", "candidate_key");--> statement-breakpoint
CREATE INDEX "tender_req_candidates_tender_status_idx" ON "tender_requirement_candidates" ("tender_id", "status");--> statement-breakpoint

CREATE TABLE "tender_automation_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade, "tender_id" uuid NOT NULL REFERENCES "tenders"("id") ON DELETE cascade,
  "status" "tender_automation_status" NOT NULL DEFAULT 'QUEUED', "requested_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "idempotency_key" text NOT NULL, "configuration" jsonb NOT NULL DEFAULT '{}'::jsonb, "summary" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "failure_reason" text, "started_at" timestamptz, "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "tender_automation_runs_tender_key_uq" ON "tender_automation_runs" ("tender_id", "idempotency_key");--> statement-breakpoint
CREATE INDEX "tender_automation_runs_tender_created_idx" ON "tender_automation_runs" ("tender_id", "created_at");--> statement-breakpoint

CREATE TABLE "tender_automation_steps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade, "tender_id" uuid NOT NULL REFERENCES "tenders"("id") ON DELETE cascade,
  "run_id" uuid NOT NULL REFERENCES "tender_automation_runs"("id") ON DELETE cascade, "kind" "tender_automation_step_kind" NOT NULL,
  "sequence" integer NOT NULL, "status" "tender_automation_status" NOT NULL DEFAULT 'QUEUED', "attempt" integer NOT NULL DEFAULT 0,
  "result" jsonb NOT NULL DEFAULT '{}'::jsonb, "failure_reason" text, "started_at" timestamptz, "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "tender_automation_steps_run_kind_uq" ON "tender_automation_steps" ("run_id", "kind");--> statement-breakpoint
CREATE INDEX "tender_automation_steps_run_sequence_idx" ON "tender_automation_steps" ("run_id", "sequence");--> statement-breakpoint

CREATE TABLE "tender_automation_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade, "tender_id" uuid NOT NULL REFERENCES "tenders"("id") ON DELETE cascade,
  "run_id" uuid NOT NULL REFERENCES "tender_automation_runs"("id") ON DELETE cascade,
  "step_id" uuid NOT NULL REFERENCES "tender_automation_steps"("id") ON DELETE cascade,
  "requirement_id" uuid REFERENCES "tender_requirements"("id") ON DELETE cascade, "answer_id" uuid REFERENCES "tender_answers"("id") ON DELETE set null,
  "item_key" text NOT NULL, "status" "tender_automation_status" NOT NULL DEFAULT 'QUEUED', "result" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "failure_reason" text, "started_at" timestamptz, "completed_at" timestamptz
);--> statement-breakpoint
CREATE UNIQUE INDEX "tender_automation_items_run_key_uq" ON "tender_automation_items" ("run_id", "item_key");--> statement-breakpoint
CREATE INDEX "tender_automation_items_step_status_idx" ON "tender_automation_items" ("step_id", "status");--> statement-breakpoint

CREATE TABLE "tender_submission_packages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade, "tender_id" uuid NOT NULL REFERENCES "tenders"("id") ON DELETE cascade,
  "version" integer NOT NULL, "status" "tender_package_status" NOT NULL DEFAULT 'GENERATING', "content_digest" text NOT NULL,
  "generator_version" text NOT NULL, "validation_run_id" uuid REFERENCES "tender_validation_runs"("id") ON DELETE set null,
  "validation_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb, "failure_reason" text, "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamptz NOT NULL DEFAULT now(), "completed_at" timestamptz
);--> statement-breakpoint
CREATE UNIQUE INDEX "tender_submission_packages_version_uq" ON "tender_submission_packages" ("tender_id", "version");--> statement-breakpoint
CREATE UNIQUE INDEX "tender_submission_packages_digest_uq" ON "tender_submission_packages" ("tender_id", "content_digest");--> statement-breakpoint
CREATE INDEX "tender_submission_packages_tender_created_idx" ON "tender_submission_packages" ("tender_id", "created_at");--> statement-breakpoint

CREATE TABLE "tender_submission_artifacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade, "tender_id" uuid NOT NULL REFERENCES "tenders"("id") ON DELETE cascade,
  "package_id" uuid NOT NULL REFERENCES "tender_submission_packages"("id") ON DELETE cascade, "file_id" uuid NOT NULL REFERENCES "files"("id") ON DELETE restrict,
  "kind" "tender_package_artifact_kind" NOT NULL, "checksum_sha256" text NOT NULL, "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "tender_submission_artifacts_package_kind_uq" ON "tender_submission_artifacts" ("package_id", "kind");--> statement-breakpoint

CREATE TABLE "tender_package_approvals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade, "tender_id" uuid NOT NULL REFERENCES "tenders"("id") ON DELETE cascade,
  "package_id" uuid NOT NULL REFERENCES "tender_submission_packages"("id") ON DELETE restrict,
  "approved_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict, "decision" text NOT NULL DEFAULT 'APPROVED', "comment" text NOT NULL DEFAULT '',
  "validation_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb, "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "tender_package_approvals_package_uq" ON "tender_package_approvals" ("package_id");--> statement-breakpoint

CREATE TABLE "tender_milestones" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade, "tender_id" uuid NOT NULL REFERENCES "tenders"("id") ON DELETE cascade,
  "kind" "tender_milestone_kind" NOT NULL, "offset_days" integer NOT NULL, "due_at" timestamptz NOT NULL,
  "status" "tender_milestone_status" NOT NULL DEFAULT 'PENDING', "completed_at" timestamptz, "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "tender_milestones_tender_kind_uq" ON "tender_milestones" ("tender_id", "kind");--> statement-breakpoint
CREATE INDEX "tender_milestones_due_status_idx" ON "tender_milestones" ("due_at", "status");--> statement-breakpoint

CREATE TABLE "tender_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade, "tender_id" uuid NOT NULL REFERENCES "tenders"("id") ON DELETE cascade,
  "package_id" uuid NOT NULL REFERENCES "tender_submission_packages"("id") ON DELETE restrict, "portal" text NOT NULL,
  "portal_reference" text NOT NULL, "submitted_at" timestamptz NOT NULL, "submitted_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "notes" text NOT NULL DEFAULT '', "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb, "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "tender_submissions_tender_reference_uq" ON "tender_submissions" ("tender_id", "portal_reference");--> statement-breakpoint
CREATE INDEX "tender_submissions_tender_created_idx" ON "tender_submissions" ("tender_id", "created_at");--> statement-breakpoint

CREATE TABLE "tender_submission_receipts" (
  "submission_id" uuid NOT NULL REFERENCES "tender_submissions"("id") ON DELETE cascade,
  "file_id" uuid NOT NULL REFERENCES "files"("id") ON DELETE restrict,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "tender_submission_receipts_submission_file_uq" ON "tender_submission_receipts" ("submission_id", "file_id");
