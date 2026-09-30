-- Store invitation tokens as SHA-256 hashes only. Hashing the existing
-- plaintext keeps every outstanding join link working: the API hashes the
-- token it receives and looks up token_hash.
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "token_hash" text;--> statement-breakpoint
UPDATE "invitations"
SET "token_hash" = encode(sha256(convert_to("token", 'UTF8')), 'hex')
WHERE "token_hash" IS NULL AND "token" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ALTER COLUMN "token_hash" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invitations_token_hash_uq" ON "invitations" USING btree ("token_hash");--> statement-breakpoint
-- The plaintext column stays (nullable) for one release so a rollback boots,
-- but no longer holds a usable secret.
ALTER TABLE "invitations" ALTER COLUMN "token" DROP NOT NULL;--> statement-breakpoint
UPDATE "invitations" SET "token" = NULL WHERE "token" IS NOT NULL;
