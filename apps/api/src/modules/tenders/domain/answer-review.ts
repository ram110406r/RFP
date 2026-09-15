import { createHash } from "node:crypto";

export function answerContentDigest(answer: { answerText: string; source: string }) {
  return createHash("sha256").update(JSON.stringify([answer.answerText, answer.source])).digest("hex");
}

export function hasCurrentApproval(
  answer: { id: string; answerText: string; source: string; status: string },
  reviews: Array<{ answerId: string; status: string; contentDigest?: string | null }>,
) {
  return ["APPROVED", "FINAL"].includes(answer.status) &&
    reviews.some((review) => review.answerId === answer.id && review.status === "APPROVED" && review.contentDigest === answerContentDigest(answer)) &&
    !reviews.some((review) => review.answerId === answer.id && ["PENDING", "CHANGES_REQUESTED", "REJECTED"].includes(review.status));
}
