import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { files, getDb, tenderDocuments, tenderNoticeDocuments, tenderSources, tenders, withTransaction } from "@rfp-os/db";
import { sniffFormat } from "@rfp-os/document-processing";
import type { TenderNoticeDocumentImportJobPayload } from "@rfp-os/jobs";
import { ObjectStorage, sanitizeFilename, tenderSourceObjectKey } from "@rfp-os/storage";
import { and, eq } from "drizzle-orm";

const MAX_REMOTE_BYTES = 50 * 1024 * 1024;

export class NoticeDocumentImporter {
  private readonly db = getDb();
  constructor(private readonly storage: ObjectStorage) {}

  async import(payload: TenderNoticeDocumentImportJobPayload) {
    const existing = await this.db.select({ id: tenderSources.id }).from(tenderSources).where(and(eq(tenderSources.tenderId, payload.tenderId), eq(tenderSources.discoveryNoticeDocumentId, payload.noticeDocumentId))).limit(1);
    if (existing[0]) return { processed: false, sourceId: existing[0].id };
    const [row] = await this.db.select({ document: tenderNoticeDocuments, tender: tenders }).from(tenderNoticeDocuments).innerJoin(tenders, eq(tenders.discoveryNoticeId, tenderNoticeDocuments.noticeId)).where(and(eq(tenderNoticeDocuments.id, payload.noticeDocumentId), eq(tenders.id, payload.tenderId), eq(tenders.organizationId, payload.organizationId), eq(tenders.workspaceId, payload.workspaceId))).limit(1);
    if (!row) throw new Error("Tender notice document is not linked to this application.");
    if (row.document.access !== "DIRECT") return { processed: false, reason: "Document is not directly downloadable." };

    const response = await fetchPublicDocument(row.document.url);
    if (!response.ok) throw new Error(`Official document returned HTTP ${response.status}.`);
    const declaredSize = Number(response.headers.get("content-length") ?? 0);
    if (declaredSize > MAX_REMOTE_BYTES) throw new Error("Official document exceeds the 50 MB import limit.");
    const bytes = await readLimitedBody(response, MAX_REMOTE_BYTES);
    if (!bytes.length || bytes.length > MAX_REMOTE_BYTES) throw new Error("Official document is empty or exceeds the 50 MB import limit.");
    const format = sniffFormat(bytes.subarray(0, 512));
    if (format !== "PDF" && format !== "ZIP") throw new Error("Official document is not a supported PDF or DOCX file.");
    const mimeType = format === "PDF" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const filename = ensureExtension(sanitizeFilename(row.document.name), format === "PDF" ? ".pdf" : ".docx");
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const sourceId = randomUUID();
    const fileId = randomUUID();
    const objectKey = tenderSourceObjectKey({ organizationId: payload.organizationId, workspaceId: payload.workspaceId, tenderId: payload.tenderId, sourceId, filename });
    await this.storage.putObject({ objectKey, mimeType, bytes });
    try {
      await withTransaction(async (tx) => {
        await tx.insert(files).values({ id: fileId, organizationId: payload.organizationId, bucket: this.storage.bucket, objectKey, filename, mimeType, sizeBytes: bytes.length, checksumSha256: checksum, uploadedBy: payload.actorId });
        const [source] = await tx.insert(tenderSources).values({ id: sourceId, organizationId: payload.organizationId, workspaceId: payload.workspaceId, tenderId: payload.tenderId, discoveryNoticeDocumentId: payload.noticeDocumentId, sourceType: "DOCUMENT", name: row.document.name, externalReference: payload.noticeDocumentId, sourceUrl: row.document.url, fileId, mimeType, fileSize: bytes.length, checksumSha256: checksum, status: "READY", createdBy: payload.actorId, metadata: { importedFromDiscovery: true } }).onConflictDoNothing({ target: [tenderSources.tenderId, tenderSources.discoveryNoticeDocumentId] }).returning();
        if (!source) throw new DuplicateImportError();
        await tx.insert(tenderDocuments).values({ organizationId: payload.organizationId, workspaceId: payload.workspaceId, tenderId: payload.tenderId, tenderSourceId: source.id, documentId: fileId, documentRole: "ATTACHMENT", status: "UPLOADED", metadata: { discoveryNoticeDocumentId: payload.noticeDocumentId } });
      });
    } catch (error) {
      await this.storage.deleteObject(objectKey).catch(() => undefined);
      if (error instanceof DuplicateImportError) {
        const [winner] = await this.db.select({ id: tenderSources.id }).from(tenderSources).where(and(eq(tenderSources.tenderId, payload.tenderId), eq(tenderSources.discoveryNoticeDocumentId, payload.noticeDocumentId))).limit(1);
        if (winner) return { processed: false, sourceId: winner.id };
      }
      throw error;
    }
    return { processed: true, sourceId };
  }
}

export function tenderDiscoveryStorage() {
  return new ObjectStorage({ endpoint: process.env.STORAGE_ENDPOINT, region: process.env.STORAGE_REGION ?? "us-east-1", bucket: process.env.STORAGE_BUCKET ?? "rfp-os-documents", accessKeyId: process.env.STORAGE_ACCESS_KEY_ID, secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY, forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === "true" });
}

function ensureExtension(name: string, extension: string) { return name.toLowerCase().endsWith(extension) ? name : `${name}${extension}`; }

class DuplicateImportError extends Error {}

async function fetchPublicDocument(value: string, redirects = 0): Promise<Response> {
  if (redirects > 4) throw new Error("Official document redirected too many times.");
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Official document URL must use HTTP or HTTPS.");
  await assertPublicHostname(url.hostname);
  const response = await fetch(url, { redirect: "manual", headers: { "user-agent": "TENDYY-TenderDiscovery/1.0" } });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) throw new Error("Official document redirect did not include a location.");
    return fetchPublicDocument(new URL(location, url).toString(), redirects + 1);
  }
  return response;
}

async function assertPublicHostname(hostname: string) {
  if (hostname.toLowerCase() === "localhost") throw new Error("Official document URL resolves to a private host.");
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("Official document URL resolves to a private host.");
}

function isPrivateAddress(address: string) {
  const value = address.toLowerCase();
  if (value === "::1" || value === "0:0:0:0:0:0:0:1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:")) return true;
  const match = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) return false;
  const first = Number(match[1]);
  const second = Number(match[2]);
  return first === 0 || first === 10 || first === 127 || (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168) || first >= 224;
}

async function readLimitedBody(response: Response, limit: number) {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) { await reader.cancel(); throw new Error("Official document exceeds the 50 MB import limit."); }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
