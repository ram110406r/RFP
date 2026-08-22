-- Document status values.
--
-- Written as a type swap rather than `ALTER TYPE ... ADD VALUE`, because the
-- drizzle migrator runs every pending migration inside ONE transaction, and
-- Postgres refuses to let a statement use an enum value that ADD VALUE
-- introduced in the same transaction ("New enum values must be committed
-- before they can be used"). Splitting the statements across migration files
-- does not help — they still share the transaction.
--
-- Building a fresh type sidesteps that entirely: values of a type created
-- within the transaction are usable immediately, since the whole type
-- disappears on rollback. rfp_documents.status is the only column of this
-- type, so the swap touches one table.
--
-- 'ready' is deliberately retained: apps/legacy-web still renders it. New code
-- writes 'parsed'; 'ready' is dropped when that app is retired.
CREATE TYPE "public"."document_status_new" AS ENUM('uploaded', 'queued', 'processing', 'parsed', 'ready', 'failed', 'archived');--> statement-breakpoint
ALTER TABLE "rfp_documents" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "rfp_documents" ALTER COLUMN "status" TYPE "public"."document_status_new" USING "status"::text::"public"."document_status_new";--> statement-breakpoint
DROP TYPE "public"."document_status";--> statement-breakpoint
ALTER TYPE "public"."document_status_new" RENAME TO "document_status";--> statement-breakpoint
ALTER TABLE "rfp_documents" ALTER COLUMN "status" SET DEFAULT 'uploaded';
