"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { AppShell } from "../../components/app-shell";
import { RfpEmptyState, RfpLoadingState, RfpMetricCard, RfpStatusBadge } from "../../components/rfp-foundation";
import type { DashboardOverview } from "../../lib/models";
import { useDashboardSummary } from "../../lib/queries";

type SortKey = "priority" | "deadline" | "readiness" | "reviews";

const severityRank: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  INFO: 0,
};

export default function TendersPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <TendersPageContent />
    </Suspense>
  );
}

function TendersPageContent() {
  const searchParams = useSearchParams();
  const dashboardQuery = useDashboardSummary(25);
  const dashboard = dashboardQuery.data ?? null;
  const rows = useMemo<DashboardOverview["tenders"]>(
    () => dashboard?.activeTenders ?? dashboard?.tenders ?? [],
    [dashboard],
  );

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortKey>("priority");

  useEffect(() => {
    const stage = searchParams.get("stage");
    setStageFilter(stage ? stage.toUpperCase() : "all");
  }, [searchParams]);

  const metrics = dashboard?.metrics ?? {
    activeRfps: 0,
    dueThisWeek: 0,
    awaitingReview: 0,
    highRiskItems: 0,
    averageReadiness: null,
  };

  const knowledge = dashboard?.knowledge ?? {
    counts: { total: 0, draft: 0, active: 0, archived: 0, stale: 0 },
    items: [],
    attention: [],
  };

  const statusOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.tender.status))).sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      const haystack = `${row.tender.title} ${row.tender.name} ${row.tender.referenceNumber ?? ""}`.toLowerCase();
      const matchesSearch = normalizedSearch ? haystack.includes(normalizedSearch) : true;
      const matchesStatus = statusFilter === "all" ? true : row.tender.status === statusFilter;
      const matchesStage = stageFilter === "all" ? true : mapTenderStage(row.tender.status) === stageFilter;
      return matchesSearch && matchesStatus && matchesStage;
    });

    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "deadline":
          return compareDeadline(a.tender.dueAt, b.tender.dueAt);
        case "readiness":
          return (b.readiness ?? -1) - (a.readiness ?? -1);
        case "reviews":
          return (b.pendingReviews ?? 0) - (a.pendingReviews ?? 0);
        case "priority":
        default: {
          const severityDelta = rankSeverity(b.highestIssue?.severity) - rankSeverity(a.highestIssue?.severity);
          if (severityDelta !== 0) return severityDelta;
          const reviewDelta = (b.pendingReviews ?? 0) - (a.pendingReviews ?? 0);
          if (reviewDelta !== 0) return reviewDelta;
          return compareDeadline(a.tender.dueAt, b.tender.dueAt);
        }
      }
    });

    return sorted;
  }, [rows, search, statusFilter, stageFilter, sortBy]);

  const topIssues = useMemo(() => {
    return rows
      .flatMap((row) => (row.highestIssue ? [{ tender: row.tender, issue: row.highestIssue }] : []))
      .sort((a, b) => rankSeverity(b.issue.severity) - rankSeverity(a.issue.severity))
      .slice(0, 4);
  }, [rows]);

  const pendingReviews = useMemo(() => rows.filter((row) => row.pendingReviews > 0).slice(0, 4), [rows]);
  const overdueRows = useMemo(() => rows.filter((row) => isOverdue(row.tender.dueAt)), [rows]);

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "RFPs" }]}>
      <div className="space-y-6">
        {dashboardQuery.isError ? (
          <section className="rounded-[24px] border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            Unable to load the tender dashboard summary right now.
          </section>
        ) : null}

        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Pipeline</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">RFPs</h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                A live workspace view of tender readiness, review pressure, and the issues that need attention next.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/tenders/new"
                className="inline-flex items-center justify-center rounded-2xl bg-sky-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-800"
              >
                Add Tender
              </Link>
              <Link
                href="/tenders/import"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
              >
                Import Tender
              </Link>
              <Link
                href="/reviews"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
              >
                Open reviews
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Active RFPs"
            value={String(metrics.activeRfps)}
            helper="Current workspace scope"
            loading={dashboardQuery.isLoading || dashboardQuery.isError}
          />
          <MetricCard
            label="Due this week"
            value={String(metrics.dueThisWeek)}
            helper={metrics.dueThisWeek > 0 ? "Deadlines need attention" : "No near-term deadlines"}
            tone={metrics.dueThisWeek > 0 ? "warning" : "success"}
            loading={dashboardQuery.isLoading || dashboardQuery.isError}
          />
          <MetricCard
            label="Awaiting review"
            value={String(metrics.awaitingReview)}
            helper="Pending or changes requested"
            tone={metrics.awaitingReview > 0 ? "warning" : "success"}
            loading={dashboardQuery.isLoading || dashboardQuery.isError}
          />
          <MetricCard
            label="High-risk items"
            value={String(metrics.highRiskItems)}
            helper="Critical or high severity issues"
            tone={metrics.highRiskItems > 0 ? "danger" : "success"}
            loading={dashboardQuery.isLoading || dashboardQuery.isError}
          />
          <MetricCard
            label="Avg. readiness"
            value={metrics.averageReadiness === null ? "-" : `${metrics.averageReadiness}%`}
            helper="Across the loaded tenders"
            tone={metrics.averageReadiness !== null && metrics.averageReadiness >= 70 ? "success" : "warning"}
            loading={dashboardQuery.isLoading || dashboardQuery.isError}
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.9fr)]">
          <article className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
            <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Pipeline</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Tender overview</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Filter by status, search by customer or title, and sort by readiness, deadline, reviews, or operational priority.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 text-sm text-slate-500">
                <StatusPill tone="neutral">{filteredRows.length} visible</StatusPill>
                <StatusPill tone="neutral">{statusOptions.length} statuses</StatusPill>
                {stageFilter !== "all" ? <StatusPill tone="neutral">Stage: {stageFilter}</StatusPill> : null}
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_200px_180px]">
              <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-500">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search RFPs or customers..."
                  className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
              </label>

              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none"
              >
                <option value="all">All statuses</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>

              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as SortKey)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none"
              >
                <option value="priority">Sort: Priority</option>
                <option value="deadline">Sort: Deadline</option>
                <option value="readiness">Sort: Readiness</option>
                <option value="reviews">Sort: Reviews</option>
              </select>
            </div>

            <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-[1080px] w-full border-separate border-spacing-0">
                  <thead className="bg-slate-100/80 text-left text-[13px] uppercase tracking-[0.14em] text-slate-500">
                    <tr>
                      <Th>RFP</Th>
                      <Th>Owner</Th>
                      <Th>Progress</Th>
                      <Th>Issues</Th>
                      <Th>Risk</Th>
                      <Th>Deadline</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardQuery.isLoading && rows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-12">
                          <LoadingState />
                        </td>
                      </tr>
                    ) : filteredRows.length > 0 ? (
                      filteredRows.map((row) => (
                        <tr key={row.tender.id} className="bg-white align-top">
                          <Td>
                            <Link href={`/tenders/${row.tender.id}`} className="group block py-4 pr-4">
                              <p className="text-[15px] font-semibold text-slate-950 group-hover:text-sky-800">{row.tender.title}</p>
                              <p className="mt-1 text-sm text-slate-600">{row.tender.name}</p>
                              <p className="mt-1 text-xs text-slate-400">{row.tender.referenceNumber ?? row.tender.id.slice(0, 8)}</p>
                            </Link>
                          </Td>
                          <Td>
                            <div className="py-4">
                              <OwnerBadge ownerId={row.tender.ownerId} />
                            </div>
                          </Td>
                          <Td>
                            <div className="py-4">
                              <ProgressCell value={row.readiness} />
                            </div>
                          </Td>
                          <Td>
                            <div className="py-4">
                              <div className="flex flex-wrap gap-2">
                                <StatusPill tone={row.blockingIssueCount > 0 ? "danger" : row.issueCount > 0 ? "warning" : "success"}>
                                  {row.issueCount} total
                                </StatusPill>
                                {row.blockingIssueCount > 0 ? <StatusPill tone="danger">{row.blockingIssueCount} blocking</StatusPill> : null}
                              </div>
                            </div>
                          </Td>
                          <Td>
                            <div className="py-4">
                              <div className="space-y-1">
                                <StatusPill tone={highestIssueTone(row.highestIssue?.severity ?? null)}>
                                  {row.highestIssue?.severity ?? "None"}
                                </StatusPill>
                                {row.highestIssue ? (
                                  <p className="max-w-[220px] text-xs leading-5 text-slate-500">{row.highestIssue.title}</p>
                                ) : (
                                  <p className="text-xs leading-5 text-slate-400">No major blockers</p>
                                )}
                              </div>
                            </div>
                          </Td>
                          <Td>
                            <div className="py-4 text-sm text-slate-700">{formatRelativeDeadline(row.tender.dueAt)}</div>
                          </Td>
                          <Td>
                            <div className="py-4">
                              <StatusPill tone={statusTone(row.tender.status)}>{row.tender.status}</StatusPill>
                            </div>
                          </Td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-6 py-10">
                    <EmptyState
                            title="No matching RFPs"
                            description="Try a broader search or clear the status filter to show all loaded tenders."
                            actionLabel="Reset filters"
                            onAction={() => {
                              setSearch("");
                              setStatusFilter("all");
                              setStageFilter("all");
                              setSortBy("priority");
                            }}
                          />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </article>

          <aside className="space-y-6">
            <PanelCard eyebrow="Review queue" title="My tasks" count={String(metrics.awaitingReview)}>
              {pendingReviews.length > 0 ? (
                <div className="space-y-3">
                  {pendingReviews.map((row) => (
                    <div key={row.tender.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Link href={`/tenders/${row.tender.id}`} className="font-medium text-slate-950 hover:text-sky-800">
                            {row.tender.title}
                          </Link>
                          <p className="mt-1 text-sm text-slate-600">
                            {row.pendingReviews} review item{row.pendingReviews === 1 ? "" : "s"} need attention
                          </p>
                        </div>
                        <StatusPill tone="warning">{row.pendingReviews}</StatusPill>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No open reviews"
                  description="The visible pipeline has no pending review items right now."
                  actionLabel="Open reviews"
                  href="/reviews"
                />
              )}
            </PanelCard>

            <PanelCard eyebrow="Attention required" title="Highest-priority issues" count={String(topIssues.length)}>
              <div className="space-y-3">
                {topIssues.length > 0 ? (
                  topIssues.map(({ tender, issue }) => (
                    <div key={`${tender.id}-${issue.id}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-950">{issue.title}</p>
                          <p className="mt-1 text-sm text-slate-600">{tender.title}</p>
                        </div>
                        <StatusPill tone={highestIssueTone(issue.severity)}>{issue.severity}</StatusPill>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-600">{issue.recommendation}</p>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    title="No blocker issues"
                    description="Validation is clear across the loaded tenders."
                    actionLabel="Review RFPs"
                    href="/tenders"
                  />
                )}
              </div>
            </PanelCard>

            <PanelCard eyebrow="Deadlines" title="Due soon" count={String(overdueRows.length)}>
              {overdueRows.length > 0 ? (
                <div className="space-y-3">
                  {overdueRows.slice(0, 4).map((row) => (
                    <div key={row.tender.id} className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                      <Link href={`/tenders/${row.tender.id}`} className="font-medium text-slate-950 hover:text-sky-800">
                        {row.tender.title}
                      </Link>
                      <p className="mt-1 text-sm text-rose-700">{formatRelativeDeadline(row.tender.dueAt)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <StatRow label="Due this week" value={String(metrics.dueThisWeek)} />
                  <StatRow label="Knowledge sources" value={String(knowledge.counts.total)} />
                  <StatRow label="Stale knowledge" value={String(knowledge.counts.stale)} />
                </div>
              )}
            </PanelCard>
          </aside>
        </section>
      </div>
    </AppShell>
  );
}

function MetricCard({
  label,
  value,
  helper,
  tone = "neutral",
  loading = false,
}: {
  label: string;
  value: string;
  helper: string;
  tone?: "neutral" | "warning" | "danger" | "success";
  loading?: boolean;
}) {
  const trendLabel =
    tone === "danger" ? "Critical" : tone === "warning" ? "Attention" : tone === "success" ? "Healthy" : "Stable";
  return <RfpMetricCard label={label} value={value} description={helper} loading={loading} trend={{ label: trendLabel, tone }} />;
}

function PanelCard({
  eyebrow,
  title,
  count,
  children,
}: {
  eyebrow: string;
  title: string;
  count?: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{eyebrow}</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{title}</h3>
        </div>
        {count ? <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">{count}</span> : null}
      </div>
      {children}
    </article>
  );
}

function ProgressCell({ value }: { value: number | null }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-2.5 w-28 rounded-full bg-slate-200">
        <div className="h-2.5 rounded-full bg-sky-700" style={{ width: `${Math.max(8, value ?? 0)}%` }} />
      </div>
      <span className="text-sm font-medium text-slate-900">{value === null ? "-" : `${value}%`}</span>
    </div>
  );
}

function OwnerBadge({ ownerId }: { ownerId: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-900">
        {ownerId.slice(0, 2).toUpperCase()}
      </div>
      <div>
        <p className="text-sm font-medium text-slate-900">{shortId(ownerId)}</p>
        <p className="text-xs text-slate-500">Owner</p>
      </div>
    </div>
  );
}

function EmptyState({
  title,
  description,
  actionLabel,
  href,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  href?: string;
  onAction?: () => void;
}) {
  return <RfpEmptyState title={title} description={description} actionLabel={actionLabel} actionHref={href} onAction={onAction} />;
}

function LoadingState() {
  return <RfpLoadingState title="Loading tenders" description="Fetching the current workspace summary." />;
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="font-semibold text-slate-950">{value}</span>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-4 font-semibold">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="border-t border-slate-200 px-4 align-top">{children}</td>;
}

function StatusPill({ tone, children }: { tone: "success" | "warning" | "danger" | "neutral"; children: React.ReactNode }) {
  return <RfpStatusBadge tone={tone}>{children}</RfpStatusBadge>;
}

function highestIssueTone(severity: string | null): "success" | "warning" | "danger" | "neutral" {
  if (severity === "CRITICAL") return "danger";
  if (severity === "HIGH") return "warning";
  if (severity === "MEDIUM") return "neutral";
  return "success";
}

function formatRelativeDeadline(value: string | null) {
  if (!value) return "Not set";
  const diffDays = Math.round((new Date(value).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays > 1) return `in ${diffDays} days`;
  if (diffDays === -1) return "1 day overdue";
  return `${Math.abs(diffDays)} days overdue`;
}

function isOverdue(value: string | null) {
  if (!value) return false;
  return new Date(value).getTime() < Date.now();
}

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  const normalized = status.toUpperCase();
  if (normalized.includes("APPROVED") || normalized.includes("ACTIVE") || normalized.includes("SUBMITTED")) return "success";
  if (normalized.includes("DRAFT") || normalized.includes("PENDING") || normalized.includes("REVIEW")) return "warning";
  if (normalized.includes("REJECT") || normalized.includes("ARCHIVED") || normalized.includes("CANCEL")) return "danger";
  return "neutral";
}

function compareDeadline(a: string | null, b: string | null) {
  const timeA = a ? new Date(a).getTime() : Number.POSITIVE_INFINITY;
  const timeB = b ? new Date(b).getTime() : Number.POSITIVE_INFINITY;
  return timeA - timeB;
}

function shortId(value: string) {
  return value.length > 10 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value;
}

function rankSeverity(severity: string | null | undefined) {
  return severityRank[severity ?? "INFO"] ?? 0;
}

function mapTenderStage(status: string) {
  const normalized = status.toUpperCase();
  if (["DRAFT", "INTAKE", "PROCESSING"].includes(normalized)) return "INTAKE";
  if (normalized === "IN_PROGRESS") return "ANSWERING";
  if (normalized === "REVIEW") return "REVIEW";
  if (normalized === "APPROVED") return "APPROVAL";
  if (normalized === "READY") return "READY";
  if (["SUBMITTED", "CLOSED"].includes(normalized)) return "SUBMITTED";
  return "INTAKE";
}
