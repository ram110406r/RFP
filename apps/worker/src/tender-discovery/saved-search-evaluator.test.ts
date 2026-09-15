import { describe, expect, test } from "bun:test";
import { nextLocalMorning } from "./saved-search-evaluator";

describe("saved search scheduling", () => {
  test("schedules daily digests for the next local 08:00", () => {
    const now = new Date("2026-09-11T01:00:00.000Z");
    expect(nextLocalMorning(now, "Asia/Kolkata").toISOString()).toBe("2026-09-11T02:30:00.000Z");
  });
  test("falls back to UTC for invalid timezones", () => {
    const now = new Date("2026-09-11T09:00:00.000Z");
    expect(nextLocalMorning(now, "invalid").toISOString()).toBe("2026-09-12T08:00:00.000Z");
  });
});
