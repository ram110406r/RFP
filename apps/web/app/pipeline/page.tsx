"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  BarChart3,
  Bell,
  CircleDollarSign,
  Download,
  FileText,
  Flag,
  GitBranch,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";

import { AppShell } from "../../components/app-shell";
import { useFirebaseSession } from "../../components/firebase-auth-gate";
import { RfpStatusBadge, statusTone } from "../../components/rfp-foundation";
import type { ActivityItem, DashboardTenderCard, TenderSummary } from "../../lib/models";
import { useActivities, useDashboardSummary, useTransitionTender } from "../../lib/queries";
import { Button } from "@rfp-os/ui";

type PipelineTab = "all" | "mine" | "risk" | "closing" | "won" | "lost";
type PipelineRow = DashboardTenderCard & { stageId: string };

const stages: Array<{ id: string; label: string; statuses: string[] }> = [
  { id: "new", label: "New", statuses: ["DRAFT", "INTAKE", "PROCESSING"] },
  { id: "qualified", label: "Qualified", statuses: ["READY"] },
  { id: "applying", label: "Applying", statuses: ["IN_PROGRESS"] },
  { id: "response", label: "RFP Response", statuses: ["REVIEW", "APPROVED"] },
  { id: "submitted", label: "Submitted", statuses: ["SUBMITTED", "CLOSED"] },
  { id: "evaluation", label: "Evaluation", statuses: [] },
  { id: "negotiation", label: "Negotiation", statuses: [] },
  { id: "won", label: "Won", statuses: [] },
  { id: "lost", label: "Lost", statuses: [] },
];

const tabs: Array<{ id: PipelineTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "mine", label: "My Pipeline" },
  { id: "risk", label: "At Risk" },
  { id: "closing", label: "Closing Soon" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
];

const stageTransitions: Record<string, string[]> = {
  DRAFT: ["INTAKE", "CANCELLED"],
  INTAKE: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["READY", "CANCELLED"],
  READY: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["REVIEW", "CANCELLED"],
  REVIEW: ["IN_PROGRESS", "APPROVED", "CANCELLED"],
  APPROVED: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["CLOSED", "CANCELLED"],
  CLOSED: ["ARCHIVED"],
};

export default function PipelinePage() {
  const session = useFirebaseSession();
  const summaryQuery = useDashboardSummary(25);
  const activitiesQuery = useActivities({ entityType: "tender" });
  const [search, setSearch] = useState("");
  const [owner, setOwner] = useState("all");
  const [stage, setStage] = useState("all");
  const [deadline, setDeadline] = useState("all");
  const [valueBand, setValueBand] = useState("all");
  const [riskOnly, setRiskOnly] = useState(false);
  const [tab, setTab] = useState<PipelineTab>("all");
  const [mobileStage, setMobileStage] = useState("response");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const summary = summaryQuery.data;
  const sourceRows = useMemo(() => summary?.activeTenders ?? [], [summary]);
  const currentUserId = session?.user?.uid ?? "";

  const rows = useMemo<PipelineRow[]>(() => {
    const query = search.trim().toLowerCase();
    return sourceRows
      .map((row) => ({ ...row, stageId: getStageId(row.tender) }))
      .filter((row) => {
        const tender = row.tender;
        const value = tenderValue(tender.metadata);
        const days = daysUntil(tender.dueAt);
        const matchesSearch = !query || [tender.title, tender.name, tender.referenceNumber ?? ""].join(" ").toLowerCase().includes(query);
        const matchesOwner = owner === "all" || tender.ownerId === owner;
        const matchesStage = stage === "all" || row.stageId === stage;
        const matchesDeadline = deadline === "all" || (deadline === "overdue" ? days < 0 : days <= Number(deadline));
        const matchesValue = valueBand === "all" || (valueBand === "under" ? value < 10000000 : valueBand === "mid" ? value >= 10000000 && value < 100000000 : value >= 100000000);
        const matchesRisk = !riskOnly || hasRisk(row);
        const matchesTab = tab === "all"
          || (tab === "mine" && (!currentUserId || tender.ownerId === currentUserId))
          || (tab === "risk" && hasRisk(row))
          || (tab === "closing" && days >= 0 && days <= 30)
          || row.stageId === tab;
        return matchesSearch && matchesOwner && matchesStage && matchesDeadline && matchesValue && matchesRisk && matchesTab;
      });
  }, [currentUserId, deadline, owner, riskOnly, search, sourceRows, stage, tab, valueBand]);

  const selected = useMemo(() => rows.find((row) => row.tender.id === selectedId) ?? null, [rows, selectedId]);
  const ownerOptions = ["all", ...new Set(sourceRows.map((row) => row.tender.ownerId).filter(Boolean))];
  const pipelineValue = sourceRows.reduce((total, row) => total + tenderValue(row.tender.metadata), 0);
  const metrics = summary?.metrics;

  useEffect(() => {
    const firstRow = rows[0];
    if (!selectedId && firstRow) setSelectedId(firstRow.tender.id);
    if (selectedId && firstRow && !rows.some((row) => row.tender.id === selectedId)) setSelectedId(firstRow.tender.id);
  }, [rows, selectedId]);

  function clearFilters() {
    setSearch("");
    setOwner("all");
    setStage("all");
    setDeadline("all");
    setValueBand("all");
    setRiskOnly(false);
    setTab("all");
  }

  function exportRows() {
    const csv = [
      ["Tender", "Authority", "Stage", "Value", "Deadline", "Status", "Owner"],
      ...rows.map((row) => [row.tender.title, row.tender.name, stageLabel(row.stageId), String(tenderValue(row.tender.metadata)), row.tender.dueAt ?? "", row.tender.status, row.tender.ownerId]),
    ].map((line) => line.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "tendyy-pipeline.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Pipeline" }]}>
      <div className="min-w-0 space-y-5 pb-8">
        <section className="flex flex-wrap items-center gap-3">
          <Button asChild variant="primary">
            <Link href="/tenders/new">
              <Plus className="h-4 w-4 text-white" />
              Add opportunity
            </Link>
          </Button>
          <Button type="button" variant="secondary" onClick={exportRows}>
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button type="button" variant="icon" size="icon" className="relative" aria-label="Notifications">
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-[#155EEF]" />
          </Button>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Pipeline summary">
          <Metric label="Pipeline value" value={formatValue(pipelineValue)} detail="Across loaded active stages" icon={<CircleDollarSign className="h-5 w-5" />} />
          <Metric label="Opportunities" value={String(metrics?.activeRfps ?? sourceRows.length)} detail="Across all active stages" icon={<BarChart3 className="h-5 w-5" />} />
          <Metric label="Active RFPs" value={String(metrics?.activeRfps ?? 0)} detail="Currently in progress" icon={<FileText className="h-5 w-5" />} />
          <Metric label="At risk" value={String(metrics?.highRiskItems ?? 0)} detail="Require attention" icon={<ShieldAlert className="h-5 w-5" />} />
        </section>

        <section className="border border-[#E4E7EC] bg-white p-4" aria-label="Pipeline filters">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[8px] border border-[#D0D5DD] px-3 text-[#667085] focus-within:border-[#155EEF]"><Search className="h-4 w-4 shrink-0" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search opportunities by tender, authority, ID..." className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#98A2B3]" /></label>
            <FilterSelect label="Owner" value={owner} options={ownerOptions} onChange={setOwner} />
            <FilterSelect label="Stage" value={stage} options={["all", ...stages.map((item) => item.id)]} onChange={setStage} />
            <FilterSelect label="Deadline" value={deadline} options={["all", "7", "30", "overdue"]} labels={{ all: "All deadlines", "7": "Next 7 days", "30": "Next 30 days", overdue: "Overdue" }} onChange={setDeadline} />
            <FilterSelect label="Value" value={valueBand} options={["all", "under", "mid", "high"]} labels={{ all: "All values", under: "Under ₹1 Cr", mid: "₹1-10 Cr", high: "Over ₹10 Cr" }} onChange={setValueBand} />
            <details className="relative shrink-0"><summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-[8px] border border-[#E4E7EC] px-3 text-xs font-semibold text-[#344054]"><Flag className="h-3.5 w-3.5 text-[#667085]" />More filters</summary><div className="absolute right-0 top-11 z-20 w-64 border border-[#E4E7EC] bg-white p-4 shadow-[0_12px_32px_rgba(16,24,40,0.12)]"><label className="flex items-center gap-2 text-xs font-medium text-[#344054]"><input type="checkbox" checked={riskOnly} onChange={(event) => setRiskOnly(event.target.checked)} className="accent-[#155EEF]" />Only opportunities with risk</label><p className="mt-3 text-[11px] leading-5 text-[#667085]">Additional stage movement rules are enforced by the server.</p></div></details>
            {(search || owner !== "all" || stage !== "all" || deadline !== "all" || valueBand !== "all" || riskOnly || tab !== "all") ? <button type="button" onClick={clearFilters} className="shrink-0 text-xs font-semibold text-[#155EEF]">Clear</button> : null}
          </div>
        </section>

        <div className="flex items-end justify-between gap-4 overflow-x-auto border-b border-[#E4E7EC]"><div className="flex min-w-max items-center gap-5">{tabs.map((item) => <button type="button" key={item.id} onClick={() => setTab(item.id)} className={`relative whitespace-nowrap pb-3 text-sm font-semibold ${tab === item.id ? "text-[#155EEF] after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-[#155EEF]" : "text-[#667085] hover:text-[#344054]"}`}>{item.label}</button>)}</div><button type="button" onClick={() => void summaryQuery.refetch()} className="mb-2 hidden shrink-0 items-center gap-1 text-xs font-semibold text-[#155EEF] sm:flex"><RefreshCw className="h-3.5 w-3.5" />Refresh</button></div>

        <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-[#101828]">{rows.length} opportunities</p><p className="mt-1 text-xs text-[#667085]">Operational view from the current tender workspace</p></div><span className="inline-flex items-center gap-2 text-xs font-semibold text-[#667085]"><span className="h-2 w-2 rounded-full bg-emerald-500" />Live data</span></div>

        {summaryQuery.isError ? <section className="border border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-800" role="alert">Unable to load pipeline. <button type="button" onClick={() => void summaryQuery.refetch()} className="font-semibold underline">Retry</button></section> : summaryQuery.isLoading ? <PipelineSkeleton /> : sourceRows.length === 0 ? <EmptyPipeline /> : <>
          <div className="md:hidden"><label className="flex h-10 items-center justify-between rounded-[8px] border border-[#E4E7EC] bg-white px-3 text-sm font-semibold text-[#344054]"><span>Stage</span><select value={mobileStage} onChange={(event) => setMobileStage(event.target.value)} className="bg-transparent text-right outline-none">{stages.map((item) => <option key={item.id} value={item.id}>{item.label} ({rows.filter((row) => row.stageId === item.id).length})</option>)}</select></label></div>
          <KanbanBoard rows={rows} mobileStage={mobileStage} onSelect={setSelectedId} />
          <div className="grid gap-5 xl:grid-cols-2"><ClosingSoon rows={rows} /><PipelineChanges items={activitiesQuery.data?.items ?? []} loading={activitiesQuery.isLoading} /></div>
        </>}
      </div>
      {selected ? <PipelineDrawer row={selected} onClose={() => setSelectedId(null)} error={drawerError} setError={setDrawerError} /> : null}
    </AppShell>
  );
}

function Metric({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: ReactNode }) {
  return <div className="flex min-h-[104px] items-start gap-3 border border-[#E4E7EC] bg-white p-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EFF5FF] text-[#155EEF]">{icon}</span><span><span className="block text-xs font-semibold text-[#667085]">{label}</span><span className="mt-1 block text-[22px] font-semibold tracking-[-0.02em] text-[#101828]">{value}</span><span className="mt-1 block text-[11px] text-[#667085]">{detail}</span></span></div>;
}

function FilterSelect({ label, value, options, onChange, labels = {} }: { label: string; value: string; options: string[]; onChange: (value: string) => void; labels?: Record<string, string> }) {
  return <label className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[8px] border border-[#E4E7EC] px-3 text-xs text-[#667085]"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="max-w-[125px] bg-transparent font-semibold text-[#344054] outline-none">{options.map((option) => <option key={option} value={option}>{labels[option] ?? (option === "all" ? "All" : formatStatus(option))}</option>)}</select></label>;
}

function KanbanBoard({ rows, mobileStage, onSelect }: { rows: PipelineRow[]; mobileStage: string; onSelect: (id: string) => void }) {
  return <div className="-mx-1 overflow-x-auto pb-2"><div className="flex min-w-max gap-3 px-1">{stages.map((stage) => <section key={stage.id} className={`${stage.id === mobileStage ? "" : "hidden md:block"} w-[264px] shrink-0 border border-[#E4E7EC] bg-[#FCFCFD]`}><div className="border-t-2 border-[#155EEF] px-3 py-3"><div className="flex items-center justify-between gap-2"><h2 className="text-xs font-bold uppercase tracking-[0.08em] text-[#101828]">{stage.label}</h2><span className="text-xs font-semibold text-[#667085]">{rows.filter((row) => row.stageId === stage.id).length}</span></div><p className="mt-1 text-[11px] text-[#667085]">{formatValue(rows.filter((row) => row.stageId === stage.id).reduce((total, row) => total + tenderValue(row.tender.metadata), 0))} total value</p></div><div className="space-y-2 p-2">{rows.filter((row) => row.stageId === stage.id).map((row) => <OpportunityCard key={row.tender.id} row={row} onSelect={onSelect} />)}{rows.filter((row) => row.stageId === stage.id).length === 0 ? <p className="border border-dashed border-[#D0D5DD] px-3 py-6 text-center text-xs text-[#98A2B3]">No opportunities in this stage.</p> : null}</div></section>)}</div></div>;
}

function OpportunityCard({ row, onSelect }: { row: PipelineRow; onSelect: (id: string) => void }) {
  const tender = row.tender;
  const progress = Math.max(0, Math.min(100, row.readiness ?? 0));
  return <article className="border border-[#E4E7EC] bg-white p-3 transition hover:border-[#155EEF] hover:shadow-[0_4px_12px_rgba(16,24,40,0.06)]"><button type="button" onClick={() => onSelect(tender.id)} className="w-full text-left"><div className="flex items-start justify-between gap-2"><span className="min-w-0"><span className="block line-clamp-2 text-xs font-semibold leading-5 text-[#101828]">{tender.title}</span><span className="mt-1 block line-clamp-2 text-[11px] leading-4 text-[#667085]">{tender.name}</span></span><MoreHorizontal className="h-4 w-4 shrink-0 text-[#98A2B3]" /></div><div className="mt-3 grid grid-cols-2 gap-2 text-[11px]"><span><span className="block text-[#98A2B3]">Value</span><span className="mt-0.5 block font-semibold text-[#344054]">{formatValue(tenderValue(tender.metadata))}</span></span><span><span className="block text-[#98A2B3]">Deadline</span><span className={`mt-0.5 block font-semibold ${daysUntil(tender.dueAt) >= 0 && daysUntil(tender.dueAt) <= 7 ? "text-rose-700" : "text-[#344054]"}`}>{daysLeftLabel(tender.dueAt)}</span></span></div><div className="mt-3 flex items-center justify-between gap-2"><RfpStatusBadge tone={statusTone(tender.status)}>{stageLabel(row.stageId)}</RfpStatusBadge><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#EFF5FF] text-[10px] font-bold text-[#155EEF]">{initials(tender.ownerId)}</span></div><div className="mt-3"><div className="flex items-center justify-between text-[10px] text-[#667085]"><span>Progress</span><span className="font-semibold text-[#101828]">{row.readiness === null ? "-" : `${row.readiness}%`}</span></div><div className="mt-1 h-1.5 bg-[#E4E7EC]"><div className="h-1.5 bg-[#155EEF]" style={{ width: `${progress}%` }} /></div></div><div className="mt-2 flex items-center justify-between text-[10px]"><span className={hasRisk(row) ? "font-semibold text-rose-700" : "text-emerald-700"}>{hasRisk(row) ? `! ${row.blockingIssueCount || row.issueCount} issue${(row.blockingIssueCount || row.issueCount) === 1 ? "" : "s"}` : "Healthy"}</span><span className="text-[#98A2B3]">{relativeTime(tender.updatedAt)}</span></div></button></article>;
}

function ClosingSoon({ rows }: { rows: PipelineRow[] }) {
  const closing = [...rows].filter((row) => daysUntil(row.tender.dueAt) >= 0).sort((a, b) => daysUntil(a.tender.dueAt) - daysUntil(b.tender.dueAt)).slice(0, 5);
  return <section className="border border-[#E4E7EC] bg-white"><SectionHeader title="Closing soon" href="/tenders" />{closing.length === 0 ? <p className="p-4 text-sm text-[#667085]">No upcoming deadlines in the current view.</p> : <div className="overflow-x-auto"><table className="min-w-[620px] w-full text-left text-xs"><thead className="border-b border-[#F2F4F7] bg-[#FCFCFD] text-[10px] uppercase tracking-[0.08em] text-[#667085]"><tr><th className="px-4 py-3">Tender / authority</th><th className="px-3 py-3">Stage</th><th className="px-3 py-3">Deadline</th><th className="px-3 py-3">Value</th><th className="px-3 py-3">Days left</th></tr></thead><tbody className="divide-y divide-[#F2F4F7]">{closing.map((row) => <tr key={row.tender.id} className="hover:bg-[#F8FAFC]"><td className="max-w-[220px] px-4 py-3"><span className="block truncate font-semibold text-[#101828]">{row.tender.title}</span><span className="mt-1 block truncate text-[10px] text-[#667085]">{row.tender.name}</span></td><td className="px-3 py-3 text-[#344054]">{stageLabel(row.stageId)}</td><td className="whitespace-nowrap px-3 py-3 text-[#344054]">{formatDate(row.tender.dueAt)}</td><td className="whitespace-nowrap px-3 py-3 font-semibold text-[#344054]">{formatValue(tenderValue(row.tender.metadata))}</td><td className="whitespace-nowrap px-3 py-3 font-semibold text-[#155EEF]">{daysLeftLabel(row.tender.dueAt)}</td></tr>)}</tbody></table></div>}</section>;
}

function PipelineChanges({ items, loading }: { items: ActivityItem[]; loading: boolean }) {
  return <section className="border border-[#E4E7EC] bg-white"><SectionHeader title="Pipeline changes" href="/reviews" />{loading ? <div className="space-y-3 p-4">{[1, 2, 3, 4].map((item) => <div key={item} className="h-8 animate-pulse bg-[#F2F4F7]" />)}</div> : items.length === 0 ? <p className="p-4 text-sm text-[#667085]">No recent pipeline activity is available.</p> : <div className="divide-y divide-[#F2F4F7]">{items.slice(0, 5).map((item) => <div key={item.id} className="flex items-start gap-3 px-4 py-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#155EEF]" /><span className="min-w-0 flex-1"><p className="text-xs font-medium text-[#344054]">{item.summary || item.label}</p><p className="mt-1 text-[10px] text-[#98A2B3]">{relativeTime(item.createdAt)}{item.actorLabel ? ` · ${item.actorLabel}` : ""}</p></span></div>)}</div>}</section>;
}

function SectionHeader({ title, href }: { title: string; href: string }) { return <div className="flex items-center justify-between border-b border-[#F2F4F7] px-4 py-4"><h2 className="text-sm font-semibold uppercase tracking-[0.04em] text-[#101828]">{title}</h2><Link href={href} className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#155EEF]">View all <ArrowRight className="h-3 w-3" /></Link></div>; }

function PipelineDrawer({ row, onClose, error, setError }: { row: PipelineRow; onClose: () => void; error: string | null; setError: (value: string | null) => void }) {
  const transition = useTransitionTender(row.tender.id);
  const available = stageTransitions[row.tender.status] ?? [];
  const progress = Math.max(0, Math.min(100, row.readiness ?? 0));

  async function moveTo(target: string) {
    const targetLabel = formatStatus(target);
    if (["SUBMITTED", "CLOSED", "CANCELLED"].includes(target) && !window.confirm(`Move this opportunity to ${targetLabel}? The server will validate this transition.`)) return;
    setError(null);
    try {
      await transition.mutateAsync({ to: target, reason: "Pipeline stage update" });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to move this opportunity.");
    }
  }

  return <><button type="button" onClick={onClose} className="fixed inset-0 z-30 bg-slate-950/20" aria-label="Close opportunity details" /><aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[390px] flex-col border-l border-[#E4E7EC] bg-white shadow-[-12px_0_32px_rgba(16,24,40,0.08)]" aria-label="Opportunity details"><div className="flex items-start justify-between gap-4 border-b border-[#E4E7EC] px-5 py-5"><div><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700"><span className="h-2 w-2 rounded-full bg-emerald-500" />Live</div><h2 className="mt-2 text-lg font-semibold leading-6 text-[#101828]">{row.tender.title}</h2><p className="mt-1 text-xs leading-5 text-[#667085]">{row.tender.name}</p></div><button type="button" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[#667085] hover:bg-[#F8FAFC]" aria-label="Close details"><X className="h-4 w-4" /></button></div><div className="min-h-0 flex-1 overflow-y-auto px-5 py-5"><p className="text-xs text-[#667085]">ID: {row.tender.referenceNumber ?? row.tender.id}</p><div className="mt-5 grid grid-cols-2 gap-4 border-y border-[#F2F4F7] py-4"><Detail label="Value" value={formatValue(tenderValue(row.tender.metadata))} /><Detail label="Deadline" value={`${formatDate(row.tender.dueAt)}${row.tender.dueAt ? `, ${formatTime(row.tender.dueAt, row.tender.timezone)}` : ""}`} /><Detail label="Current stage" value={stageLabel(row.stageId)} /><Detail label="Progress" value={row.readiness === null ? "Not calculated" : `${row.readiness}%`} /></div><div className="mt-4"><div className="h-2 bg-[#E4E7EC]"><div className="h-2 bg-[#155EEF]" style={{ width: `${progress}%` }} /></div></div><div className="mt-5 grid grid-cols-2 gap-4"><Detail label="Owner" value={row.tender.ownerId || "Unassigned"} /><Detail label="Risk status" value={hasRisk(row) ? `${row.blockingIssueCount || row.issueCount} open issue(s)` : "Healthy"} tone={hasRisk(row) ? "danger" : "success"} /></div><div className="mt-6 border-t border-[#F2F4F7] pt-5"><p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#667085]">Next action</p><p className="mt-2 text-sm font-semibold text-[#101828]">{row.pendingReviews > 0 ? `${row.pendingReviews} review${row.pendingReviews === 1 ? "" : "s"} require attention` : row.ready ? "Ready for submission checks" : "Continue response preparation"}</p><Button asChild variant="secondary" className="mt-4"><Link href={`/apply/${row.tender.id}`}>Open application <ArrowRight className="h-3.5 w-3.5" /></Link></Button></div><div className="mt-6 border-t border-[#F2F4F7] pt-5"><p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#667085]">Tender context</p><dl className="mt-3 divide-y divide-[#F2F4F7]">{[["Category", formatStatus(row.tender.tenderType)], ["Location", metadataText(row.tender.metadata, "location")], ["Source", formatStatus(row.tender.sourceType)], ["Last updated", relativeTime(row.tender.updatedAt)]].map(([label, value]) => <div key={label} className="grid grid-cols-[100px_1fr] gap-3 py-2 text-xs"><dt className="text-[#667085]">{label}</dt><dd className="font-medium text-[#344054]">{value}</dd></div>)}</dl></div>{error ? <p className="mt-5 border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800" role="alert">{error}</p> : null}</div><div className="border-t border-[#E4E7EC] p-5"><label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#667085]">Move stage</label><div className="mt-2 flex gap-2"><select defaultValue="" onChange={(event) => { if (event.target.value) void moveTo(event.target.value); event.currentTarget.value = ""; }} disabled={transition.isPending || available.length === 0} className="h-10 min-w-0 flex-1 rounded-[8px] border border-[#D0D5DD] bg-white px-3 text-xs font-semibold text-[#344054] outline-none focus:border-[#155EEF]"><option value="">{available.length ? "Select next stage" : "No transitions available"}</option>{available.map((target) => <option key={target} value={target}>{formatStatus(target)}</option>)}</select><Button type="button" variant="secondary" size="md" onClick={onClose}>Close</Button></div></div></aside></>;
}

function Detail({ label, value, tone }: { label: string; value: string; tone?: "danger" | "success" }) { return <div><p className="text-[11px] text-[#667085]">{label}</p><p className={`mt-1 text-xs font-semibold ${tone === "danger" ? "text-rose-700" : tone === "success" ? "text-emerald-700" : "text-[#344054]"}`}>{value}</p></div>; }
function PipelineSkeleton() { return <div className="flex gap-3 overflow-hidden">{[1, 2, 3, 4].map((item) => <div key={item} className="w-[264px] shrink-0 animate-pulse border border-[#E4E7EC] p-3"><div className="h-12 bg-[#F2F4F7]" /><div className="mt-3 space-y-2">{[1, 2, 3].map((line) => <div key={line} className="h-28 bg-[#F2F4F7]" />)}</div></div>)}</div>; }
function EmptyPipeline() { return <section className="border border-dashed border-[#D0D5DD] bg-white px-5 py-14 text-center"><GitBranch className="mx-auto h-8 w-8 text-[#98A2B3]" /><h2 className="mt-3 text-lg font-semibold text-[#101828]">No opportunities yet</h2><p className="mt-1 text-sm text-[#667085]">Add your first opportunity to start building the pipeline.</p><Button asChild className="mt-5"><Link href="/tenders/new"><Plus className="h-4 w-4" />Add opportunity</Link></Button></section>; }

function getStageId(tender: TenderSummary) {
  const metadataStage = tender.metadata.pipelineStage ?? tender.metadata.stage;
  if (typeof metadataStage === "string") {
    const normalized = metadataStage.toLowerCase().replace(/[ _-]+/g, "");
    const match = stages.find((item) => item.id.replace(/[ _-]+/g, "") === normalized || item.label.toLowerCase().replace(/[ _-]+/g, "") === normalized);
    if (match) return match.id;
  }
  return stages.find((item) => item.statuses.includes(tender.status))?.id ?? "new";
}
function stageLabel(id: string) { return stages.find((item) => item.id === id)?.label ?? formatStatus(id); }
function hasRisk(row: DashboardTenderCard) { return row.blockingIssueCount > 0 || ["HIGH", "CRITICAL"].includes(row.highestIssue?.severity ?? ""); }
function tenderValue(metadata: Record<string, unknown>) { const value = metadata.estimatedValue ?? metadata.estimatedContractValue ?? metadata.value; if (typeof value === "number" && Number.isFinite(value)) return value; if (typeof value === "string") { const parsed = Number(value.replace(/[^0-9.-]/g, "")); return Number.isFinite(parsed) ? parsed : 0; } return 0; }
function formatValue(value: number) { if (!value) return "Not tracked"; return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", notation: value >= 10000000 ? "compact" : "standard", maximumFractionDigits: value >= 10000000 ? 1 : 0 }).format(value); }
function daysUntil(value: string | null) { if (!value) return Number.POSITIVE_INFINITY; return Math.ceil((new Date(value).getTime() - Date.now()) / 86400000); }
function daysLeftLabel(value: string | null) { const days = daysUntil(value); if (!Number.isFinite(days)) return "No deadline"; if (days < 0) return `${Math.abs(days)}d overdue`; if (days === 0) return "Due today"; return `${days}d left`; }
function formatDate(value: string | null) { if (!value) return "Not set"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "Not set" : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date); }
function formatTime(value: string, timezone: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: timezone || undefined }).format(date); }
function relativeTime(value: string) { const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000)); if (minutes < 1) return "Just now"; if (minutes < 60) return `${minutes}m ago`; const hours = Math.round(minutes / 60); if (hours < 24) return `${hours}h ago`; return `${Math.round(hours / 24)}d ago`; }
function metadataText(metadata: Record<string, unknown>, key: string) { const value = metadata[key]; return typeof value === "string" && value.trim() ? value : "Not set"; }
function formatStatus(value: string) { return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()); }
function initials(value: string) { return value.split(/[-_\s]+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase() || "NA"; }
