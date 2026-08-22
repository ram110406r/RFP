import { describe, expect, test } from "bun:test";

import {
  RFP_LIFECYCLE_STATUSES,
  RFP_TRANSITIONS,
  allowedTransitionsFrom,
  canTransition,
  findTransition,
  isFailureStatus,
  isRfpLifecycleStatus,
  isTerminalStatus,
  permissionForTransition,
  type RfpLifecycleStatus,
} from "./rfp-state-machine";

/** The full happy path from the phase brief, walked edge by edge. */
const HAPPY_PATH: RfpLifecycleStatus[] = [
  "DRAFT",
  "INTAKE",
  "PARSING",
  "ANALYZING",
  "QUALIFICATION",
  "RESPONSE",
  "REVIEW",
  "VALIDATION",
  "READY_FOR_SUBMISSION",
  "SUBMITTED",
  "OUTCOME_RECORDED",
  "CLOSED",
];

describe("RFP lifecycle — happy path", () => {
  test("every consecutive pair is a legal transition", () => {
    for (let i = 0; i < HAPPY_PATH.length - 1; i += 1) {
      const from = HAPPY_PATH[i]!;
      const to = HAPPY_PATH[i + 1]!;
      expect({ from, to, allowed: canTransition(from, to) }).toEqual({
        from,
        to,
        allowed: true,
      });
    }
  });

  test("the path visits all twelve non-failure states", () => {
    expect(HAPPY_PATH).toHaveLength(12);
    expect(new Set(HAPPY_PATH).size).toBe(12);
  });
});

describe("RFP lifecycle — failure states and recovery", () => {
  test("each stage can fail", () => {
    expect(canTransition("PARSING", "PARSING_FAILED")).toBe(true);
    expect(canTransition("ANALYZING", "ANALYSIS_FAILED")).toBe(true);
    expect(canTransition("VALIDATION", "VALIDATION_FAILED")).toBe(true);
  });

  test("each failure recovers to the stage that failed", () => {
    expect(canTransition("PARSING_FAILED", "PARSING")).toBe(true);
    expect(canTransition("ANALYSIS_FAILED", "ANALYZING")).toBe(true);
    expect(canTransition("VALIDATION_FAILED", "VALIDATION")).toBe(true);
  });

  test("a failure state cannot skip forward past the stage it failed at", () => {
    expect(canTransition("PARSING_FAILED", "ANALYZING")).toBe(false);
    expect(canTransition("ANALYSIS_FAILED", "QUALIFICATION")).toBe(false);
    expect(canTransition("VALIDATION_FAILED", "READY_FOR_SUBMISSION")).toBe(false);
  });

  test("classifies failure states", () => {
    expect(isFailureStatus("PARSING_FAILED")).toBe(true);
    expect(isFailureStatus("ANALYSIS_FAILED")).toBe(true);
    expect(isFailureStatus("VALIDATION_FAILED")).toBe(true);
    expect(isFailureStatus("RESPONSE")).toBe(false);
  });
});

describe("RFP lifecycle — invalid transitions", () => {
  test("cannot skip a stage", () => {
    expect(canTransition("DRAFT", "SUBMITTED")).toBe(false);
    expect(canTransition("DRAFT", "RESPONSE")).toBe(false);
    expect(canTransition("INTAKE", "REVIEW")).toBe(false);
    expect(canTransition("RESPONSE", "READY_FOR_SUBMISSION")).toBe(false);
  });

  test("cannot move backwards along the happy path", () => {
    expect(canTransition("REVIEW", "RESPONSE")).toBe(false);
    expect(canTransition("SUBMITTED", "REVIEW")).toBe(false);
    expect(canTransition("QUALIFICATION", "ANALYZING")).toBe(false);
  });

  test("cannot transition to itself", () => {
    for (const status of RFP_LIFECYCLE_STATUSES) {
      expect({ status, self: canTransition(status, status) }).toEqual({ status, self: false });
    }
  });

  test("CLOSED is terminal", () => {
    expect(isTerminalStatus("CLOSED")).toBe(true);
    expect(allowedTransitionsFrom("CLOSED")).toHaveLength(0);
    for (const status of RFP_LIFECYCLE_STATUSES) {
      expect(canTransition("CLOSED", status)).toBe(false);
    }
  });
});

describe("RFP lifecycle — transition permissions", () => {
  test("approving for submission requires rfp:approve", () => {
    expect(permissionForTransition("VALIDATION", "READY_FOR_SUBMISSION")).toBe("rfp:approve");
  });

  test("submitting requires rfp:submit", () => {
    expect(permissionForTransition("READY_FOR_SUBMISSION", "SUBMITTED")).toBe("rfp:submit");
  });

  test("ordinary progress needs nothing beyond rfp:update", () => {
    expect(permissionForTransition("DRAFT", "INTAKE")).toBeUndefined();
    expect(permissionForTransition("RESPONSE", "REVIEW")).toBeUndefined();
  });
});

describe("RFP lifecycle — table integrity", () => {
  test("every state in the table is a declared lifecycle state", () => {
    for (const rule of RFP_TRANSITIONS) {
      expect(isRfpLifecycleStatus(rule.from)).toBe(true);
      expect(isRfpLifecycleStatus(rule.to)).toBe(true);
    }
  });

  test("no duplicate edges", () => {
    const edges = RFP_TRANSITIONS.map((rule) => `${rule.from}->${rule.to}`);
    expect(new Set(edges).size).toBe(edges.length);
  });

  test("every non-terminal state is reachable from DRAFT", () => {
    const seen = new Set<RfpLifecycleStatus>(["DRAFT"]);
    const queue: RfpLifecycleStatus[] = ["DRAFT"];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const rule of allowedTransitionsFrom(current)) {
        if (!seen.has(rule.to)) {
          seen.add(rule.to);
          queue.push(rule.to);
        }
      }
    }
    // An unreachable state would be dead configuration.
    expect(seen.size).toBe(RFP_LIFECYCLE_STATUSES.length);
  });

  test("findTransition returns the rule with its description", () => {
    const rule = findTransition("DRAFT", "INTAKE");
    expect(rule?.description).toBe("Begin intake.");
    expect(findTransition("DRAFT", "CLOSED")).toBeUndefined();
  });

  test("rejects values that are not lifecycle states", () => {
    expect(isRfpLifecycleStatus("draft")).toBe(false);
    expect(isRfpLifecycleStatus("NOT_A_STATE")).toBe(false);
    expect(isRfpLifecycleStatus(null)).toBe(false);
  });
});
