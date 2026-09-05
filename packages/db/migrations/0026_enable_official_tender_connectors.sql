ALTER TABLE "tender_portals" ADD COLUMN "sync_cursor" text;--> statement-breakpoint

UPDATE "tender_portals"
SET
  "enabled" = true,
  "health" = 'PENDING',
  "schedule_minutes" = 30,
  "metadata" = "metadata" || '{"builtInConnector":"GEM","coverageMode":"FULL_BACKFILL","maxPagesPerRun":30,"requestDelayMs":1000}'::jsonb,
  "updated_at" = now()
WHERE "key" = 'gem';--> statement-breakpoint

UPDATE "tender_portals"
SET
  "enabled" = true,
  "health" = 'PENDING',
  "schedule_minutes" = 15,
  "metadata" = "metadata" || '{"builtInConnector":"CPPP_LATEST","coverageMode":"LATEST_PUBLIC_WINDOW","maxPagesPerRun":1,"requestDelayMs":1000}'::jsonb,
  "updated_at" = now()
WHERE "key" = 'cppp';
