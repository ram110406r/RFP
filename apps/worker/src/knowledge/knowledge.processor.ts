import { createHash } from "node:crypto";

import { extractJson, KNOWLEDGE_EMBEDDING_MODEL } from "@rfp-os/ai";
import {
  getDb,
  knowledgeChunks,
  knowledgeClaims,
  knowledgeConflicts,
  knowledgeConflictVariants,
  knowledgeDocuments,
  knowledgeSources,
  withTransaction,
} from "@rfp-os/db";
import {
  contradictsDeclaredType,
  DocxDocumentParser,
  PdfDocumentParser,
  SNIFF_LENGTH,
  sniffFormat,
} from "@rfp-os/document-processing";
import type { KnowledgeConflictJobPayload, KnowledgeDocumentJobPayload } from "@rfp-os/jobs";
import type { ObjectStorage } from "@rfp-os/storage";
import { and, asc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";

import { maxDocumentBytesFromEnv, PermanentJobError } from "../documents/document-processor";
import { inAppEnabled, insertNotificationOnce } from "../shared/notifications";
import { chunkDocument } from "./chunker";
import { KNOWLEDGE_EXTRACT_MODEL, type KnowledgeAi } from "./knowledge-ai";
import {
  buildExtractionMessages,
  claimKey,
  conflictPairKey,
  extractionWindows,
  heuristicClaims,
  mapExtractedClaims,
  MAX_SUGGESTED_CLAIMS_PER_DOCUMENT,
  parseExtractionResponse,
  recommendConflictSide,
  valuesConflict,
  type ExtractedClaim,
} from "./knowledge.logic";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const EMBED_BATCH = 64;
/** pg_trgm similarity above which two claim labels are treated as the same question. */
const LABEL_SIMILARITY = 0.55;
/**
 * Cosine similarity of label embeddings above which two labels ask the same
 * question in different words ("RPO" vs "Recovery point objective"). High on
 * purpose: a false match only costs a valuesConflict check, but a false
 * conflict costs a reviewer's attention.
 */
const SEMANTIC_LABEL_SIMILARITY = 0.85;
/** Label embeddings written per conflict run, so a large first backfill is spread over runs. */
const LABEL_EMBED_LIMIT = 512;

type ConflictCandidate = {
  id: string;
  label: string;
  value: string;
  source_id: string;
  source_name: string;
  authority: string;
  last_verified: string | null;
  owner_id: string | null;
};

export interface StepResult {
  processed: boolean;
  status: string;
  [key: string]: unknown;
}

/**
 * The knowledge document pipeline. Every query is scoped by the payload's
 * organizationId — the worker runs outside any request, so this is the only
 * tenant boundary — and every step re-reads the row and skips work already
 * done, because BullMQ redelivers a job whose worker died after committing.
 */
export class KnowledgeProcessor {
  constructor(
    private readonly storage: ObjectStorage,
    private readonly ai: KnowledgeAi,
    private readonly pdfParser = new PdfDocumentParser(),
    private readonly docxParser = new DocxDocumentParser(),
    private readonly maxDocumentBytes = maxDocumentBytesFromEnv(),
  ) {}

  // -------------------------------------------------------------------------
  // INGEST: bytes → text → chunks
  // -------------------------------------------------------------------------

  async ingest(payload: KnowledgeDocumentJobPayload): Promise<StepResult> {
    const db = getDb();
    const document = await this.requireDocument(payload);
    if (document.version !== payload.version) return { processed: false, status: "superseded" };
    if (document.status === "parsed" || document.status === "embedded") return { processed: false, status: document.status };

    const [source] = await db
      .select()
      .from(knowledgeSources)
      .where(and(eq(knowledgeSources.organizationId, payload.organizationId), eq(knowledgeSources.id, payload.sourceId)));
    if (!source) throw new PermanentJobError("The knowledge source was deleted before processing.");
    if (source.lifecycleStatus === "ARCHIVED") throw new PermanentJobError("The knowledge source was archived before processing.");

    await this.setStatus(payload, { status: "processing", processingStartedAt: new Date(), failureReason: null });

    const prefix = await this.storage.readObjectPrefix(payload.objectKey, SNIFF_LENGTH);
    if (!prefix) throw new PermanentJobError(`Object ${payload.objectKey} is missing from storage; the upload did not survive.`);
    const sniffed = sniffFormat(prefix);
    if (contradictsDeclaredType(sniffed, payload.mimeType)) {
      throw new PermanentJobError(`Content is ${sniffed} but the upload declared ${payload.mimeType}.`);
    }
    const head = await this.storage.headObject(payload.objectKey);
    if (head && head.sizeBytes > this.maxDocumentBytes) {
      throw new PermanentJobError(`Document is ${head.sizeBytes} bytes; the worker limit is ${this.maxDocumentBytes}.`);
    }
    const bytes = await this.storage.readObject(payload.objectKey);
    if (!bytes) throw new PermanentJobError(`Object ${payload.objectKey} is missing from storage; the upload did not survive.`);

    const checksum = createHash("sha256").update(bytes).digest("hex");
    const [duplicate] = await db
      .select({ id: knowledgeDocuments.id, fileName: knowledgeDocuments.fileName })
      .from(knowledgeDocuments)
      .where(
        and(
          eq(knowledgeDocuments.sourceId, payload.sourceId),
          eq(knowledgeDocuments.checksumSha256, checksum),
          ne(knowledgeDocuments.id, payload.documentId),
        ),
      )
      .limit(1);
    if (duplicate) throw new PermanentJobError(`This file is identical to "${duplicate.fileName}", already on this source.`);

    let parsed;
    try {
      parsed = payload.mimeType === DOCX_MIME ? await this.docxParser.parse(bytes) : await this.pdfParser.parse(bytes);
    } catch (error) {
      throw new PermanentJobError(`Could not read the document: ${(error as Error).message}`);
    }
    const chunks = chunkDocument(parsed);
    if (chunks.length === 0) {
      throw new PermanentJobError("No readable text found. Scanned PDFs need OCR before they can be used as knowledge.");
    }

    await withTransaction(async (tx) => {
      await tx.delete(knowledgeChunks).where(eq(knowledgeChunks.documentId, payload.documentId));
      for (let start = 0; start < chunks.length; start += 200) {
        await tx.insert(knowledgeChunks).values(
          chunks.slice(start, start + 200).map((chunk) => ({
            organizationId: payload.organizationId,
            sourceId: payload.sourceId,
            documentId: payload.documentId,
            ordinal: chunk.ordinal,
            pageNumber: chunk.pageNumber,
            heading: chunk.heading,
            text: chunk.text,
            tokenCount: chunk.tokenCount,
            contentHash: chunk.contentHash,
          })),
        );
      }
      await tx
        .update(knowledgeDocuments)
        .set({
          status: "parsed",
          checksumSha256: checksum,
          pageCount: parsed.pageCount ?? null,
          chunkCount: chunks.length,
          processedAt: new Date(),
          failureReason: null,
          updatedAt: new Date(),
        })
        .where(and(eq(knowledgeDocuments.id, payload.documentId), eq(knowledgeDocuments.version, payload.version)));
    });
    return { processed: true, status: "parsed", chunks: chunks.length };
  }

  // -------------------------------------------------------------------------
  // EMBED: chunks → vectors
  // -------------------------------------------------------------------------

  /**
   * Embeds chunks that have no vector or one from a different model — the
   * second case is how a model switch re-embeds the library. Without an
   * embedder the document stays `parsed`: keyword search still covers it.
   */
  async embed(payload: KnowledgeDocumentJobPayload): Promise<StepResult> {
    const embedder = this.ai.embedder;
    if (!embedder) return { processed: false, status: "parsed", reason: "no embedding provider configured" };
    const db = getDb();
    await this.requireDocument(payload);

    let embedded = 0;
    for (;;) {
      const pending = await db
        .select({ id: knowledgeChunks.id, text: knowledgeChunks.text, heading: knowledgeChunks.heading })
        .from(knowledgeChunks)
        .where(
          and(
            eq(knowledgeChunks.organizationId, payload.organizationId),
            eq(knowledgeChunks.documentId, payload.documentId),
            or(isNull(knowledgeChunks.embedding), ne(knowledgeChunks.embeddingModel, embedder.vendorModel), isNull(knowledgeChunks.embeddingModel)),
          ),
        )
        .orderBy(asc(knowledgeChunks.ordinal))
        .limit(EMBED_BATCH);
      if (pending.length === 0) break;
      const response = await this.ai.router.embed({
        model: KNOWLEDGE_EMBEDDING_MODEL,
        input: pending.map((chunk) => [chunk.heading, chunk.text].filter(Boolean).join("\n")),
        inputType: "document",
      });
      await withTransaction(async (tx) => {
        for (const [index, chunk] of pending.entries()) {
          const vector = response.embeddings[index];
          if (!vector) throw new Error(`Embedding provider returned ${response.embeddings.length} vectors for ${pending.length} inputs.`);
          await tx
            .update(knowledgeChunks)
            .set({ embedding: vector, embeddingModel: embedder.vendorModel, embeddedAt: new Date() })
            .where(eq(knowledgeChunks.id, chunk.id));
        }
      });
      embedded += pending.length;
    }

    await db
      .update(knowledgeDocuments)
      .set({ status: "embedded", updatedAt: new Date() })
      .where(
        and(
          eq(knowledgeDocuments.id, payload.documentId),
          eq(knowledgeDocuments.version, payload.version),
          inArray(knowledgeDocuments.status, ["parsed", "embedded"]),
        ),
      );
    return { processed: true, status: "embedded", embedded };
  }

  // -------------------------------------------------------------------------
  // EXTRACT_CLAIMS: chunks → suggested claims for human review
  // -------------------------------------------------------------------------

  async extractClaims(payload: KnowledgeDocumentJobPayload): Promise<StepResult> {
    const db = getDb();
    await this.requireDocument(payload);
    const [source] = await db
      .select()
      .from(knowledgeSources)
      .where(and(eq(knowledgeSources.organizationId, payload.organizationId), eq(knowledgeSources.id, payload.sourceId)));
    if (!source || source.lifecycleStatus === "ARCHIVED") return { processed: false, status: "source-unavailable" };

    const chunks = await db
      .select({
        id: knowledgeChunks.id,
        ordinal: knowledgeChunks.ordinal,
        pageNumber: knowledgeChunks.pageNumber,
        heading: knowledgeChunks.heading,
        text: knowledgeChunks.text,
      })
      .from(knowledgeChunks)
      .where(and(eq(knowledgeChunks.organizationId, payload.organizationId), eq(knowledgeChunks.documentId, payload.documentId)))
      .orderBy(asc(knowledgeChunks.ordinal));
    if (chunks.length === 0) return { processed: false, status: "no-chunks" };

    let extracted: ExtractedClaim[] = [];
    let extractor = "heuristic";
    if (this.ai.canComplete) {
      extractor = KNOWLEDGE_EXTRACT_MODEL;
      for (const window of extractionWindows(chunks)) {
        const response = await this.ai.router.complete({
          model: KNOWLEDGE_EXTRACT_MODEL,
          messages: buildExtractionMessages(source.name, window),
          temperature: 0,
          maxTokens: 1_500,
        });
        extracted.push(...mapExtractedClaims(window, parseExtractionResponse(extractJson(response.content))));
      }
    } else {
      extracted = heuristicClaims(chunks);
    }

    // Dedupe against everything the source already has — including REJECTED
    // suggestions, so a reviewer's "no" is remembered across re-processing.
    const existing = await db
      .select({ label: knowledgeClaims.label, value: knowledgeClaims.value })
      .from(knowledgeClaims)
      .where(eq(knowledgeClaims.sourceId, payload.sourceId));
    const seen = new Set(existing.map((claim) => claimKey(claim.label, claim.value)));
    const fresh: ExtractedClaim[] = [];
    for (const claim of extracted) {
      const key = claimKey(claim.label, claim.value);
      if (seen.has(key)) continue;
      seen.add(key);
      fresh.push(claim);
      if (fresh.length >= MAX_SUGGESTED_CLAIMS_PER_DOCUMENT) break;
    }

    if (fresh.length > 0) {
      await db.insert(knowledgeClaims).values(
        fresh.map((claim) => ({
          sourceId: payload.sourceId,
          label: claim.label,
          value: claim.value,
          confidence: Math.max(0, Math.min(1, claim.confidence)).toFixed(3),
          status: "SUGGESTED" as const,
          origin: "extracted" as const,
          documentId: payload.documentId,
          chunkId: claim.chunkId,
        })),
      );
      const recipient = source.ownerId ?? payload.actorId;
      if (recipient && (await inAppEnabled(db, payload.organizationId, "Knowledge"))) {
        await insertNotificationOnce(db, {
          organizationId: payload.organizationId,
          userId: recipient,
          category: "Knowledge",
          severity: "info",
          title: `${fresh.length} suggested claim${fresh.length === 1 ? "" : "s"} to review`,
          detail: `Extracted from a document on ${source.name}. Accept the accurate ones to make them citable.`,
          relatedEntityType: "knowledge_source",
          relatedEntityId: source.id,
        });
      }
    }
    return { processed: true, status: "claims-suggested", suggested: fresh.length, extractor };
  }

  // -------------------------------------------------------------------------
  // DETECT_CONFLICTS: same question, different answer, across ACTIVE sources
  // -------------------------------------------------------------------------

  /**
   * Candidate pairs come from pg_trgm label similarity in SQL (indexed, and
   * it catches "Encryption at rest" vs "Data encryption at rest"); the value
   * comparison that decides whether they actually disagree is valuesConflict.
   * Conflicts are keyed on the claim pair, so re-running never duplicates one
   * and a conflict a human resolved is not reopened for the same values.
   */
  async detectConflicts(payload: KnowledgeConflictJobPayload): Promise<StepResult> {
    const db = getDb();
    const [source] = await db
      .select()
      .from(knowledgeSources)
      .where(and(eq(knowledgeSources.organizationId, payload.organizationId), eq(knowledgeSources.id, payload.sourceId)));
    if (!source || source.lifecycleStatus !== "ACTIVE") return { processed: false, status: "source-not-active" };

    const claims = await db
      .select()
      .from(knowledgeClaims)
      .where(
        and(
          eq(knowledgeClaims.sourceId, payload.sourceId),
          eq(knowledgeClaims.status, "ACTIVE"),
          payload.claimIds.length > 0 ? inArray(knowledgeClaims.id, payload.claimIds) : undefined,
        ),
      );

    const semanticModel = await this.ensureLabelEmbeddings(payload.organizationId);

    let created = 0;
    const notifyOwners = new Set<string>();
    for (const claim of claims) {
      const matches = await this.conflictCandidates(payload, claim.id, claim.label, semanticModel);

      for (const match of matches) {
        if (!valuesConflict(claim.value, match.value)) continue;
        const pairKey = conflictPairKey(claim.id, match.id);
        const [existing] = await db
          .select({ id: knowledgeConflicts.id })
          .from(knowledgeConflicts)
          .where(eq(knowledgeConflicts.pairKey, pairKey))
          .limit(1);
        if (existing) continue;

        const recommendation = recommendConflictSide(
          { claimId: claim.id, sourceName: source.name, value: claim.value, authority: source.authority, lastVerified: source.lastVerified },
          { claimId: match.id, sourceName: match.source_name, value: match.value, authority: match.authority, lastVerified: match.last_verified },
        );
        await withTransaction(async (tx) => {
          const [conflict] = await tx
            .insert(knowledgeConflicts)
            .values({
              sourceId: source.id,
              topic: claim.label,
              recommended: `Use "${recommendation.keep.value}" (${recommendation.reason}).`,
              action: `Update or retire "${recommendation.retire.value}" in ${recommendation.retire.sourceName} so tenders cite one answer.`,
              pairKey,
              detectedBy: "engine",
            })
            .onConflictDoNothing()
            .returning();
          if (!conflict) return;
          await tx.insert(knowledgeConflictVariants).values([
            { conflictId: conflict.id, label: source.name, value: claim.value },
            { conflictId: conflict.id, label: match.source_name, value: match.value },
          ]);
          created += 1;
        });
        if (source.ownerId) notifyOwners.add(source.ownerId);
        if (match.owner_id) notifyOwners.add(match.owner_id);
      }
    }

    if (created > 0 && (await inAppEnabled(db, payload.organizationId, "Knowledge"))) {
      for (const userId of notifyOwners) {
        await insertNotificationOnce(db, {
          organizationId: payload.organizationId,
          userId,
          category: "Knowledge",
          severity: "warning",
          title: "Conflicting knowledge detected",
          detail: `${source.name} disagrees with other sources on ${created} point${created === 1 ? "" : "s"}. Tenders could cite either answer.`,
          relatedEntityType: "knowledge_source",
          relatedEntityId: source.id,
        });
      }
    }
    return { processed: true, status: "conflicts-checked", created };
  }

  /**
   * Candidate claims answering the same question: labels spelled alike
   * (pg_trgm, always available) plus labels that mean the same thing (label
   * embeddings, when an embedder is configured). Merged and de-duplicated.
   */
  private async conflictCandidates(
    payload: KnowledgeConflictJobPayload,
    claimId: string,
    label: string,
    semanticModel: string | null,
  ): Promise<ConflictCandidate[]> {
    const db = getDb();
    const lexical = (await db.execute(sql`
      select c.id, c.label, c.value, s.id as source_id, s.name as source_name, s.authority, s.last_verified, s.owner_id
      from knowledge_claims c
      join knowledge_sources s on s.id = c.source_id
      where s.organization_id = ${payload.organizationId}
        and s.lifecycle_status = 'ACTIVE'
        and c.status = 'ACTIVE'
        and c.source_id <> ${payload.sourceId}
        and similarity(lower(c.label), lower(${label})) >= ${LABEL_SIMILARITY}
      order by similarity(lower(c.label), lower(${label})) desc
      limit 10`)) as unknown as ConflictCandidate[];
    if (!semanticModel) return lexical;

    const semantic = (await db.execute(sql`
      select c.id, c.label, c.value, s.id as source_id, s.name as source_name, s.authority, s.last_verified, s.owner_id
      from knowledge_claims target
      join knowledge_claims c on c.id <> target.id
      join knowledge_sources s on s.id = c.source_id
      where target.id = ${claimId}
        and target.label_embedding is not null
        and target.label_embedding_model = ${semanticModel}
        and s.organization_id = ${payload.organizationId}
        and s.lifecycle_status = 'ACTIVE'
        and c.status = 'ACTIVE'
        and c.source_id <> ${payload.sourceId}
        and c.label_embedding is not null
        and c.label_embedding_model = ${semanticModel}
        and 1 - (c.label_embedding <=> target.label_embedding) >= ${SEMANTIC_LABEL_SIMILARITY}
      order by c.label_embedding <=> target.label_embedding
      limit 10`)) as unknown as ConflictCandidate[];

    const merged = new Map<string, ConflictCandidate>();
    for (const candidate of [...lexical, ...semantic]) merged.set(candidate.id, candidate);
    return [...merged.values()];
  }

  /**
   * Embeds the labels of ACTIVE claims on ACTIVE sources that have no label
   * embedding (or one from another model). Returns the model semantic
   * matching can use, or null without an embedder or if embedding fails —
   * conflict detection then runs on trigram matching alone.
   */
  private async ensureLabelEmbeddings(organizationId: string): Promise<string | null> {
    const embedder = this.ai.embedder;
    if (!embedder) return null;
    const db = getDb();
    try {
      const pending = (await db.execute(sql`
        select c.id, c.label
        from knowledge_claims c
        join knowledge_sources s on s.id = c.source_id
        where s.organization_id = ${organizationId}
          and s.lifecycle_status = 'ACTIVE'
          and c.status = 'ACTIVE'
          and (c.label_embedding is null or c.label_embedding_model is distinct from ${embedder.vendorModel})
        limit ${LABEL_EMBED_LIMIT}`)) as unknown as Array<{ id: string; label: string }>;
      for (let start = 0; start < pending.length; start += EMBED_BATCH) {
        const batch = pending.slice(start, start + EMBED_BATCH);
        const response = await this.ai.router.embed({
          model: KNOWLEDGE_EMBEDDING_MODEL,
          input: batch.map((claim) => claim.label),
          inputType: "query",
        });
        await withTransaction(async (tx) => {
          for (const [index, claim] of batch.entries()) {
            const vector = response.embeddings[index];
            if (!vector) continue;
            await tx
              .update(knowledgeClaims)
              .set({ labelEmbedding: vector, labelEmbeddingModel: embedder.vendorModel })
              .where(eq(knowledgeClaims.id, claim.id));
          }
        });
      }
      return embedder.vendorModel;
    } catch {
      return null;
    }
  }

  async recordFailure(payload: KnowledgeDocumentJobPayload, reason: string): Promise<void> {
    await this.setStatus(payload, { status: "failed", failureReason: reason.slice(0, 1_000) });
  }

  private async requireDocument(payload: KnowledgeDocumentJobPayload) {
    const [document] = await getDb()
      .select()
      .from(knowledgeDocuments)
      .where(and(eq(knowledgeDocuments.organizationId, payload.organizationId), eq(knowledgeDocuments.id, payload.documentId)))
      .limit(1);
    if (!document) throw new PermanentJobError(`Knowledge document ${payload.documentId} no longer exists.`);
    return document;
  }

  /** Guarded by version so a superseded run can never overwrite a newer one's status. */
  private async setStatus(
    payload: KnowledgeDocumentJobPayload,
    values: Partial<typeof knowledgeDocuments.$inferInsert>,
  ): Promise<void> {
    await getDb()
      .update(knowledgeDocuments)
      .set({ ...values, updatedAt: new Date() })
      .where(
        and(
          eq(knowledgeDocuments.organizationId, payload.organizationId),
          eq(knowledgeDocuments.id, payload.documentId),
          eq(knowledgeDocuments.version, payload.version),
        ),
      );
  }
}
