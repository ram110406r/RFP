-- Document management (Phase 6a).
--
-- organization_id is added in three steps rather than one: drizzle-kit emits a
-- bare `ADD COLUMN ... NOT NULL`, which fails against a table that already has
-- rows (the seed creates three). Adding it nullable, backfilling from the
-- owning RFP, then applying the constraint is the same end state and works on
-- a populated table.
ALTER TABLE "rfp_documents" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
UPDATE "rfp_documents" AS d SET "organization_id" = r."organization_id" FROM "rfps" AS r WHERE r."id" = d."rfp_id" AND d."organization_id" IS NULL;--> statement-breakpoint
ALTER TABLE "rfp_documents" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "rfp_documents" ADD COLUMN "current_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "rfp_documents" ADD COLUMN "page_count" integer;--> statement-breakpoint
ALTER TABLE "rfp_documents" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "rfp_documents" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rfp_documents" ADD CONSTRAINT "rfp_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rfp_documents_org_idx" ON "rfp_documents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "rfp_documents_org_status_idx" ON "rfp_documents" USING btree ("organization_id","status");
