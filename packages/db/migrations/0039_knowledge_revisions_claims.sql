-- Editing live knowledge no longer pulls it out of circulation: content
-- changes to an ACTIVE source are held as a pending revision while the
-- approved version keeps serving tenders. Versions gain a full snapshot so
-- history is real rather than a note.
--
-- Claims get a lifecycle of their own so AI-extracted claims can wait for
-- review (SUGGESTED) and removed claims are soft-deleted (REJECTED) — claim
-- ids are cited by tender answers and must never be recycled.
DO $$ BEGIN
 CREATE TYPE "public"."knowledge_revision_status" AS ENUM('PENDING', 'APPLIED', 'REJECTED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."knowledge_claim_status" AS ENUM('ACTIVE', 'SUGGESTED', 'REJECTED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_source_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"status" "knowledge_revision_status" DEFAULT 'PENDING' NOT NULL,
	"base_version" text NOT NULL,
	"changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"note" text,
	"created_by" uuid,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_source_revisions" ADD CONSTRAINT "knowledge_source_revisions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_source_revisions" ADD CONSTRAINT "knowledge_source_revisions_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_source_revisions" ADD CONSTRAINT "knowledge_source_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_source_revisions" ADD CONSTRAINT "knowledge_source_revisions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_source_revisions_source_idx" ON "knowledge_source_revisions" USING btree ("source_id");--> statement-breakpoint
-- At most one open revision per source; further edits amend it.
CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_source_revisions_pending_uq" ON "knowledge_source_revisions" USING btree ("source_id") WHERE "status" = 'PENDING';--> statement-breakpoint
ALTER TABLE "knowledge_versions" ADD COLUMN IF NOT EXISTS "snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "knowledge_versions" ADD COLUMN IF NOT EXISTS "created_by" uuid;--> statement-breakpoint
ALTER TABLE "knowledge_versions" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_claims" ADD COLUMN IF NOT EXISTS "status" "knowledge_claim_status" DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_claims" ADD COLUMN IF NOT EXISTS "origin" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_claims" ADD COLUMN IF NOT EXISTS "document_id" uuid;--> statement-breakpoint
ALTER TABLE "knowledge_claims" ADD COLUMN IF NOT EXISTS "chunk_id" uuid;--> statement-breakpoint
ALTER TABLE "knowledge_claims" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_claims" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_claims" ADD CONSTRAINT "knowledge_claims_document_id_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_claims" ADD CONSTRAINT "knowledge_claims_chunk_id_knowledge_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."knowledge_chunks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_claims_source_status_idx" ON "knowledge_claims" USING btree ("source_id", "status");--> statement-breakpoint
-- Detected conflicts are keyed on the (sorted) pair of claims that disagree,
-- so re-running detection updates rather than duplicates a conflict.
ALTER TABLE "knowledge_conflicts" ADD COLUMN IF NOT EXISTS "pair_key" text;--> statement-breakpoint
ALTER TABLE "knowledge_conflicts" ADD COLUMN IF NOT EXISTS "detected_by" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_conflicts" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_conflicts_pair_key_uq" ON "knowledge_conflicts" USING btree ("pair_key") WHERE "pair_key" IS NOT NULL;
