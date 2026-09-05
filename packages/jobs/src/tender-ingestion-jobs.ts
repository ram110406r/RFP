export const TENDER_INGESTION_JOBS = {
  SYNC_PORTAL: "TENDER_PORTAL_SYNC",
  IMPORT_DOCUMENT: "TENDER_NOTICE_DOCUMENT_IMPORT",
} as const;

export type TenderIngestionJobName = (typeof TENDER_INGESTION_JOBS)[keyof typeof TENDER_INGESTION_JOBS];

export interface TenderPortalSyncJobPayload {
  kind: "SYNC_PORTAL";
  portalId: string;
  portalKey: string;
  windowStartedAt: string;
  cursor?: string | null;
}

export interface TenderNoticeDocumentImportJobPayload {
  kind: "IMPORT_DOCUMENT";
  organizationId: string;
  workspaceId: string;
  tenderId: string;
  noticeDocumentId: string;
  actorId: string | null;
}

export type TenderIngestionJobPayload = TenderPortalSyncJobPayload | TenderNoticeDocumentImportJobPayload;

export function tenderIngestionJobId(portalKey: string, windowStartedAt: string) {
  return `${TENDER_INGESTION_JOBS.SYNC_PORTAL}-${portalKey}-${windowStartedAt}`;
}

export function tenderNoticeDocumentImportJobId(tenderId: string, noticeDocumentId: string) {
  return `${TENDER_INGESTION_JOBS.IMPORT_DOCUMENT}-${tenderId}-${noticeDocumentId}`;
}
