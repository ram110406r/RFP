import { getDb, rfpDocuments, withTransaction } from "@rfp-os/db";
import { and, eq, isNull } from "drizzle-orm";
import { DOCUMENT_JOBS, type DocumentJobName, type DocumentJobPayload } from "@rfp-os/jobs";
import type { ObjectStorage } from "@rfp-os/storage";

import { ExtractionRepository } from "./extraction.repository";
import { contradictsDeclaredType, SNIFF_LENGTH, sniffFormat } from "./magic-bytes";
import { DocxDocumentParser } from "./docx-document-parser";
import { PdfDocumentParser } from "./pdf-document-parser";

/**
 * Raised for a failure that retrying cannot fix — a missing object, a file
 * whose content contradicts its declaration. BullMQ retries every throw, so
 * without this distinction a corrupt upload would burn all three attempts and
 * take fifteen seconds of backoff to reach the same conclusion.
 */
export class PermanentJobError extends Error {
  readonly permanent = true;
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}

export function isPermanent(error: unknown): boolean {
  return error instanceof PermanentJobError;
}

export interface ProcessResult {
  /** False when the document was already past this stage. */
  processed: boolean;
  status: string;
}

/**
 * Handles the document processing jobs.
 *
 * Phase 6A deliberately stops short of extraction: this verifies that the
 * bytes exist, that they are what the client said they were, and drives the
 * document through its status transitions. Phase 6C fills in real text and
 * table extraction behind the same job names, so nothing here changes shape.
 *
 * Every query is scoped by organizationId from the payload. The worker runs
 * outside any request context — there is no guard above it — so a query that
 * matched on documentId alone would be the one place in the system where a
 * tenant boundary is not enforced.
 */
export class DocumentProcessor {
  constructor(
    private readonly storage: ObjectStorage,
    private readonly parser: PdfDocumentParser = new PdfDocumentParser(),
    private readonly docxParser: DocxDocumentParser = new DocxDocumentParser(),
    private readonly extractions: ExtractionRepository = new ExtractionRepository(),
  ) {}

  async process(name: DocumentJobName, payload: DocumentJobPayload): Promise<ProcessResult> {
    switch (name) {
      case DOCUMENT_JOBS.PARSE:
        return this.parse(payload);
      /*
       * Declared in the contract because the pipeline is specified in terms of
       * them, but not yet implemented. Failing loudly beats silently
       * succeeding: a job that returns ok without doing anything would leave a
       * document marked ready with no content behind it.
       */
      case DOCUMENT_JOBS.OCR:
      case DOCUMENT_JOBS.TABLE_EXTRACTION:
      case DOCUMENT_JOBS.NORMALIZATION:
        throw new PermanentJobError(`${name} is not implemented until Phase 6C.`);
      default:
        throw new PermanentJobError(`Unknown document job ${name}.`);
    }
  }

  private async parse(payload: DocumentJobPayload): Promise<ProcessResult> {
    const db = getDb();
    const { organizationId, documentId } = payload;

    const [document] = await db
      .select()
      .from(rfpDocuments)
      .where(and(eq(rfpDocuments.organizationId, organizationId), eq(rfpDocuments.id, documentId)))
      .limit(1);

    if (!document) {
      throw new PermanentJobError(`Document ${documentId} no longer exists in this organization.`);
    }

    /*
     * Idempotency at the data level, not just the queue's.
     *
     * The stable job id stops a duplicate enqueue, but a job can still run
     * twice: BullMQ redelivers when a worker dies mid-job, having already
     * committed its side effects. Re-reading the row and skipping work that is
     * already done is what makes that redelivery harmless.
     */
    const currentPayload = this.matchesCurrentVersion(document, payload);
    if (currentPayload && (document.status === "parsed" || document.status === "ready" || document.status === "failed")) {
      return { processed: false, status: document.status };
    }
    if (document.archivedAt) {
      throw new PermanentJobError(`Document ${documentId} was archived before processing.`);
    }

    if (currentPayload) {
      await this.setStatusIfCurrent(payload, "processing", null);
    }

    const prefix = await this.storage.readObjectPrefix(payload.objectKey, SNIFF_LENGTH);
    if (!prefix) {
      throw new PermanentJobError(
        `Object ${payload.objectKey} is missing from storage; the upload did not survive.`,
      );
    }

    const sniffed = sniffFormat(prefix);
    if (contradictsDeclaredType(sniffed, payload.mimeType)) {
      throw new PermanentJobError(
        `Content is ${sniffed} but the upload declared ${payload.mimeType}.`,
      );
    }

    const bytes = await this.storage.readObject(payload.objectKey);
    if (!bytes) {
      throw new PermanentJobError(
        `Object ${payload.objectKey} is missing from storage; the upload did not survive.`,
      );
    }

    const parser = this.selectParser(document.type);
    if (!parser) {
      throw new PermanentJobError(`Document type ${document.type} is not supported for extraction yet.`);
    }

    let parsed;
    try {
      parsed = await parser.parse(bytes);
    } catch (error) {
      throw new PermanentJobError(
        `Failed to parse ${document.type} ${payload.objectKey}: ${(error as Error).message}`,
      );
    }

    /*
     * `parsed`, not `ready`. The status enum separates the two, and Phase 6C's
     * requirement extraction is what earns `ready` - claiming it here would
     * tell the UI a document is usable when nothing has been read out of it.
     */
    await withTransaction(async (tx) => {
      const blocks = normalizeBlocks(parsed.blocks);
      await this.extractions.saveSuccess(
        {
          organizationId,
          documentId,
          version: payload.version,
        },
        {
          extractor: parsed.extractor,
          pages: parsed.pages,
          tables: parsed.tables,
          blocks,
        },
        tx,
      );

      await tx
        .update(rfpDocuments)
        .set({
          status: "parsed",
          pageCount: parsed.pageCount,
          failureReason: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(rfpDocuments.organizationId, organizationId),
            eq(rfpDocuments.id, documentId),
            eq(rfpDocuments.currentVersion, payload.version),
            eq(rfpDocuments.fileId, payload.fileId),
            isNull(rfpDocuments.archivedAt),
          ),
        );
    });
    return { processed: true, status: "parsed" };
  }

  private selectParser(documentType: string): PdfDocumentParser | DocxDocumentParser | null {
    switch (documentType) {
      case "PDF":
        return this.parser;
      case "DOCX":
        return this.docxParser;
      default:
        return null;
    }
  }

  /**
   * Records a terminal failure on the document itself.
   *
   * Called only once BullMQ has exhausted its attempts. Marking `failed` on
   * the first of three tries would show a user a broken document that the
   * queue was about to retry successfully.
   */
  async recordFailure(payload: DocumentJobPayload, reason: string): Promise<void> {
    await this.setStatusIfCurrent(payload, "failed", reason);
  }

  private matchesCurrentVersion(document: typeof rfpDocuments.$inferSelect, payload: DocumentJobPayload) {
    return document.currentVersion === payload.version && document.fileId === payload.fileId;
  }

  private async setStatusIfCurrent(
    payload: DocumentJobPayload,
    status: "processing" | "failed",
    failureReason: string | null,
  ): Promise<void> {
    await getDb()
      .update(rfpDocuments)
      .set({ status, failureReason, updatedAt: new Date() })
      .where(
        and(
          eq(rfpDocuments.organizationId, payload.organizationId),
          eq(rfpDocuments.id, payload.documentId),
          eq(rfpDocuments.currentVersion, payload.version),
          eq(rfpDocuments.fileId, payload.fileId),
          isNull(rfpDocuments.archivedAt),
        ),
      );
  }
}

function normalizeBlocks(
  blocks:
    | Array<{
        kind: "heading" | "paragraph" | "listItem" | "table";
        text?: string;
        cells?: string[][];
        headingPath: string[];
        sourceRef: { xmlKind: "w:p" | "w:tbl"; index: number };
      }>
    | undefined,
): Array<{
  kind: "heading" | "paragraph" | "listItem" | "table";
  text: string;
  headingPath: string[];
  sourceRef: { xmlKind: "w:p" | "w:tbl"; index: number };
}> | undefined {
  if (!blocks) return undefined;

  return blocks.map((block) => ({
    kind: block.kind,
    text: block.kind === "table" ? serializeTable(block.cells ?? []) : block.text ?? "",
    headingPath: block.headingPath,
    sourceRef: block.sourceRef,
  }));
}

function serializeTable(cells: string[][]): string {
  return cells.map((row) => row.join("\t")).join("\n");
}
