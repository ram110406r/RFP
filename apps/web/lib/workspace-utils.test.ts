/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";

import { getGenerationId, getGenerationMeta, reviewToneFromStatus } from "./workspace-utils";

describe("workspace utils", () => {
  test("maps review status to display tone", () => {
    expect(reviewToneFromStatus("APPROVED")).toBe("success");
    expect(reviewToneFromStatus("CHANGES_REQUESTED")).toBe("warning");
    expect(reviewToneFromStatus("REJECTED")).toBe("danger");
    expect(reviewToneFromStatus("PENDING")).toBe("neutral");
  });

  test("reads generation metadata safely", () => {
    const payload = {
      metadata: {
        generation: {
          generatedAt: "2026-08-26T00:00:00.000Z",
          generationId: "gen-1",
        },
      },
    } satisfies Parameters<typeof getGenerationMeta>[0];

    expect(getGenerationMeta(payload)?.generationId).toBe("gen-1");
    expect(getGenerationId(payload.metadata as Record<string, unknown>)).toBe("gen-1");
  });
});
