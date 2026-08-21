import { queryOptions } from "@tanstack/react-query";
import { apiRequest } from "./http";
import type { ReviewItem } from "@/types";

export async function fetchReviews(): Promise<ReviewItem[]> {
  const { items } = await apiRequest<{ items: ReviewItem[] }>("/api/reviews");
  return items;
}

export async function fetchReview(id: string): Promise<ReviewItem> {
  return apiRequest<ReviewItem>(`/api/reviews/${id}`);
}

export const reviewsQueryOptions = () =>
  queryOptions({ queryKey: ["reviews"], queryFn: fetchReviews });

export const reviewQueryOptions = (id: string) =>
  queryOptions({ queryKey: ["reviews", id], queryFn: () => fetchReview(id) });

export type ReviewAction = "APPROVED" | "REJECTED" | "REQUEST_CHANGES" | "COMMENT" | "ASSIGNED";

/**
 * Persists a real review event (`rfp_reviews`) and, for decision actions,
 * updates the requirement's and its assignment's status server-side in the
 * same request — see server/src/modules/reviews.ts. Used for both the
 * dedicated review queue (reviews/$reviewId.tsx) and the requirement drawer's
 * inline review panel, so every approve/reject/request-changes/comment is
 * logged the same way regardless of where it was taken from.
 */
export async function submitReviewAction(
  requirementId: string,
  action: ReviewAction,
  comment?: string,
): Promise<void> {
  await apiRequest("/api/reviews", { method: "POST", body: { requirementId, action, comment } });
}
