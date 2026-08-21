CREATE TYPE "public"."setting_toggle_kind" AS ENUM('toggle', 'select', 'slider');--> statement-breakpoint
CREATE TABLE "config_toggles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"group" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"label" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kind" "setting_toggle_kind" NOT NULL,
	"value" jsonb NOT NULL,
	"options" jsonb,
	"max" integer
);
--> statement-breakpoint
ALTER TABLE "config_toggles" ADD CONSTRAINT "config_toggles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "config_toggles_org_group_idx" ON "config_toggles" USING btree ("organization_id","group");