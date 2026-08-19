import { queryOptions } from "@tanstack/react-query";
import { reviews, computeOverdue } from "@/data/reviews";
import { delay, ApiNotFoundError } from "./client";
import type { ReviewItem } from "@/types";

export async function fetchReviews(): Promise<ReviewItem[]> {
  return delay(reviews);
}

export async function fetchReview(id: string): Promise<ReviewItem> {
  const review = reviews.find((r) => r.id === id);
  if (!review) throw new ApiNotFoundError("Review", id);
  return delay(review);
}

export const reviewsQueryOptions = () =>
  queryOptions({ queryKey: ["reviews"], queryFn: fetchReviews });

export const reviewQueryOptions = (id: string) =>
  queryOptions({ queryKey: ["reviews", id], queryFn: () => fetchReview(id) });

function mustFind(id: string): ReviewItem {
  const review = reviews.find((r) => r.id === id);
  if (!review) throw new ApiNotFoundError("Review", id);
  return review;
}

export async function setReviewStatus(
  id: string,
  status: ReviewItem["status"],
  actorId: string,
): Promise<ReviewItem> {
  const review = mustFind(id);
  review.status = status;
  review.overdue = computeOverdue(review.due, status);
  review.history = [
    ...review.history,
    {
      id: `${id}-h${review.history.length + 1}`,
      at: new Date().toISOString(),
      label:
        status === "approved"
          ? "Approved"
          : status === "rejected"
            ? "Rejected"
            : status === "changes_requested"
              ? "Changes requested"
              : "Status updated",
      actorId,
    },
  ];
  return delay(review);
}

export async function addReviewComment(
  id: string,
  body: string,
  actorId: string,
): Promise<ReviewItem> {
  const review = mustFind(id);
  review.comments = [
    ...review.comments,
    {
      id: `${id}-c${review.comments.length + 1}`,
      authorId: actorId,
      at: new Date().toISOString(),
      body,
    },
  ];
  return delay(review);
}
