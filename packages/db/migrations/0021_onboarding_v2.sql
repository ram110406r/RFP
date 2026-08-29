ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "preferred_name" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "account_type" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "department" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "timezone" text NOT NULL DEFAULT 'UTC';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "legal_name" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "country" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "operating_region" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "profile" jsonb NOT NULL DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "proposed_department" text;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "proposed_team_id" uuid REFERENCES "teams"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invitations_team_idx" ON "invitations" ("proposed_team_id");--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD COLUMN IF NOT EXISTS "invitation_id" uuid REFERENCES "invitations"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD COLUMN IF NOT EXISTS "journey" text;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD COLUMN IF NOT EXISTS "current_state" text NOT NULL DEFAULT 'IDENTITY';
