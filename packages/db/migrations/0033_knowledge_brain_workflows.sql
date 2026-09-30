-- Idempotent: safe to re-run against a database whose schema already contains
-- some of these objects (e.g. after a `drizzle-kit push`), so a drifted
-- production database cannot wedge the migrate step.
ALTER TABLE "knowledge_conflicts" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'OPEN';--> statement-breakpoint
ALTER TABLE "knowledge_conflicts" ADD COLUMN IF NOT EXISTS "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "knowledge_conflicts" ADD COLUMN IF NOT EXISTS "resolved_by" uuid;--> statement-breakpoint
ALTER TABLE "knowledge_conflicts" ADD COLUMN IF NOT EXISTS "resolution_note" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_conflicts" ADD CONSTRAINT "knowledge_conflicts_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."response_template_status" AS ENUM('DRAFT', 'ACTIVE', 'ARCHIVED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "response_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" "requirement_category" NOT NULL,
	"status" "response_template_status" DEFAULT 'DRAFT' NOT NULL,
	"owner_id" uuid,
	"description" text DEFAULT '' NOT NULL,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" text DEFAULT '1.0' NOT NULL,
	"usage_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
-- If a live database was partially pushed before this migration was recorded,
-- the table may already exist with only some columns. Repair it before adding
-- constraints and indexes so the one-shot deploy migration remains additive.
ALTER TABLE "response_templates" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "response_templates" ADD COLUMN IF NOT EXISTS "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "response_templates" ADD COLUMN IF NOT EXISTS "name" text;--> statement-breakpoint
ALTER TABLE "response_templates" ADD COLUMN IF NOT EXISTS "category" "requirement_category";--> statement-breakpoint
ALTER TABLE "response_templates" ADD COLUMN IF NOT EXISTS "status" "response_template_status" DEFAULT 'DRAFT' NOT NULL;--> statement-breakpoint
ALTER TABLE "response_templates" ADD COLUMN IF NOT EXISTS "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "response_templates" ADD COLUMN IF NOT EXISTS "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "response_templates" ADD COLUMN IF NOT EXISTS "sections" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "response_templates" ADD COLUMN IF NOT EXISTS "variables" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "response_templates" ADD COLUMN IF NOT EXISTS "version" text DEFAULT '1.0' NOT NULL;--> statement-breakpoint
ALTER TABLE "response_templates" ADD COLUMN IF NOT EXISTS "usage_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "response_templates" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "response_templates" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "response_templates" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "response_templates" SET
	"name" = COALESCE("name", ''),
	"category" = COALESCE("category", 'Product'::"requirement_category"),
	"status" = COALESCE("status", 'DRAFT'::"response_template_status"),
	"description" = COALESCE("description", ''),
	"sections" = COALESCE("sections", '[]'::jsonb),
	"variables" = COALESCE("variables", '[]'::jsonb),
	"version" = COALESCE("version", '1.0'),
	"usage_metadata" = COALESCE("usage_metadata", '{}'::jsonb),
	"created_at" = COALESCE("created_at", now()),
	"updated_at" = COALESCE("updated_at", now());--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "response_templates" ADD CONSTRAINT "response_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "response_templates" ADD CONSTRAINT "response_templates_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "response_templates_org_idx" ON "response_templates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "response_templates_status_idx" ON "response_templates" USING btree ("status");
