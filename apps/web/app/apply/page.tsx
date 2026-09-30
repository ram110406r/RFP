"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Bell,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileCheck2,
  FilePlus2,
  FileText,
  ListChecks,
  MoreHorizontal,
  RefreshCw,
  Search,
  ShieldAlert,
  Upload,
  Users,
} from "lucide-react";

import { AppShell } from "../../components/app-shell";
import { RfpEmptyState, RfpStatusBadge, statusTone } from "../../components/rfp-foundation";
import { useAuthSession } from "../../components/auth-gate";
import { TendyyResponsiveDataView, TendyyResponsiveNav } from "../../components/tendyy-ui";
import type { DashboardTenderCard } from "../../lib/models";
import { useDashboardSummary } from "../../lib/queries";
import { Button } from "@rfp-os/ui";
import { TENDER_STATUSES } from "@rfp-os/types";
import { APPLY_QUEUE_TABS, classifyApplication, matchesApplyQueue, type ApplyQueueTab, type ApplyQueueState } from "../../lib/apply-queues";

type ApplicationRowModel = {
  row: DashboardTenderCard;
  automation: DashboardTenderCard["latestRun"];
  submissionPackage: DashboardTenderCard["latestPackage"];
  state: ApplyQueueState;
};

type ReadinessFilter = "all" | "low" | "medium" | "high";
type RiskFilter = "all" | "blocking" | "clear";
type PackageFilter = "all" | "none" | "GENERATING" | "READY" | "APPROVED" | "STALE" | "FAILED";
type SelectOption = string | { value: string; label: string };

export default function ApplyPage() {
  return <Suspense fallback={<ApplyLoadingState />}><ApplyInbox /></Suspense>;
}

function ApplyInbox() {
  const session = useAuthSession();
  const summaryQuery = useDashboardSummary(25);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [owner, setOwner] = useState("all");
  const [readiness, setReadiness] = useState<ReadinessFilter>("all");
  const [risk, setRisk] = useState<RiskFilter>("all");
  const [packageStatus, setPackageStatus] = useState<PackageFilter>("all");
  const [deadlineOrder, setDeadlineOrder] = useState<"soonest" | "latest">("soonest");
  const [tab, setTab] = useState<ApplyQueueTab>("all");
  const summary = summaryQuery.data ?? null;
  const sourceRows = useMemo(() => summary?.activeTenders ?? [], [summary]);
  const currentUserId = session?.user?.uid ?? session?.profile?.uid;
  const applicationRows = useMemo<ApplicationRowModel[]>(() => sourceRows.map((row) => {
    const automation = row.latestRun ?? null;
    const submissionPackage = row.latestPackage ?? null;
    return { row, automation, submissionPackage, state: classifyApplication(row, submissionPackage, automation, currentUserId) };
  }), [currentUserId, sourceRows]);
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return applicationRows
      .filter((item) => {
        const row = item.row;
        const tender = row.tender;
        const haystack = `${tender.title} ${tender.name} ${tender.referenceNumber ?? ""}`.toLowerCase();
        const matchesSearch = needle.length === 0 || haystack.includes(needle);
        const matchesStatus = status === "all" || tender.status === status;
        const matchesOwner = owner === "all" || tender.ownerId === owner;
        const matchesTab = matchesApplyQueue(tab, item.state);
        const score = row.readiness ?? 0;
        const matchesReadiness = readiness === "all" || (readiness === "low" ? score < 50 : readiness === "medium" ? score >= 50 && score <= 84 : score >= 85);
        const matchesRisk = risk === "all" || (risk === "blocking" ? row.blockingIssueCount > 0 : row.blockingIssueCount === 0);
        const matchesPackage = packageStatus === "all" || (packageStatus === "none" ? !item.submissionPackage : item.submissionPackage?.status === packageStatus);
        return matchesSearch && matchesStatus && matchesOwner && matchesTab && matchesReadiness && matchesRisk && matchesPackage;
      })
      .sort((left, right) => {
        const leftDate = left.row.tender.dueAt ? new Date(left.row.tender.dueAt).getTime() : Number.POSITIVE_INFINITY;
        const rightDate = right.row.tender.dueAt ? new Date(right.row.tender.dueAt).getTime() : Number.POSITIVE_INFINITY;
        return deadlineOrder === "soonest" ? leftDate - rightDate : rightDate - leftDate;
      });
  }, [applicationRows, deadlineOrder, owner, packageStatus, readiness, risk, search, status, tab]);

  const metrics = summary?.metrics;
  const pipelineCount = (id: string) => summary?.pipeline.find((stage) => stage.id === id)?.count ?? 0;
  const evidenceMissing = summary?.evidenceHealth?.answersWithoutEvidence ?? 0;
  const workQueue = [
    { label: "Questions need review", value: metrics?.awaitingReview ?? 0, detail: "Across the current applications", href: "/reviews", icon: <ListChecks className="h-4 w-4" /> },
    { label: "Evidence missing", value: evidenceMissing, detail: "Answers without linked evidence", href: "/reviews", icon: <FileCheck2 className="h-4 w-4" /> },
    { label: "High-risk answers", value: metrics?.highRiskItems ?? 0, detail: "Critical or high severity items", href: "/reviews", icon: <ShieldAlert className="h-4 w-4" /> },
    { label: "Submission blockers", value: metrics?.blockedFromSubmission ?? 0, detail: "Validation issues to resolve", href: "/tenders", icon: <AlertTriangle className="h-4 w-4" /> },
  ];
  const deadlines = [
    ...(summary?.deadlines.dueThisWeek.items ?? []),
    ...(summary?.deadlines.later.items ?? []),
  ].slice(0, 5);
  const userName = session?.profile?.displayName ?? session?.user?.displayName ?? "Workspace user";
  const ownerOptions: SelectOption[] = [
    { value: "all", label: "All" },
    ...Array.from(new Map(sourceRows.map((row) => [row.tender.ownerId, { value: row.tender.ownerId, label: ownerLabel(row) }])).values()),
  ];
  const queueCounts = Object.fromEntries(APPLY_QUEUE_TABS.map((item) => [item.key, applicationRows.filter((row) => matchesApplyQueue(item.key, row.state)).length])) as Record<ApplyQueueTab, number>;
  const filtersActive = search || status !== "all" || owner !== "all" || readiness !== "all" || risk !== "all" || packageStatus !== "all" || tab !== "all";

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Apply" }]}>
      <div className="min-w-0 space-y-5 pb-6">
        <section className="flex flex-col gap-4 border border-[#E4E7EC] bg-white p-4 sm:p-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#667085]">Apply inbox</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-[#101828]">Applications needing action</h1>
            <p className="mt-2 text-sm leading-6 text-[#667085]">{rows.length} visible of {sourceRows.length} active application{sourceRows.length === 1 ? "" : "s"}.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="secondary">
              <Link href="/tenders/import">
                <Upload className="h-4 w-4" />
                Import RFP
              </Link>
            </Button>
            <Button asChild variant="primary">
              <Link href="/tenders/new">
                <FilePlus2 className="h-4 w-4 text-white" />
                New application
                <ChevronDown className="h-4 w-4 text-white" />
              </Link>
            </Button>
            <Button asChild variant="icon" size="icon" className="relative" aria-label="Notifications">
              <Link href="/notifications">
                <Bell className="h-4 w-4" />
              </Link>
            </Button>
          <div className="hidden items-center gap-2 sm:flex">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EFF5FF] text-xs font-semibold text-[#155EEF]">{initials(userName)}</div>
            <div>
              <p className="max-w-[120px] truncate text-[13px] font-semibold text-slate-950">{userName}</p>
              <p className="text-[11px] text-slate-500">{session?.profile?.role ?? "Workspace member"}</p>
            </div>
          </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5" aria-label="Application workflow metrics">
          <WorkflowMetric label="In progress" value={pipelineCount("answering")} detail="Applications" icon={<Clock3 className="h-5 w-5" />} onClick={() => setTab("all")} />
          <WorkflowMetric label="Needs review" value={queueCounts.review} detail="Applications" icon={<Search className="h-5 w-5" />} onClick={() => setTab("review")} />
          <WorkflowMetric label="Needs approval" value={queueCounts.approval} detail="Packages" icon={<BadgeCheck className="h-5 w-5" />} onClick={() => setTab("approval")} />
          <WorkflowMetric label="Ready to submit" value={queueCounts.ready} detail="Approved packages" icon={<CheckCircle2 className="h-5 w-5" />} onClick={() => setTab("ready")} />
          <WorkflowMetric label="Submitted" value={pipelineCount("submitted")} detail="Responses" icon={<FileCheck2 className="h-5 w-5" />} onClick={() => setTab("submitted")} />
        </section>

        <section className="border border-[#E4E7EC] bg-white p-4 sm:p-5" aria-label="Application filters">
          <div className="flex flex-col gap-3 xl:flex-row">
            <label className="flex h-10 min-w-0 flex-1 items-center gap-3 rounded-[9px] border border-[#D0D5DD] px-3 text-[#667085] focus-within:border-[#155EEF]"><Search className="h-4 w-4" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search applications by tender, authority, ID..." className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#98A2B3]" /></label>
            <FilterSelect label="Status" value={status} options={["all", ...TENDER_STATUSES]} onChange={setStatus} />
            <FilterSelect label="Deadline" value={deadlineOrder} options={["soonest", "latest"]} onChange={(value) => setDeadlineOrder(value as "soonest" | "latest")} />
            <FilterSelect label="Owner" value={owner} options={ownerOptions} onChange={setOwner} icon={<Users className="h-3.5 w-3.5 text-[#667085]" />} />
            <details className="relative"><summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-[9px] border border-[#E4E7EC] px-3 text-xs font-semibold text-[#344054]"><RefreshCw className="h-3.5 w-3.5 text-[#667085]" /> More filters</summary><div className="absolute right-0 top-11 z-20 grid w-80 gap-3 border border-[#E4E7EC] bg-white p-4 shadow-[0_12px_32px_rgba(16,24,40,0.12)] sm:grid-cols-1"><FilterSelect label="Readiness" value={readiness} options={[{ value: "all", label: "All" }, { value: "low", label: "Low <50" }, { value: "medium", label: "Medium 50-84" }, { value: "high", label: "High 85+" }]} onChange={(value) => setReadiness(value as ReadinessFilter)} /><FilterSelect label="Risk" value={risk} options={[{ value: "all", label: "All" }, { value: "blocking", label: "Blocking only" }, { value: "clear", label: "No blockers" }]} onChange={(value) => setRisk(value as RiskFilter)} /><FilterSelect label="Package" value={packageStatus} options={[{ value: "all", label: "All" }, { value: "none", label: "None" }, "GENERATING", "READY", "APPROVED", "STALE", "FAILED"]} onChange={(value) => setPackageStatus(value as PackageFilter)} /></div></details>
            {filtersActive ? <button type="button" onClick={() => { setSearch(""); setStatus("all"); setOwner("all"); setReadiness("all"); setRisk("all"); setPackageStatus("all"); setTab("all"); }} className="text-xs font-semibold text-[#155EEF]">Clear all</button> : null}
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 flex-1"><TendyyResponsiveNav label="Application view" value={tab} items={APPLY_QUEUE_TABS.map((item) => ({ value: item.key, label: `${item.label} (${queueCounts[item.key] ?? 0})` }))} onChange={(value) => setTab(value as ApplyQueueTab)} /></div>
          <button type="button" onClick={() => void summaryQuery.refetch()} className="inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-[8px] border border-[#E4E7EC] px-3 text-xs font-semibold text-[#155EEF]"><RefreshCw className="h-3.5 w-3.5" />Refresh</button>
        </div>

        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(300px,0.8fr)]">
          <section className="min-w-0 border border-[#E4E7EC] bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-[#F2F4F7] px-4 py-4"><h2 className="text-sm font-semibold uppercase tracking-[0.04em] text-[#101828]">Active applications</h2><span className="text-xs text-[#667085]">{rows.length} visible</span></div>
            {summaryQuery.isError ? <div className="m-4 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">Unable to load applications. <button type="button" onClick={() => void summaryQuery.refetch()} className="font-semibold underline">Retry</button></div> : summaryQuery.isLoading ? <ApplicationSkeleton /> : rows.length > 0 ? <ApplicationTable items={rows} /> : <div className="p-5"><RfpEmptyState title={tab === "all" ? "No applications yet" : "No matching applications"} description={tab === "all" ? "Start by creating an application from a tender or importing an RFP." : "Try another workflow tab or clear the filters."} actionHref="/tenders/new" actionLabel="Create application" /></div>}
          </section>
          <ApplyRightRail workQueue={workQueue} deadlines={deadlines} />
        </div>
      </div>
    </AppShell>
  );
}

function WorkflowMetric({ label, value, detail, icon, onClick }: { label: string; value: number; detail: string; icon: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex min-h-[112px] items-start gap-3 border border-[#E4E7EC] bg-white p-4 text-left transition hover:border-[#155EEF] hover:bg-[#FCFCFD]"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EFF5FF] text-[#155EEF]">{icon}</span><span><span className="block text-xs font-semibold text-[#667085]">{label}</span><span className="mt-1 block text-2xl font-semibold text-[#101828]">{value}</span><span className="mt-1 block text-xs text-[#667085]">{detail}</span></span></button>;
}

function FilterSelect({ label, value, options, onChange, icon }: { label: string; value: string; options: SelectOption[]; onChange: (value: string) => void; icon?: React.ReactNode }) {
  return <label className="inline-flex h-10 items-center gap-2 rounded-[9px] border border-[#E4E7EC] px-3 text-xs text-[#667085]">{icon}{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="max-w-[130px] bg-transparent font-semibold text-[#344054] outline-none">{options.map((option) => { const item = typeof option === "string" ? { value: option, label: option === "all" ? "All" : formatStatus(option) } : option; return <option key={item.value} value={item.value}>{item.label}</option>; })}</select></label>;
}

function ApplicationTable({ items }: { items: ApplicationRowModel[] }) {
  const resolved = items;
  return <TendyyResponsiveDataView desktop={<table className="w-full table-fixed border-collapse text-left"><thead className="border-y border-[#F2F4F7] bg-[#FCFCFD] text-[10px] font-semibold uppercase tracking-[0.08em] text-[#667085]"><tr><th className="w-[25%] px-4 py-3">Application</th><th className="px-3 py-3">Tender / Authority</th><th className="px-3 py-3">Deadline</th><th className="px-3 py-3">Progress</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Risks</th><th className="px-3 py-3">Last activity</th><th className="w-24 px-3 py-3" /></tr></thead><tbody className="divide-y divide-[#F2F4F7]">{resolved.map((item) => <ApplicationRow key={item.row.tender.id} {...item} />)}</tbody></table>} mobile={<div className="space-y-3 p-3 sm:p-4">{resolved.map((item) => <ApplicationCard key={item.row.tender.id} {...item} />)}</div>} />;
}

function ApplicationCard({ row, automation, submissionPackage, state }: { row: DashboardTenderCard; automation: DashboardTenderCard["latestRun"]; submissionPackage: DashboardTenderCard["latestPackage"]; state: ApplyQueueState }) {
  const tender = row.tender;
  const readiness = Math.max(0, Math.min(100, row.readiness ?? 0));
  void state;
  return <article className="min-w-0 border border-[#E4E7EC] bg-white p-4"><div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1"><Link href={`/apply/${tender.id}`} className="tendyy-wrap-anywhere block text-sm font-semibold leading-5 text-[#101828]">{tender.title}</Link><p className="tendyy-wrap-anywhere mt-1 text-[11px] text-[#667085]">ID: {tender.referenceNumber ?? tender.id}</p></div><RfpStatusBadge tone={statusTone(tender.status)}>{applicationStatus(tender.status)}</RfpStatusBadge></div><p className="tendyy-wrap-anywhere mt-3 text-xs text-[#344054]">{tender.name}</p><div className="mt-3 grid grid-cols-2 gap-3 text-[11px]"><CardDetail label="Deadline" value={`${formatDate(tender.dueAt)} · ${daysLeftLabel(tender.dueAt)}`} /><CardDetail label="Progress" value={row.readiness === null ? "Not calculated" : `${row.readiness}%`} /><CardDetail label="Reviews" value={`${row.pendingReviews} pending`} /><CardDetail label="Risks" value={`${row.blockingIssueCount} blocking`} /><CardDetail label="Preparation" value={submissionPackage ? `Package v${submissionPackage.version} ${formatStatus(submissionPackage.status)}` : automation ? formatStatus(automation.status) : "Not prepared"} /><CardDetail label="Updated" value={relativeTime(tender.updatedAt)} /></div><div className="mt-3 h-1.5 rounded-full bg-[#E4E7EC]"><div className="h-1.5 rounded-full bg-[#155EEF]" style={{ width: `${readiness}%` }} /></div><Link href={`/apply/${tender.id}`} className="mt-4 inline-flex h-9 items-center rounded-[8px] border border-[#155EEF] px-3 text-xs font-semibold text-[#155EEF]">Continue application</Link></article>;
}

function CardDetail({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#98A2B3]">{label}</p><p className="tendyy-wrap-anywhere mt-1 font-medium text-[#344054]">{value}</p></div>; }

function ApplicationRow({ row, automation, submissionPackage, state }: { row: DashboardTenderCard; automation: DashboardTenderCard["latestRun"]; submissionPackage: DashboardTenderCard["latestPackage"]; state: ApplyQueueState }) {
  const tender = row.tender;
  const readiness = row.readiness === null ? 0 : Math.max(0, Math.min(100, row.readiness));
  return <tr className="align-top text-xs text-[#344054] transition hover:bg-[#F8FAFC]"><td className="max-w-[220px] px-4 py-4"><Link href={`/apply/${tender.id}`} className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-[#EFF5FF] text-[#155EEF]"><FileText className="h-4 w-4" /></span><span className="min-w-0"><span className="block font-semibold leading-5 text-[#101828]">{tender.title}</span><span className="mt-1 block truncate text-[11px] text-[#667085]">ID: {tender.referenceNumber ?? tender.id}</span><span className="mt-1 block truncate text-[11px] text-[#667085]">Owner: {ownerLabel(row)}</span><span className="mt-2 inline-flex gap-1 text-[10px] text-[#667085]"><span className="bg-[#F8FAFC] px-1.5 py-0.5">{formatStatus(tender.tenderType)}</span><span className="bg-[#F8FAFC] px-1.5 py-0.5">{metadataText(tender.metadata, "location")}</span></span></span></Link></td><td className="max-w-[150px] px-3 py-4 leading-5">{tender.name}</td><td className="whitespace-nowrap px-3 py-4">{formatDate(tender.dueAt)}<span className={`mt-1 block text-[10px] ${daysLeft(tender.dueAt) < 7 ? "text-amber-700" : "text-[#98A2B3]"}`}>{daysLeftLabel(tender.dueAt)}</span></td><td className="min-w-[105px] px-3 py-4"><div className="font-semibold text-[#101828]">{row.readiness === null ? "-" : `${row.readiness}%`}</div><div className="mt-1 h-1.5 rounded-full bg-[#E4E7EC]"><div className="h-1.5 rounded-full bg-[#155EEF]" style={{ width: `${readiness}%` }} /></div><p className="mt-1 text-[10px] text-[#667085]">{row.pendingReviews} review{row.pendingReviews === 1 ? "" : "s"}</p></td><td className="px-3 py-4"><RfpStatusBadge tone={statusTone(tender.status)}>{applicationStatus(tender.status)}</RfpStatusBadge><span className="mt-1 block max-w-[120px] text-[10px] leading-4 text-[#667085]">{submissionPackage ? `Package v${submissionPackage.version} ${formatStatus(submissionPackage.status)}` : automation ? `Prepare ${formatStatus(automation.status)}` : "Not prepared"}</span><span className="mt-1 block max-w-[140px] text-[10px] leading-4 text-[#344054]">{state.reason}</span></td><td className="px-3 py-4"><span className={row.blockingIssueCount > 0 ? "font-semibold text-rose-700" : "font-semibold text-emerald-700"}>{row.blockingIssueCount}</span><span className="mt-1 block text-[10px] text-[#667085]">{row.highestIssue?.severity ?? "No high risk"}</span></td><td className="whitespace-nowrap px-3 py-4"><span className="block text-[#344054]">{relativeTime(tender.updatedAt)}</span><span className="mt-1 block max-w-[90px] text-[10px] leading-4 text-[#667085]">Tender record updated</span></td><td className="px-3 py-4"><div className="flex items-center gap-1"><Link href={`/apply/${tender.id}`} className="inline-flex h-8 items-center rounded-[8px] border border-[#E4E7EC] px-2.5 text-xs font-semibold text-[#155EEF] hover:bg-[#EFF5FF]">Continue</Link><details className="relative"><summary className="inline-flex h-8 w-7 cursor-pointer list-none items-center justify-center text-[#667085]" aria-label="More application actions"><MoreHorizontal className="h-4 w-4" /></summary><div className="absolute right-0 top-9 z-20 w-40 border border-[#E4E7EC] bg-white p-1 shadow-[0_12px_32px_rgba(16,24,40,0.12)]"><ActionMenuLink href={`/apply/${tender.id}`}>Open workspace</ActionMenuLink><ActionMenuLink href="/reviews">View reviews</ActionMenuLink><ActionMenuLink href={`/apply/${tender.id}#packages`}>View packages</ActionMenuLink><ActionMenuLink href={`/tenders/${tender.id}`}>Open tender record</ActionMenuLink></div></details></div></td></tr>;
}

function ApplyRightRail({ workQueue, deadlines }: { workQueue: Array<{ label: string; value: number; detail: string; href: string; icon: React.ReactNode }>; deadlines: Array<{ tenderId: string; title: string; name: string; dueAt: string | null }> }) {
  return <aside className="space-y-5"><section className="border border-[#E4E7EC] bg-white"><RailHeader title="Work queue" href="/reviews" /><div className="space-y-2 p-3">{workQueue.map((item) => <Link key={item.label} href={item.href} className="flex items-center gap-3 border border-[#F2F4F7] p-3 hover:bg-[#F8FAFC]"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EFF5FF] text-[#155EEF]">{item.icon}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#101828]">{item.value} <span className="font-medium">{item.label}</span></span><span className="mt-1 block truncate text-[11px] text-[#667085]">{item.detail}</span></span><ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#155EEF]" /></Link>)}</div></section><section className="border border-[#E4E7EC] bg-white"><RailHeader title="Upcoming deadlines" href="/tenders" /><div className="divide-y divide-[#F2F4F7] px-3">{deadlines.length > 0 ? deadlines.map((item) => <Link key={item.tenderId} href={`/apply/${item.tenderId}`} className="flex items-center gap-3 py-3 hover:bg-[#F8FAFC]"><span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center border border-[#E4E7EC] text-[#344054]"><span className="text-sm font-semibold">{item.dueAt ? new Date(item.dueAt).getDate() : "-"}</span><span className="text-[9px] uppercase text-[#667085]">{item.dueAt ? new Intl.DateTimeFormat("en-IN", { month: "short" }).format(new Date(item.dueAt)) : "n/a"}</span></span><span className="min-w-0"><span className="block truncate text-xs font-semibold text-[#101828]">{item.title}</span><span className="mt-1 block truncate text-[10px] text-[#667085]">{item.name}</span><span className="mt-1 block text-[10px] text-[#155EEF]">{daysLeftLabel(item.dueAt)}</span></span></Link>) : <p className="p-4 text-sm text-[#667085]">No upcoming deadlines.</p>}</div></section><section className="border border-[#E4E7EC] bg-white"><RailHeader title="Quick actions" /><div className="grid grid-cols-3 divide-x divide-[#F2F4F7]"><QuickAction href="/tenders/import" label="Import RFP" detail="Upload questionnaire" icon={<Upload className="h-4 w-4" />} /><QuickAction href="/tenders" label="Create from tender" detail="Start from search" icon={<FileText className="h-4 w-4" />} /><QuickAction href="/templates" label="Template" detail="Reusable responses" icon={<FilePlus2 className="h-4 w-4" />} /></div></section></aside>;
}

function RailHeader({ title, href }: { title: string; href?: string }) { return <div className="flex items-center justify-between border-b border-[#F2F4F7] px-4 py-4"><h2 className="text-sm font-semibold uppercase tracking-[0.04em] text-[#101828]">{title}</h2>{href ? <Link href={href} className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#155EEF]">View all <ArrowRight className="h-3 w-3" /></Link> : null}</div>; }
function ActionMenuLink({ href, children }: { href: string; children: React.ReactNode }) { return <Link href={href} className="block rounded-[6px] px-2 py-1.5 text-[11px] font-semibold text-[#344054] hover:bg-[#F8FAFC]">{children}</Link>; }
function QuickAction({ href, label, detail, icon }: { href: string; label: string; detail: string; icon: React.ReactNode }) { return <Link href={href} className="flex flex-col items-center p-3 text-center hover:bg-[#F8FAFC]"><span className="text-[#155EEF]">{icon}</span><span className="mt-2 text-[10px] font-semibold text-[#344054]">{label}</span><span className="mt-1 text-[9px] text-[#667085]">{detail}</span></Link>; }
function ApplicationSkeleton() { return <div className="space-y-2 p-4">{[1, 2, 3, 4].map((item) => <div key={item} className="flex animate-pulse gap-3 border-b border-[#F2F4F7] py-4"><div className="h-9 w-9 bg-slate-100" /><div className="flex-1 space-y-2"><div className="h-3 w-3/5 bg-slate-100" /><div className="h-2 w-2/5 bg-slate-100" /></div></div>)}</div>; }
function ApplyLoadingState() { return <AppShell breadcrumbs={[{ label: "Apply" }]}><ApplicationSkeleton /></AppShell>; }
function formatDate(value: string | null) { if (!value) return "Not set"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "Not set" : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date); }
function daysLeft(value: string | null) { if (!value) return Number.POSITIVE_INFINITY; return Math.ceil((new Date(value).getTime() - Date.now()) / 86400000); }
function daysLeftLabel(value: string | null) { const days = daysLeft(value); if (!Number.isFinite(days)) return "No deadline"; if (days < 0) return `${Math.abs(days)}d overdue`; if (days === 0) return "Due today"; return `${days}d left`; }
function relativeTime(value: string) { const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000)); if (minutes < 1) return "Just now"; if (minutes < 60) return `${minutes}m ago`; const hours = Math.round(minutes / 60); if (hours < 24) return `${hours}h ago`; return `${Math.round(hours / 24)}d ago`; }
function metadataText(metadata: Record<string, unknown>, key: string) { const value = metadata[key]; return typeof value === "string" && value.trim() ? value : "-"; }
function formatStatus(value: string) { return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()); }
function applicationStatus(value: string) { if (value === "IN_PROGRESS") return "In Progress"; if (value === "REVIEW") return "Needs Review"; if (value === "READY") return "Ready to Submit"; if (value === "APPROVED") return "Approval"; return formatStatus(value); }
function ownerLabel(row: DashboardTenderCard) { return row.owner?.name || row.owner?.email || shortOwnerLabel(row.tender.ownerId); }
function shortOwnerLabel(ownerId: string | null | undefined) { return ownerId ? ownerId.slice(0, 8) : "Unassigned"; }
function initials(value: string) { return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase() || "TW"; }
