"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Bell,
  CalendarClock,
  ClipboardCheck,
  FileCheck2,
  FileText,
  Flag,
  Info,
  ListChecks,
  MessageSquare,
  Search,
  ShieldAlert,
  Timer,
} from "lucide-react";

import { AppShell } from "./app-shell";
import { RfpEmptyState, RfpStatusBadge, statusTone } from "./rfp-foundation";
import type { DashboardOverview, DashboardTenderCard } from "../lib/models";
import { useDashboardSummary } from "../lib/queries";

type Kpi = {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  loading?: boolean;
};

export function DashboardWorkspace() {
  const dashboardQuery = useDashboardSummary(6);
  const dashboard = dashboardQuery.data ?? null;

  const rows = useMemo<DashboardOverview["tenders"]>(
    () => dashboard?.activeTenders ?? [],
    [dashboard],
  );

  const metrics = dashboard?.metrics;
  const activeCount = metrics?.activeRfps ?? 0;
  const dueThisWeek = metrics?.dueThisWeek ?? 0;
  const awaitingReview = metrics?.awaitingReview ?? 0;
  const submissionReady = metrics?.submissionReady ?? rows.filter((row) => row.ready).length;
  const blocked = metrics?.blockedFromSubmission ?? rows.reduce((sum, row) => sum + row.blockingIssueCount, 0);
  const highRisk = metrics?.highRiskItems ?? 0;
  const pipeline = dashboard?.pipeline ?? [];
  const attention = dashboard?.attention ?? [];
  const reviewQueue = dashboard?.reviewQueue.items ?? [];
  const dueItems = dashboard?.deadlines.dueThisWeek.items ?? [];
  const overdueItems = dashboard?.deadlines.overdue.items ?? [];

  const kpis: Kpi[] = [
    {
      label: "ACTIVE RFPS",
      value: String(activeCount),
      detail: `${rows.length} currently visible in this workspace`,
      icon: <FileText className="h-5 w-5" strokeWidth={1.8} />,
    },
    {
      label: "DUE THIS WEEK",
      value: String(dueThisWeek),
      detail: dueThisWeek ? "Deadlines requiring attention" : "No near-term deadlines",
      icon: <CalendarClock className="h-5 w-5" strokeWidth={1.8} />,
    },
    {
      label: "AWAITING REVIEW",
      value: String(awaitingReview),
      detail: `${highRisk} high-risk item${highRisk === 1 ? "" : "s"} in the workspace`,
      icon: <ClipboardCheck className="h-5 w-5" strokeWidth={1.8} />,
    },
    {
      label: "SUBMISSION READY",
      value: String(submissionReady),
      detail: blocked ? `${blocked} blocked by validation issues` : "No active submission blockers",
      icon: <BadgeCheck className="h-5 w-5" strokeWidth={1.8} />,
    },
  ];

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard" }]} hideDesktopHeader>
      <div className="min-w-0 space-y-5 pb-6">
        <DashboardHeader generatedAt={dashboard?.generatedAt} />

        {dashboardQuery.isError ? (
          <div className="border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
            Unable to load the dashboard summary right now.
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Dashboard metrics">
          {kpis.map((kpi) => (
            <KpiCard key={kpi.label} {...kpi} loading={dashboardQuery.isLoading || dashboardQuery.isError} />
          ))}
        </section>

        <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.9fr)_minmax(300px,1fr)]">
          <PipelineSnapshot pipeline={pipeline} />
          <RecentActivity attention={attention} reviewQueue={reviewQueue} />
        </section>

        <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.9fr)_minmax(300px,1fr)]">
          <ActiveTenders rows={rows} loading={dashboardQuery.isLoading} />
          <ImportantAlerts
            overdueCount={dashboard?.deadlines.overdue.count ?? 0}
            dueCount={dueThisWeek}
            reviewCount={awaitingReview}
            blockedCount={blocked}
            overdueItems={overdueItems}
            dueItems={dueItems}
          />
        </section>
      </div>
    </AppShell>
  );
}

function DashboardHeader({ generatedAt }: { generatedAt?: string }) {
  return (
    <header className="flex flex-col gap-4 border-b border-[#E4E7EC] pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">RFP operations</p>
        <h1 className="mt-2 text-[29px] font-semibold tracking-[-0.03em] text-[#101828] sm:text-[30px]">Dashboard</h1>
        <p className="mt-1 text-sm text-[#667085]">Overview of your tender and RFP activities</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-[#E4E7EC] bg-white px-3 text-sm text-[#344054]">
          <CalendarClock className="h-4 w-4 text-[#155EEF]" strokeWidth={1.8} />
          <span>{generatedAt ? `Updated ${formatDate(generatedAt)}` : "Current workspace"}</span>
        </div>
        <button type="button" className="relative inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#E4E7EC] bg-white text-[#344054]" aria-label="Notifications">
          <Bell className="h-[18px] w-[18px]" strokeWidth={1.8} />
          <span className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-[#155EEF]" aria-hidden="true" />
        </button>
        <Link href="/tenders/new" className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#155EEF] px-4 text-sm font-semibold text-white transition hover:bg-[#0F4BD6] focus:outline-none focus:ring-2 focus:ring-[#155EEF]/30">
          New tender
          <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
        </Link>
      </div>
    </header>
  );
}

function KpiCard({ label, value, detail, icon, loading }: Kpi & { loading?: boolean }) {
  return (
    <article className="min-w-0 border border-[#E4E7EC] bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-[#EFF5FF] text-[#155EEF]">{icon}</span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-[#667085]">{label}</p>
          {loading ? <div className="mt-2 h-8 w-16 animate-pulse bg-slate-100" /> : <p className="mt-1 text-[28px] font-semibold leading-8 tracking-[-0.03em] text-[#101828]">{value}</p>}
          <p className="mt-2 text-xs leading-5 text-[#667085]">{detail}</p>
        </div>
      </div>
    </article>
  );
}

function PipelineSnapshot({ pipeline }: { pipeline: Array<{ id: string; label: string; count: number }> }) {
  return (
    <article className="min-w-0 border border-[#E4E7EC] bg-white">
      <PanelHeader title="Pipeline snapshot" actionLabel="View pipeline" actionHref="/pipeline" />
      <div className="scrollbar-hide overflow-x-auto px-4 pb-4 sm:px-5">
        {pipeline.length > 0 ? (
          <div className="grid min-w-[680px] grid-cols-6 divide-x divide-[#E4E7EC] border-t border-[#E4E7EC]">
            {pipeline.map((stage) => (
              <div key={stage.id} className="min-w-0 px-3 pt-4 first:pl-0 last:pr-0 sm:px-4">
                <p className="truncate text-xs font-medium text-[#667085]">{stage.label}</p>
                <p className="mt-3 text-[19px] font-semibold text-[#101828]">{stage.count}</p>
                <p className="mt-1 text-xs text-[#667085]">active items</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="border-t border-[#E4E7EC] py-8 text-sm text-[#667085]">No pipeline data available yet.</div>
        )}
      </div>
    </article>
  );
}

function RecentActivity({
  attention,
  reviewQueue,
}: {
  attention: DashboardOverview["attention"];
  reviewQueue: DashboardOverview["reviewQueue"]["items"];
}) {
  const activity = [
    ...attention.slice(0, 5).map((item) => ({
      id: item.id,
      title: item.title,
      detail: item.detail,
      meta: item.kind.replace(/_/g, " "),
      href: item.href,
      icon: activityIcon(item.kind),
    })),
    ...reviewQueue.slice(0, Math.max(0, 5 - attention.length)).map((item) => ({
      id: `review-${item.id}`,
      title: item.title,
      detail: `${item.pendingReviews} pending review${item.pendingReviews === 1 ? "" : "s"}`,
      meta: "review queue",
      href: `/tenders/${item.tenderId}`,
      icon: <MessageSquare className="h-4 w-4" strokeWidth={1.8} />,
    })),
  ].slice(0, 5);

  return (
    <article className="min-w-0 border border-[#E4E7EC] bg-white">
      <PanelHeader title="Recent activity" actionLabel="View all" actionHref="/reviews" />
      <div className="divide-y divide-[#F2F4F7] px-5">
        {activity.length > 0 ? (
          activity.map((item) => <ActivityRow key={item.id} {...item} />)
        ) : (
          <div className="py-8 text-sm text-[#667085]">No recent activity in this workspace.</div>
        )}
      </div>
    </article>
  );
}

function ActiveTenders({ rows, loading }: { rows: DashboardTenderCard[]; loading: boolean }) {
  return (
    <article className="min-w-0 border border-[#E4E7EC] bg-white">
      <PanelHeader title={`Active tenders (${rows.length})`} actionLabel="View all" actionHref="/tenders" />
      <div className="scrollbar-hide overflow-x-auto">
        <table className="min-w-[780px] w-full border-collapse text-left">
          <thead className="border-y border-[#F2F4F7] bg-[#FCFCFD] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#667085]">
            <tr>
              <th className="px-5 py-3">Tender</th>
              <th className="px-3 py-3">Organization</th>
              <th className="px-3 py-3">Deadline</th>
              <th className="px-3 py-3">Value</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Owner</th>
              <th className="px-5 py-3">Progress</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F2F4F7]">
            {loading && rows.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-10 text-sm text-[#667085]">Loading active tenders...</td></tr>
            ) : rows.length > 0 ? (
              rows.map((row) => <TenderRow key={row.tender.id} row={row} />)
            ) : (
              <tr>
                <td colSpan={7} className="px-5 py-8">
                  <RfpEmptyState title="No active tenders" description="Create or import an RFP to populate this operational view." actionHref="/tenders/new" actionLabel="Create tender" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function TenderRow({ row }: { row: DashboardTenderCard }) {
  const value = getTenderValue(row.tender.metadata);
  return (
    <tr className="align-top text-[13px] text-[#344054]">
      <td className="max-w-[250px] px-5 py-4">
        <Link href={`/tenders/${row.tender.id}`} className="block hover:text-[#155EEF]">
          <p className="font-semibold leading-5 text-[#101828]">{row.tender.title}</p>
          <p className="mt-1 truncate text-xs text-[#667085]">{row.tender.referenceNumber ?? row.tender.name}</p>
        </Link>
      </td>
      <td className="max-w-[170px] px-3 py-4 text-xs leading-5">{row.tender.name}</td>
      <td className="whitespace-nowrap px-3 py-4 text-xs text-[#344054]">{formatDate(row.tender.dueAt)}</td>
      <td className="whitespace-nowrap px-3 py-4 text-xs font-medium text-[#101828]">{value}</td>
      <td className="px-3 py-4"><RfpStatusBadge tone={statusTone(row.tender.status)}>{formatStatus(row.tender.status)}</RfpStatusBadge></td>
      <td className="px-3 py-4"><OwnerBadge ownerId={row.tender.ownerId} /></td>
      <td className="px-5 py-4"><ProgressCell value={row.readiness} /></td>
    </tr>
  );
}

function ImportantAlerts({
  overdueCount,
  dueCount,
  reviewCount,
  blockedCount,
  overdueItems,
  dueItems,
}: {
  overdueCount: number;
  dueCount: number;
  reviewCount: number;
  blockedCount: number;
  overdueItems: DashboardOverview["deadlines"]["overdue"]["items"];
  dueItems: DashboardOverview["deadlines"]["dueThisWeek"]["items"];
}) {
  const alerts = [
    {
      label: "Overdue tenders",
      detail: "Deadlines have passed and need triage",
      value: overdueCount,
      href: overdueItems[0] ? `/tenders/${overdueItems[0].tenderId}` : "/tenders",
      icon: <AlertTriangle className="h-4 w-4" strokeWidth={1.8} />,
    },
    {
      label: "Tenders closing soon",
      detail: "Deadlines within the next seven days",
      value: dueCount,
      href: dueItems[0] ? `/tenders/${dueItems[0].tenderId}` : "/tenders",
      icon: <Timer className="h-4 w-4" strokeWidth={1.8} />,
    },
    {
      label: "Questions need review",
      detail: "Require SME or reviewer attention",
      value: reviewCount,
      href: "/reviews",
      icon: <ListChecks className="h-4 w-4" strokeWidth={1.8} />,
    },
    {
      label: "Submission blockers",
      detail: "Validation issues prevent submission",
      value: blockedCount,
      href: "/tenders",
      icon: <ShieldAlert className="h-4 w-4" strokeWidth={1.8} />,
    },
  ];

  return (
    <article className="min-w-0 border border-[#E4E7EC] bg-white">
      <PanelHeader title="Important alerts" actionLabel="View all" actionHref="/tenders" />
      <div className="divide-y divide-[#F2F4F7] px-5">
        {alerts.map((alert) => (
          <Link key={alert.label} href={alert.href} className="flex items-center gap-3 py-4 transition hover:bg-[#FCFCFD]">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] border border-[#E4E7EC] bg-white text-[#344054]">{alert.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-[#101828]">{alert.label}</span>
              <span className="mt-1 block text-xs leading-5 text-[#667085]">{alert.detail}</span>
            </span>
            <span className="text-lg font-semibold text-[#155EEF]">{alert.value}</span>
          </Link>
        ))}
      </div>
    </article>
  );
}

function PanelHeader({ title, actionLabel, actionHref }: { title: string; actionLabel: string; actionHref: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4">
      <h2 className="text-sm font-semibold uppercase tracking-[0.04em] text-[#101828]">{title}</h2>
      <Link href={actionHref} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#155EEF] hover:text-[#0F4BD6]">
        {actionLabel}
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.8} />
      </Link>
    </div>
  );
}

function ActivityRow({ title, detail, meta, href, icon }: { title: string; detail: string; meta: string; href?: string; icon: ReactNode }) {
  const content = (
    <span className="flex min-w-0 items-start gap-3 py-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-[#F8FAFC] text-[#344054]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-[#101828]">{title}</span>
        <span className="mt-1 block truncate text-xs text-[#667085]">{detail}</span>
        <span className="mt-1 block text-[10px] uppercase tracking-[0.08em] text-[#98A2B3]">{meta}</span>
      </span>
    </span>
  );
  return href ? <Link href={href} className="block hover:bg-[#FCFCFD]">{content}</Link> : <div>{content}</div>;
}

function OwnerBadge({ ownerId }: { ownerId: string }) {
  return <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#EFF5FF] text-[10px] font-semibold text-[#155EEF]">{ownerId.slice(0, 2).toUpperCase()}</span>;
}

function ProgressCell({ value }: { value: number | null }) {
  const progress = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="min-w-[84px]">
      <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-[#344054]"><span>{value === null ? "-" : `${value}%`}</span></div>
      <div className="mt-1 h-1.5 rounded-full bg-[#E4E7EC]"><div className="h-1.5 rounded-full bg-[#155EEF]" style={{ width: `${progress}%` }} /></div>
    </div>
  );
}

function activityIcon(kind: DashboardOverview["attention"][number]["kind"]) {
  if (kind === "deadline") return <CalendarClock className="h-4 w-4" strokeWidth={1.8} />;
  if (kind === "review") return <ClipboardCheck className="h-4 w-4" strokeWidth={1.8} />;
  if (kind === "evidence") return <FileCheck2 className="h-4 w-4" strokeWidth={1.8} />;
  if (kind === "knowledge") return <Search className="h-4 w-4" strokeWidth={1.8} />;
  return kind === "tender" ? <Flag className="h-4 w-4" strokeWidth={1.8} /> : <Info className="h-4 w-4" strokeWidth={1.8} />;
}

function getTenderValue(metadata: Record<string, unknown>) {
  const candidate = metadata.estimatedValue ?? metadata.estimatedContractValue ?? metadata.value;
  if (typeof candidate === "number" && Number.isFinite(candidate)) return formatCurrency(candidate);
  if (typeof candidate === "string" && candidate.trim()) {
    const parsed = Number(candidate);
    return Number.isFinite(parsed) ? formatCurrency(parsed) : candidate;
  }
  return "-";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatStatus(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
