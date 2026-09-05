import { createHash } from "node:crypto";

export type NoticeStatus = "ACTIVE" | "CLOSED" | "CANCELLED" | "AWARDED" | "EXPIRED" | "UNKNOWN";

export interface ConnectorDocument {
  key: string;
  name: string;
  url: string;
  mimeType?: string | null;
  access?: "DIRECT" | "EXTERNAL" | "AUTHENTICATED";
  metadata?: Record<string, unknown>;
}

export interface ConnectorNotice {
  sourceNoticeKey: string;
  title: string;
  referenceNumber?: string | null;
  description?: string;
  buyerName?: string | null;
  authorityType?: string | null;
  location?: string | null;
  state?: string | null;
  category?: string | null;
  procurementType?: string | null;
  publishedAt?: string | null;
  bidStartsAt?: string | null;
  deadlineAt?: string | null;
  opensAt?: string | null;
  estimatedValue?: number | null;
  currency?: string;
  emdAmount?: number | null;
  documentFee?: number | null;
  status?: NoticeStatus;
  sourceUrl: string;
  sourceUpdatedAt?: string | null;
  documents?: ConnectorDocument[];
  metadata?: Record<string, unknown>;
  raw: Record<string, unknown>;
}

export interface ConnectorPage {
  items: ConnectorNotice[];
  nextCursor: string | null;
}

export interface TenderConnector {
  fetchPage(cursor?: string | null): Promise<ConnectorPage>;
}

export function connectorForPortal(metadata: Record<string, unknown>): TenderConnector {
  const feedUrl = typeof metadata.feedUrl === "string" ? metadata.feedUrl : null;
  if (!feedUrl) throw new Error("No verified official feed URL is configured for this portal.");
  return new JsonFeedConnector(feedUrl);
}

class JsonFeedConnector implements TenderConnector {
  constructor(private readonly feedUrl: string) {}

  async fetchPage(cursor?: string | null): Promise<ConnectorPage> {
    const url = new URL(this.feedUrl);
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "TENDYY-TenderDiscovery/1.0" } });
    if (!response.ok) throw new Error(`Official feed returned HTTP ${response.status}.`);
    const payload = await response.json() as { items?: unknown; nextCursor?: unknown };
    if (!Array.isArray(payload.items)) throw new Error("Official feed response does not contain an items array.");
    return {
      items: payload.items.map((item) => normalizeOfficialFeedItem(item)),
      nextCursor: typeof payload.nextCursor === "string" && payload.nextCursor ? payload.nextCursor : null,
    };
  }
}

export function normalizeOfficialFeedItem(value: unknown): ConnectorNotice {
  if (!value || typeof value !== "object") throw new Error("Tender feed item must be an object.");
  const raw = value as Record<string, unknown>;
  const sourceNoticeKey = requiredString(raw.sourceNoticeKey, "sourceNoticeKey");
  const title = requiredString(raw.title, "title");
  const sourceUrl = requiredUrl(raw.sourceUrl, "sourceUrl");
  const status = typeof raw.status === "string" && ["ACTIVE", "CLOSED", "CANCELLED", "AWARDED", "EXPIRED", "UNKNOWN"].includes(raw.status.toUpperCase())
    ? raw.status.toUpperCase() as NoticeStatus
    : "UNKNOWN";
  return {
    sourceNoticeKey,
    title,
    referenceNumber: optionalString(raw.referenceNumber),
    description: optionalString(raw.description) ?? "",
    buyerName: optionalString(raw.buyerName),
    authorityType: optionalString(raw.authorityType),
    location: optionalString(raw.location),
    state: optionalString(raw.state),
    category: optionalString(raw.category),
    procurementType: optionalString(raw.procurementType),
    publishedAt: optionalDate(raw.publishedAt),
    bidStartsAt: optionalDate(raw.bidStartsAt),
    deadlineAt: optionalDate(raw.deadlineAt),
    opensAt: optionalDate(raw.opensAt),
    estimatedValue: optionalNumber(raw.estimatedValue),
    currency: optionalString(raw.currency)?.toUpperCase() ?? "INR",
    emdAmount: optionalNumber(raw.emdAmount),
    documentFee: optionalNumber(raw.documentFee),
    status,
    sourceUrl,
    sourceUpdatedAt: optionalDate(raw.sourceUpdatedAt),
    documents: normalizeDocuments(raw.documents),
    metadata: typeof raw.metadata === "object" && raw.metadata ? raw.metadata as Record<string, unknown> : {},
    raw,
  };
}

export function canonicalNoticeKey(item: ConnectorNotice) {
  const exact = [item.buyerName, item.referenceNumber].map(normalizeKeyPart).filter(Boolean).join("|");
  const fallback = [item.title, item.deadlineAt?.slice(0, 10)].map(normalizeKeyPart).filter(Boolean).join("|");
  return createHash("sha256").update(exact || fallback || item.sourceNoticeKey).digest("hex");
}

export function payloadHash(raw: Record<string, unknown>) {
  return createHash("sha256").update(stableJson(raw)).digest("hex");
}

function normalizeDocuments(value: unknown): ConnectorDocument[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    const key = optionalString(row.key);
    const name = optionalString(row.name);
    const url = optionalString(row.url);
    if (!key || !name || !url || !isUrl(url)) return [];
    const access = optionalString(row.access)?.toUpperCase();
    return [{ key, name, url, mimeType: optionalString(row.mimeType), access: access === "DIRECT" || access === "AUTHENTICATED" ? access : "EXTERNAL", metadata: typeof row.metadata === "object" && row.metadata ? row.metadata as Record<string, unknown> : {} }];
  });
}

function requiredString(value: unknown, field: string) { const result = optionalString(value); if (!result) throw new Error(`Tender feed item is missing ${field}.`); return result; }
function requiredUrl(value: unknown, field: string) { const result = requiredString(value, field); if (!isUrl(result)) throw new Error(`Tender feed item ${field} must be an absolute URL.`); return result; }
function optionalString(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function optionalNumber(value: unknown) { const result = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/[₹,\s]/g, "")) : NaN; return Number.isFinite(result) && result >= 0 ? result : null; }
function optionalDate(value: unknown) { const raw = optionalString(value); if (!raw) return null; const date = new Date(raw); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function normalizeKeyPart(value: string | null | undefined) { return (value ?? "").normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(limited|ltd)\b/g, " ").replace(/\s+/g, " ").trim(); }
function isUrl(value: string) { try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:"; } catch { return false; } }
function stableJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`; return JSON.stringify(value); }
