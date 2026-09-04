ALTER TABLE "tenders" ADD COLUMN "buyer_name" text;--> statement-breakpoint
ALTER TABLE "tenders" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "tenders" ADD COLUMN "estimated_value" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "tenders" ADD COLUMN "currency" text DEFAULT 'INR' NOT NULL;--> statement-breakpoint

UPDATE "tenders"
SET
  "buyer_name" = nullif("name", ''),
  "location" = nullif("metadata"->>'location', ''),
  "estimated_value" = CASE
    WHEN ("metadata"->>'estimatedValue') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN ("metadata"->>'estimatedValue')::numeric(14, 2)
    WHEN ("metadata"->'intake'->>'estimatedContractValue') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN ("metadata"->'intake'->>'estimatedContractValue')::numeric(14, 2)
    WHEN ("metadata"->>'estimatedContractValue') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN ("metadata"->>'estimatedContractValue')::numeric(14, 2)
    ELSE null
  END,
  "currency" = coalesce(nullif("metadata"->>'currency', ''), nullif("metadata"->'intake'->>'currency', ''), 'INR');--> statement-breakpoint

CREATE INDEX "tenders_org_source_type_idx" ON "tenders" USING btree ("organization_id", "source_type");--> statement-breakpoint
CREATE INDEX "tenders_org_buyer_idx" ON "tenders" USING btree ("organization_id", "buyer_name");--> statement-breakpoint
CREATE INDEX "tenders_org_location_idx" ON "tenders" USING btree ("organization_id", "location");--> statement-breakpoint
CREATE INDEX "tenders_estimated_value_idx" ON "tenders" USING btree ("estimated_value");--> statement-breakpoint

CREATE TABLE "saved_tenders" (
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "tender_id" uuid NOT NULL REFERENCES "tenders"("id") ON DELETE cascade,
  "saved_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("workspace_id", "tender_id")
);--> statement-breakpoint
CREATE INDEX "saved_tenders_org_idx" ON "saved_tenders" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "saved_tenders_workspace_idx" ON "saved_tenders" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "saved_tenders_tender_idx" ON "saved_tenders" USING btree ("tender_id");--> statement-breakpoint
CREATE INDEX "saved_tenders_saved_by_idx" ON "saved_tenders" USING btree ("saved_by");
