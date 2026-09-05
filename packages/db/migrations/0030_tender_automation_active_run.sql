CREATE UNIQUE INDEX "tender_automation_runs_active_uq"
ON "tender_automation_runs" ("tender_id")
WHERE "status" IN ('QUEUED', 'RUNNING');
