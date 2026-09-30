ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "location" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "language" text NOT NULL DEFAULT 'en-US';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bio" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "skills" jsonb NOT NULL DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notification_preferences" jsonb NOT NULL DEFAULT '{}'::jsonb;
