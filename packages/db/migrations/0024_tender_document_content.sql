CREATE TYPE "public"."tender_document_extraction_status" AS ENUM('pending', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."tender_document_content_kind" AS ENUM('page', 'heading', 'paragraph', 'listItem', 'table');--> statement-breakpoint
CREATE TABLE "tender_document_extractions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"tender_id" uuid NOT NULL,
	"tender_document_id" uuid NOT NULL,
	"extractor" text DEFAULT '' NOT NULL,
	"status" "tender_document_extraction_status" DEFAULT 'pending' NOT NULL,
	"page_count" integer,
	"character_count" integer DEFAULT 0 NOT NULL,
	"table_count" integer DEFAULT 0 NOT NULL,
	"failure_reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tender_document_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"tender_id" uuid NOT NULL,
	"tender_document_id" uuid NOT NULL,
	"extraction_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"page_number" integer,
	"section" text,
	"kind" "tender_document_content_kind" DEFAULT 'page' NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"content_hash" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tender_document_extractions" ADD CONSTRAINT "tender_document_extractions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_document_extractions" ADD CONSTRAINT "tender_document_extractions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_document_extractions" ADD CONSTRAINT "tender_document_extractions_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_document_extractions" ADD CONSTRAINT "tender_document_extractions_tender_document_id_tender_documents_id_fk" FOREIGN KEY ("tender_document_id") REFERENCES "public"."tender_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_document_content" ADD CONSTRAINT "tender_document_content_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_document_content" ADD CONSTRAINT "tender_document_content_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_document_content" ADD CONSTRAINT "tender_document_content_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_document_content" ADD CONSTRAINT "tender_document_content_tender_document_id_tender_documents_id_fk" FOREIGN KEY ("tender_document_id") REFERENCES "public"."tender_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_document_content" ADD CONSTRAINT "tender_document_content_extraction_id_tender_document_extractions_id_fk" FOREIGN KEY ("extraction_id") REFERENCES "public"."tender_document_extractions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tender_document_extractions_document_uq" ON "tender_document_extractions" USING btree ("tender_document_id");--> statement-breakpoint
CREATE INDEX "tender_document_extractions_org_idx" ON "tender_document_extractions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tender_document_extractions_workspace_idx" ON "tender_document_extractions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "tender_document_extractions_tender_idx" ON "tender_document_extractions" USING btree ("tender_id");--> statement-breakpoint
CREATE INDEX "tender_document_extractions_org_status_idx" ON "tender_document_extractions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "tender_document_content_extraction_sequence_uq" ON "tender_document_content" USING btree ("extraction_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "tender_document_content_extraction_hash_uq" ON "tender_document_content" USING btree ("extraction_id","content_hash");--> statement-breakpoint
CREATE INDEX "tender_document_content_org_idx" ON "tender_document_content" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tender_document_content_tender_document_idx" ON "tender_document_content" USING btree ("tender_document_id");--> statement-breakpoint
CREATE INDEX "tender_document_content_document_sequence_idx" ON "tender_document_content" USING btree ("tender_document_id","sequence");--> statement-breakpoint
CREATE INDEX "tender_document_content_hash_idx" ON "tender_document_content" USING btree ("content_hash");
