CREATE TYPE "tender_source_kind" AS ENUM ('DOCUMENT', 'URL', 'ONLINE_FORM', 'MANUAL', 'IMPORT');--> statement-breakpoint
CREATE TYPE "tender_source_status" AS ENUM ('REGISTERED', 'READY', 'REMOVED');--> statement-breakpoint

CREATE TABLE "tender_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "tender_id" uuid NOT NULL REFERENCES "tenders"("id") ON DELETE cascade,
  "source_type" "tender_source_kind" NOT NULL DEFAULT 'DOCUMENT',
  "name" text NOT NULL,
  "external_reference" text,
  "source_url" text,
  "file_id" uuid NOT NULL REFERENCES "files"("id") ON DELETE restrict,
  "mime_type" text NOT NULL,
  "file_size" bigint NOT NULL DEFAULT 0,
  "checksum_sha256" text,
  "status" "tender_source_status" NOT NULL DEFAULT 'REGISTERED',
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "removed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX "tender_sources_org_idx" ON "tender_sources" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tender_sources_workspace_idx" ON "tender_sources" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "tender_sources_tender_idx" ON "tender_sources" USING btree ("tender_id");--> statement-breakpoint
CREATE INDEX "tender_sources_status_idx" ON "tender_sources" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tender_sources_checksum_idx" ON "tender_sources" USING btree ("checksum_sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "tender_sources_tender_checksum_uq" ON "tender_sources" USING btree ("tender_id", "checksum_sha256");
