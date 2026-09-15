ALTER TABLE "tender_automation_runs" ADD COLUMN "lease_owner" uuid;
ALTER TABLE "tender_automation_runs" ADD COLUMN "lease_expires_at" timestamp with time zone;
CREATE INDEX "tender_automation_runs_claim_idx" ON "tender_automation_runs" ("status", "lease_expires_at", "created_at");
ALTER TABLE "tender_answer_reviews" ADD COLUMN "content_digest" text;
-- Existing reviews cannot prove which content was reviewed. A new explicit review is required.
