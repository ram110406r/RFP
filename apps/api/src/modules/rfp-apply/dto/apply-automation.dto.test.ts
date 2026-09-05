import { describe, expect, test } from "bun:test";
import { createAutomationRunSchema, createSubmissionSchema, updateMilestonesSchema } from "./apply-automation.dto";

describe("apply automation DTOs", () => {
  test("defaults automation and receipt inputs safely", () => {
    expect(createAutomationRunSchema.parse({})).toEqual({ includePackage: false });
    expect(createSubmissionSchema.parse({ packageId: "11111111-1111-4111-8111-111111111111", portal: "GeM", portalReference: "ACK-1", submittedAt: "2026-09-06T10:00:00.000Z" })).toMatchObject({ notes: "", receiptFileIds: [] });
  });

  test("requires each configurable milestone exactly once", () => {
    expect(() => updateMilestonesSchema.parse({ milestones: [
      { kind: "REVIEW", offsetDays: 7 }, { kind: "REVIEW", offsetDays: 3 }, { kind: "PACKAGE", offsetDays: 2 }, { kind: "SUBMISSION", offsetDays: 1 },
    ] })).toThrow();
  });
});
