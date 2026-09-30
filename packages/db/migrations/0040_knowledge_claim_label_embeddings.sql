-- Conflict detection matched claims only by label spelling (pg_trgm), so
-- "RPO" and "Recovery point objective" were never compared. Each claim now
-- carries an embedding of its label, written lazily by the conflict worker,
-- so semantically equal questions are found whatever their wording.
-- Same 1024 dimension and model bookkeeping as knowledge_chunks (0038).
ALTER TABLE "knowledge_claims" ADD COLUMN IF NOT EXISTS "label_embedding" vector(1024);--> statement-breakpoint
ALTER TABLE "knowledge_claims" ADD COLUMN IF NOT EXISTS "label_embedding_model" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_claims_label_embedding_idx" ON "knowledge_claims" USING hnsw ("label_embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_claims_label_trgm_idx" ON "knowledge_claims" USING gin (lower("label") gin_trgm_ops);
