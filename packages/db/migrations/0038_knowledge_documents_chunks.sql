-- Knowledge becomes document-backed: uploaded files are parsed into chunks
-- that carry both a full-text vector and a pgvector embedding, so retrieval
-- can fuse keyword and semantic ranking. pgvector itself was enabled in 0003.
--
-- The embedding dimension is fixed at 1024 (Voyage voyage-3.5's default
-- output). Every chunk records the model that produced it, so switching
-- models is a re-embed job the worker sweep performs, not a schema rewrite —
-- unless the new model needs a different dimension.
DO $$ BEGIN
 CREATE TYPE "public"."knowledge_document_status" AS ENUM('uploaded', 'queued', 'processing', 'parsed', 'embedded', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"checksum_sha256" text,
	"status" "knowledge_document_status" DEFAULT 'uploaded' NOT NULL,
	"failure_reason" text,
	"page_count" integer,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"processing_started_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_documents_org_idx" ON "knowledge_documents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_documents_source_idx" ON "knowledge_documents" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_documents_status_idx" ON "knowledge_documents" USING btree ("status");--> statement-breakpoint
-- The same bytes uploaded twice to one source are one document.
CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_documents_source_checksum_uq" ON "knowledge_documents" USING btree ("source_id", "checksum_sha256") WHERE "checksum_sha256" IS NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"page_number" integer,
	"heading" text,
	"text" text NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	"content_hash" text NOT NULL,
	"embedding" vector(1024),
	"embedding_model" text,
	"embedded_at" timestamp with time zone,
	"search_vector" tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce("heading", '') || ' ' || "text")) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_document_id_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_chunks_org_source_idx" ON "knowledge_chunks" USING btree ("organization_id", "source_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_chunks_document_ordinal_uq" ON "knowledge_chunks" USING btree ("document_id", "ordinal");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_chunks_search_idx" ON "knowledge_chunks" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_chunks_embedding_idx" ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);
