CREATE TYPE "tender_document_status" AS ENUM ('UPLOADED', 'PROCESSING', 'PROCESSED', 'FAILED');--> statement-breakpoint

ALTER TABLE "tender_documents" ADD COLUMN "tender_source_id" uuid;--> statement-breakpoint
ALTER TABLE "tender_documents" ADD COLUMN "status" "tender_document_status" DEFAULT 'UPLOADED' NOT NULL;--> statement-breakpoint
ALTER TABLE "tender_documents" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "tender_documents" ADD COLUMN "processed_at" timestamptz;--> statement-breakpoint
ALTER TABLE "tender_documents" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tender_documents" ADD COLUMN "updated_at" timestamptz DEFAULT now() NOT NULL;--> statement-breakpoint

ALTER TABLE "tender_documents"
  ADD CONSTRAINT "tender_documents_tender_source_id_tender_sources_id_fk"
  FOREIGN KEY ("tender_source_id") REFERENCES "tender_sources"("id") ON DELETE set null;--> statement-breakpoint

CREATE INDEX "tender_documents_source_idx" ON "tender_documents" USING btree ("tender_source_id");--> statement-breakpoint
CREATE INDEX "tender_documents_status_idx" ON "tender_documents" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "tender_documents_source_uq" ON "tender_documents" USING btree ("tender_source_id");
