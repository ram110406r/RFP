DO $$ BEGIN
 CREATE TYPE "tender_document_import_status" AS ENUM ('PENDING', 'IMPORTED', 'FAILED', 'NOT_APPLICABLE');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 CREATE TYPE "tender_saved_search_cadence" AS ENUM ('IMMEDIATE', 'DAILY');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
ALTER TYPE "notification_category" ADD VALUE IF NOT EXISTS 'Tenders';

ALTER TABLE "tender_sync_runs" ADD COLUMN IF NOT EXISTS "parsed_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "tender_sync_runs" ADD COLUMN IF NOT EXISTS "rejected_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "tender_sync_runs" ADD COLUMN IF NOT EXISTS "duplicate_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "tender_sync_runs" ADD COLUMN IF NOT EXISTS "stale_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "tender_sync_runs" ADD COLUMN IF NOT EXISTS "completeness" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "tender_source_records" ADD COLUMN IF NOT EXISTS "accepted" boolean NOT NULL DEFAULT true;
ALTER TABLE "tender_source_records" ADD COLUMN IF NOT EXISTS "rejection_reason" text;

ALTER TABLE "tender_notice_documents" ADD COLUMN IF NOT EXISTS "import_status" "tender_document_import_status" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "tender_notice_documents" ADD COLUMN IF NOT EXISTS "import_attempts" integer NOT NULL DEFAULT 0;
ALTER TABLE "tender_notice_documents" ADD COLUMN IF NOT EXISTS "last_checked_at" timestamptz;
ALTER TABLE "tender_notice_documents" ADD COLUMN IF NOT EXISTS "storage_key" text;
ALTER TABLE "tender_notice_documents" ADD COLUMN IF NOT EXISTS "last_error" text;
UPDATE "tender_notice_documents" SET "import_status" = 'NOT_APPLICABLE' WHERE "access" <> 'DIRECT';

ALTER TABLE "tender_notices" ADD COLUMN IF NOT EXISTS "search_vector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('simple', coalesce("reference_number", '')), 'A') ||
  setweight(to_tsvector('english', coalesce("buyer_name", '') || ' ' || coalesce("category", '')), 'B') ||
  setweight(to_tsvector('english', coalesce("description", '') || ' ' || coalesce("location", '') || ' ' || coalesce("state", '') || ' ' || coalesce("procurement_type", '')), 'C')
) STORED;
CREATE INDEX IF NOT EXISTS "tender_notices_weighted_search_idx" ON "tender_notices" USING gin ("search_vector");
CREATE INDEX IF NOT EXISTS "tender_notices_reference_trgm_idx" ON "tender_notices" USING gin ("reference_number" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "tender_notices_deadline_cursor_idx" ON "tender_notices" ("deadline_at", "id");
CREATE INDEX IF NOT EXISTS "tender_notices_published_cursor_idx" ON "tender_notices" ("published_at" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "tender_notices_value_cursor_idx" ON "tender_notices" ("estimated_value" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "tender_notices_updated_cursor_idx" ON "tender_notices" ("updated_at" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "tender_notices_filter_idx" ON "tender_notices" ("status", "state", "category", "procurement_type");
CREATE INDEX IF NOT EXISTS "tender_source_records_rejected_idx" ON "tender_source_records" ("portal_id", "last_seen_at" DESC) WHERE "accepted" = false;

CREATE TABLE IF NOT EXISTS "tender_match_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "capability_keywords" text[] NOT NULL DEFAULT '{}', "preferred_categories" text[] NOT NULL DEFAULT '{}', "preferred_states" text[] NOT NULL DEFAULT '{}',
  "certifications" text[] NOT NULL DEFAULT '{}', "industry" text, "minimum_value" numeric(18,2), "maximum_value" numeric(18,2),
  "updated_by" uuid REFERENCES "users"("id") ON DELETE set null, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "tender_match_profiles_org_uq" ON "tender_match_profiles" ("organization_id");

CREATE TABLE IF NOT EXISTS "tender_saved_searches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade, "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "name" text NOT NULL, "query" jsonb NOT NULL DEFAULT '{}', "cadence" "tender_saved_search_cadence" NOT NULL DEFAULT 'DAILY', "enabled" boolean NOT NULL DEFAULT true,
  "last_evaluated_at" timestamptz, "next_evaluation_at" timestamptz, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "tender_saved_searches_due_idx" ON "tender_saved_searches" ("enabled", "next_evaluation_at");
CREATE INDEX IF NOT EXISTS "tender_saved_searches_owner_idx" ON "tender_saved_searches" ("organization_id", "workspace_id", "user_id");

CREATE TABLE IF NOT EXISTS "tender_saved_search_matches" (
  "search_id" uuid NOT NULL REFERENCES "tender_saved_searches"("id") ON DELETE cascade, "notice_id" uuid NOT NULL REFERENCES "tender_notices"("id") ON DELETE cascade,
  "notice_version" text NOT NULL, "matched_at" timestamptz NOT NULL DEFAULT now(), "notified_at" timestamptz,
  PRIMARY KEY ("search_id", "notice_id", "notice_version")
);
CREATE INDEX IF NOT EXISTS "tender_saved_search_matches_notice_idx" ON "tender_saved_search_matches" ("notice_id");

CREATE TABLE IF NOT EXISTS "tender_discovery_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade, "user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "notice_id" uuid REFERENCES "tender_notices"("id") ON DELETE set null, "event_type" text NOT NULL, "query_fingerprint" text,
  "filters" jsonb NOT NULL DEFAULT '{}', "result_count" integer, "duration_ms" integer, "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "tender_discovery_events_workspace_created_idx" ON "tender_discovery_events" ("workspace_id", "created_at");
CREATE INDEX IF NOT EXISTS "tender_discovery_events_type_created_idx" ON "tender_discovery_events" ("event_type", "created_at");

CREATE TABLE IF NOT EXISTS "tender_discovery_daily_metrics" (
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade, "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "day" timestamptz NOT NULL, "event_type" text NOT NULL, "count" integer NOT NULL DEFAULT 0, "zero_result_count" integer NOT NULL DEFAULT 0,
  "average_duration_ms" real, "metadata" jsonb NOT NULL DEFAULT '{}', PRIMARY KEY ("workspace_id", "day", "event_type")
);
