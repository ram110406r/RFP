CREATE TABLE "tender_validation_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "tender_id" uuid NOT NULL REFERENCES "tenders"("id") ON DELETE cascade,
  "score" integer DEFAULT 0 NOT NULL,
  "ready" boolean DEFAULT false NOT NULL,
  "categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "result" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "tender_validation_runs_org_idx" ON "tender_validation_runs" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "tender_validation_runs_workspace_idx" ON "tender_validation_runs" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX "tender_validation_runs_tender_idx" ON "tender_validation_runs" USING btree ("tender_id");
