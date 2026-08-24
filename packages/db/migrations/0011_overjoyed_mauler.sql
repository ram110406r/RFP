CREATE TYPE "public"."document_block_kind" AS ENUM('heading', 'paragraph', 'listItem', 'table');--> statement-breakpoint
CREATE TYPE "public"."requirement_candidate_status" AS ENUM('extracted', 'accepted', 'rejected', 'projected', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."requirement_candidate_type" AS ENUM('explicit_requirement', 'acceptance_criteria', 'deliverable', 'deadline', 'constraint', 'qualification', 'evaluation_criterion', 'question');--> statement-breakpoint
CREATE TYPE "public"."requirement_extraction_status" AS ENUM('pending', 'processing', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."requirement_source_kind" AS ENUM('page', 'table', 'block');--> statement-breakpoint
CREATE TABLE "document_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"extraction_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"block_number" integer NOT NULL,
	"kind" "document_block_kind" NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"heading_path" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_ref" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requirement_candidate_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"source_index" integer NOT NULL,
	"source_kind" "requirement_source_kind" NOT NULL,
	"document_page_id" uuid,
	"document_table_id" uuid,
	"document_block_id" uuid,
	"excerpt" text DEFAULT '' NOT NULL,
	"row_index" integer,
	"column_index" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requirement_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extraction_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"rfp_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"document_version" integer NOT NULL,
	"candidate_index" integer NOT NULL,
	"candidate_type" "requirement_candidate_type" NOT NULL,
	"category" "requirement_category",
	"mandatory" boolean DEFAULT false NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"original_text" text NOT NULL,
	"normalized_text" text NOT NULL,
	"confidence" numeric(4, 3) DEFAULT '0' NOT NULL,
	"extraction_method" text DEFAULT 'deterministic' NOT NULL,
	"status" "requirement_candidate_status" DEFAULT 'extracted' NOT NULL,
	"projected_requirement_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requirement_extractions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"rfp_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"document_extraction_id" uuid NOT NULL,
	"status" "requirement_extraction_status" DEFAULT 'pending' NOT NULL,
	"extractor" text DEFAULT 'deterministic@1' NOT NULL,
	"failure_reason" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_blocks" ADD CONSTRAINT "document_blocks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_blocks" ADD CONSTRAINT "document_blocks_extraction_id_document_extractions_id_fk" FOREIGN KEY ("extraction_id") REFERENCES "public"."document_extractions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_blocks" ADD CONSTRAINT "document_blocks_document_id_rfp_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."rfp_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_candidate_sources" ADD CONSTRAINT "requirement_candidate_sources_candidate_id_requirement_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."requirement_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_candidate_sources" ADD CONSTRAINT "requirement_candidate_sources_document_page_id_document_pages_id_fk" FOREIGN KEY ("document_page_id") REFERENCES "public"."document_pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_candidate_sources" ADD CONSTRAINT "requirement_candidate_sources_document_table_id_document_tables_id_fk" FOREIGN KEY ("document_table_id") REFERENCES "public"."document_tables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_candidate_sources" ADD CONSTRAINT "requirement_candidate_sources_document_block_id_document_blocks_id_fk" FOREIGN KEY ("document_block_id") REFERENCES "public"."document_blocks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_candidates" ADD CONSTRAINT "requirement_candidates_extraction_id_requirement_extractions_id_fk" FOREIGN KEY ("extraction_id") REFERENCES "public"."requirement_extractions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_candidates" ADD CONSTRAINT "requirement_candidates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_candidates" ADD CONSTRAINT "requirement_candidates_rfp_id_rfps_id_fk" FOREIGN KEY ("rfp_id") REFERENCES "public"."rfps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_candidates" ADD CONSTRAINT "requirement_candidates_document_id_rfp_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."rfp_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_candidates" ADD CONSTRAINT "requirement_candidates_projected_requirement_id_rfp_requirements_id_fk" FOREIGN KEY ("projected_requirement_id") REFERENCES "public"."rfp_requirements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_extractions" ADD CONSTRAINT "requirement_extractions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_extractions" ADD CONSTRAINT "requirement_extractions_rfp_id_rfps_id_fk" FOREIGN KEY ("rfp_id") REFERENCES "public"."rfps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_extractions" ADD CONSTRAINT "requirement_extractions_document_id_rfp_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."rfp_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_extractions" ADD CONSTRAINT "requirement_extractions_document_extraction_id_document_extractions_id_fk" FOREIGN KEY ("document_extraction_id") REFERENCES "public"."document_extractions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_blocks_extraction_block_uq" ON "document_blocks" USING btree ("extraction_id","block_number");--> statement-breakpoint
CREATE INDEX "document_blocks_org_idx" ON "document_blocks" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "document_blocks_document_idx" ON "document_blocks" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "requirement_candidate_sources_candidate_source_uq" ON "requirement_candidate_sources" USING btree ("candidate_id","source_index");--> statement-breakpoint
CREATE INDEX "requirement_candidate_sources_candidate_idx" ON "requirement_candidate_sources" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "requirement_candidate_sources_page_idx" ON "requirement_candidate_sources" USING btree ("document_page_id");--> statement-breakpoint
CREATE INDEX "requirement_candidate_sources_table_idx" ON "requirement_candidate_sources" USING btree ("document_table_id");--> statement-breakpoint
CREATE INDEX "requirement_candidate_sources_block_idx" ON "requirement_candidate_sources" USING btree ("document_block_id");--> statement-breakpoint
CREATE UNIQUE INDEX "requirement_candidates_extraction_index_uq" ON "requirement_candidates" USING btree ("extraction_id","candidate_index");--> statement-breakpoint
CREATE INDEX "requirement_candidates_org_idx" ON "requirement_candidates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "requirement_candidates_org_status_idx" ON "requirement_candidates" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "requirement_candidates_document_idx" ON "requirement_candidates" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "requirement_candidates_projection_idx" ON "requirement_candidates" USING btree ("projected_requirement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "requirement_extractions_document_extraction_uq" ON "requirement_extractions" USING btree ("document_extraction_id");--> statement-breakpoint
CREATE INDEX "requirement_extractions_org_idx" ON "requirement_extractions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "requirement_extractions_org_status_idx" ON "requirement_extractions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "requirement_extractions_document_idx" ON "requirement_extractions" USING btree ("document_id");