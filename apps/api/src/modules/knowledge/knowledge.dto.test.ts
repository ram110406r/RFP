import { describe, expect, test } from "bun:test";

import {
  createKnowledgeSchema,
  createResponseTemplateSchema,
  listKnowledgeIssuesSchema,
  listKnowledgeSchema,
  resolveKnowledgeIssueSchema,
  updateResponseTemplateSchema,
  verifyKnowledgeSchema,
} from "./knowledge.dto";

describe("knowledge workflow DTOs", () => {
  test("accepts expanded knowledge source filters", () => {
    const result = listKnowledgeSchema.parse({
      status: "ACTIVE",
      category: "Security",
      authority: "high",
      ownerId: "00000000-0000-0000-0000-000000000001",
      sourceKind: "manual",
      expires: "expiring",
      reviewState: "stale",
      search: "soc",
      page: "2",
      pageSize: "50",
    });

    expect(result).toMatchObject({
      status: "ACTIVE",
      category: "Security",
      authority: "high",
      sourceKind: "manual",
      expires: "expiring",
      reviewState: "stale",
      page: 2,
      pageSize: 50,
    });
  });

  test("validates manual source metadata and claims", () => {
    const result = createKnowledgeSchema.parse({
      name: "SOC 2 Type II",
      type: "Audit Report",
      category: "Security",
      authority: "high",
      sourceKind: "manual",
      metadata: { source: "manual" },
      claims: [{ label: "Exceptions", value: "0 exceptions", confidence: 0.95 }],
    });

    expect(result.claims?.[0]?.confidence).toBe(0.95);
    expect(result.sourceKind).toBe("manual");
  });

  test("validates issue filters and remediation actions", () => {
    expect(listKnowledgeIssuesSchema.parse({ type: "CONFLICT", status: "ALL" })).toMatchObject({
      type: "CONFLICT",
      status: "ALL",
      page: 1,
      pageSize: 50,
    });
    expect(resolveKnowledgeIssueSchema.parse({ action: "resolve_conflict", note: "Use CAIQ" })).toEqual({
      action: "resolve_conflict",
      note: "Use CAIQ",
    });
    expect(verifyKnowledgeSchema.parse({ expiresAt: null })).toEqual({ expiresAt: null });
  });

  test("validates response template create and update contracts", () => {
    const created = createResponseTemplateSchema.parse({
      name: "Security answer",
      category: "Security",
      description: "Reusable security response",
      sections: [{ title: "Answer", body: "We use {{control_name}}." }],
      variables: [{ key: "control_name", label: "Control name", required: true }],
      usageMetadata: { channel: "rfp" },
    });

    expect(created.sections).toHaveLength(1);
    expect(created.variables?.[0]?.key).toBe("control_name");
    expect(updateResponseTemplateSchema.parse({ description: "Updated" })).toEqual({ description: "Updated" });
    expect(() => updateResponseTemplateSchema.parse({})).toThrow();
  });
});
