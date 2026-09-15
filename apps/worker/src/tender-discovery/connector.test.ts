import { describe, expect, test } from "bun:test";

import {
  canonicalNoticeKey,
  effectiveNoticeStatus,
  normalizeGemNotice,
  normalizeOfficialFeedItem,
  normalizeNoticeFields,
  parseCpppLatestHtml,
  parseGepnicLatestHtml,
  payloadHash,
} from "./connector";

describe("official tender feed normalization", () => {
  test("normalizes persisted taxonomy and whitespace", () => {
    const item = normalizeNoticeFields({ sourceNoticeKey: "  X  1 ", title: "  Cloud   services ", buyerName: " State   Department ", state: "ORISSA", currency: "inr", sourceUrl: "https://example.gov.in/tender", raw: {} });
    expect(item).toMatchObject({ sourceNoticeKey: "X 1", title: "Cloud services", buyerName: "State Department", state: "Odisha", currency: "INR" });
  });
  test("normalizes Indian values, dates, statuses, and document links", () => {
    const item = normalizeOfficialFeedItem({
      sourceNoticeKey: "GEM/2026/B/123",
      title: "Supply of networking equipment",
      referenceNumber: "GEM/2026/B/123",
      buyerName: "Department of Telecommunications",
      estimatedValue: "₹ 12,50,000",
      deadlineAt: "2026-10-12T15:00:00+05:30",
      status: "active",
      sourceUrl: "https://example.gov.in/tender/123",
      documents: [
        { key: "nit", name: "NIT", url: "https://example.gov.in/nit.pdf", access: "DIRECT" },
      ],
    });
    expect(item.estimatedValue).toBe(1_250_000);
    expect(item.status).toBe("ACTIVE");
    expect(item.deadlineAt).toBe("2026-10-12T09:30:00.000Z");
    expect(item.documents?.[0]?.access).toBe("DIRECT");
  });

  test("uses buyer and reference as the stable cross-source identity", () => {
    const base = normalizeOfficialFeedItem({
      sourceNoticeKey: "one",
      title: "First title",
      referenceNumber: "ABC-10",
      buyerName: "Bharat Electronics",
      sourceUrl: "https://one.gov.in/a",
    });
    const mirror = normalizeOfficialFeedItem({
      sourceNoticeKey: "two",
      title: "Changed title",
      referenceNumber: "abc 10",
      buyerName: "Bharat Electronics Ltd.",
      sourceUrl: "https://two.gov.in/b",
    });
    expect(canonicalNoticeKey(base)).toBe(canonicalNoticeKey(mirror));
    expect(canonicalNoticeKey(base)).toBe(
      canonicalNoticeKey({ ...base, sourceNoticeKey: "mirror", sourceUrl: mirror.sourceUrl }),
    );
  });

  test("hashes object payloads independently of property order", () => {
    expect(payloadHash({ a: 1, b: { c: true } })).toBe(payloadHash({ b: { c: true }, a: 1 }));
  });

  test("rejects malformed source records", () => {
    expect(() =>
      normalizeOfficialFeedItem({ title: "Missing identity", sourceUrl: "https://example.gov.in" }),
    ).toThrow("sourceNoticeKey");
    expect(() =>
      normalizeOfficialFeedItem({
        sourceNoticeKey: "1",
        title: "Bad URL",
        sourceUrl: "javascript:alert(1)",
      }),
    ).toThrow("absolute URL");
  });

  test("normalizes GeM array-valued search records", () => {
    const item = normalizeGemNotice({
      id: "9755446",
      b_id: [9755446],
      b_bid_number: ["GEM/2026/B/7917062"],
      b_category_name: ["Scientific equipment"],
      bbt_title: ["Laser measurement system"],
      final_start_date_sort: ["2026-08-17T16:18:30Z"],
      final_end_date_sort: ["2026-09-07T09:00:00Z"],
      b_bid_type: [1],
      b_is_new_upload: [3],
      qtr_dir: ["AugQ326"],
      ba_official_details_minName: ["Ministry of Defence"],
      ba_official_details_deptName: ["Department of Defence Research & Development"],
    });
    expect(item.sourceNoticeKey).toBe("GEM/2026/B/7917062");
    expect(item.title).toBe("Laser measurement system");
    expect(item.buyerName).toBe("Department of Defence Research & Development");
    expect(item.sourceUrl).toContain("/showbidDocument/9755446/AugQ326/3");
  });

  test("parses CPPP's public latest tender window in source order", () => {
    const items = parseCpppLatestHtml(`
      <table id="activeTenders">
        <tr><td><a href="/eprocure/app?x=1&amp;y=2">1. Supply &amp; installation</a></td><td>CPPP/10</td><td>26-Sep-2026 03:00 PM</td><td>30-Sep-2026 03:30 PM</td></tr>
        <tr><td><a href="/eprocure/app?x=2">2. Maintenance</a></td><td>CPPP/11</td><td>27-Sep-2026 11:00 AM</td><td>01-Oct-2026 12:00 PM</td></tr>
      </table>
    `);
    expect(items.map((item) => item.sourceNoticeKey)).toEqual(["CPPP/10", "CPPP/11"]);
    expect(items[0]?.title).toBe("Supply & installation");
    expect(items[0]?.deadlineAt).toBe("2026-09-26T09:30:00.000Z");
    expect(items[0]?.sourceUrl).toBe("https://eprocure.gov.in/eprocure/app?service=restart");
    expect(items[0]?.documents?.[0]?.name).toBe("Open CPPP and search by reference");
  });

  test("expires active notices after their deadline but preserves explicit terminal states", () => {
    const now = new Date("2026-09-06T12:00:00.000Z");
    expect(effectiveNoticeStatus("ACTIVE", "2026-09-05T12:00:00.000Z", now)).toBe("EXPIRED");
    expect(effectiveNoticeStatus("ACTIVE", "2026-09-07T12:00:00.000Z", now)).toBe("ACTIVE");
    expect(effectiveNoticeStatus("CANCELLED", "2026-09-07T12:00:00.000Z", now)).toBe("CANCELLED");
    expect(effectiveNoticeStatus("AWARDED", "2026-09-05T12:00:00.000Z", now)).toBe("AWARDED");
  });

  test("reuses the GePNIC public window while preserving portal state and durable navigation", () => {
    const [item] = parseGepnicLatestHtml(`<table id="activeTenders"><tr><td><a href="?session=short">1. Road works</a></td><td>MH/12</td><td>26-Sep-2026 03:00 PM</td><td>30-Sep-2026 03:30 PM</td></tr></table>`, { portalName: "mahatenders", state: "Maharashtra", entryUrl: "https://mahatenders.gov.in/nicgep/app" });
    expect(item?.state).toBe("Maharashtra");
    expect(item?.sourceUrl).toBe("https://mahatenders.gov.in/nicgep/app");
    expect(item?.metadata.coverageMode).toBe("LATEST_PUBLIC_WINDOW");
  });
});
