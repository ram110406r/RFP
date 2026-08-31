"use client";

import Link from "next/link";
import { useQueries } from "@tanstack/react-query";

import { AppShell } from "../../components/app-shell";
import { RfpEmptyState, RfpStatusBadge } from "../../components/rfp-foundation";
import { fetchTenderReviews, fetchWorkspaceOverview } from "../../lib/api";
import { useTenders, tenderKeys } from "../../lib/queries";

export default function ReviewsPage() {
  const tendersQuery = useTenders({ pageSize: 10, includeArchived: false });
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

  const items = tenders.flatMap((tender, index) => {
    const workspace = workspaceQueries[index]?.data ?? null;
    const reviews = reviewQueries[index]?.data?.items ?? [];
    return reviews.map((review) => ({
      tender,
      review,
      readiness: workspace?.validation.current.score ?? null,
    }));
  });

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Reviews" }]}>
      <div className="space-y-5">
        <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-700">Review queue</p>
          <h1 className="mt-2 text-[29px] font-semibold tracking-tight text-slate-950">Reviews</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-600">
            Current review items surfaced from the live tender workspace data.
          </p>
        </section>

        {items.length > 0 ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {items.map(({ tender, review, readiness }) => (
              <article key={review.id} className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={`/tenders/${tender.id}`} className="text-[16px] font-semibold text-slate-950 hover:text-sky-800">
                      {tender.title}
                    </Link>
                    <p className="mt-1 text-[13px] leading-6 text-slate-600">{review.comment || "No reviewer note yet."}</p>
                  </div>
                  <Badge tone={reviewTone(review.status)}>{review.status}</Badge>
                </div>
                <div className="mt-4 grid gap-2 text-sm text-slate-600">
                  <Row label="RFP" value={tender.name} />
                  <Row label="Readiness" value={readiness === null ? "-" : `${readiness}%`} />
                  <Row label="Updated" value={new Date(review.updatedAt).toLocaleDateString()} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2">
      <span>{label}</span>
      <span className="font-medium text-slate-950">{value}</span>
    </div>
  );
}

function Badge({ tone, children }: { tone: "success" | "warning" | "danger" | "neutral"; children: React.ReactNode }) {
  return <RfpStatusBadge tone={tone}>{children}</RfpStatusBadge>;
}

function reviewTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "APPROVED") return "success";
  if (status === "CHANGES_REQUESTED" || status === "PENDING") return "warning";
  if (status === "REJECTED") return "danger";
  return "neutral";
}

function EmptyState() {
  return <RfpEmptyState title="No review items yet" description="Reviews will appear here once work is added to a tender." actionHref="/" actionLabel="Back to dashboard" />;
}
