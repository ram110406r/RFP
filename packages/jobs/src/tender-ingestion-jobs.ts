export const TENDER_INGESTION_JOBS = {
  SYNC_PORTAL: "TENDER_PORTAL_SYNC",
  RECONCILE_CATALOG: "TENDER_CATALOG_RECONCILE",
  IMPORT_DOCUMENT: "TENDER_NOTICE_DOCUMENT_IMPORT",
} as const;

export type TenderIngestionJobName = (typeof TENDER_INGESTION_JOBS)[keyof typeof TENDER_INGESTION_JOBS];

export interface TenderPortalSyncJobPayload {
  kind: "SYNC_PORTAL";
  portalId: string;
  portalKey: string;
  windowStartedAt: string;
  cursor?: string | null;
  mode?: "HEAD" | "BACKFILL" | "FULL_REFRESH";
  scope?: Record<string, unknown>;
}

export interface TenderCatalogReconcileJobPayload {
  kind: "RECONCILE_CATALOG";
  windowStartedAt: string;
}

export interface TenderNoticeDocumentImportJobPayload {
  kind: "IMPORT_DOCUMENT";
  organizationId: string;
  workspaceId: string;
  tenderId: string;
  noticeDocumentId: string;
  actorId: string | null;
}

export type TenderIngestionJobPayload = TenderPortalSyncJobPayload | TenderCatalogReconcileJobPayload | TenderNoticeDocumentImportJobPayload;

export function tenderIngestionJobId(portalKey: string, windowStartedAt: string, mode = "HEAD") {
  return `${TENDER_INGESTION_JOBS.SYNC_PORTAL}-${portalKey}-${mode}-${windowStartedAt}`;
}

export function tenderCatalogReconcileJobId(windowStartedAt: string) {
  return `${TENDER_INGESTION_JOBS.RECONCILE_CATALOG}-${windowStartedAt}`;
}

export function tenderNoticeDocumentImportJobId(tenderId: string, noticeDocumentId: string) {
  return `${TENDER_INGESTION_JOBS.IMPORT_DOCUMENT}-${tenderId}-${noticeDocumentId}`;
}
