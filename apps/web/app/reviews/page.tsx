"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useQueries } from "@tanstack/react-query";

import { AppShell } from "../../components/app-shell";
import { RfpEmptyState, RfpStatusBadge } from "../../components/rfp-foundation";
import { fetchTenderAnswers, fetchTenderQuestions, fetchTenderReviews, fetchWorkspaceOverview } from "../../lib/api";
import type { TenderAnswer, TenderQuestion, TenderReview, TenderSummary, WorkspaceOverview } from "../../lib/models";
import { useTenders, tenderKeys, useUpdateReview } from "../../lib/queries";

type ReviewQueueItem = {
  tender: TenderSummary;
  review: TenderReview;
  workspace: WorkspaceOverview | null;
  answer: TenderAnswer | null;
  question: TenderQuestion | null;
};

const GROUPS = [
  { key: "PENDING", label: "Pending" },
  { key: "CHANGES_REQUESTED", label: "Changes requested" },
  { key: "REJECTED", label: "Rejected" },
  { key: "APPROVED", label: "Approved" },
] as const;

export default function ReviewsPage() {
  const tendersQuery = useTenders({ pageSize: 25, includeArchived: false });
  const tenders = tendersQuery.data?.items ?? [];
  const workspaceQueries = useQueries({
    queries: tenders.map((tender) => ({
      queryKey: tenderKeys.workspace(tender.id),
      queryFn: () => fetchWorkspaceOverview(tender.id),
    })),
  });
  const reviewQueries = useQueries({
    queries: tenders.map((tender) => ({
      queryKey: tenderKeys.reviews(tender.id),
      queryFn: () => fetchTenderReviews(tender.id),
    })),
  });
  const answerQueries = useQueries({
    queries: tenders.map((tender) => ({
      queryKey: tenderKeys.answers(tender.id),
      queryFn: () => fetchTenderAnswers(tender.id),
    })),
  });
  const questionQueries = useQueries({
    queries: tenders.map((tender) => ({
      queryKey: tenderKeys.questions(tender.id),
      queryFn: () => fetchTenderQuestions(tender.id),
    })),
  });

  const items = tenders.flatMap((tender, index) => {
    const workspace = workspaceQueries[index]?.data ?? null;
    const answers = answerQueries[index]?.data?.items ?? [];
    const questions = questionQueries[index]?.data?.items ?? [];
    const reviews = reviewQueries[index]?.data?.items ?? [];
    return reviews.map((review) => {
      const answer = answers.find((item) => item.id === review.answerId) ?? null;
      const question = answer ? questions.find((item) => item.id === answer.questionId) ?? null : null;
      return { tender, review, workspace, answer, question };
    });
  });
  const grouped = GROUPS.map((group) => ({ ...group, items: items.filter((item) => item.review.status === group.key) }));

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Reviews" }]}>
      <div className="space-y-5">
        <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-700">Reviewer queue</p>
          <h1 className="mt-2 text-[29px] font-semibold tracking-tight text-slate-950">Reviews</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-600">
            Work review items across active tenders. Open a requirement for full context or act inline when the review API permits it.
          </p>
        </section>

        {items.length > 0 ? (
          <div className="space-y-5">
            {grouped.map((group) => (
              <section key={group.key} className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-[18px] font-semibold text-slate-950">{group.label}</h2>
                  <Badge tone={groupTone(group.key)}>{group.items.length}</Badge>
                </div>
                {group.items.length > 0 ? (
                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    {group.items.map((item) => <ReviewQueueCard key={item.review.id} item={item} />)}
                  </div>
                ) : (
                  <p className="mt-4 rounded-[10px] bg-slate-50 px-4 py-3 text-sm text-slate-500">No items in this lane.</p>
                )}
              </section>
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </div>
    </AppShell>
  );
}

function ReviewQueueCard({ item }: { item: ReviewQueueItem }) {
  const updateReview = useUpdateReview(item.tender.id);
  const requirement = item.question?.requirementIds[0]
    ? item.workspace?.requirements.find((entry) => entry.id === item.question?.requirementIds[0]) ?? null
    : null;
  const href = requirement ? `/tenders/${item.tender.id}/requirements/${requirement.id}` : `/apply/${item.tender.id}`;
  const canAct = item.review.status === "PENDING" || item.review.status === "CHANGES_REQUESTED";

  async function setStatus(status: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED") {
    await updateReview.mutateAsync({
      reviewId: item.review.id,
      status,
      comment: item.review.comment || defaultReviewComment(status),
    });
  }

  return (
    <article className="rounded-[10px] border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={href} className="tendyy-wrap-anywhere text-[16px] font-semibold text-slate-950 hover:text-sky-800">
            {item.tender.title}
          </Link>
          <p className="mt-1 text-[13px] leading-6 text-slate-600">
            {item.question?.questionText ?? requirement?.title ?? "Requirement context unavailable"}
          </p>
        </div>
        <Badge tone={reviewTone(item.review.status)}>{statusLabel(item.review.status)}</Badge>
      </div>

      <p className="mt-4 line-clamp-3 rounded-[10px] bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
        {item.answer?.answerText || "No saved answer text is available for this review."}
      </p>

      <div className="mt-4 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
        <Row label="Evidence" value={`${item.answer?.evidenceCount ?? 0}`} />
        <Row label="Confidence" value={typeof item.answer?.confidence === "number" ? `${Math.round(item.answer.confidence * 100)}%` : "-"} />
        <Row label="Comment" value={item.review.comment || "No reviewer note"} />
        <Row label="Age" value={ageLabel(item.review.createdAt)} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link href={href} className="inline-flex h-9 items-center rounded-lg border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-800 hover:bg-sky-100">
          Open detail
        </Link>
        {canAct ? (
          <>
            <button type="button" disabled={updateReview.isPending} onClick={() => void setStatus("APPROVED")} className="h-9 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 disabled:opacity-60">
              Approve
            </button>
            <button type="button" disabled={updateReview.isPending} onClick={() => void setStatus("CHANGES_REQUESTED")} className="h-9 rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-800 disabled:opacity-60">
              Request changes
            </button>
            <button type="button" disabled={updateReview.isPending} onClick={() => void setStatus("REJECTED")} className="h-9 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-800 disabled:opacity-60">
              Reject
            </button>
          </>
        ) : null}
      </div>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-[10px] bg-slate-50 px-3 py-2">
      <span className="shrink-0">{label}</span>
      <span className="truncate text-right font-medium text-slate-950">{value}</span>
    </div>
  );
}

function Badge({ tone, children }: { tone: "success" | "warning" | "danger" | "neutral"; children: ReactNode }) {
  return <RfpStatusBadge tone={tone}>{children}</RfpStatusBadge>;
}

function reviewTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "APPROVED") return "success";
  if (status === "CHANGES_REQUESTED" || status === "PENDING") return "warning";
  if (status === "REJECTED") return "danger";
  return "neutral";
}

function groupTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "APPROVED") return "success";
  if (status === "REJECTED") return "danger";
  if (status === "PENDING" || status === "CHANGES_REQUESTED") return "warning";
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

function EmptyState() {
  return <RfpEmptyState title="No review items yet" description="Reviews will appear here once answers are sent for review." actionHref="/apply" actionLabel="Open Apply" />;
}
