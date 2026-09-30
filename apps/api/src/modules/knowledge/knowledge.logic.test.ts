import { describe, expect, test } from "bun:test";

import {
  type ClaimRow,
  type KnowledgeRow,
  lifecycleIssuesForSource,
  parseIssueId,
  planClaimChanges,
  serializeKnowledgeSource,
  splitKnowledgeUpdate,
} from "./knowledge.logic";

const now = new Date("2026-09-30T12:00:00Z");
const SOURCE_ID = "11111111-1111-4111-8111-111111111111";

function source(overrides: Partial<KnowledgeRow> = {}): KnowledgeRow {
  return {
    id: SOURCE_ID,
    organizationId: "22222222-2222-4222-8222-222222222222",
    name: "SOC 2",
    type: "Audit Report",
    category: "Security",
    version: "1.0",
    authority: "high",
    ownerId: null,
    lastVerified: "2026-09-01",
    lastUpdated: "2026-09-01",
    expiresAt: null,
    summary: "Type II attestation.",
    metadata: {},
    lifecycleStatus: "ACTIVE",
    reviewState: null,
    reviewStateChangedAt: null,
    usageCount: 0,
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as KnowledgeRow;
}

function claim(id: string, label: string, value: string, status: ClaimRow["status"] = "ACTIVE"): ClaimRow {
  return {
    id,
    sourceId: SOURCE_ID,
    label,
    value,
    confidence: "0.900",
    status,
    origin: "manual",
    documentId: null,
    chunkId: null,
    createdAt: now,
    updatedAt: now,
  } as ClaimRow;
}

describe("lifecycleIssuesForSource", () => {
  test("an archived source that has expired raises nothing", () => {
    const serialized = serializeKnowledgeSource(source({ lifecycleStatus: "ARCHIVED", expiresAt: "2020-01-01" }), now);
    expect(lifecycleIssuesForSource(serialized)).toEqual([]);
  });

  test("an active source never verified is surfaced as UNVERIFIED", () => {
    const serialized = serializeKnowledgeSource(source({ lastVerified: null }), now);
    expect(lifecycleIssuesForSource(serialized).map((issue) => issue.type)).toEqual(["UNVERIFIED"]);
  });

  test("a pending revision is its own issue alongside the source state", () => {
    const serialized = serializeKnowledgeSource(source({ lastVerified: "2025-01-01" }), now);
    const types = lifecycleIssuesForSource(serialized, { pendingRevisionId: "33333333-3333-4333-8333-333333333333" }).map(
      (issue) => issue.type,
    );
    expect(types).toEqual(["REVISION", "STALE"]);
  });
});

describe("splitKnowledgeUpdate", () => {
  test("metadata applies directly and unchanged content opens no revision", () => {
    const existing = source();
    const split = splitKnowledgeUpdate(existing, [], { ownerId: "44444444-4444-4444-8444-444444444444", summary: existing.summary });
    expect(split.content).toEqual({});
    expect(split.metadata).toEqual({ ownerId: "44444444-4444-4444-8444-444444444444" });
  });

  test("changed summary and claims are content", () => {
    const existing = source();
    const claims = [claim("55555555-5555-4555-8555-555555555555", "RPO", "4 hours")];
    const split = splitKnowledgeUpdate(existing, claims, {
      summary: "New summary",
      claims: [{ id: "55555555-5555-4555-8555-555555555555", label: "RPO", value: "1 hour" }],
    });
    expect(Object.keys(split.content).sort()).toEqual(["claims", "summary"]);
  });
});

describe("planClaimChanges", () => {
  test("keeps ids stable, matches by label when ids are absent, soft-deletes removed claims", () => {
    const existing = [
      claim("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "RPO", "4 hours"),
      claim("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "RTO", "8 hours"),
      claim("cccccccc-cccc-4ccc-8ccc-cccccccccccc", "Old", "value"),
      claim("dddddddd-dddd-4ddd-8ddd-dddddddddddd", "Suggested", "x", "SUGGESTED"),
    ];
    const plan = planClaimChanges(existing, [
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", label: "RPO", value: "1 hour" },
      { label: "rto", value: "2 hours" },
      { label: "New claim", value: "yes" },
    ]);
    expect(plan.updates.map((update) => update.id)).toEqual([
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    ]);
    expect(plan.inserts.map((insert) => insert.label)).toEqual(["New claim"]);
    expect(plan.rejectIds).toEqual(["cccccccc-cccc-4ccc-8ccc-cccccccccccc"]);
  });
});

describe("parseIssueId", () => {
  test("rejects malformed ids instead of passing them to Postgres", () => {
    expect(parseIssueId(`source:${SOURCE_ID}:STALE`)).toEqual({ kind: "source", id: SOURCE_ID });
    expect(parseIssueId("source:not-a-uuid:STALE")).toBeNull();
    expect(parseIssueId("other:" + SOURCE_ID)).toBeNull();
  });
});
