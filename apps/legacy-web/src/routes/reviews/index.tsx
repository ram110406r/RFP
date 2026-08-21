import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { reviewsQueryOptions } from "@/lib/api/reviews";
import { PageHeader } from "@/components/common/page-header";
import { PageSkeleton } from "@/components/common/page-skeleton";
import { StatusBadge } from "@/components/common/status-badge";
import { RiskBadge } from "@/components/common/risk-badge";
import { ConfidenceMeter } from "@/components/common/confidence-meter";
import { PersonAvatar } from "@/components/common/person-avatar";
import { EmptyState } from "@/components/common/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { getPerson } from "@/lib/session";
import { cn } from "@/lib/utils";
import type { ReviewItem } from "@/types";

export const Route = createFileRoute("/reviews/")({
  head: () => ({ meta: [{ title: "Reviews · Tendyy" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(reviewsQueryOptions()),
  pendingComponent: PageSkeleton,
  component: ReviewsQueue,
});

type ScopeFilter = "mine" | "all";
type StatusFilter = ReviewItem["status"] | "all";

function ReviewsQueue() {
  const { data: reviews } = useSuspenseQuery(reviewsQueryOptions());
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    let list = reviews;
    if (scope === "mine") list = list.filter((r) => r.mine);
    if (status !== "all") list = list.filter((r) => r.status === status);
    return [...list].sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      return a.due.localeCompare(b.due);
    });
  }, [reviews, scope, status]);

  const pendingCount = reviews.filter(
    (r) => r.status === "pending" || r.status === "in_review",
  ).length;
  const overdueCount = reviews.filter((r) => r.overdue).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Review queue"
        title="Reviews"
        description={`${pendingCount} awaiting review, ${overdueCount} overdue`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border bg-muted/40 p-1">
          {(["all", "mine"] as ScopeFilter[]).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={scope === s ? "default" : "ghost"}
              className="h-7 px-3 text-xs capitalize"
              onClick={() => setScope(s)}
            >
              {s === "mine" ? "Assigned to me" : "All reviews"}
            </Button>
          ))}
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_review">In review</SelectItem>
            <SelectItem value="changes_requested">Changes requested</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Nothing here" description="No reviews match your filters." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Requirement</th>
                <th className="px-4 py-2.5 font-medium">RFP</th>
                <th className="px-4 py-2.5 font-medium">Risk</th>
                <th className="px-4 py-2.5 font-medium">Confidence</th>
                <th className="px-4 py-2.5 font-medium">Reviewer</th>
                <th className="px-4 py-2.5 font-medium">Due</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((review) => (
                <tr key={review.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link
                      to="/reviews/$reviewId"
                      params={{ reviewId: review.id }}
                      className="num font-medium text-foreground hover:underline"
                    >
                      {review.requirementCode}
                    </Link>
                    <p className="max-w-xs truncate text-xs text-muted-foreground">
                      {review.requirementTitle}
                    </p>
                  </td>
                  <td className="max-w-[12rem] truncate px-4 py-3 text-xs text-muted-foreground">
                    {review.rfpTitle}
                  </td>
                  <td className="px-4 py-3">
                    <RiskBadge risk={review.risk} />
                  </td>
                  <td className="px-4 py-3">
                    <ConfidenceMeter value={review.confidence} size="sm" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <PersonAvatar personId={review.reviewerId} />
                      <span className="text-xs text-muted-foreground">
                        {getPerson(review.reviewerId)?.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "num flex items-center gap-1 text-xs",
                        review.overdue ? "font-medium text-danger" : "text-muted-foreground",
                      )}
                    >
                      {review.overdue && <AlertTriangle className="h-3 w-3" />}
                      {review.due}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={review.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
