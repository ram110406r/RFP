CREATE TABLE IF NOT EXISTS "onboarding_progress" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "organization_id" uuid REFERENCES "organizations"("id") ON DELETE SET NULL,
  "workspace_id" uuid REFERENCES "workspaces"("id") ON DELETE SET NULL,
  "current_step" integer NOT NULL DEFAULT 1,
  "completed" boolean NOT NULL DEFAULT false,
  "completed_at" timestamptz,
  "company" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "profile" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "team" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "rfp_context" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "onboarding_progress_user_uq" ON "onboarding_progress" ("user_id");
