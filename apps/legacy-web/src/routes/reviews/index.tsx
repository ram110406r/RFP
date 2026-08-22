import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { reviewsQueryOptions } from "@/lib/api/reviews";
import { PageHeader } from "@/components/common/page-header";
import { PageSkeleton } from "@/components/common/page-skeleton";
import { StatusBadge } from "@/components/common/status-badge";
import { RiskBadge } from "@/components/common/risk-badge";
import { ConfidenceMeter } from "@/components/common/confidence-meter";
import { PersonAvatar } from "@/components/common/person-avatar";
import { EmptyState } from "@/components/common/empty-state";
import {
  DataRow,
  DataTable,
  DeadlineCell,
  RowCell,
  RowSub,
  RowTitle,
  Td,
  Th,
  rowEmphasis,
} from "@/components/common/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { deadlineMeta } from "@/lib/dates";
import { getPerson } from "@/lib/session";
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
        <div className="inline-flex rounded-lg border border-border bg-surface-sunken p-0.5">
          {(["all", "mine"] as ScopeFilter[]).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={scope === s ? "default" : "ghost"}
              className="h-7 px-3 text-meta"
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
        <EmptyState
          icon={<ClipboardCheck className="h-5 w-5" />}
          title="Nothing in this queue"
          description={
            scope === "mine"
              ? "No reviews are assigned to you right now."
              : "No reviews match the selected status."
          }
          action={
            scope === "mine" ? (
              <Button variant="outline" size="sm" onClick={() => setScope("all")}>
                View all reviews
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable
          head={
            <>
              <Th>Requirement</Th>
              <Th>RFP</Th>
              <Th>Risk</Th>
              <Th>Confidence</Th>
              <Th>Reviewer</Th>
              <Th>Due</Th>
              <Th>Status</Th>
            </>
          }
        >
          {filtered.map((review) => {
            const due = deadlineMeta(review.due);
            return (
              <DataRow
                key={review.id}
                emphasis={rowEmphasis({
                  risk: review.risk,
                  overdue: review.overdue,
                  dueInDays: due.days,
                })}
              >
                <Td>
                  <Link
                    to="/reviews/$reviewId"
                    params={{ reviewId: review.id }}
                    className="num hover:underline"
                  >
                    <RowTitle>{review.requirementCode}</RowTitle>
                  </Link>
                  <RowSub className="max-w-xs">{review.requirementTitle}</RowSub>
                </Td>
                <Td className="max-w-[12rem]">
                  <RowCell className="block truncate">{review.rfpTitle}</RowCell>
                </Td>
                <Td>
                  <RiskBadge risk={review.risk} />
                </Td>
                <Td>
                  <ConfidenceMeter value={review.confidence} size="sm" />
                </Td>
                <Td>
                  <span className="flex items-center gap-1.5">
                    <PersonAvatar personId={review.reviewerId} />
                    <RowCell>{getPerson(review.reviewerId)?.name}</RowCell>
                  </span>
                </Td>
                <Td>
                  <DeadlineCell meta={due} />
                </Td>
                <Td>
                  <StatusBadge status={review.status} />
                </Td>
              </DataRow>
            );
          })}
        </DataTable>
      )}
    </div>
  );
}
