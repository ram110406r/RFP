CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "tender_portal_category" AS ENUM ('CENTRAL', 'DEFENCE', 'RAILWAYS', 'STATE', 'PSU');--> statement-breakpoint
CREATE TYPE "tender_connector_type" AS ENUM ('GEM', 'GEPNIC', 'IREPS', 'DEFPROC', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "tender_portal_health" AS ENUM ('PENDING', 'HEALTHY', 'DEGRADED', 'DISABLED');--> statement-breakpoint
CREATE TYPE "tender_sync_status" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "tender_notice_status" AS ENUM ('ACTIVE', 'CLOSED', 'CANCELLED', 'AWARDED', 'EXPIRED', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "tender_notice_document_access" AS ENUM ('DIRECT', 'EXTERNAL', 'AUTHENTICATED');--> statement-breakpoint

CREATE TABLE "tender_portals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "category" "tender_portal_category" NOT NULL,
  "state" text,
  "official_url" text NOT NULL,
  "connector_type" "tender_connector_type" NOT NULL,
  "schedule_minutes" integer DEFAULT 60 NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "health" "tender_portal_health" DEFAULT 'PENDING' NOT NULL,
  "last_attempt_at" timestamptz,
  "last_success_at" timestamptz,
  "last_error" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "tender_portals_key_uq" UNIQUE("key")
);--> statement-breakpoint

CREATE TABLE "tender_sync_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "portal_id" uuid NOT NULL REFERENCES "tender_portals"("id") ON DELETE cascade,
  "status" "tender_sync_status" DEFAULT 'RUNNING' NOT NULL,
  "cursor" text,
  "window_started_at" timestamptz,
  "discovered_count" integer DEFAULT 0 NOT NULL,
  "inserted_count" integer DEFAULT 0 NOT NULL,
  "updated_count" integer DEFAULT 0 NOT NULL,
  "error_count" integer DEFAULT 0 NOT NULL,
  "failure_reason" text,
  "started_at" timestamptz DEFAULT now() NOT NULL,
  "completed_at" timestamptz,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);--> statement-breakpoint

CREATE TABLE "tender_source_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "portal_id" uuid NOT NULL REFERENCES "tender_portals"("id") ON DELETE cascade,
  "sync_run_id" uuid REFERENCES "tender_sync_runs"("id") ON DELETE set null,
  "source_notice_key" text NOT NULL,
  "payload_hash" text NOT NULL,
  "raw_payload" jsonb NOT NULL,
  "source_updated_at" timestamptz,
  "first_seen_at" timestamptz DEFAULT now() NOT NULL,
  "last_seen_at" timestamptz DEFAULT now() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "tender_source_records_version_uq" UNIQUE("portal_id", "source_notice_key", "payload_hash")
);--> statement-breakpoint

CREATE TABLE "tender_notices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "canonical_key" text NOT NULL,
  "title" text NOT NULL,
  "reference_number" text,
  "description" text DEFAULT '' NOT NULL,
  "buyer_name" text,
  "authority_type" text,
  "location" text,
  "state" text,
  "category" text,
  "procurement_type" text,
  "published_at" timestamptz,
  "bid_starts_at" timestamptz,
  "deadline_at" timestamptz,
  "opens_at" timestamptz,
  "estimated_value" numeric(18,2),
  "currency" text DEFAULT 'INR' NOT NULL,
  "emd_amount" numeric(18,2),
  "document_fee" numeric(18,2),
  "status" "tender_notice_status" DEFAULT 'UNKNOWN' NOT NULL,
  "source_url" text NOT NULL,
  "source_updated_at" timestamptz,
  "first_seen_at" timestamptz DEFAULT now() NOT NULL,
  "last_seen_at" timestamptz DEFAULT now() NOT NULL,
  "missed_syncs" integer DEFAULT 0 NOT NULL,
  "stale_at" timestamptz,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "tender_notices_canonical_key_uq" UNIQUE("canonical_key")
);--> statement-breakpoint

CREATE TABLE "tender_notice_sources" (
  "notice_id" uuid NOT NULL REFERENCES "tender_notices"("id") ON DELETE cascade,
  "portal_id" uuid NOT NULL REFERENCES "tender_portals"("id") ON DELETE cascade,
  "source_record_id" uuid NOT NULL REFERENCES "tender_source_records"("id") ON DELETE restrict,
  "source_notice_key" text NOT NULL,
  "source_url" text NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "last_seen_at" timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY("notice_id", "portal_id"),
  CONSTRAINT "tender_notice_sources_portal_notice_uq" UNIQUE("portal_id", "source_notice_key")
);--> statement-breakpoint

CREATE TABLE "tender_notice_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "notice_id" uuid NOT NULL REFERENCES "tender_notices"("id") ON DELETE cascade,
  "portal_id" uuid NOT NULL REFERENCES "tender_portals"("id") ON DELETE cascade,
  "source_document_key" text NOT NULL,
  "name" text NOT NULL,
  "url" text NOT NULL,
  "mime_type" text,
  "size_bytes" bigint,
  "access" "tender_notice_document_access" DEFAULT 'EXTERNAL' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "tender_notice_documents_source_uq" UNIQUE("portal_id", "source_document_key")
);--> statement-breakpoint

CREATE TABLE "saved_tender_notices" (
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "notice_id" uuid NOT NULL REFERENCES "tender_notices"("id") ON DELETE cascade,
  "saved_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY("workspace_id", "notice_id")
);--> statement-breakpoint

ALTER TABLE "tenders" ADD COLUMN "discovery_notice_id" uuid REFERENCES "tender_notices"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "tender_sources" ADD COLUMN "discovery_notice_document_id" uuid REFERENCES "tender_notice_documents"("id") ON DELETE set null;--> statement-breakpoint
DROP INDEX IF EXISTS "tenders_org_reference_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "tenders_workspace_reference_uq" ON "tenders" ("workspace_id", "reference_number");--> statement-breakpoint

CREATE INDEX "tender_portals_enabled_health_idx" ON "tender_portals" ("enabled", "health");
CREATE INDEX "tender_portals_category_idx" ON "tender_portals" ("category");
CREATE INDEX "tender_sync_runs_portal_started_idx" ON "tender_sync_runs" ("portal_id", "started_at");
CREATE INDEX "tender_source_records_portal_notice_idx" ON "tender_source_records" ("portal_id", "source_notice_key");
CREATE INDEX "tender_notices_status_deadline_idx" ON "tender_notices" ("status", "deadline_at");
CREATE INDEX "tender_notices_state_idx" ON "tender_notices" ("state");
CREATE INDEX "tender_notices_buyer_idx" ON "tender_notices" ("buyer_name");
CREATE INDEX "tender_notices_category_idx" ON "tender_notices" ("category");
CREATE INDEX "tender_notices_value_idx" ON "tender_notices" ("estimated_value");
CREATE INDEX "tender_notices_updated_idx" ON "tender_notices" ("updated_at");
CREATE INDEX "tender_notices_search_idx" ON "tender_notices" USING gin (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("reference_number", '') || ' ' || coalesce("description", '') || ' ' || coalesce("buyer_name", '') || ' ' || coalesce("location", '') || ' ' || coalesce("category", '')));
CREATE INDEX "tender_notices_title_trgm_idx" ON "tender_notices" USING gin ("title" gin_trgm_ops);
CREATE INDEX "tender_notice_sources_record_idx" ON "tender_notice_sources" ("source_record_id");
CREATE INDEX "tender_notice_documents_notice_idx" ON "tender_notice_documents" ("notice_id");
CREATE INDEX "saved_tender_notices_org_idx" ON "saved_tender_notices" ("organization_id");
CREATE INDEX "saved_tender_notices_notice_idx" ON "saved_tender_notices" ("notice_id");
CREATE UNIQUE INDEX "tenders_workspace_discovery_notice_uq" ON "tenders" ("workspace_id", "discovery_notice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tender_sources_tender_discovery_document_uq" ON "tender_sources" ("tender_id", "discovery_notice_document_id");--> statement-breakpoint

INSERT INTO "tender_portals" ("key", "name", "category", "state", "official_url", "connector_type", "schedule_minutes", "enabled", "health", "metadata") VALUES
  ('gem', 'Government e-Marketplace', 'CENTRAL', NULL, 'https://gem.gov.in', 'GEM', 30, false, 'PENDING', '{"rolloutTier":1}'::jsonb),
  ('cppp', 'Central Public Procurement Portal', 'CENTRAL', NULL, 'https://eprocure.gov.in', 'GEPNIC', 30, false, 'PENDING', '{"rolloutTier":1}'::jsonb),
  ('defproc', 'Defence e-Procurement Portal', 'DEFENCE', NULL, 'https://defproc.gov.in', 'DEFPROC', 60, false, 'PENDING', '{"rolloutTier":3}'::jsonb),
  ('ireps', 'Indian Railways e-Procurement System', 'RAILWAYS', NULL, 'https://www.ireps.gov.in', 'IREPS', 60, false, 'PENDING', '{"rolloutTier":3}'::jsonb),
  ('mahatenders', 'MahaTenders', 'STATE', 'Maharashtra', 'https://mahatenders.gov.in', 'GEPNIC', 60, false, 'PENDING', '{"rolloutTier":2}'::jsonb),
  ('up-etender', 'UP e-Tender', 'STATE', 'Uttar Pradesh', 'https://etender.up.nic.in', 'GEPNIC', 60, false, 'PENDING', '{"rolloutTier":2}'::jsonb),
  ('karnataka-eproc', 'Karnataka e-Procurement', 'STATE', 'Karnataka', 'https://eproc.karnataka.gov.in', 'CUSTOM', 60, false, 'PENDING', '{"rolloutTier":4}'::jsonb),
  ('tn-tenders', 'Tamil Nadu Tenders', 'STATE', 'Tamil Nadu', 'https://tntenders.gov.in', 'GEPNIC', 60, false, 'PENDING', '{"rolloutTier":2}'::jsonb),
  ('bel', 'Bharat Electronics Limited Tenders', 'PSU', NULL, 'https://www.bel-india.in/Tenders', 'CUSTOM', 60, false, 'PENDING', '{"rolloutTier":4}'::jsonb),
  ('ap-eproc', 'Andhra Pradesh eProcurement', 'STATE', 'Andhra Pradesh', 'https://apeprocurement.gov.in', 'CUSTOM', 60, false, 'PENDING', '{"rolloutTier":4}'::jsonb),
  ('telangana-eproc', 'Telangana eProcurement', 'STATE', 'Telangana', 'https://tender.telangana.gov.in', 'CUSTOM', 60, false, 'PENDING', '{"rolloutTier":4}'::jsonb),
  ('gujarat-eproc', 'Gujarat e-Procurement', 'STATE', 'Gujarat', 'https://gil.gujarat.gov.in/eprocurement', 'CUSTOM', 60, false, 'PENDING', '{"rolloutTier":4}'::jsonb),
  ('rajasthan-eproc', 'Rajasthan e-Procurement', 'STATE', 'Rajasthan', 'https://eproc.rajasthan.gov.in', 'GEPNIC', 60, false, 'PENDING', '{"rolloutTier":2}'::jsonb),
  ('wb-tenders', 'West Bengal e-Procurement', 'STATE', 'West Bengal', 'https://wbtenders.gov.in', 'GEPNIC', 60, false, 'PENDING', '{"rolloutTier":2}'::jsonb),
  ('mp-tenders', 'Madhya Pradesh e-Procurement', 'STATE', 'Madhya Pradesh', 'https://mptenders.gov.in', 'GEPNIC', 60, false, 'PENDING', '{"rolloutTier":2}'::jsonb),
  ('kerala-tenders', 'Kerala e-Tenders', 'STATE', 'Kerala', 'https://etenders.kerala.gov.in', 'GEPNIC', 60, false, 'PENDING', '{"rolloutTier":2}'::jsonb),
  ('punjab-eproc', 'Punjab e-Procurement', 'STATE', 'Punjab', 'https://eproc.punjab.gov.in', 'GEPNIC', 60, false, 'PENDING', '{"rolloutTier":2}'::jsonb),
  ('odisha-tenders', 'Odisha e-Procurement', 'STATE', 'Odisha', 'https://tendersodisha.gov.in', 'GEPNIC', 60, false, 'PENDING', '{"rolloutTier":2}'::jsonb),
  ('bihar-eproc', 'Bihar e-Procurement', 'STATE', 'Bihar', 'https://state.bihar.gov.in/eproc2', 'CUSTOM', 60, false, 'PENDING', '{"rolloutTier":4}'::jsonb),
  ('haryana-tenders', 'Haryana e-Procurement', 'STATE', 'Haryana', 'https://etenders.hry.nic.in', 'GEPNIC', 60, false, 'PENDING', '{"rolloutTier":2}'::jsonb),
  ('delhi-eproc', 'Delhi e-Procurement', 'STATE', 'Delhi', 'https://govtprocurement.delhi.gov.in', 'GEPNIC', 60, false, 'PENDING', '{"rolloutTier":2}'::jsonb)
ON CONFLICT ("key") DO NOTHING;
