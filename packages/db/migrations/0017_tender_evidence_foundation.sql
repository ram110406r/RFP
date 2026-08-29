CREATE TYPE "evidence_freshness" AS ENUM ('FRESH', 'AGING', 'STALE', 'EXPIRED', 'UNKNOWN');--> statement-breakpoint

ALTER TABLE "tender_answer_evidence" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "tender_answer_evidence" ADD COLUMN "source_version" text;--> statement-breakpoint
ALTER TABLE "tender_answer_evidence" ADD COLUMN "relevance" numeric(4, 3) NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "tender_answer_evidence" ADD COLUMN "confidence" numeric(4, 3) NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "tender_answer_evidence" ADD COLUMN "freshness" "evidence_freshness" NOT NULL DEFAULT 'UNKNOWN';--> statement-breakpoint
ALTER TABLE "tender_answer_evidence" ADD COLUMN "verified_at" timestamptz;--> statement-breakpoint
CREATE INDEX "tender_answer_evidence_source_idx" ON "tender_answer_evidence" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tender_answer_evidence_answer_evidence_uq" ON "tender_answer_evidence" USING btree ("answer_id", "evidence_type", "evidence_id", "source_id", "source_version");
