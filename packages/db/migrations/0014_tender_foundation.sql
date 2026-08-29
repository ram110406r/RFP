CREATE TYPE "tender_type" AS ENUM ('DOCUMENT', 'ONLINE');--> statement-breakpoint
CREATE TYPE "tender_source_type" AS ENUM ('DOCUMENT_UPLOAD', 'EMAIL_IMPORT', 'PORTAL', 'MANUAL');--> statement-breakpoint
CREATE TYPE "tender_status" AS ENUM ('DRAFT', 'INTAKE', 'PROCESSING', 'READY', 'IN_PROGRESS', 'REVIEW', 'APPROVED', 'SUBMITTED', 'CLOSED', 'CANCELLED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "tender_question_status" AS ENUM ('UNASSIGNED', 'ASSIGNED', 'IN_PROGRESS', 'ANSWERED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'NOT_APPLICABLE');--> statement-breakpoint
CREATE TYPE "tender_question_type" AS ENUM ('TEXT', 'LONG_TEXT', 'YES_NO', 'SINGLE_SELECT', 'MULTI_SELECT', 'NUMBER', 'DATE', 'FILE', 'TABLE');--> statement-breakpoint
CREATE TYPE "tender_requirement_type" AS ENUM ('COMPLIANCE', 'TECHNICAL', 'LEGAL', 'COMMERCIAL', 'SECURITY', 'DOCUMENTATION', 'GENERAL');--> statement-breakpoint
CREATE TYPE "tender_requirement_status" AS ENUM ('UNASSIGNED', 'ASSIGNED', 'IN_PROGRESS', 'ANSWERED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'NOT_APPLICABLE');--> statement-breakpoint
CREATE TYPE "tender_answer_status" AS ENUM ('DRAFT', 'GENERATED', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'FINAL');--> statement-breakpoint
CREATE TYPE "tender_answer_source" AS ENUM ('MANUAL', 'IMPORTED', 'AI_GENERATED');--> statement-breakpoint
CREATE TYPE "tender_review_status" AS ENUM ('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "tender_document_role" AS ENUM ('SOURCE_TENDER', 'ATTACHMENT', 'RESPONSE_DOCUMENT');--> statement-breakpoint

CREATE TABLE "tenders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "title" text NOT NULL,
  "reference_number" text,
  "description" text NOT NULL DEFAULT '',
  "tender_type" "tender_type" NOT NULL,
  "source_type" "tender_source_type" NOT NULL,
  "source_reference" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "source_url" text,
  "status" "tender_status" NOT NULL DEFAULT 'DRAFT',
  "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "received_at" timestamptz,
  "due_at" timestamptz,
  "timezone" text NOT NULL DEFAULT 'UTC',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "archived_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX "tenders_org_idx" ON "tenders" ("organization_id");--> statement-breakpoint
CREATE INDEX "tenders_workspace_idx" ON "tenders" ("workspace_id");--> statement-breakpoint
CREATE INDEX "tenders_org_status_idx" ON "tenders" ("organization_id", "status");--> statement-breakpoint
CREATE INDEX "tenders_org_type_idx" ON "tenders" ("organization_id", "tender_type");--> statement-breakpoint
CREATE INDEX "tenders_owner_idx" ON "tenders" ("owner_id");--> statement-breakpoint
CREATE INDEX "tenders_due_idx" ON "tenders" ("due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tenders_org_reference_uq" ON "tenders" ("organization_id", "reference_number");--> statement-breakpoint

CREATE TABLE "tender_status_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "tender_id" uuid NOT NULL REFERENCES "tenders"("id") ON DELETE cascade,
  "from_status" "tender_status",
  "to_status" "tender_status" NOT NULL,
  "actor_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "reason" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX "tender_status_history_org_idx" ON "tender_status_history" ("organization_id");--> statement-breakpoint
CREATE INDEX "tender_status_history_tender_idx" ON "tender_status_history" ("tender_id");--> statement-breakpoint
CREATE INDEX "tender_status_history_tender_created_idx" ON "tender_status_history" ("tender_id", "created_at");--> statement-breakpoint

CREATE TABLE "tender_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "tender_id" uuid NOT NULL REFERENCES "tenders"("id") ON DELETE cascade,
  "question_number" text,
  "section" text NOT NULL DEFAULT '',
  "question_text" text NOT NULL,
  "question_type" "tender_question_type" NOT NULL DEFAULT 'TEXT',
  "required" boolean NOT NULL DEFAULT false,
  "status" "tender_question_status" NOT NULL DEFAULT 'UNASSIGNED',
  "source_reference" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "sort_order" integer NOT NULL DEFAULT 0,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX "tender_questions_org_idx" ON "tender_questions" ("organization_id");--> statement-breakpoint
CREATE INDEX "tender_questions_workspace_idx" ON "tender_questions" ("workspace_id");--> statement-breakpoint
CREATE INDEX "tender_questions_tender_idx" ON "tender_questions" ("tender_id");--> statement-breakpoint
CREATE INDEX "tender_questions_status_idx" ON "tender_questions" ("status");--> statement-breakpoint
CREATE INDEX "tender_questions_sort_idx" ON "tender_questions" ("tender_id", "sort_order");--> statement-breakpoint

CREATE TABLE "tender_requirements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "tender_id" uuid NOT NULL REFERENCES "tenders"("id") ON DELETE cascade,
  "requirement_code" text,
  "title" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "requirement_type" "tender_requirement_type" NOT NULL DEFAULT 'GENERAL',
  "mandatory" boolean NOT NULL DEFAULT false,
  "status" "tender_requirement_status" NOT NULL DEFAULT 'UNASSIGNED',
  "source_reference" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX "tender_requirements_org_idx" ON "tender_requirements" ("organization_id");--> statement-breakpoint
CREATE INDEX "tender_requirements_workspace_idx" ON "tender_requirements" ("workspace_id");--> statement-breakpoint
CREATE INDEX "tender_requirements_tender_idx" ON "tender_requirements" ("tender_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tender_requirements_tender_code_uq" ON "tender_requirements" ("tender_id", "requirement_code");--> statement-breakpoint

CREATE TABLE "tender_question_requirements" (
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "question_id" uuid NOT NULL REFERENCES "tender_questions"("id") ON DELETE cascade,
  "requirement_id" uuid NOT NULL REFERENCES "tender_requirements"("id") ON DELETE cascade,
  PRIMARY KEY ("question_id", "requirement_id")
);--> statement-breakpoint
CREATE INDEX "tender_question_requirements_org_idx" ON "tender_question_requirements" ("organization_id");--> statement-breakpoint
CREATE INDEX "tender_question_requirements_workspace_idx" ON "tender_question_requirements" ("workspace_id");--> statement-breakpoint

CREATE TABLE "tender_answers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "tender_id" uuid NOT NULL REFERENCES "tenders"("id") ON DELETE cascade,
  "question_id" uuid NOT NULL REFERENCES "tender_questions"("id") ON DELETE cascade,
  "answer_text" text NOT NULL DEFAULT '',
  "status" "tender_answer_status" NOT NULL DEFAULT 'DRAFT',
  "source" "tender_answer_source" NOT NULL DEFAULT 'MANUAL',
  "confidence" numeric(4, 3) NOT NULL DEFAULT 0,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX "tender_answers_org_idx" ON "tender_answers" ("organization_id");--> statement-breakpoint
CREATE INDEX "tender_answers_workspace_idx" ON "tender_answers" ("workspace_id");--> statement-breakpoint
CREATE INDEX "tender_answers_tender_idx" ON "tender_answers" ("tender_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tender_answers_question_uq" ON "tender_answers" ("question_id");--> statement-breakpoint
CREATE INDEX "tender_answers_status_idx" ON "tender_answers" ("status");--> statement-breakpoint

CREATE TABLE "tender_answer_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "tender_id" uuid NOT NULL REFERENCES "tenders"("id") ON DELETE cascade,
  "answer_id" uuid NOT NULL REFERENCES "tender_answers"("id") ON DELETE cascade,
  "version_number" integer NOT NULL,
  "content" text NOT NULL DEFAULT '',
  "source" "tender_answer_source" NOT NULL DEFAULT 'MANUAL',
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX "tender_answer_versions_org_idx" ON "tender_answer_versions" ("organization_id");--> statement-breakpoint
CREATE INDEX "tender_answer_versions_workspace_idx" ON "tender_answer_versions" ("workspace_id");--> statement-breakpoint
CREATE INDEX "tender_answer_versions_tender_idx" ON "tender_answer_versions" ("tender_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tender_answer_versions_answer_version_uq" ON "tender_answer_versions" ("answer_id", "version_number");--> statement-breakpoint
CREATE INDEX "tender_answer_versions_answer_idx" ON "tender_answer_versions" ("answer_id");--> statement-breakpoint

CREATE TABLE "tender_answer_evidence" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "tender_id" uuid NOT NULL REFERENCES "tenders"("id") ON DELETE cascade,
  "answer_id" uuid NOT NULL REFERENCES "tender_answers"("id") ON DELETE cascade,
  "evidence_type" text NOT NULL,
  "evidence_id" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX "tender_answer_evidence_org_idx" ON "tender_answer_evidence" ("organization_id");--> statement-breakpoint
CREATE INDEX "tender_answer_evidence_answer_idx" ON "tender_answer_evidence" ("answer_id");--> statement-breakpoint

CREATE TABLE "tender_answer_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "tender_id" uuid NOT NULL REFERENCES "tenders"("id") ON DELETE cascade,
  "answer_id" uuid NOT NULL REFERENCES "tender_answers"("id") ON DELETE cascade,
  "reviewer_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "status" "tender_review_status" NOT NULL DEFAULT 'PENDING',
  "comment" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX "tender_answer_reviews_org_idx" ON "tender_answer_reviews" ("organization_id");--> statement-breakpoint
CREATE INDEX "tender_answer_reviews_answer_idx" ON "tender_answer_reviews" ("answer_id");--> statement-breakpoint
CREATE INDEX "tender_answer_reviews_reviewer_idx" ON "tender_answer_reviews" ("reviewer_id");--> statement-breakpoint

CREATE TABLE "tender_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "tender_id" uuid NOT NULL REFERENCES "tenders"("id") ON DELETE cascade,
  "document_id" uuid NOT NULL REFERENCES "files"("id") ON DELETE restrict,
  "document_role" "tender_document_role" NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX "tender_documents_org_idx" ON "tender_documents" ("organization_id");--> statement-breakpoint
CREATE INDEX "tender_documents_tender_idx" ON "tender_documents" ("tender_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tender_documents_tender_document_role_uq" ON "tender_documents" ("tender_id", "document_id", "document_role");--> statement-breakpoint
