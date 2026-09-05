import { describe, expect, test } from "bun:test";

import { allowedTransitionsFrom, canTransitionTender, permissionForTenderTransition } from "./tender-state-machine";

describe("Tender lifecycle", () => {
  test("allows the documented happy-path transitions", () => {
    expect(canTransitionTender("DRAFT", "INTAKE")).toBe(true);
    expect(canTransitionTender("INTAKE", "PROCESSING")).toBe(true);
    expect(canTransitionTender("PROCESSING", "READY")).toBe(true);
    expect(canTransitionTender("READY", "IN_PROGRESS")).toBe(true);
    expect(canTransitionTender("IN_PROGRESS", "REVIEW")).toBe(true);
    expect(canTransitionTender("REVIEW", "APPROVED")).toBe(true);
    expect(canTransitionTender("APPROVED", "REVIEW")).toBe(true);
    expect(canTransitionTender("APPROVED", "SUBMITTED")).toBe(true);
    expect(canTransitionTender("SUBMITTED", "CLOSED")).toBe(true);
  });

  test("rejects invalid transitions", () => {
    expect(canTransitionTender("DRAFT", "SUBMITTED")).toBe(false);
    expect(canTransitionTender("CLOSED", "IN_PROGRESS")).toBe(false);
    expect(canTransitionTender("CANCELLED", "APPROVED")).toBe(false);
  });

  test("exposes the required permission per transition", () => {
    expect(permissionForTenderTransition("DRAFT", "INTAKE")).toBe("tender:update");
    expect(permissionForTenderTransition("REVIEW", "APPROVED")).toBe("tender:approve");
    expect(permissionForTenderTransition("APPROVED", "REVIEW")).toBe("tender:update");
    expect(permissionForTenderTransition("APPROVED", "SUBMITTED")).toBe("tender:submit");
  });

  test("lists available transitions from a tender state", () => {
    expect(allowedTransitionsFrom("REVIEW").map((rule) => rule.to)).toEqual([
      "IN_PROGRESS",
      "APPROVED",
      "CANCELLED",
    ]);
  });
});
