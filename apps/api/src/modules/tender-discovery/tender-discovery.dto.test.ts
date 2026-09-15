import { describe, expect, test } from "bun:test";

import { bulkTenderDiscoverySchema, compareTenderDiscoverySchema, listTenderDiscoverySchema, savedSearchSchema, tenderDiscoveryWorkspaceSchema, tenderMatchProfileSchema } from "./tender-discovery.dto";

describe("tender discovery request contracts", () => {
  test("coerces pagination, booleans, and value filters", () => {
    const result = listTenderDiscoverySchema.parse({ page: "2", pageSize: "50", saved: "true", minValue: "1000", maxValue: "5000", sort: "deadline" });
    expect(result).toMatchObject({ page: 2, pageSize: 50, saved: true, minValue: 1000, maxValue: 5000, sort: "deadline" });
    expect(result.freshness).toBe("current");
  });

  test("accepts explicit stale and all-catalog freshness filters", () => {
    expect(listTenderDiscoverySchema.parse({ freshness: "stale" }).freshness).toBe("stale");
    expect(listTenderDiscoverySchema.parse({ freshness: "all" }).freshness).toBe("all");
  });

  test("rejects inverted values and unknown filters", () => {
    expect(() => listTenderDiscoverySchema.parse({ minValue: "5000", maxValue: "1000" })).toThrow();
    expect(() => listTenderDiscoverySchema.parse({ unsupported: "value" })).toThrow();
  });

  test("requires an explicit workspace for mutations", () => {
    expect(() => tenderDiscoveryWorkspaceSchema.parse({})).toThrow();
    expect(tenderDiscoveryWorkspaceSchema.parse({ workspaceId: "11111111-1111-4111-8111-111111111111" }).workspaceId).toBeTruthy();
  });

  test("caps comparison and bulk actions", () => {
    const ids = Array.from({ length: 101 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
    expect(() => bulkTenderDiscoverySchema.parse({ workspaceId: ids[0], noticeIds: ids })).toThrow();
    expect(compareTenderDiscoverySchema.parse({ workspaceId: ids[0], noticeIds: ids.slice(1, 3).join(",") }).noticeIds).toHaveLength(2);
    expect(() => compareTenderDiscoverySchema.parse({ workspaceId: ids[0], noticeIds: ids.slice(1, 6) })).toThrow();
  });

  test("validates saved search and match profile ranges", () => {
    const workspaceId = "11111111-1111-4111-8111-111111111111";
    expect(savedSearchSchema.parse({ workspaceId, name: "IT", query: { q: "cloud" } }).cadence).toBe("DAILY");
    expect(() => tenderMatchProfileSchema.parse({ capabilityKeywords: [], preferredCategories: [], preferredStates: [], certifications: [], minimumValue: 10, maximumValue: 1 })).toThrow();
  });
});
