CREATE TYPE "public"."activity_kind" AS ENUM('assigned', 'approved', 'evidence', 'comment', 'risk', 'submission', 'generated', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."answer_source" AS ENUM('ai_draft', 'human_edited', 'reused');--> statement-breakpoint
CREATE TYPE "public"."assignment_status" AS ENUM('pending', 'in_review', 'approved', 'rejected', 'changes_requested');--> statement-breakpoint
CREATE TYPE "public"."authority" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('queued', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('PDF', 'DOCX', 'XLSX', 'PPTX', 'ZIP', 'HTML');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('Admin', 'Proposal Manager', 'Contributor', 'Reviewer', 'Viewer');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('active', 'invited', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."notification_category" AS ENUM('Reviews', 'Assignments', 'Risks', 'Deadlines', 'Knowledge', 'Submissions');--> statement-breakpoint
CREATE TYPE "public"."notification_severity" AS ENUM('info', 'warning', 'danger');--> statement-breakpoint
CREATE TYPE "public"."outcome" AS ENUM('won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."requirement_category" AS ENUM('Security', 'Commercial', 'Compliance', 'Product', 'Legal', 'Architecture', 'Support');--> statement-breakpoint
CREATE TYPE "public"."requirement_status" AS ENUM('unanswered', 'drafted', 'needs_review', 'changes_requested', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."review_action" AS ENUM('APPROVED', 'REJECTED', 'REQUEST_CHANGES', 'COMMENT', 'ASSIGNED');--> statement-breakpoint
CREATE TYPE "public"."rfp_status" AS ENUM('draft', 'analyzing', 'in_progress', 'review', 'needs_attention', 'submitted', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"rfp_id" uuid,
	"actor_id" uuid,
	"actor_label" text DEFAULT 'System' NOT NULL,
	"kind" "activity_kind" NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"label" text NOT NULL,
	"prefix" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"previous_value" jsonb,
	"new_value" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"industry" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"connected" boolean DEFAULT false NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"last_synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "knowledge_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"label" text NOT NULL,
	"value" text NOT NULL,
	"confidence" numeric(4, 3) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_conflict_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conflict_id" uuid NOT NULL,
	"label" text NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"recommended" text DEFAULT '' NOT NULL,
	"action" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"category" "requirement_category" NOT NULL,
	"version" text DEFAULT '1.0' NOT NULL,
	"authority" "authority" DEFAULT 'medium' NOT NULL,
	"owner_id" uuid,
	"last_verified" date,
	"last_updated" date,
	"expires_at" date,
	"summary" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"version" text NOT NULL,
	"date" date NOT NULL,
	"note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"transport" text NOT NULL,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"tools_exposed" integer DEFAULT 0 NOT NULL,
	"description" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"category" text NOT NULL,
	"label" text NOT NULL,
	"email" boolean DEFAULT true NOT NULL,
	"in_app" boolean DEFAULT true NOT NULL,
	"digest" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"category" "notification_category" NOT NULL,
	"title" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"severity" "notification_severity" DEFAULT 'info' NOT NULL,
	"related_entity_type" text,
	"related_entity_id" uuid,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"plan" text DEFAULT 'Starter' NOT NULL,
	"seats" integer DEFAULT 10 NOT NULL,
	"industry" text,
	"logo_initials" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"customer_id" uuid,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfp_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requirement_id" uuid NOT NULL,
	"answer" text DEFAULT '' NOT NULL,
	"confidence" numeric(4, 3) DEFAULT '0' NOT NULL,
	"generated_by" "answer_source" DEFAULT 'ai_draft' NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfp_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requirement_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'reviewer' NOT NULL,
	"deadline" date,
	"status" "assignment_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfp_collaborators" (
	"rfp_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "rfp_collaborators_rfp_id_user_id_pk" PRIMARY KEY("rfp_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "rfp_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfp_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"type" "document_type" NOT NULL,
	"size_mb" numeric(10, 2) DEFAULT '0' NOT NULL,
	"status" "document_status" DEFAULT 'queued' NOT NULL,
	"storage_key" text,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfp_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"answer_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"source_version" text,
	"title" text NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"relevance" numeric(4, 3) DEFAULT '0' NOT NULL,
	"verified_at" date,
	"verified_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfp_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfp_id" uuid NOT NULL,
	"outcome" "outcome" NOT NULL,
	"value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"closed_at" date NOT NULL,
	"reason" text,
	CONSTRAINT "rfp_outcomes_rfp_id_unique" UNIQUE("rfp_id")
);
--> statement-breakpoint
CREATE TABLE "rfp_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfp_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"question" text NOT NULL,
	"category" "requirement_category" NOT NULL,
	"mandatory" boolean DEFAULT false NOT NULL,
	"risk" "risk_level" DEFAULT 'low' NOT NULL,
	"risk_rationale" text DEFAULT '' NOT NULL,
	"owner_team" text DEFAULT '' NOT NULL,
	"status" "requirement_status" DEFAULT 'unanswered' NOT NULL,
	"reviewer_id" uuid,
	"source_location" text,
	"due_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfp_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requirement_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"action" "review_action" NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfp_risks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requirement_id" uuid NOT NULL,
	"level" "risk_level" NOT NULL,
	"rationale" text DEFAULT '' NOT NULL,
	"set_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfp_submission_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"label" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"ready" boolean DEFAULT false NOT NULL,
	"storage_key" text
);
--> statement-breakpoint
CREATE TABLE "rfp_submission_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"label" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfp_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfp_id" uuid NOT NULL,
	"label" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"project_id" uuid,
	"title" text NOT NULL,
	"opportunity" text DEFAULT '' NOT NULL,
	"owner_id" uuid NOT NULL,
	"deadline" date NOT NULL,
	"estimated_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" "rfp_status" DEFAULT 'draft' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"evidence_coverage" integer DEFAULT 0 NOT NULL,
	"readiness" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"role_id" uuid,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"job_title" text DEFAULT '' NOT NULL,
	"team" text DEFAULT '' NOT NULL,
	"member_role" "member_role" DEFAULT 'Contributor' NOT NULL,
	"status" "member_status" DEFAULT 'active' NOT NULL,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_rfp_id_rfps_id_fk" FOREIGN KEY ("rfp_id") REFERENCES "public"."rfps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_claims" ADD CONSTRAINT "knowledge_claims_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_conflict_variants" ADD CONSTRAINT "knowledge_conflict_variants_conflict_id_knowledge_conflicts_id_fk" FOREIGN KEY ("conflict_id") REFERENCES "public"."knowledge_conflicts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_conflicts" ADD CONSTRAINT "knowledge_conflicts_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_connections" ADD CONSTRAINT "mcp_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_answers" ADD CONSTRAINT "rfp_answers_requirement_id_rfp_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."rfp_requirements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_answers" ADD CONSTRAINT "rfp_answers_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_assignments" ADD CONSTRAINT "rfp_assignments_requirement_id_rfp_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."rfp_requirements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_assignments" ADD CONSTRAINT "rfp_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_collaborators" ADD CONSTRAINT "rfp_collaborators_rfp_id_rfps_id_fk" FOREIGN KEY ("rfp_id") REFERENCES "public"."rfps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_collaborators" ADD CONSTRAINT "rfp_collaborators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_documents" ADD CONSTRAINT "rfp_documents_rfp_id_rfps_id_fk" FOREIGN KEY ("rfp_id") REFERENCES "public"."rfps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_documents" ADD CONSTRAINT "rfp_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_evidence" ADD CONSTRAINT "rfp_evidence_answer_id_rfp_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."rfp_answers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_evidence" ADD CONSTRAINT "rfp_evidence_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_evidence" ADD CONSTRAINT "rfp_evidence_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_outcomes" ADD CONSTRAINT "rfp_outcomes_rfp_id_rfps_id_fk" FOREIGN KEY ("rfp_id") REFERENCES "public"."rfps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_requirements" ADD CONSTRAINT "rfp_requirements_rfp_id_rfps_id_fk" FOREIGN KEY ("rfp_id") REFERENCES "public"."rfps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_requirements" ADD CONSTRAINT "rfp_requirements_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_reviews" ADD CONSTRAINT "rfp_reviews_requirement_id_rfp_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."rfp_requirements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_reviews" ADD CONSTRAINT "rfp_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_risks" ADD CONSTRAINT "rfp_risks_requirement_id_rfp_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."rfp_requirements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_risks" ADD CONSTRAINT "rfp_risks_set_by_users_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_submission_artifacts" ADD CONSTRAINT "rfp_submission_artifacts_submission_id_rfp_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."rfp_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_submission_checklist_items" ADD CONSTRAINT "rfp_submission_checklist_items_submission_id_rfp_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."rfp_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_submissions" ADD CONSTRAINT "rfp_submissions_rfp_id_rfps_id_fk" FOREIGN KEY ("rfp_id") REFERENCES "public"."rfps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_submissions" ADD CONSTRAINT "rfp_submissions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfps" ADD CONSTRAINT "rfps_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfps" ADD CONSTRAINT "rfps_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfps" ADD CONSTRAINT "rfps_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfps" ADD CONSTRAINT "rfps_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_org_idx" ON "activities" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "activities_rfp_idx" ON "activities" USING btree ("rfp_id");--> statement-breakpoint
CREATE INDEX "api_keys_org_idx" ON "api_keys" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "audit_logs_org_idx" ON "audit_logs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "customers_org_idx" ON "customers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "integrations_org_idx" ON "integrations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "knowledge_claims_source_idx" ON "knowledge_claims" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "knowledge_conflict_variants_conflict_idx" ON "knowledge_conflict_variants" USING btree ("conflict_id");--> statement-breakpoint
CREATE INDEX "knowledge_conflicts_source_idx" ON "knowledge_conflicts" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "knowledge_sources_org_idx" ON "knowledge_sources" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "knowledge_versions_source_idx" ON "knowledge_versions" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "mcp_connections_org_idx" ON "mcp_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "notification_preferences_org_idx" ON "notification_preferences" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","read");--> statement-breakpoint
CREATE INDEX "projects_org_idx" ON "projects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "rfp_answers_requirement_idx" ON "rfp_answers" USING btree ("requirement_id");--> statement-breakpoint
CREATE INDEX "rfp_answers_current_idx" ON "rfp_answers" USING btree ("requirement_id","is_current");--> statement-breakpoint
CREATE INDEX "rfp_assignments_requirement_idx" ON "rfp_assignments" USING btree ("requirement_id");--> statement-breakpoint
CREATE INDEX "rfp_assignments_user_idx" ON "rfp_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rfp_documents_rfp_idx" ON "rfp_documents" USING btree ("rfp_id");--> statement-breakpoint
CREATE INDEX "rfp_evidence_answer_idx" ON "rfp_evidence" USING btree ("answer_id");--> statement-breakpoint
CREATE INDEX "rfp_requirements_rfp_idx" ON "rfp_requirements" USING btree ("rfp_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rfp_requirements_rfp_code_uq" ON "rfp_requirements" USING btree ("rfp_id","code");--> statement-breakpoint
CREATE INDEX "rfp_requirements_risk_idx" ON "rfp_requirements" USING btree ("risk");--> statement-breakpoint
CREATE INDEX "rfp_requirements_status_idx" ON "rfp_requirements" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rfp_reviews_requirement_idx" ON "rfp_reviews" USING btree ("requirement_id");--> statement-breakpoint
CREATE INDEX "rfp_risks_requirement_idx" ON "rfp_risks" USING btree ("requirement_id");--> statement-breakpoint
CREATE INDEX "rfp_submission_artifacts_submission_idx" ON "rfp_submission_artifacts" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "rfp_submission_checklist_submission_idx" ON "rfp_submission_checklist_items" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "rfp_submissions_rfp_idx" ON "rfp_submissions" USING btree ("rfp_id");--> statement-breakpoint
CREATE INDEX "rfps_org_idx" ON "rfps" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "rfps_org_status_idx" ON "rfps" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_org_name_uq" ON "roles" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "users_org_email_uq" ON "users" USING btree ("organization_id","email");--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("organization_id");