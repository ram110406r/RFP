import {
  requirementCandidateSources,
  requirementCandidates,
  requirementExtractions,
  getDb,
  withTransaction,
  type Database,
  type Transaction,
} from "@rfp-os/db";
import { and, eq } from "drizzle-orm";

export interface RequirementCandidateSourceInput {
  sourceIndex: number;
  sourceKind: "page" | "table" | "block";
  documentPageId?: string | null;
  documentTableId?: string | null;
  documentBlockId?: string | null;
  excerpt: string;
  rowIndex?: number | null;
  columnIndex?: number | null;
}

export interface RequirementCandidateInput {
  candidateIndex: number;
  candidateType:
    | "explicit_requirement"
    | "acceptance_criteria"
    | "deliverable"
    | "deadline"
    | "constraint"
    | "qualification"
    | "evaluation_criterion"
    | "question";
  category: "Security" | "Commercial" | "Compliance" | "Product" | "Legal" | "Architecture" | "Support" | null;
  mandatory: boolean;
  title: string;
  originalText: string;
  normalizedText: string;
  confidence: number;
  extractionMethod: "deterministic";
  status: "extracted";
  sources: RequirementCandidateSourceInput[];
}

export interface RequirementExtractionInput {
  organizationId: string;
  rfpId: string;
  documentId: string;
  version: number;
  documentExtractionId: string;
}

export interface RequirementExtractionRun {
  id: string;
  status: "pending" | "processing" | "succeeded" | "failed";
  documentExtractionId: string;
}

type Executor = Database | Transaction;

export class RequirementExtractionRepository {
  async markProcessing(input: RequirementExtractionInput, tx?: Executor): Promise<RequirementExtractionRun> {
    if (tx) return this.markProcessingInTransaction(tx, input);
    return withTransaction((managed) => this.markProcessingInTransaction(managed, input));
  }

  async saveSuccess(
    input: RequirementExtractionInput,
    extractor: string,
    candidates: RequirementCandidateInput[],
    tx?: Executor,
  ): Promise<RequirementExtractionRun> {
    if (tx) return this.saveSuccessInTransaction(tx, input, extractor, candidates);
    return withTransaction((managed) => this.saveSuccessInTransaction(managed, input, extractor, candidates));
  }

  async saveFailure(
    input: RequirementExtractionInput,
    extractor: string,
    reason: string,
    tx?: Executor,
  ): Promise<RequirementExtractionRun> {
    if (tx) return this.saveFailureInTransaction(tx, input, extractor, reason);
    return withTransaction((managed) => this.saveFailureInTransaction(managed, input, extractor, reason));
  }

  async findByDocumentExtraction(
    organizationId: string,
    documentExtractionId: string,
    tx?: Executor,
  ): Promise<RequirementExtractionRun | null> {
    const db = tx ?? getDb();
    const [row] = await db
      .select({
        id: requirementExtractions.id,
        status: requirementExtractions.status,
        documentExtractionId: requirementExtractions.documentExtractionId,
      })
      .from(requirementExtractions)
      .where(
        and(
          eq(requirementExtractions.organizationId, organizationId),
          eq(requirementExtractions.documentExtractionId, documentExtractionId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  private async markProcessingInTransaction(
    tx: Executor,
    input: RequirementExtractionInput,
  ): Promise<RequirementExtractionRun> {
    const [row] = await tx
      .insert(requirementExtractions)
      .values({
        organizationId: input.organizationId,
        rfpId: input.rfpId,
        documentId: input.documentId,
        documentExtractionId: input.documentExtractionId,
        status: "processing",
        extractor: "deterministic@1",
        startedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [requirementExtractions.documentExtractionId],
        set: {
          rfpId: input.rfpId,
          documentId: input.documentId,
          status: "processing",
          extractor: "deterministic@1",
          failureReason: null,
          completedAt: null,
          updatedAt: new Date(),
        },
      })
      .returning({ id: requirementExtractions.id, status: requirementExtractions.status, documentExtractionId: requirementExtractions.documentExtractionId });

    if (!row) throw new Error("Failed to record requirement extraction run.");
    return row;
  }

  private async saveSuccessInTransaction(
    tx: Executor,
    input: RequirementExtractionInput,
    extractor: string,
    candidates: RequirementCandidateInput[],
  ): Promise<RequirementExtractionRun> {
    const [run] = await tx
      .insert(requirementExtractions)
      .values({
        organizationId: input.organizationId,
        rfpId: input.rfpId,
        documentId: input.documentId,
        documentExtractionId: input.documentExtractionId,
        status: "succeeded",
        extractor,
        failureReason: null,
        completedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [requirementExtractions.documentExtractionId],
        set: {
          rfpId: input.rfpId,
          documentId: input.documentId,
          status: "succeeded",
          extractor,
          failureReason: null,
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning({ id: requirementExtractions.id, status: requirementExtractions.status, documentExtractionId: requirementExtractions.documentExtractionId });

    if (!run) throw new Error("Failed to record requirement extraction run.");

    await tx.delete(requirementCandidates).where(eq(requirementCandidates.extractionId, run.id));

    for (const candidate of candidates) {
      const [inserted] = await tx
        .insert(requirementCandidates)
        .values({
          extractionId: run.id,
          organizationId: input.organizationId,
          rfpId: input.rfpId,
          documentId: input.documentId,
          documentVersion: input.version,
          candidateIndex: candidate.candidateIndex,
          candidateType: candidate.candidateType,
          category: candidate.category,
          mandatory: candidate.mandatory,
          title: candidate.title,
          originalText: candidate.originalText,
          normalizedText: candidate.normalizedText,
          confidence: String(candidate.confidence),
          extractionMethod: candidate.extractionMethod,
          status: candidate.status,
          projectedRequirementId: null,
          updatedAt: new Date(),
        } as typeof requirementCandidates.$inferInsert)
        .returning({ id: requirementCandidates.id });

      if (!inserted) throw new Error("Failed to record requirement candidate.");

      if (candidate.sources.length) {
        await tx.insert(requirementCandidateSources).values(
          candidate.sources.map((source) => ({
            candidateId: inserted.id,
            sourceIndex: source.sourceIndex,
            sourceKind: source.sourceKind,
            documentPageId: source.documentPageId ?? null,
            documentTableId: source.documentTableId ?? null,
            documentBlockId: source.documentBlockId ?? null,
            excerpt: source.excerpt,
            rowIndex: source.rowIndex ?? null,
            columnIndex: source.columnIndex ?? null,
          })),
        );
      }
    }

    return run;
  }

  private async saveFailureInTransaction(
    tx: Executor,
    input: RequirementExtractionInput,
    extractor: string,
    reason: string,
  ): Promise<RequirementExtractionRun> {
    const [run] = await tx
      .insert(requirementExtractions)
      .values({
        organizationId: input.organizationId,
        rfpId: input.rfpId,
        documentId: input.documentId,
        documentExtractionId: input.documentExtractionId,
        status: "failed",
        extractor,
        failureReason: reason,
        completedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [requirementExtractions.documentExtractionId],
        set: {
          rfpId: input.rfpId,
          documentId: input.documentId,
          status: "failed",
          extractor,
          failureReason: reason,
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning({ id: requirementExtractions.id, status: requirementExtractions.status, documentExtractionId: requirementExtractions.documentExtractionId });

    if (!run) throw new Error("Failed to record requirement extraction failure.");
    await tx.delete(requirementCandidates).where(eq(requirementCandidates.extractionId, run.id));
    return run;
  }
}
