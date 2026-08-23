import {
  documentExtractions,
  documentPages,
  documentTables,
  getDb,
  withTransaction,
} from "@rfp-os/db";
import { and, asc, eq } from "drizzle-orm";

/**
 * What an extractor produces. Deliberately plain data with no database types,
 * so a Phase 6C extractor can be unit-tested without a connection.
 */
export interface ExtractedPage {
  /** 1-based, in reading order. */
  pageNumber: number;
  /** Human-facing name where the format has one, e.g. "Sheet1". */
  label?: string;
  text: string;
}

export interface ExtractedTable {
  /** Null when the format has no pages, or the table spans several. */
  pageNumber?: number | null;
  caption?: string;
  /** Rows of cells, all text — see the schema comment for why. */
  cells: string[][];
}

export interface ExtractionResult {
  /** Extractor name and version, e.g. "unpdf@0.12". */
  extractor: string;
  pages: ExtractedPage[];
  tables: ExtractedTable[];
}

export interface StoredExtraction {
  id: string;
  status: string;
  pageCount: number | null;
  characterCount: number;
  tableCount: number;
}

/**
 * Persistence for extracted document content.
 *
 * Lives in the worker rather than behind the API because the worker is the
 * only writer: extraction happens in a job, and the API reads this content
 * through its own modules in Phase 6E. Splitting reads and writes across
 * process boundaries here would add a network hop to the hot path of a job
 * that already holds the bytes.
 */
export class ExtractionRepository {
  /**
   * Replaces the extraction for one document version.
   *
   * Delete-then-insert inside a transaction rather than a diff: a re-parse
   * produces a wholly new reading of the bytes, and reconciling page-by-page
   * would leave stale rows behind whenever the new extractor found fewer
   * pages than the old one. The unique constraint on (document_id, version)
   * is what makes the upsert land on the same row each time.
   *
   * The whole replacement is one transaction so a reader never observes an
   * extraction whose pages have been deleted but not yet rewritten.
   */
  async saveSuccess(
    input: {
      organizationId: string;
      documentId: string;
      version: number;
    },
    result: ExtractionResult,
  ): Promise<StoredExtraction> {
    const { organizationId, documentId, version } = input;
    const characterCount = result.pages.reduce((sum, page) => sum + page.text.length, 0);

    return withTransaction(async (tx) => {
      const [extraction] = await tx
        .insert(documentExtractions)
        .values({
          organizationId,
          documentId,
          version,
          extractor: result.extractor,
          status: "succeeded",
          pageCount: result.pages.length,
          characterCount,
          tableCount: result.tables.length,
          failureReason: null,
          completedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [documentExtractions.documentId, documentExtractions.version],
          set: {
            extractor: result.extractor,
            status: "succeeded",
            pageCount: result.pages.length,
            characterCount,
            tableCount: result.tables.length,
            failureReason: null,
            completedAt: new Date(),
            updatedAt: new Date(),
          },
        })
        .returning();

      if (!extraction) throw new Error("Failed to record extraction.");

      /*
       * Children are keyed by extraction id, so clearing them here is scoped
       * to this document version — a sibling version's content is untouched.
       */
      await tx.delete(documentPages).where(eq(documentPages.extractionId, extraction.id));
      await tx.delete(documentTables).where(eq(documentTables.extractionId, extraction.id));

      if (result.pages.length) {
        await tx.insert(documentPages).values(
          result.pages.map((page) => ({
            organizationId,
            extractionId: extraction.id,
            documentId,
            pageNumber: page.pageNumber,
            label: page.label ?? "",
            text: page.text,
            characterCount: page.text.length,
          })),
        );
      }

      if (result.tables.length) {
        await tx.insert(documentTables).values(
          result.tables.map((table, index) => ({
            organizationId,
            extractionId: extraction.id,
            documentId,
            /*
             * Sequential across the extraction rather than per page: the
             * uniqueness constraint has to hold for formats where pageNumber
             * is null, and Postgres treats nulls as distinct.
             */
            tableIndex: index,
            pageNumber: table.pageNumber ?? null,
            caption: table.caption ?? "",
            rowCount: table.cells.length,
            columnCount: table.cells[0]?.length ?? 0,
            cells: table.cells,
          })),
        );
      }

      return {
        id: extraction.id,
        status: extraction.status,
        pageCount: extraction.pageCount,
        characterCount: extraction.characterCount,
        tableCount: extraction.tableCount,
      };
    });
  }

  /**
   * Records that extraction failed for this document version.
   *
   * Any content from a previous successful run is cleared: leaving it in place
   * would mean a document reported as failed still answering reads with text
   * that no longer reflects its bytes.
   */
  async saveFailure(
    input: { organizationId: string; documentId: string; version: number },
    extractor: string,
    reason: string,
  ): Promise<void> {
    const { organizationId, documentId, version } = input;

    await withTransaction(async (tx) => {
      const [extraction] = await tx
        .insert(documentExtractions)
        .values({
          organizationId,
          documentId,
          version,
          extractor,
          status: "failed",
          failureReason: reason,
          completedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [documentExtractions.documentId, documentExtractions.version],
          set: {
            extractor,
            status: "failed",
            pageCount: null,
            characterCount: 0,
            tableCount: 0,
            failureReason: reason,
            completedAt: new Date(),
            updatedAt: new Date(),
          },
        })
        .returning();

      if (!extraction) return;
      await tx.delete(documentPages).where(eq(documentPages.extractionId, extraction.id));
      await tx.delete(documentTables).where(eq(documentTables.extractionId, extraction.id));
    });
  }

  /** The extraction for one document version, or null. Org-scoped. */
  async find(organizationId: string, documentId: string, version: number) {
    const [row] = await getDb()
      .select()
      .from(documentExtractions)
      .where(
        and(
          eq(documentExtractions.organizationId, organizationId),
          eq(documentExtractions.documentId, documentId),
          eq(documentExtractions.version, version),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /** Pages in reading order. Org-scoped, so a wrong tenant reads nothing. */
  async listPages(organizationId: string, extractionId: string) {
    return getDb()
      .select()
      .from(documentPages)
      .where(
        and(
          eq(documentPages.organizationId, organizationId),
          eq(documentPages.extractionId, extractionId),
        ),
      )
      .orderBy(asc(documentPages.pageNumber));
  }

  /** Tables in extraction order. Org-scoped. */
  async listTables(organizationId: string, extractionId: string) {
    return getDb()
      .select()
      .from(documentTables)
      .where(
        and(
          eq(documentTables.organizationId, organizationId),
          eq(documentTables.extractionId, extractionId),
        ),
      )
      .orderBy(asc(documentTables.tableIndex));
  }
}
