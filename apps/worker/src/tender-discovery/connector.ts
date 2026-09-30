import { createHash } from "node:crypto";
import { load } from "cheerio";

import { fetchPublicUrl, fetchWithTimeout, readJsonLimited, readTextLimited } from "../lib/http";

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
  total?: number;
}
export interface ConnectorFetchOptions {
  mode?: "HEAD" | "BACKFILL" | "FULL_REFRESH";
  deadlineFrom?: string;
  deadlineTo?: string;
}
export interface TenderConnector {
  fetchPage(cursor?: string | null, options?: ConnectorFetchOptions): Promise<ConnectorPage>;
}
export interface ConnectorPortal {
  key: string;
  connectorType: string;
  officialUrl: string;
  state?: string | null;
  metadata: Record<string, unknown>;
}

export function connectorForPortal(portal: ConnectorPortal): TenderConnector {
  const feedUrl = typeof portal.metadata.feedUrl === "string" ? portal.metadata.feedUrl : null;
  if (feedUrl) return new JsonFeedConnector(feedUrl);
  const builtIn =
    typeof portal.metadata.builtInConnector === "string"
      ? portal.metadata.builtInConnector
      : portal.connectorType;
  if (builtIn === "GEM") return new GemConnector();
  if (builtIn === "CPPP_LATEST") return new CpppLatestConnector();
  if (builtIn === "GEPNIC_LATEST") return new GepnicLatestConnector(portal);
  throw new Error("No verified official connector is configured for this portal.");
}

class JsonFeedConnector implements TenderConnector {
  constructor(private readonly feedUrl: string) {}
  async fetchPage(cursor?: string | null): Promise<ConnectorPage> {
    const url = new URL(this.feedUrl);
    if (cursor) url.searchParams.set("cursor", cursor);
    // The feed URL is portal configuration, so it gets the same private-host
    // checks as a notice document URL.
    const response = await fetchPublicUrl(url, { headers: { accept: "application/json" } });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`Official feed returned HTTP ${response.status}.`);
    }
    const payload = await readJsonLimited<{ items?: unknown; nextCursor?: unknown }>(response);
    if (!Array.isArray(payload.items))
      throw new Error("Official feed response does not contain an items array.");
    return {
      items: payload.items.map(normalizeOfficialFeedItem),
      nextCursor:
        typeof payload.nextCursor === "string" && payload.nextCursor ? payload.nextCursor : null,
    };
  }
}

const GEM_LIST_URL = "https://bidplus.gem.gov.in/all-bids";
const GEM_DATA_URL = "https://bidplus.gem.gov.in/all-bids-data";
const CPPP_ENTRY_URL = "https://eprocure.gov.in/eprocure/app?service=restart";

export class GemConnector implements TenderConnector {
  private csrfName: string | null = null;
  private csrfValue: string | null = null;
  private cookie = "";

  async fetchPage(cursor?: string | null, options?: ConnectorFetchOptions): Promise<ConnectorPage> {
    if (!this.csrfName || !this.csrfValue) await this.createSession();
    const page = positiveInteger(cursor) ?? 1;
    const requestPayload = {
      param: { searchBid: "", searchType: "fullText" },
      filter: {
        bidStatusType: "ongoing_bids",
        byType: "all",
        highBidValue: "",
        byEndDate: {
          from: gemDate(options?.deadlineFrom),
          to: gemDate(options?.deadlineTo),
        },
        sort: "Bid-Start-Date-Latest",
      },
      page,
    };
    const body = new URLSearchParams({
      payload: JSON.stringify(requestPayload),
      [this.csrfName!]: this.csrfValue!,
    });
    const response = await fetchWithTimeout(GEM_DATA_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        cookie: this.cookie,
        origin: "https://bidplus.gem.gov.in",
        referer: GEM_LIST_URL,
      },
      body,
    });
    if (!response.ok) throw new Error(`GeM public listing returned HTTP ${response.status}.`);
    const responsePayload = await readJsonLimited<Record<string, unknown>>(response);
    const result = objectValue(objectValue(responsePayload.response).response);
    const docs = Array.isArray(result.docs) ? result.docs : [];
    const total = numericValue(result.numFound) ?? 0;
    const start = numericValue(result.start) ?? (page - 1) * 10;
    const items = docs.map(normalizeGemNotice);
    return {
      items,
      nextCursor: items.length > 0 && start + items.length < total ? String(page + 1) : null,
      total,
    };
  }

  private async createSession() {
    const response = await fetchWithTimeout(GEM_LIST_URL, { headers: { accept: "text/html" } });
    if (!response.ok)
      throw new Error(`GeM public listing session returned HTTP ${response.status}.`);
    const html = await readTextLimited(response);
    const name = html.match(/id=["']cname["'][^>]*value=["']([^"']+)["']/i)?.[1];
    const value = html.match(/id=["']chash["'][^>]*value=["']([^"']+)["']/i)?.[1];
    if (!name || !value) throw new Error("GeM public listing did not provide its request token.");
    this.csrfName = name;
    this.csrfValue = value;
    const cookieHeaders = (
      response.headers as Headers & { getSetCookie?: () => string[] }
    ).getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
    this.cookie = cookieHeaders
      .map((entry) => entry.split(";", 1)[0])
      .filter(Boolean)
      .join("; ");
  }
}

export class CpppLatestConnector implements TenderConnector {
  async fetchPage(cursor?: string | null): Promise<ConnectorPage> {
    if (cursor) return { items: [], nextCursor: null };
    const response = await fetchWithTimeout("https://eprocure.gov.in/eprocure/app", {
      headers: { accept: "text/html" },
    });
    if (!response.ok)
      throw new Error(`CPPP public latest-tenders page returned HTTP ${response.status}.`);
    return { items: parseCpppLatestHtml(await readTextLimited(response)), nextCursor: null };
  }
}

export class GepnicLatestConnector implements TenderConnector {
  constructor(private readonly portal: ConnectorPortal) {}

  async fetchPage(cursor?: string | null): Promise<ConnectorPage> {
    if (cursor) return { items: [], nextCursor: null };
    const appPath = typeof this.portal.metadata.appPath === "string" ? this.portal.metadata.appPath : "/nicgep/app";
    const appUrl = new URL(appPath, this.portal.officialUrl).toString();
    const response = await fetchWithTimeout(appUrl, { headers: { accept: "text/html" } });
    if (!response.ok) throw new Error(`GePNIC public latest-tenders page returned HTTP ${response.status}.`);
    return {
      items: parseGepnicLatestHtml(await readTextLimited(response), {
        portalName: this.portal.key,
        state: this.portal.state ?? null,
        entryUrl: appUrl,
      }),
      nextCursor: null,
    };
  }
}

export function parseGepnicLatestHtml(
  html: string,
  context: { portalName: string; state: string | null; entryUrl: string },
) {
  return parseCpppLatestHtml(html).map((item) => ({
    ...item,
    state: item.state ?? context.state,
    sourceUrl: context.entryUrl,
    documents: (item.documents ?? []).map((document) => ({ ...document, url: context.entryUrl })),
    metadata: {
      ...item.metadata,
      source: context.portalName,
      coverageMode: "LATEST_PUBLIC_WINDOW",
      navigation: "SEARCH_BY_REFERENCE",
    },
  }));
}

export function normalizeGemNotice(value: unknown): ConnectorNotice {
  const raw = objectValue(value);
  const id = stringValue(firstValue(raw.b_id) ?? raw.id);
  const reference = stringValue(firstValue(raw.b_bid_number));
  if (!id || !reference) throw new Error("GeM bid is missing its public identity.");
  const category = stringValue(firstValue(raw.b_category_name) ?? firstValue(raw.bd_category_name));
  const title = stringValue(firstValue(raw.bbt_title)) ?? category ?? reference;
  const qtrDir = stringValue(firstValue(raw.qtr_dir));
  const uploadVersion = stringValue(firstValue(raw.b_is_new_upload));
  const bidType = numericValue(firstValue(raw.b_bid_type));
  const documentPath =
    bidType === 5
      ? "showdirectradocumentPdf"
      : bidType === 2
        ? "showradocumentPdf"
        : "showbidDocument";
  const sourceUrl =
    qtrDir && uploadVersion
      ? `https://bidplus.gem.gov.in/${documentPath}/${encodeURIComponent(id)}/${encodeURIComponent(qtrDir)}/${encodeURIComponent(uploadVersion)}`
      : GEM_LIST_URL;
  const publishedAt = optionalDate(firstValue(raw.final_start_date_sort));
  return {
    sourceNoticeKey: reference,
    title,
    referenceNumber: reference,
    description: "",
    buyerName: stringValue(firstValue(raw.ba_official_details_deptName)),
    authorityType: stringValue(firstValue(raw.ba_official_details_minName)),
    category,
    procurementType: bidType === 2 || bidType === 5 ? "Reverse auction" : "Bid",
    publishedAt,
    bidStartsAt: publishedAt,
    deadlineAt: optionalDate(firstValue(raw.final_end_date_sort)),
    status: "ACTIVE",
    sourceUrl,
    sourceUpdatedAt: new Date().toISOString(),
    documents: [
      {
        key: `${reference}:official`,
        name: "Official GeM bid document",
        url: sourceUrl,
        access: "EXTERNAL",
      },
    ],
    metadata: {
      source: "GeM",
      quantity: numericValue(firstValue(raw.b_total_quantity)),
      globalTender: numericValue(firstValue(raw.ba_is_global_tendering)) === 1,
      highValue: firstValue(raw.is_high_value) === true,
    },
    raw,
  };
}

export function parseCpppLatestHtml(html: string): ConnectorNotice[] {
  const $ = load(html);
  const table = $("#activeTenders");
  if (!table.length) throw new Error("CPPP public latest-tenders table was not found.");
  return table.find("tr").toArray().flatMap((row) => {
    const cells = $(row).find("td");
    if (cells.length < 4) return [];
    const link = cells.eq(0).find("a").first();
    const href = link.attr("href");
    const title = link.text().replace(/\s+/g, " ").trim().replace(/^\d+\.\s*/, "");
    const reference = cells.eq(1).text().replace(/\s+/g, " ").trim();
    if (!href || !title || !reference) return [];
    const deadlineAt = parseIndianPortalDate(cells.eq(2).text().replace(/\s+/g, " ").trim());
    const opensAt = parseIndianPortalDate(cells.eq(3).text().replace(/\s+/g, " ").trim());
    const raw = { title, referenceNumber: reference, deadlineAt, opensAt };
    return [
      {
        sourceNoticeKey: reference,
        title,
        referenceNumber: reference,
        description: "",
        procurementType: "Tender",
        deadlineAt,
        opensAt,
        status: "ACTIVE" as const,
        sourceUrl: CPPP_ENTRY_URL,
        sourceUpdatedAt: new Date().toISOString(),
        documents: [
          {
            key: `${reference}:official`,
            name: "Open CPPP and search by reference",
            url: CPPP_ENTRY_URL,
            access: "EXTERNAL" as const,
          },
        ],
        metadata: {
          source: "CPPP",
          coverageMode: "LATEST_PUBLIC_WINDOW",
          navigation: "SEARCH_BY_REFERENCE",
        },
        raw,
      },
    ];
  });
}

export function normalizeOfficialFeedItem(value: unknown): ConnectorNotice {
  if (!value || typeof value !== "object") throw new Error("Tender feed item must be an object.");
  const raw = value as Record<string, unknown>;
  const sourceNoticeKey = requiredString(raw.sourceNoticeKey, "sourceNoticeKey");
  const title = requiredString(raw.title, "title");
  const sourceUrl = requiredUrl(raw.sourceUrl, "sourceUrl");
  const status =
    typeof raw.status === "string" &&
    ["ACTIVE", "CLOSED", "CANCELLED", "AWARDED", "EXPIRED", "UNKNOWN"].includes(
      raw.status.toUpperCase(),
    )
      ? (raw.status.toUpperCase() as NoticeStatus)
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
    metadata:
      typeof raw.metadata === "object" && raw.metadata
        ? (raw.metadata as Record<string, unknown>)
        : {},
    raw,
  };
}

export function canonicalNoticeKey(item: ConnectorNotice) {
  const exact = [item.buyerName, item.referenceNumber]
    .map(normalizeKeyPart)
    .filter(Boolean)
    .join("|");
  const fallback = [item.title, item.deadlineAt?.slice(0, 10)]
    .map(normalizeKeyPart)
    .filter(Boolean)
    .join("|");
  return createHash("sha256")
    .update(exact || fallback || item.sourceNoticeKey)
    .digest("hex");
}
export function payloadHash(raw: Record<string, unknown>) {
  return createHash("sha256").update(stableJson(raw)).digest("hex");
}

export function effectiveNoticeStatus(status: NoticeStatus | undefined, deadlineAt: string | null | undefined, now = new Date()): NoticeStatus {
  const normalized = status ?? "UNKNOWN";
  if (normalized === "CLOSED" || normalized === "CANCELLED" || normalized === "AWARDED") return normalized;
  if (deadlineAt && new Date(deadlineAt).getTime() < now.getTime()) return "EXPIRED";
  return normalized;
}

export function normalizeNoticeFields(item: ConnectorNotice): ConnectorNotice {
  const source = new URL(item.sourceUrl);
  if (source.protocol !== "https:" && source.protocol !== "http:") throw new Error("Tender source URL must use HTTP or HTTPS.");
  const clean = (value: string | null | undefined) => value?.normalize("NFKC").replace(/\s+/g, " ").trim() || undefined;
  const stateAliases: Record<string, string> = { orissa: "Odisha", uttaranchal: "Uttarakhand", "nct of delhi": "Delhi", "new delhi": "Delhi" };
  const rawState = clean(item.state);
  const state = rawState ? stateAliases[rawState.toLocaleLowerCase("en-IN")] ?? rawState.toLocaleLowerCase("en-IN").replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase("en-IN")) : undefined;
  const currency = clean(item.currency)?.toUpperCase();
  return { ...item, sourceNoticeKey: clean(item.sourceNoticeKey) ?? item.sourceNoticeKey, title: clean(item.title) ?? item.title, referenceNumber: clean(item.referenceNumber), description: clean(item.description) ?? "", buyerName: clean(item.buyerName), authorityType: clean(item.authorityType), location: clean(item.location), state, category: clean(item.category), procurementType: clean(item.procurementType), currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : "INR", sourceUrl: source.toString(), documents: item.documents?.map((document) => ({ ...document, key: clean(document.key) ?? document.key, name: clean(document.name) ?? document.name, url: new URL(document.url).toString() })) };
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
    return [
      {
        key,
        name,
        url,
        mimeType: optionalString(row.mimeType),
        access: access === "DIRECT" || access === "AUTHENTICATED" ? access : "EXTERNAL",
        metadata:
          typeof row.metadata === "object" && row.metadata
            ? (row.metadata as Record<string, unknown>)
            : {},
      },
    ];
  });
}
function requiredString(value: unknown, field: string) {
  const result = optionalString(value);
  if (!result) throw new Error(`Tender feed item is missing ${field}.`);
  return result;
}
function requiredUrl(value: unknown, field: string) {
  const result = requiredString(value, field);
  if (!isUrl(result)) throw new Error(`Tender feed item ${field} must be an absolute URL.`);
  return result;
}
function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function optionalNumber(value: unknown) {
  const result =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/[^0-9.-]/g, ""))
        : NaN;
  return Number.isFinite(result) && result >= 0 ? result : null;
}
function optionalDate(value: unknown) {
  const raw = optionalString(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function gemDate(value: string | undefined) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00+05:30`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(date);
}
function normalizeKeyPart(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(limited|ltd)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function isUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function firstValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}
function stringValue(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}
function numericValue(value: unknown) {
  const number =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}
function positiveInteger(value: string | null | undefined) {
  const number = value ? Number(value) : NaN;
  return Number.isInteger(number) && number > 0 ? number : null;
}
function parseIndianPortalDate(value: string) {
  const match = value.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{1,2}):(\d{2})\s+(AM|PM)$/i);
  if (!match) return null;
  const months: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };
  const month = months[match[2]!.toLowerCase()];
  if (month === undefined) return null;
  let hour = Number(match[4]);
  if (match[6]!.toUpperCase() === "PM" && hour !== 12) hour += 12;
  if (match[6]!.toUpperCase() === "AM" && hour === 12) hour = 0;
  return new Date(
    Date.UTC(Number(match[3]), month, Number(match[1]), hour, Number(match[5])) - 330 * 60_000,
  ).toISOString();
}
