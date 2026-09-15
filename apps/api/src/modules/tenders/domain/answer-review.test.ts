import { expect, test } from "bun:test";
import { answerContentDigest, hasCurrentApproval } from "./answer-review";

const answer = { id: "a", answerText: "Reviewed text", source: "MANUAL", status: "APPROVED" };
const review = { answerId: "a", status: "APPROVED", contentDigest: answerContentDigest(answer) };

test("approval binds content and source and permits finalization", () => {
  expect(hasCurrentApproval(answer, [review])).toBe(true);
  expect(hasCurrentApproval({ ...answer, status: "FINAL" }, [review])).toBe(true);
  expect(hasCurrentApproval({ ...answer, answerText: "Changed text" }, [review])).toBe(false);
  expect(hasCurrentApproval({ ...answer, source: "AI_GENERATED" }, [review])).toBe(false);
});

test("legacy approval, pending reviews, rejection, and drafts fail closed", () => {
  expect(hasCurrentApproval(answer, [{ ...review, contentDigest: null }])).toBe(false);
  expect(hasCurrentApproval(answer, [])).toBe(false);
  for (const status of ["PENDING", "REJECTED", "CHANGES_REQUESTED"]) expect(hasCurrentApproval(answer, [review, { ...review, status }])).toBe(false);
  expect(hasCurrentApproval({ ...answer, status: "DRAFT" }, [review])).toBe(false);
});
