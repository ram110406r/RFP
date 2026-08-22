import { Inject, Injectable } from "@nestjs/common";
import { auditLogs, type Database, type Transaction } from "@rfp-os/db";

import { DATABASE } from "../database";

/**
 * The compliance record for an important business action.
 *
 * `entityType`/`entityId` identify what changed; `previousValue`/`newValue`
 * carry the before/after. Deliberately generic — audit is a platform service,
 * not an RFP one, so later domains write through this same seam rather than
 * inventing their own table.
 */
export interface AuditEntry {
  organizationId: string;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  previousValue?: unknown;
  newValue?: unknown;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Writes to the existing `audit_logs` table — the one apps/legacy-api already
 * uses. This is a Nest-side entry point onto that table, not a second audit
 * system.
 *
 * Every method takes an optional transaction handle, because an audit row must
 * commit with the change it describes. A business mutation that succeeds while
 * its audit row is rolled back (or vice versa) is exactly the inconsistency
 * the table exists to prevent.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async record(entry: AuditEntry, tx?: Transaction): Promise<void> {
    const executor = tx ?? this.db;
    await executor.insert(auditLogs).values({
      organizationId: entry.organizationId,
      actorId: entry.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      previousValue: entry.previousValue ?? null,
      newValue: entry.newValue ?? null,
      metadata: entry.metadata ?? null,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
    });
  }
}

/**
 * Audit action names for the RFP domain. String constants rather than an enum
 * so the column stays open to other domains, and typo-proof at the call site.
 */
/**
 * Document audit actions.
 *
 * DOWNLOADED is recorded like any mutation even though it changes nothing:
 * a presigned URL hands the raw bytes to whoever holds it, so who asked for
 * one is exactly the question a compliance review will ask.
 */
export const DOCUMENT_AUDIT_ACTIONS = {
  UPLOAD_STARTED: "DOCUMENT_UPLOAD_STARTED",
  UPLOADED: "DOCUMENT_UPLOADED",
  DOWNLOADED: "DOCUMENT_DOWNLOADED",
  ARCHIVED: "DOCUMENT_ARCHIVED",
  VERSION_ADDED: "DOCUMENT_VERSION_ADDED",
} as const;

export const RFP_AUDIT_ACTIONS = {
  CREATED: "RFP_CREATED",
  UPDATED: "RFP_UPDATED",
  ARCHIVED: "RFP_ARCHIVED",
  RESTORED: "RFP_RESTORED",
  DELETED: "RFP_DELETED",
  STATUS_CHANGED: "RFP_STATUS_CHANGED",
  ASSIGNMENT_CREATED: "RFP_ASSIGNMENT_CREATED",
  ASSIGNMENT_REMOVED: "RFP_ASSIGNMENT_REMOVED",
} as const;
