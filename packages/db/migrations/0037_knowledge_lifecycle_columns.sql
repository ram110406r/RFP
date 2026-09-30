-- Knowledge lifecycle becomes real columns instead of metadata->>'lifecycleStatus',
-- so it can be indexed, counted in SQL and maintained by the worker sweep.
-- Idempotent throughout, following 0033, so a partially pushed database can
-- re-run it.
DO $$ BEGIN
 CREATE TYPE "public"."knowledge_lifecycle_status" AS ENUM('DRAFT', 'ACTIVE', 'ARCHIVED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN IF NOT EXISTS "lifecycle_status" "knowledge_lifecycle_status" DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN IF NOT EXISTS "review_state" text;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN IF NOT EXISTS "review_state_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN IF NOT EXISTS "usage_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN IF NOT EXISTS "last_used_at" timestamp with time zone;--> statement-breakpoint
-- Rows written before this column existed carried their state in metadata;
-- a row with no recorded state was always read as ACTIVE, so the column
-- defaults to ACTIVE too (the API sets DRAFT explicitly on create). The API
-- keeps mirroring the state into metadata, so re-running this is harmless.
UPDATE "knowledge_sources" SET "lifecycle_status" = CASE
  WHEN "metadata" ->> 'lifecycleStatus' IN ('DRAFT', 'ACTIVE', 'ARCHIVED') THEN ("metadata" ->> 'lifecycleStatus')::"knowledge_lifecycle_status"
  ELSE 'ACTIVE'::"knowledge_lifecycle_status"
END;--> statement-breakpoint
-- Usage so far is whatever answers already cite each source.
UPDATE "knowledge_sources" AS ks SET
  "usage_count" = counts.n,
  "last_used_at" = counts.last_at
FROM (
  SELECT "source_id", count(*)::integer AS n, max("created_at") AS last_at
  FROM "tender_answer_evidence"
  WHERE "source_id" IS NOT NULL
  GROUP BY "source_id"
) AS counts
WHERE ks."id"::text = counts."source_id" AND ks."usage_count" = 0;--> statement-breakpoint
ALTER TABLE "tender_answer_evidence" ADD COLUMN IF NOT EXISTS "citation_status" text DEFAULT 'current' NOT NULL;--> statement-breakpoint
ALTER TABLE "tender_answer_evidence" ADD COLUMN IF NOT EXISTS "citation_checked_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_sources_org_status_idx" ON "knowledge_sources" USING btree ("organization_id", "lifecycle_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_sources_expires_idx" ON "knowledge_sources" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_sources_last_verified_idx" ON "knowledge_sources" USING btree ("last_verified");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_conflicts_status_idx" ON "knowledge_conflicts" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tender_answer_evidence_citation_status_idx" ON "tender_answer_evidence" USING btree ("citation_status");--> statement-breakpoint
DROP INDEX IF EXISTS "response_templates_status_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "response_templates_org_status_idx" ON "response_templates" USING btree ("organization_id", "status");--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_sources_name_trgm_idx" ON "knowledge_sources" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_sources_summary_trgm_idx" ON "knowledge_sources" USING gin ("summary" gin_trgm_ops);
