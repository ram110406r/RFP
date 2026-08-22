CREATE TYPE "public"."rfp_lifecycle_status" AS ENUM('DRAFT', 'INTAKE', 'PARSING', 'ANALYZING', 'QUALIFICATION', 'RESPONSE', 'REVIEW', 'VALIDATION', 'READY_FOR_SUBMISSION', 'SUBMITTED', 'OUTCOME_RECORDED', 'CLOSED', 'PARSING_FAILED', 'ANALYSIS_FAILED', 'VALIDATION_FAILED');--> statement-breakpoint
CREATE TYPE "public"."rfp_team_role" AS ENUM('OWNER', 'CONTRIBUTOR', 'REVIEWER', 'SME');--> statement-breakpoint
CREATE TABLE "rfp_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"rfp_id" uuid NOT NULL,
	"from_status" "rfp_lifecycle_status",
	"to_status" "rfp_lifecycle_status" NOT NULL,
	"actor_id" uuid,
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfp_team_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"rfp_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "rfp_team_role" DEFAULT 'CONTRIBUTOR' NOT NULL,
	"assigned_by" uuid,
	"unassigned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rfps" ADD COLUMN "lifecycle_status" "rfp_lifecycle_status" DEFAULT 'DRAFT' NOT NULL;--> statement-breakpoint
ALTER TABLE "rfps" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rfp_status_history" ADD CONSTRAINT "rfp_status_history_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_status_history" ADD CONSTRAINT "rfp_status_history_rfp_id_rfps_id_fk" FOREIGN KEY ("rfp_id") REFERENCES "public"."rfps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_status_history" ADD CONSTRAINT "rfp_status_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_team_assignments" ADD CONSTRAINT "rfp_team_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_team_assignments" ADD CONSTRAINT "rfp_team_assignments_rfp_id_rfps_id_fk" FOREIGN KEY ("rfp_id") REFERENCES "public"."rfps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_team_assignments" ADD CONSTRAINT "rfp_team_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_team_assignments" ADD CONSTRAINT "rfp_team_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rfp_status_history_rfp_idx" ON "rfp_status_history" USING btree ("rfp_id");--> statement-breakpoint
CREATE INDEX "rfp_status_history_org_idx" ON "rfp_status_history" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "rfp_status_history_rfp_created_idx" ON "rfp_status_history" USING btree ("rfp_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rfp_team_assignments_rfp_user_role_uq" ON "rfp_team_assignments" USING btree ("rfp_id","user_id","role");--> statement-breakpoint
CREATE INDEX "rfp_team_assignments_org_idx" ON "rfp_team_assignments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "rfp_team_assignments_rfp_idx" ON "rfp_team_assignments" USING btree ("rfp_id");--> statement-breakpoint
CREATE INDEX "rfp_team_assignments_user_idx" ON "rfp_team_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rfps_org_lifecycle_idx" ON "rfps" USING btree ("organization_id","lifecycle_status");--> statement-breakpoint
CREATE INDEX "rfps_org_owner_idx" ON "rfps" USING btree ("organization_id","owner_id");--> statement-breakpoint
CREATE INDEX "rfps_org_deadline_idx" ON "rfps" USING btree ("organization_id","deadline");--> statement-breakpoint
CREATE INDEX "rfps_org_created_idx" ON "rfps" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "rfps_org_archived_idx" ON "rfps" USING btree ("organization_id","archived_at");--> statement-breakpoint
-- Backfill (hand-added; drizzle-kit generates DDL only).
--
-- lifecycle_status defaults to DRAFT, which would misrepresent every existing
-- RFP as unstarted. Derive an honest starting position from the prototype's
-- display status instead. "needs_attention" has no lifecycle equivalent — it
-- is a flag, not a stage — so it maps to RESPONSE, the stage it is raised in.
UPDATE "rfps" SET "lifecycle_status" = (CASE "status"
    WHEN 'draft'            THEN 'DRAFT'
    WHEN 'analyzing'        THEN 'ANALYZING'
    WHEN 'in_progress'      THEN 'RESPONSE'
    WHEN 'review'           THEN 'REVIEW'
    WHEN 'needs_attention'  THEN 'RESPONSE'
    WHEN 'submitted'        THEN 'SUBMITTED'
    WHEN 'won'              THEN 'OUTCOME_RECORDED'
    WHEN 'lost'             THEN 'OUTCOME_RECORDED'
    ELSE 'DRAFT'
  END)::"public"."rfp_lifecycle_status";
--> statement-breakpoint
-- Seed history so every RFP has a traceable origin rather than appearing to
-- have materialised at its current stage. actor_id is null: nobody performed
-- this transition, the migration derived it.
INSERT INTO "rfp_status_history" ("organization_id", "rfp_id", "from_status", "to_status", "actor_id", "reason", "created_at")
SELECT r."organization_id", r."id", NULL, r."lifecycle_status", NULL,
       'Backfilled from prototype status during the Phase 5 migration.', r."created_at"
FROM "rfps" r;
