import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, desc, eq, isNull, max, type SQL } from "drizzle-orm";
import {
  documentVersions,
  files,
  orgScope,
  rfpDocuments,
  rfps,
  users,
  type Database,
  type Transaction,
} from "@rfp-os/db";

import { DATABASE } from "../../infrastructure/database";
import type { ListDocumentsInput } from "./dto/document.dto";

type Executor = Database | Transaction;

/**
 * All document data access, and the only place document SQL is written.
 *
 * Like RfpRepository, every method takes `organizationId` first and applies it
 * through `orgScope` — which `rfp_documents` can now do directly, since it
 * carries its own `organization_id` rather than reaching it through a join.
 */
@Injectable()
export class DocumentsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private exec(tx?: Executor): Executor {
    return tx ?? this.db;
  }

  async findById(organizationId: string, documentId: string, tx?: Executor) {
    const [document] = await this.exec(tx)
      .select()
      .from(rfpDocuments)
      .where(and(orgScope(rfpDocuments, organizationId), eq(rfpDocuments.id, documentId)))
      .limit(1);
    return document ?? null;
  }

  /** Document joined to its current file row, for download and completion. */
  async findWithFile(organizationId: string, documentId: string, tx?: Executor) {
    const [row] = await this.exec(tx)
      .select({ document: rfpDocuments, file: files })
      .from(rfpDocuments)
      .leftJoin(files, eq(files.id, rfpDocuments.fileId))
      .where(and(orgScope(rfpDocuments, organizationId), eq(rfpDocuments.id, documentId)))
      .limit(1);
    return row ?? null;
  }

  async listForRfp(organizationId: string, rfpId: string, filters: ListDocumentsInput) {
    const conditions: SQL[] = [orgScope(rfpDocuments, organizationId), eq(rfpDocuments.rfpId, rfpId)];
    if (!filters.includeArchived) conditions.push(isNull(rfpDocuments.archivedAt));
    if (filters.status) conditions.push(eq(rfpDocuments.status, filters.status));

    const where = and(...conditions);
    const offset = (filters.page - 1) * filters.pageSize;

    const [items, [totals]] = await Promise.all([
      this.db
        .select({ document: rfpDocuments, uploadedByName: users.name })
        .from(rfpDocuments)
        .leftJoin(users, eq(users.id, rfpDocuments.uploadedBy))
        .where(where)
        .orderBy(desc(rfpDocuments.createdAt))
        .limit(filters.pageSize)
        .offset(offset),
      this.db.select({ total: count() }).from(rfpDocuments).where(where),
    ]);

    return { items, total: totals?.total ?? 0 };
  }

  /** Confirms an RFP exists in this tenant before documents are hung off it. */
  async rfpExists(organizationId: string, rfpId: string, tx?: Executor): Promise<boolean> {
    const [rfp] = await this.exec(tx)
      .select({ id: rfps.id })
      .from(rfps)
      .where(and(orgScope(rfps, organizationId), eq(rfps.id, rfpId)))
      .limit(1);
    return rfp !== undefined;
  }

  async insertFile(values: typeof files.$inferInsert, tx?: Executor) {
    const [created] = await this.exec(tx).insert(files).values(values).returning();
    return created ?? null;
  }

  async insertDocument(values: typeof rfpDocuments.$inferInsert, tx?: Executor) {
    const [created] = await this.exec(tx).insert(rfpDocuments).values(values).returning();
    return created ?? null;
  }

  async updateDocument(
    organizationId: string,
    documentId: string,
    values: Partial<typeof rfpDocuments.$inferInsert>,
    tx?: Executor,
  ) {
    const [updated] = await this.exec(tx)
      .update(rfpDocuments)
      .set({ ...values, updatedAt: new Date() })
      .where(and(orgScope(rfpDocuments, organizationId), eq(rfpDocuments.id, documentId)))
      .returning();
    return updated ?? null;
  }

  async insertVersion(values: typeof documentVersions.$inferInsert, tx?: Executor) {
    const [created] = await this.exec(tx).insert(documentVersions).values(values).returning();
    return created ?? null;
  }

  /**
   * The next version number for a document.
   *
   * Read inside the caller's transaction so it is consistent with the insert
   * that follows; the unique index on (document_id, version) is what actually
   * prevents two concurrent uploads from claiming the same number, turning a
   * race into a constraint violation rather than a duplicate.
   */
  async nextVersionNumber(
    organizationId: string,
    documentId: string,
    tx?: Executor,
  ): Promise<number> {
    const [row] = await this.exec(tx)
      .select({ highest: max(documentVersions.version) })
      .from(documentVersions)
      .where(
        and(
          orgScope(documentVersions, organizationId),
          eq(documentVersions.documentId, documentId),
        ),
      );
    return (row?.highest ?? 0) + 1;
  }

  async listVersions(organizationId: string, documentId: string) {
    return this.db
      .select({
        id: documentVersions.id,
        version: documentVersions.version,
        note: documentVersions.note,
        fileId: documentVersions.fileId,
        filename: files.filename,
        sizeBytes: files.sizeBytes,
        mimeType: files.mimeType,
        createdAt: documentVersions.createdAt,
        createdBy: documentVersions.createdBy,
        createdByName: users.name,
      })
      .from(documentVersions)
      .innerJoin(files, eq(files.id, documentVersions.fileId))
      .leftJoin(users, eq(users.id, documentVersions.createdBy))
      .where(
        and(
          orgScope(documentVersions, organizationId),
          eq(documentVersions.documentId, documentId),
        ),
      )
      .orderBy(asc(documentVersions.version));
  }

  /**
   * Finds an existing file by content hash within the tenant.
   *
   * Re-uploading identical bytes is common (a corrected covering letter in an
   * otherwise unchanged pack), and this is what lets the parse worker skip
   * work it has already done rather than re-extracting the same text.
   */
  async findFileByChecksum(organizationId: string, checksum: string, tx?: Executor) {
    const [file] = await this.exec(tx)
      .select()
      .from(files)
      .where(and(orgScope(files, organizationId), eq(files.checksumSha256, checksum)))
      .limit(1);
    return file ?? null;
  }
}
