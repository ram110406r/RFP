import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, ShieldAlert, UserPlus, XCircle } from "lucide-react";
import { reviewQueryOptions, submitReviewAction, type ReviewAction } from "@/lib/api/reviews";
import { requirementQueryOptions, assignReviewer } from "@/lib/api/requirements";
import { evidenceForRequirementQueryOptions } from "@/lib/api/evidence";
import { PageHeader } from "@/components/common/page-header";
import { PageSkeleton } from "@/components/common/page-skeleton";
import { RouteErrorState } from "@/components/common/route-error-state";
import { RiskBadge } from "@/components/common/risk-badge";
import { StatusBadge } from "@/components/common/status-badge";
import { ConfidenceMeter } from "@/components/common/confidence-meter";
import { EvidenceCard } from "@/components/common/evidence-card";
import { PersonAvatar } from "@/components/common/person-avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CURRENT_USER_ID, getPerson, people, personName } from "@/lib/session";

const ACTION_FOR_STATUS: Record<"approved" | "rejected" | "changes_requested", ReviewAction> = {
  approved: "APPROVED",
  rejected: "REJECTED",
  changes_requested: "REQUEST_CHANGES",
};

export const Route = createFileRoute("/reviews/$reviewId")({
  loader: async ({ context, params }) => {
    const review = await context.queryClient.ensureQueryData(reviewQueryOptions(params.reviewId));
    const requirement = await context.queryClient.ensureQueryData(
      requirementQueryOptions(review.requirementId),
    );
    await context.queryClient.ensureQueryData(evidenceForRequirementQueryOptions(requirement.id));
    return { crumb: review.requirementCode };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.crumb} · Tendyy` : "Review · Tendyy" }],
  }),
  pendingComponent: PageSkeleton,
  errorComponent: RouteErrorState,
  component: ReviewDetail,
});

function ReviewDetail() {
  const { reviewId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: review } = useSuspenseQuery(reviewQueryOptions(reviewId));
  const { data: requirement } = useSuspenseQuery(requirementQueryOptions(review.requirementId));
  const { data: evidence } = useSuspenseQuery(evidenceForRequirementQueryOptions(requirement.id));

  const [comment, setComment] = useState("");
  const [changesNote, setChangesNote] = useState("");
  const [showChanges, setShowChanges] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [assignTo, setAssignTo] = useState(review.reviewerId);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["reviews"] });
    queryClient.invalidateQueries({ queryKey: ["requirements"] });
  }

  const decide = useMutation({
    mutationFn: ({
      status,
      note,
    }: {
      status: "approved" | "rejected" | "changes_requested";
      note?: string;
    }) => submitReviewAction(requirement.id, ACTION_FOR_STATUS[status], note),
    onSuccess: (_d, vars) => {
      invalidate();
      setShowChanges(false);
      setChangesNote("");
      toast.success(
        vars.status === "approved"
          ? "Approved"
          : vars.status === "rejected"
            ? "Rejected"
            : "Changes requested",
      );
    },
    onError: () => toast.error("Couldn't update the review. Try again."),
  });

  const assign = useMutation({
    mutationFn: (reviewerId: string) =>
      assignReviewer(requirement.id, reviewerId, personName(CURRENT_USER_ID)),
    onSuccess: () => {
      invalidate();
      setShowAssign(false);
      toast.success("Reviewer reassigned");
    },
    onError: () => toast.error("Couldn't reassign the reviewer. Try again."),
  });

  const addComment = useMutation({
    mutationFn: () => submitReviewAction(review.requirementId, "COMMENT", comment),
    onSuccess: () => {
      invalidate();
      setComment("");
      toast.success("Comment added");
    },
    onError: () => toast.error("Couldn't add the comment. Try again."),
  });

  const locked = review.status === "approved" || review.status === "rejected";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Review"
        title={`${review.requirementCode} — ${review.requirementTitle}`}
        description={
          <Link to="/rfps/$rfpId" params={{ rfpId: review.rfpId }} className="hover:underline">
            {review.rfpTitle}
          </Link>
        }
        actions={<StatusBadge status={review.status} />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <div className="surface-panel space-y-3 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Question
            </p>
            <p className="text-sm text-foreground">{requirement.question}</p>
          </div>

          <div className="surface-panel space-y-3 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Answer
              </p>
              <ConfidenceMeter value={requirement.confidence} size="sm" />
            </div>
            <p className="text-sm leading-relaxed text-foreground">
              {requirement.answer || "No answer drafted yet."}
            </p>
          </div>

          <div className="space-y-2 rounded-lg border border-danger/20 bg-danger-soft/40 p-4">
            <div className="flex items-center gap-2 text-danger">
              <ShieldAlert className="h-4 w-4" />
              <p className="text-sm font-medium">
                Risk — <RiskBadge risk={requirement.risk} className="align-middle" />
              </p>
            </div>
            <p className="text-sm text-foreground/90">{requirement.riskRationale}</p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Evidence ({evidence.length})
            </p>
            {evidence.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3.5 text-sm text-muted-foreground">
                No evidence linked.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {evidence.map((ev) => (
                  <EvidenceCard key={ev.id} evidence={ev} />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className="surface-panel space-y-3 p-4">
            <h3 className="text-sm font-semibold text-foreground">Reviewer actions</h3>
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                disabled={locked || decide.isPending}
                onClick={() => decide.mutate({ status: "approved" })}
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={locked || decide.isPending}
                onClick={() => decide.mutate({ status: "rejected" })}
              >
                <XCircle className="h-3.5 w-3.5" /> Reject
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={locked}
                onClick={() => setShowChanges((v) => !v)}
              >
                Request changes
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={locked}
                onClick={() => setShowAssign((v) => !v)}
              >
                <UserPlus className="h-3.5 w-3.5" /> Reassign
              </Button>
            </div>
            {showChanges && (
              <div className="space-y-2">
                <Textarea
                  placeholder="What needs to change?"
                  value={changesNote}
                  onChange={(e) => setChangesNote(e.target.value)}
                  rows={3}
                />
                <Button
                  size="sm"
                  className="w-full"
                  disabled={!changesNote.trim() || decide.isPending}
                  onClick={() => decide.mutate({ status: "changes_requested", note: changesNote })}
                >
                  Submit
                </Button>
              </div>
            )}
            {showAssign && (
              <div className="space-y-2">
                <Select value={assignTo} onValueChange={setAssignTo}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {people.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} — {p.role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  className="w-full"
                  disabled={assign.isPending}
                  onClick={() => assign.mutate(assignTo)}
                >
                  Confirm
                </Button>
              </div>
            )}
          </div>

          <div className="surface-panel space-y-3 p-4">
            <h3 className="text-sm font-semibold text-foreground">Comments</h3>
            <div className="space-y-3">
              {review.comments.length === 0 && (
                <p className="text-sm text-muted-foreground">No comments yet.</p>
              )}
              {review.comments.map((c) => (
                <div key={c.id} className="flex gap-2.5">
                  <PersonAvatar personId={c.authorId} className="mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">
                      {getPerson(c.authorId)?.name}
                    </p>
                    <p className="text-sm text-muted-foreground">{c.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Textarea
                placeholder="Leave a comment…"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
              />
              <Button
                size="sm"
                className="w-full"
                disabled={!comment.trim() || addComment.isPending}
                onClick={() => addComment.mutate()}
              >
                Comment
              </Button>
            </div>
          </div>

          <div className="surface-panel space-y-3 p-4">
            <h3 className="text-sm font-semibold text-foreground">Approval history</h3>
            <ol className="space-y-2.5">
              {review.history
                .slice()
                .reverse()
                .map((h) => (
                  <li key={h.id} className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{h.label}</span> ·{" "}
                    {personName(h.actorId)} ·{" "}
                    {new Date(h.at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </li>
                ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
