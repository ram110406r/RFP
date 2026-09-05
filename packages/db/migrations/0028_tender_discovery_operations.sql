CREATE TYPE "tender_sync_mode" AS ENUM ('HEAD', 'BACKFILL', 'FULL_REFRESH', 'RECONCILE');--> statement-breakpoint
CREATE TYPE "tender_ingestion_alert_status" AS ENUM ('OPEN', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "tender_ingestion_alert_kind" AS ENUM ('CONSECUTIVE_FAILURES', 'STALE_SOURCE', 'CURSOR_STALLED', 'VOLUME_ANOMALY');--> statement-breakpoint

ALTER TABLE "tender_portals" ADD COLUMN "sync_state" jsonb NOT NULL DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "tender_portals" ADD COLUMN "last_full_sync_at" timestamptz;--> statement-breakpoint
ALTER TABLE "tender_portals" ADD COLUMN "backfill_completed_at" timestamptz;--> statement-breakpoint
ALTER TABLE "tender_portals" ADD COLUMN "consecutive_failures" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "tender_sync_runs" ADD COLUMN "mode" "tender_sync_mode" NOT NULL DEFAULT 'HEAD';--> statement-breakpoint
ALTER TABLE "tender_sync_runs" ADD COLUMN "scope" jsonb NOT NULL DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "tender_sync_runs" ADD COLUMN "full_snapshot" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "tender_notice_sources" ADD COLUMN "source_status" "tender_notice_status" NOT NULL DEFAULT 'UNKNOWN';--> statement-breakpoint
ALTER TABLE "tender_notice_sources" ADD COLUMN "last_seen_run_id" uuid REFERENCES "tender_sync_runs"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "tender_notice_sources" ADD COLUMN "missed_syncs" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "tender_notice_sources" ADD COLUMN "stale_at" timestamptz;--> statement-breakpoint

UPDATE "tender_notice_sources" AS s
SET "source_status" = n."status"
FROM "tender_notices" AS n
WHERE n."id" = s."notice_id";--> statement-breakpoint

CREATE INDEX "tender_notice_sources_freshness_idx" ON "tender_notice_sources" ("portal_id", "stale_at", "last_seen_at");--> statement-breakpoint
CREATE INDEX "tender_notice_sources_run_idx" ON "tender_notice_sources" ("last_seen_run_id");--> statement-breakpoint

CREATE TABLE "platform_administrators" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE cascade,
  "granted_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE TABLE "tender_portal_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "portal_id" uuid NOT NULL REFERENCES "tender_portals"("id") ON DELETE cascade,
  "actor_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "action" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX "tender_portal_events_portal_created_idx" ON "tender_portal_events" ("portal_id", "created_at");--> statement-breakpoint

CREATE TABLE "tender_ingestion_alerts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "portal_id" uuid NOT NULL REFERENCES "tender_portals"("id") ON DELETE cascade,
  "kind" "tender_ingestion_alert_kind" NOT NULL,
  "status" "tender_ingestion_alert_status" NOT NULL DEFAULT 'OPEN',
  "message" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "opened_at" timestamptz NOT NULL DEFAULT now(),
  "resolved_at" timestamptz,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "tender_ingestion_alerts_open_uq" ON "tender_ingestion_alerts" ("portal_id", "kind") WHERE "status" = 'OPEN';--> statement-breakpoint
CREATE INDEX "tender_ingestion_alerts_status_idx" ON "tender_ingestion_alerts" ("status", "opened_at");
--> statement-breakpoint
UPDATE "tender_portals"
SET "metadata" = "metadata" || jsonb_build_object(
  'builtInConnector', 'GEPNIC_LATEST',
  'appPath', '/nicgep/app',
  'coverageMode', 'LATEST_PUBLIC_WINDOW'
)
WHERE "connector_type" = 'GEPNIC' AND "key" <> 'cppp';
--> statement-breakpoint
UPDATE "tender_portals"
SET "metadata" = "metadata" || '{"connectorVerified":true}'::jsonb
WHERE "key" IN ('gem', 'cppp');
--> statement-breakpoint
UPDATE "tender_portals"
SET "metadata" = "metadata" || jsonb_build_object(
  'connectorVerified', true,
  'verifiedAt', '2026-09-06',
  'verifiedScope', 'LATEST_PUBLIC_WINDOW'
)
WHERE "connector_type" = 'GEPNIC' AND "key" <> 'cppp';
--> statement-breakpoint
UPDATE "tender_portals"
SET "metadata" = "metadata" || jsonb_build_object(
  'builtInConnector', 'GEPNIC_LATEST',
  'appPath', '/nicgep/app',
  'coverageMode', 'LATEST_PUBLIC_WINDOW',
  'connectorVerified', true,
  'verifiedAt', '2026-09-06',
  'verifiedScope', 'LATEST_PUBLIC_WINDOW'
)
WHERE "key" = 'defproc';
