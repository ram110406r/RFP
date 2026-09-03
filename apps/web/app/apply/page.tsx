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
import { useFirebaseSession } from "../../components/firebase-auth-gate";
import type { DashboardTenderCard } from "../../lib/models";
import { useDashboardSummary } from "../../lib/queries";
import { Button } from "@rfp-os/ui";

type ApplicationTab = "all" | "mine" | "review" | "approval" | "ready" | "submitted" | "closed";

const tabs: Array<{ key: ApplicationTab; label: string }> = [
  { key: "all", label: "All applications" },
  { key: "mine", label: "My applications" },
  { key: "review", label: "Needs review" },
  { key: "approval", label: "Approval" },
  { key: "ready", label: "Ready" },
  { key: "submitted", label: "Submitted" },
  { key: "closed", label: "Closed" },
];

export default function ApplyPage() {
  return <Suspense fallback={<ApplyLoadingState />}><ApplyInbox /></Suspense>;
}

function ApplyInbox() {
  const session = useFirebaseSession();
  const summaryQuery = useDashboardSummary(25);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [owner, setOwner] = useState("all");
  const [deadlineOrder, setDeadlineOrder] = useState<"soonest" | "latest">("soonest");
  const [tab, setTab] = useState<ApplicationTab>("all");
  const summary = summaryQuery.data ?? null;
  const sourceRows = useMemo(() => summary?.activeTenders ?? [], [summary]);
  const currentUserId = session?.user?.uid ?? session?.profile?.uid;
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return sourceRows
      .filter((row) => {
        const tender = row.tender;
        const haystack = `${tender.title} ${tender.name} ${tender.referenceNumber ?? ""}`.toLowerCase();
        const matchesSearch = needle.length === 0 || haystack.includes(needle);
        const matchesStatus = status === "all" || tender.status === status;
        const matchesOwner = owner === "all" || tender.ownerId === owner;
        const matchesTab = tab === "all"
          || (tab === "mine" && (!currentUserId || tender.ownerId === currentUserId))
          || (tab === "review" && row.pendingReviews > 0)
          || (tab === "approval" && tender.status === "APPROVED")
          || (tab === "ready" && row.ready)
          || (tab === "submitted" && tender.status === "SUBMITTED")
          || (tab === "closed" && tender.status === "CLOSED");
        return matchesSearch && matchesStatus && matchesOwner && matchesTab;
      })
      .sort((left, right) => {
        const leftDate = left.tender.dueAt ? new Date(left.tender.dueAt).getTime() : Number.POSITIVE_INFINITY;
        const rightDate = right.tender.dueAt ? new Date(right.tender.dueAt).getTime() : Number.POSITIVE_INFINITY;
        return deadlineOrder === "soonest" ? leftDate - rightDate : rightDate - leftDate;
      });
  }, [currentUserId, deadlineOrder, owner, search, sourceRows, status, tab]);

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
  const ownerOptions = ["all", ...new Set(sourceRows.map((row) => row.tender.ownerId))];

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Apply" }]}>
      <div className="min-w-0 space-y-5 pb-6">
        <section className="flex flex-wrap items-center gap-3">
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
          <Button type="button" variant="icon" size="icon" className="relative" aria-label="Notifications">
            <span className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-[#155EEF]" />
            <Bell className="h-4 w-4" />
          </Button>
          <div className="hidden items-center gap-2 sm:flex">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EFF5FF] text-xs font-semibold text-[#155EEF]">{initials(userName)}</div>
            <div>
              <p className="max-w-[120px] truncate text-[13px] font-semibold text-slate-950">{userName}</p>
              <p className="text-[11px] text-slate-500">{session?.profile?.role ?? "Workspace member"}</p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5" aria-label="Application workflow metrics">
          <WorkflowMetric label="In progress" value={pipelineCount("answering")} detail="Applications" icon={<Clock3 className="h-5 w-5" />} onClick={() => setTab("all")} />
          <WorkflowMetric label="Needs review" value={metrics?.awaitingReview ?? 0} detail="Questions" icon={<Search className="h-5 w-5" />} onClick={() => setTab("review")} />
          <WorkflowMetric label="Approval" value={pipelineCount("approval")} detail="Answers" icon={<BadgeCheck className="h-5 w-5" />} onClick={() => setTab("approval")} />
          <WorkflowMetric label="Ready to submit" value={metrics?.submissionReady ?? 0} detail="Responses" icon={<CheckCircle2 className="h-5 w-5" />} onClick={() => setTab("ready")} />
          <WorkflowMetric label="Submitted" value={pipelineCount("submitted")} detail="Responses" icon={<FileCheck2 className="h-5 w-5" />} onClick={() => setTab("submitted")} />
        </section>

        <section className="border border-[#E4E7EC] bg-white p-4 sm:p-5" aria-label="Application filters">
          <div className="flex flex-col gap-3 xl:flex-row">
            <label className="flex h-10 min-w-0 flex-1 items-center gap-3 rounded-[9px] border border-[#D0D5DD] px-3 text-[#667085] focus-within:border-[#155EEF]"><Search className="h-4 w-4" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search applications by tender, authority, ID..." className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#98A2B3]" /></label>
            <FilterSelect label="Status" value={status} options={["all", "DRAFT", "IN_PROGRESS", "REVIEW", "APPROVED", "SUBMITTED", "CLOSED"]} onChange={setStatus} />
            <FilterSelect label="Deadline" value={deadlineOrder} options={["soonest", "latest"]} onChange={(value) => setDeadlineOrder(value as "soonest" | "latest")} />
            <FilterSelect label="Owner" value={owner} options={ownerOptions} onChange={setOwner} icon={<Users className="h-3.5 w-3.5 text-[#667085]" />} />
            <details className="relative"><summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-[9px] border border-[#E4E7EC] px-3 text-xs font-semibold text-[#344054]"><RefreshCw className="h-3.5 w-3.5 text-[#667085]" /> More filters</summary><div className="absolute right-0 top-11 z-20 w-72 border border-[#E4E7EC] bg-white p-4 text-xs leading-5 text-[#667085] shadow-[0_12px_32px_rgba(16,24,40,0.12)]">Workflow filters currently available are status, deadline ordering, review state, readiness, and submission state.</div></details>
            {(search || status !== "all" || owner !== "all" || tab !== "all") ? <button type="button" onClick={() => { setSearch(""); setStatus("all"); setOwner("all"); setTab("all"); }} className="text-xs font-semibold text-[#155EEF]">Clear all</button> : null}
          </div>
        </section>

        <div className="flex items-end justify-between gap-4 border-b border-[#E4E7EC] overflow-x-auto">
          <div className="flex min-w-max items-center gap-5">{tabs.map((item) => <button type="button" key={item.key} onClick={() => setTab(item.key)} className={`relative whitespace-nowrap pb-3 text-sm font-semibold ${tab === item.key ? "text-[#155EEF] after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-[#155EEF]" : "text-[#667085] hover:text-[#344054]"}`}>{item.label}</button>)}</div>
          <button type="button" onClick={() => void summaryQuery.refetch()} className="mb-2 hidden shrink-0 items-center gap-1 text-xs font-semibold text-[#155EEF] sm:flex"><RefreshCw className="h-3.5 w-3.5" />Refresh</button>
        </div>

        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(300px,0.8fr)]">
          <section className="min-w-0 border border-[#E4E7EC] bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-[#F2F4F7] px-4 py-4"><h2 className="text-sm font-semibold uppercase tracking-[0.04em] text-[#101828]">Active applications</h2><span className="text-xs text-[#667085]">{rows.length} visible</span></div>
            {summaryQuery.isError ? <div className="m-4 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">Unable to load applications. <button type="button" onClick={() => void summaryQuery.refetch()} className="font-semibold underline">Retry</button></div> : summaryQuery.isLoading ? <ApplicationSkeleton /> : rows.length > 0 ? <ApplicationTable rows={rows} /> : <div className="p-5"><RfpEmptyState title={tab === "all" ? "No applications yet" : "No matching applications"} description={tab === "all" ? "Start by creating an application from a tender or importing an RFP." : "Try another workflow tab or clear the filters."} actionHref="/tenders/new" actionLabel="Create application" /></div>}
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

function FilterSelect({ label, value, options, onChange, icon }: { label: string; value: string; options: string[]; onChange: (value: string) => void; icon?: React.ReactNode }) {
  return <label className="inline-flex h-10 items-center gap-2 rounded-[9px] border border-[#E4E7EC] px-3 text-xs text-[#667085]">{icon}{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="max-w-[110px] bg-transparent font-semibold text-[#344054] outline-none">{options.map((option) => <option key={option} value={option}>{option === "all" ? "All" : formatStatus(option)}</option>)}</select></label>;
}

function ApplicationTable({ rows }: { rows: DashboardTenderCard[] }) {
  return <div className="overflow-x-auto"><table className="min-w-[850px] w-full border-collapse text-left"><thead className="border-y border-[#F2F4F7] bg-[#FCFCFD] text-[10px] font-semibold uppercase tracking-[0.08em] text-[#667085]"><tr><th className="px-4 py-3">Application</th><th className="px-3 py-3">Tender / Authority</th><th className="px-3 py-3">Deadline</th><th className="px-3 py-3">Progress</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Risks</th><th className="px-3 py-3">Last activity</th><th className="px-3 py-3" /></tr></thead><tbody className="divide-y divide-[#F2F4F7]">{rows.map((row) => <ApplicationRow key={row.tender.id} row={row} />)}</tbody></table></div>;
}

function ApplicationRow({ row }: { row: DashboardTenderCard }) {
  const tender = row.tender;
  const readiness = row.readiness === null ? 0 : Math.max(0, Math.min(100, row.readiness));
  return <tr className="align-top text-xs text-[#344054] transition hover:bg-[#F8FAFC]"><td className="max-w-[220px] px-4 py-4"><Link href={`/apply/${tender.id}`} className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-[#EFF5FF] text-[#155EEF]"><FileText className="h-4 w-4" /></span><span className="min-w-0"><span className="block font-semibold leading-5 text-[#101828]">{tender.title}</span><span className="mt-1 block truncate text-[11px] text-[#667085]">ID: {tender.referenceNumber ?? tender.id}</span><span className="mt-2 inline-flex gap-1 text-[10px] text-[#667085]"><span className="bg-[#F8FAFC] px-1.5 py-0.5">{formatStatus(tender.tenderType)}</span><span className="bg-[#F8FAFC] px-1.5 py-0.5">{metadataText(tender.metadata, "location")}</span></span></span></Link></td><td className="max-w-[150px] px-3 py-4 leading-5">{tender.name}</td><td className="whitespace-nowrap px-3 py-4">{formatDate(tender.dueAt)}<span className={`mt-1 block text-[10px] ${daysLeft(tender.dueAt) < 7 ? "text-amber-700" : "text-[#98A2B3]"}`}>{daysLeftLabel(tender.dueAt)}</span></td><td className="min-w-[105px] px-3 py-4"><div className="font-semibold text-[#101828]">{row.readiness === null ? "-" : `${row.readiness}%`}</div><div className="mt-1 h-1.5 rounded-full bg-[#E4E7EC]"><div className="h-1.5 rounded-full bg-[#155EEF]" style={{ width: `${readiness}%` }} /></div><p className="mt-1 text-[10px] text-[#667085]">{row.pendingReviews} review{row.pendingReviews === 1 ? "" : "s"}</p></td><td className="px-3 py-4"><RfpStatusBadge tone={statusTone(tender.status)}>{applicationStatus(tender.status)}</RfpStatusBadge></td><td className="px-3 py-4"><span className={row.blockingIssueCount > 0 ? "font-semibold text-rose-700" : "font-semibold text-emerald-700"}>{row.blockingIssueCount}</span><span className="mt-1 block text-[10px] text-[#667085]">{row.highestIssue?.severity ?? "No high risk"}</span></td><td className="whitespace-nowrap px-3 py-4"><span className="block text-[#344054]">{relativeTime(tender.updatedAt)}</span><span className="mt-1 block max-w-[90px] text-[10px] leading-4 text-[#667085]">Tender record updated</span></td><td className="px-3 py-4"><div className="flex items-center gap-1"><Link href={`/apply/${tender.id}`} className="inline-flex h-8 items-center rounded-[8px] border border-[#E4E7EC] px-2.5 text-xs font-semibold text-[#155EEF] hover:bg-[#EFF5FF]">Continue</Link><button type="button" className="inline-flex h-8 w-7 items-center justify-center text-[#667085]" aria-label="More application actions"><MoreHorizontal className="h-4 w-4" /></button></div></td></tr>;
}

function ApplyRightRail({ workQueue, deadlines }: { workQueue: Array<{ label: string; value: number; detail: string; href: string; icon: React.ReactNode }>; deadlines: Array<{ tenderId: string; title: string; name: string; dueAt: string | null }> }) {
  return <aside className="space-y-5"><section className="border border-[#E4E7EC] bg-white"><RailHeader title="Work queue" href="/reviews" /><div className="space-y-2 p-3">{workQueue.map((item) => <Link key={item.label} href={item.href} className="flex items-center gap-3 border border-[#F2F4F7] p-3 hover:bg-[#F8FAFC]"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EFF5FF] text-[#155EEF]">{item.icon}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#101828]">{item.value} <span className="font-medium">{item.label}</span></span><span className="mt-1 block truncate text-[11px] text-[#667085]">{item.detail}</span></span><ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#155EEF]" /></Link>)}</div></section><section className="border border-[#E4E7EC] bg-white"><RailHeader title="Upcoming deadlines" href="/tenders" /><div className="divide-y divide-[#F2F4F7] px-3">{deadlines.length > 0 ? deadlines.map((item) => <Link key={item.tenderId} href={`/apply/${item.tenderId}`} className="flex items-center gap-3 py-3 hover:bg-[#F8FAFC]"><span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center border border-[#E4E7EC] text-[#344054]"><span className="text-sm font-semibold">{item.dueAt ? new Date(item.dueAt).getDate() : "-"}</span><span className="text-[9px] uppercase text-[#667085]">{item.dueAt ? new Intl.DateTimeFormat("en-IN", { month: "short" }).format(new Date(item.dueAt)) : "n/a"}</span></span><span className="min-w-0"><span className="block truncate text-xs font-semibold text-[#101828]">{item.title}</span><span className="mt-1 block truncate text-[10px] text-[#667085]">{item.name}</span><span className="mt-1 block text-[10px] text-[#155EEF]">{daysLeftLabel(item.dueAt)}</span></span></Link>) : <p className="p-4 text-sm text-[#667085]">No upcoming deadlines.</p>}</div></section><section className="border border-[#E4E7EC] bg-white"><RailHeader title="Quick actions" /><div className="grid grid-cols-3 divide-x divide-[#F2F4F7]"><QuickAction href="/tenders/import" label="Import RFP" detail="Upload questionnaire" icon={<Upload className="h-4 w-4" />} /><QuickAction href="/tenders" label="Create from tender" detail="Start from search" icon={<FileText className="h-4 w-4" />} /><QuickAction href="/templates" label="Template" detail="Reusable responses" icon={<FilePlus2 className="h-4 w-4" />} /></div></section></aside>;
}

function RailHeader({ title, href }: { title: string; href?: string }) { return <div className="flex items-center justify-between border-b border-[#F2F4F7] px-4 py-4"><h2 className="text-sm font-semibold uppercase tracking-[0.04em] text-[#101828]">{title}</h2>{href ? <Link href={href} className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#155EEF]">View all <ArrowRight className="h-3 w-3" /></Link> : null}</div>; }
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
function initials(value: string) { return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase() || "TW"; }
