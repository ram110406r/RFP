"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { AppShell } from "../../components/app-shell";
import { RfpEmptyState, RfpStatusBadge } from "../../components/rfp-foundation";
import type { ReviewQueueItem } from "../../lib/models";
import { useReviewQueue, useUpdateReview } from "../../lib/queries";

type ReviewStatus = "PENDING" | "CHANGES_REQUESTED" | "APPROVED" | "REJECTED";
type QueueView = "mine-actionable" | "all-actionable" | "all-statuses";

const ACTIONABLE_STATUSES: ReviewStatus[] = ["PENDING", "CHANGES_REQUESTED"];
const ALL_STATUSES: ReviewStatus[] = ["PENDING", "CHANGES_REQUESTED", "APPROVED", "REJECTED"];

const VIEW_OPTIONS: Array<{ id: QueueView; label: string; scope: "mine" | "all"; statuses: ReviewStatus[] }> = [
  { id: "mine-actionable", label: "My actionable", scope: "mine", statuses: ACTIONABLE_STATUSES },
  { id: "all-actionable", label: "All actionable", scope: "all", statuses: ACTIONABLE_STATUSES },
  { id: "all-statuses", label: "All statuses", scope: "all", statuses: ALL_STATUSES },
];
const DEFAULT_VIEW = VIEW_OPTIONS[0]!;

const STATUS_GROUPS: Array<{ key: ReviewStatus; label: string }> = [
  { key: "PENDING", label: "Pending" },
  { key: "CHANGES_REQUESTED", label: "Changes requested" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
];

export default function ReviewsPage() {
  const [view, setView] = useState<QueueView>("mine-actionable");
  const [search, setSearch] = useState("");
  const selectedView = VIEW_OPTIONS.find((item) => item.id === view) ?? DEFAULT_VIEW;
  const reviewsQuery = useReviewQueue({
    scope: selectedView.scope,
    statuses: selectedView.statuses,
    q: search.trim() || undefined,
    pageSize: 50,
  });
  const payload = reviewsQuery.data;
  const items = useMemo(() => payload?.items ?? [], [payload?.items]);
  const grouped = useMemo(
    () => STATUS_GROUPS.filter((group) => selectedView.statuses.includes(group.key)).map((group) => ({
      ...group,
      items: items.filter((item) => item.review.status === group.key),
    })),
    [items, selectedView.statuses],
  );

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Reviews" }]}>
      <div className="space-y-5">
        <section className="border border-[#E4E7EC] bg-white p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#155EEF]">Reviewer queue</p>
              <h1 className="mt-2 text-[28px] font-semibold tracking-tight text-[#101828]">Reviews</h1>
              <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[#667085]">
                Work assigned answer reviews with tender, question, requirement, evidence, and reviewer context in one queue.
              </p>
            </div>
            <label className="min-w-0 lg:w-80">
              <span className="sr-only">Search reviews</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search tender, question, or answer"
                className="h-10 w-full border border-[#D0D5DD] bg-white px-3 text-sm text-[#101828] outline-none transition placeholder:text-[#98A2B3] focus:border-[#155EEF] focus:ring-2 focus:ring-[#EFF5FF]"
              />
            </label>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <MetricCard label="Actionable" value={payload?.counts.actionable ?? 0} tone="warning" />
          <MetricCard label="Pending" value={payload?.counts.pending ?? 0} tone="warning" />
          <MetricCard label="Changes" value={payload?.counts.changesRequested ?? 0} tone="warning" />
          <MetricCard label="Approved" value={payload?.counts.approved ?? 0} tone="success" />
          <MetricCard label="Rejected" value={payload?.counts.rejected ?? 0} tone="danger" />
          <MetricCard label="Total" value={payload?.counts.total ?? 0} tone="neutral" />
        </section>

        <section className="flex flex-col gap-3 border border-[#E4E7EC] bg-white p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setView(option.id)}
                className={`h-9 border px-3 text-xs font-semibold transition ${
                  view === option.id
                    ? "border-[#155EEF] bg-[#EFF5FF] text-[#155EEF]"
                    : "border-[#E4E7EC] bg-white text-[#344054] hover:bg-[#F8FAFC]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-[#667085]">
            Showing {items.length} of {payload?.total ?? 0} matching reviews
          </p>
        </section>

        {reviewsQuery.isLoading ? <ReviewSkeleton /> : null}
        {reviewsQuery.isError ? <ErrorState onRetry={() => void reviewsQuery.refetch()} error={reviewsQuery.error} /> : null}
        {!reviewsQuery.isLoading && !reviewsQuery.isError && items.length === 0 ? (
          <RfpEmptyState
            title={search.trim() ? "No matching reviews" : view === "mine-actionable" ? "Your review queue is clear" : "No review items found"}
            description={search.trim() ? "Try a different tender, question, or answer search." : "Reviews will appear here when answers are assigned or sent for review."}
            actionHref="/apply"
            actionLabel="Open Apply"
          />
        ) : null}

        {!reviewsQuery.isLoading && !reviewsQuery.isError && items.length > 0 ? (
          <div className="space-y-5">
            {grouped.map((group) => (
              <section key={group.key} className="border border-[#E4E7EC] bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-[17px] font-semibold text-[#101828]">{group.label}</h2>
                  <RfpStatusBadge tone={reviewTone(group.key)}>{group.items.length}</RfpStatusBadge>
                </div>
                {group.items.length > 0 ? (
                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    {group.items.map((item) => <ReviewQueueCard key={item.review.id} item={item} />)}
                  </div>
                ) : (
                  <p className="mt-4 bg-[#F8FAFC] px-4 py-3 text-sm text-[#667085]">No items in this lane.</p>
                )}
              </section>
            ))}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

function ReviewQueueCard({ item }: { item: ReviewQueueItem }) {
  const updateReview = useUpdateReview(item.tender.id);
  const canAct = item.canAct && (item.review.status === "PENDING" || item.review.status === "CHANGES_REQUESTED");

  async function setStatus(status: Exclude<ReviewStatus, "PENDING">) {
    await updateReview.mutateAsync({
      reviewId: item.review.id,
      status,
      comment: item.review.comment || defaultReviewComment(status),
    });
  }

  return (
    <article className="min-w-0 border border-[#E4E7EC] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={item.href} className="tendyy-wrap-anywhere text-[16px] font-semibold text-[#101828] hover:text-[#155EEF]">
            {item.tender.title}
          </Link>
          <p className="mt-1 text-xs text-[#667085]">
            {item.tender.referenceNumber ?? item.tender.name} / Due {formatDate(item.tender.dueAt)}
          </p>
        </div>
        <RfpStatusBadge tone={reviewTone(item.review.status)}>{statusLabel(item.review.status)}</RfpStatusBadge>
      </div>

      <div className="mt-4 space-y-2">
        <p className="tendyy-wrap-anywhere text-sm font-semibold leading-6 text-[#344054]">
          {item.requirement?.title ?? item.question.questionText}
        </p>
        {item.requirement && item.question.questionText !== item.requirement.title ? (
          <p className="tendyy-wrap-anywhere text-xs leading-5 text-[#667085]">{item.question.questionText}</p>
        ) : null}
      </div>

      <p className="mt-4 line-clamp-3 bg-[#F8FAFC] px-3 py-2 text-sm leading-6 text-[#344054]">
        {item.answer.answerText || "No saved answer text is available for this review."}
      </p>

      <div className="mt-4 grid gap-2 text-sm text-[#667085] md:grid-cols-2">
        <Row label="Evidence" value={`${item.answer.evidenceCount} linked`} />
        <Row label="Confidence" value={`${Math.round(item.answer.confidence * 100)}%`} />
        <Row label="Reviewer" value={reviewerLabel(item)} />
        <Row label="Age" value={ageLabel(item.review.createdAt)} />
      </div>

      {item.review.comment ? <p className="mt-3 border-l-2 border-[#D0D5DD] pl-3 text-xs leading-5 text-[#667085]">{item.review.comment}</p> : null}
      {updateReview.isError ? <p className="mt-3 text-xs font-semibold text-rose-700">{errorMessage(updateReview.error)}</p> : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link href={item.href} className="inline-flex h-9 items-center border border-[#B2CCFF] bg-[#EFF5FF] px-3 text-xs font-semibold text-[#155EEF] hover:bg-[#D1E9FF]">
          Open detail
        </Link>
        {canAct ? (
          <>
            <ActionButton disabled={updateReview.isPending} tone="success" onClick={() => void setStatus("APPROVED")}>
              Approve
            </ActionButton>
            <ActionButton disabled={updateReview.isPending} tone="warning" onClick={() => void setStatus("CHANGES_REQUESTED")}>
              Request changes
            </ActionButton>
            <ActionButton disabled={updateReview.isPending} tone="danger" onClick={() => void setStatus("REJECTED")}>
              Reject
            </ActionButton>
          </>
        ) : null}
      </div>
    </article>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone: "success" | "warning" | "danger" | "neutral" }) {
  const toneClass = tone === "success" ? "text-emerald-700" : tone === "danger" ? "text-rose-700" : tone === "warning" ? "text-amber-700" : "text-[#344054]";
  return (
    <div className="border border-[#E4E7EC] bg-white p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#667085]">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 bg-[#F8FAFC] px-3 py-2">
      <span className="shrink-0">{label}</span>
      <span className="truncate text-right font-medium text-[#101828]">{value}</span>
    </div>
  );
}

function ActionButton({ tone, disabled, onClick, children }: { tone: "success" | "warning" | "danger"; disabled: boolean; onClick: () => void; children: ReactNode }) {
  const classes = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
    warning: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
    danger: "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100",
  };
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`h-9 border px-3 text-xs font-semibold disabled:opacity-60 ${classes[tone]}`}>
      {children}
    </button>
  );
}

function ReviewSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((item) => (
        <div key={item} className="border border-[#E4E7EC] bg-white p-4">
          <div className="h-5 w-48 animate-pulse bg-[#F2F4F7]" />
          <div className="mt-4 h-20 animate-pulse bg-[#F8FAFC]" />
        </div>
      ))}
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <section className="border border-rose-200 bg-rose-50 p-4">
      <h2 className="text-sm font-semibold text-rose-900">Review queue could not load</h2>
      <p className="mt-1 text-sm text-rose-700">{errorMessage(error)}</p>
      <button type="button" onClick={onRetry} className="mt-3 h-9 border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-800">
        Retry
      </button>
    </section>
  );
}

function reviewerLabel(item: ReviewQueueItem) {
  if (item.reviewer?.name) return item.reviewer.name;
  if (item.review.reviewerName) return item.review.reviewerName;
  return item.review.reviewerId ?? "Unassigned";
}

function reviewTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "APPROVED") return "success";
  if (status === "CHANGES_REQUESTED" || status === "PENDING") return "warning";
  if (status === "REJECTED") return "danger";
  return "neutral";
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ").toLowerCase().replace(/^\w|\s\w/g, (match) => match.toUpperCase());
}

function defaultReviewComment(status: string) {
  if (status === "APPROVED") return "Approved from the review queue.";
  if (status === "REJECTED") return "Rejected from the review queue.";
  return "Changes requested from the review queue.";
}

function ageLabel(date: string) {
  const elapsed = Date.now() - new Date(date).getTime();
  const days = Math.max(0, Math.floor(elapsed / 86_400_000));
  if (days === 0) return "Today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Please try again.";
}
