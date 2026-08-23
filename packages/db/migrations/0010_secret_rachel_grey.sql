CREATE TYPE "public"."extraction_status" AS ENUM('pending', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "document_extractions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"extractor" text DEFAULT '' NOT NULL,
	"status" "extraction_status" DEFAULT 'pending' NOT NULL,
	"page_count" integer,
	"character_count" integer DEFAULT 0 NOT NULL,
	"table_count" integer DEFAULT 0 NOT NULL,
	"failure_reason" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"extraction_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"page_number" integer NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"character_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"extraction_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"table_index" integer NOT NULL,
	"page_number" integer,
	"caption" text DEFAULT '' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"column_count" integer DEFAULT 0 NOT NULL,
	"cells" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_document_id_rfp_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."rfp_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_pages" ADD CONSTRAINT "document_pages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_pages" ADD CONSTRAINT "document_pages_extraction_id_document_extractions_id_fk" FOREIGN KEY ("extraction_id") REFERENCES "public"."document_extractions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_pages" ADD CONSTRAINT "document_pages_document_id_rfp_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."rfp_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_tables" ADD CONSTRAINT "document_tables_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_tables" ADD CONSTRAINT "document_tables_extraction_id_document_extractions_id_fk" FOREIGN KEY ("extraction_id") REFERENCES "public"."document_extractions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_tables" ADD CONSTRAINT "document_tables_document_id_rfp_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."rfp_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_extractions_document_version_uq" ON "document_extractions" USING btree ("document_id","version");--> statement-breakpoint
CREATE INDEX "document_extractions_org_idx" ON "document_extractions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "document_extractions_document_idx" ON "document_extractions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_extractions_org_status_idx" ON "document_extractions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "document_pages_extraction_page_uq" ON "document_pages" USING btree ("extraction_id","page_number");--> statement-breakpoint
CREATE INDEX "document_pages_org_idx" ON "document_pages" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "document_pages_document_idx" ON "document_pages" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_tables_extraction_index_uq" ON "document_tables" USING btree ("extraction_id","table_index");--> statement-breakpoint
CREATE INDEX "document_tables_org_idx" ON "document_tables" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "document_tables_document_idx" ON "document_tables" USING btree ("document_id");