"use client";

import Link from "next/link";
import { useState } from "react";

import { AppShell } from "./app-shell";
import { RfpEmptyState, RfpStatusBadge, statusTone } from "./rfp-foundation";
import { TendyyErrorState, TendyyResponsiveDataView, TendyySkeletonRows } from "./tendyy-ui";
import { useActivities, useAudits, useCreateKnowledge, useDashboardSummary, useKnowledgeList, useRequirementsQueue, useResponsesQueue } from "../lib/queries";

export function RequirementsPage() {
  const [filter, setFilter] = useState("all");
  const queueQuery = useRequirementsQueue({ pageSize: 100, includeArchived: false });
  const rows = queueQuery.data?.items ?? [];
  const counts = queueQuery.data?.counts ?? { tenders: 0, requirements: 0, mandatory: 0, unanswered: 0, highRisk: 0, pendingReview: 0, approved: 0, blocked: 0 };
  const filteredRows = rows.filter((row) =>
    filter === "all"
    || (filter === "mandatory" && row.requirement.mandatory)
    || (filter === "unanswered" && !row.answerState.answered)
    || (filter === "high-risk" && row.riskState.highRisk)
    || (filter === "pending-review" && row.answerState.pendingReview)
    || (filter === "approved" && row.answerState.approved)
    || (filter === "blocked" && row.riskState.blocked),
  );
  const filters: Array<[string, string]> = [
    ["all", `All (${counts.requirements})`],
    ["mandatory", `Mandatory (${counts.mandatory})`],
    ["unanswered", `Unanswered (${counts.unanswered})`],
    ["high-risk", `High risk (${counts.highRisk})`],
    ["pending-review", `Pending review (${counts.pendingReview})`],
    ["approved", `Approved (${counts.approved})`],
    ["blocked", `Blocked (${counts.blocked})`],
  ];
  const filterHidesRows = filter !== "all" && filteredRows.length < rows.length;

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Apply", href: "/apply" }, { label: "Requirements" }]}>
      <main className="space-y-5">
        <PageTitle eyebrow="Response planning" title="Requirements" description="A workspace-wide view of tender requirements. Open a requirement to draft, evidence, and review its answer." />
        <MetricRow values={[["Tenders", counts.tenders], ["Requirements", counts.requirements], ["Mandatory", counts.mandatory]]} />
        <QueueFilters items={filters} value={filter} onChange={setFilter} />
        {filterHidesRows ? <p className="text-xs font-medium text-slate-500">Showing {filteredRows.length} of {rows.length} requirements for this filter.</p> : null}
        {queueQuery.isLoading ? <section className="rounded-[10px] border border-slate-200 bg-white p-4"><TendyySkeletonRows count={7} /></section> : queueQuery.isError ? <TendyyErrorState message="Requirements could not be loaded. Check the API and selected workspace, then retry." onRetry={() => void queueQuery.refetch()} /> : filteredRows.length ? <TendyyResponsiveDataView desktop={<section className="overflow-hidden rounded-[10px] border border-slate-200 bg-white"><table className="w-full table-fixed text-left text-[13px]"><thead className="bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500"><tr><th className="w-2/5 px-4 py-3">Requirement</th><th className="px-4 py-3">Tender</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Answer</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredRows.map(({ tender, requirement, answerState }) => <tr key={requirement.id} className="hover:bg-slate-50"><td className="px-4 py-3"><Link href={`/tenders/${tender.id}/requirements/${requirement.id}`} className="tendyy-wrap-anywhere font-semibold text-slate-950 hover:text-[#155EEF]">{requirement.title}</Link><p className="mt-1 line-clamp-2 text-xs text-slate-500">{requirement.description || "No description"}</p></td><td className="px-4 py-3"><Link href={`/apply/${tender.id}`} className="tendyy-wrap-anywhere font-medium text-[#155EEF] hover:underline">{tender.title}</Link></td><td className="px-4 py-3 text-slate-600">{formatLabel(requirement.requirementType)}</td><td className="px-4 py-3"><RfpStatusBadge tone={requirement.mandatory ? "warning" : "neutral"}>{requirement.mandatory ? "Mandatory" : "Standard"}</RfpStatusBadge></td><td className="px-4 py-3"><RfpStatusBadge tone={answerState.approved ? "success" : answerState.pendingReview ? "warning" : answerState.answered ? "neutral" : "danger"}>{answerState.approved ? "Approved" : answerState.pendingReview ? "Pending review" : answerState.answered ? "Answered" : "Unanswered"}</RfpStatusBadge></td><td className="px-4 py-3"><RfpStatusBadge tone={statusTone(requirement.status)}>{formatLabel(requirement.status)}</RfpStatusBadge></td></tr>)}</tbody></table></section>} mobile={<div className="space-y-3">{filteredRows.map(({ tender, requirement, answerState }) => <article key={requirement.id} className="min-w-0 rounded-[10px] border border-slate-200 bg-white p-4"><div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><Link href={`/tenders/${tender.id}/requirements/${requirement.id}`} className="tendyy-wrap-anywhere min-w-0 flex-1 font-semibold text-slate-950">{requirement.title}</Link><RfpStatusBadge tone={statusTone(requirement.status)}>{formatLabel(requirement.status)}</RfpStatusBadge></div><p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600">{requirement.description || "No description"}</p><dl className="mt-3 grid grid-cols-2 gap-3 text-xs"><CardField label="Tender" value={tender.title} /><CardField label="Type" value={formatLabel(requirement.requirementType)} /><CardField label="Priority" value={requirement.mandatory ? "Mandatory" : "Standard"} /><CardField label="Answer" value={answerState.approved ? "Approved" : answerState.pendingReview ? "Pending review" : answerState.answered ? "Answered" : "Unanswered"} /></dl><Link href={`/tenders/${tender.id}/requirements/${requirement.id}`} className="mt-4 inline-flex text-xs font-semibold text-[#155EEF]">Open requirement</Link></article>)}</div>} /> : <RfpEmptyState title="No matching requirements" description={rows.length ? "Try another queue filter to widen the results." : "Import a tender to populate this page."} actionHref="/tenders/import" actionLabel="Import RFP" />}
      </main>
    </AppShell>
  );
}

export function ResponsesPage() {
  const [quickFilter, setQuickFilter] = useState("all");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [evidence, setEvidence] = useState("all");
  const [confidence, setConfidence] = useState("all");
  const [review, setReview] = useState("all");
  const [sort, setSort] = useState("updated_desc");
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const queueQuery = useResponsesQueue({ pageSize, page, includeArchived: false, q: q.trim() || undefined, status, source, evidence, confidence, review, sort });
  const rows = queueQuery.data?.items ?? [];
  const counts = queueQuery.data?.counts ?? { total: 0, draft: 0, needsReview: 0, missingEvidence: 0, lowConfidence: 0, changesRequested: 0, final: 0 };
  const total = queueQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasActiveFilters = Boolean(q.trim()) || status !== "all" || source !== "all" || evidence !== "all" || confidence !== "all" || review !== "all";
  const filters: Array<[string, string]> = [
    ["all", `All (${counts.total})`],
    ["draft", `Draft (${counts.draft})`],
    ["missing-evidence", `Missing evidence (${counts.missingEvidence})`],
    ["low-confidence", `Low confidence (${counts.lowConfidence})`],
    ["changes-requested", `Changes requested (${counts.changesRequested})`],
    ["final", `Final (${counts.final})`],
  ];
  const clearFilters = () => {
    setQuickFilter("all");
    setQ("");
    setStatus("all");
    setSource("all");
    setEvidence("all");
    setConfidence("all");
    setReview("all");
    setSort("updated_desc");
    setPage(1);
  };
  const selectQuickFilter = (value: string) => {
    setQuickFilter(value);
    setPage(1);
    setStatus(value === "draft" ? "DRAFT" : value === "final" ? "FINAL" : "all");
    setEvidence(value === "missing-evidence" ? "missing" : "all");
    setConfidence(value === "low-confidence" ? "low" : "all");
    setReview(value === "changes-requested" ? "changes_requested" : "all");
    setSource("all");
  };

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Apply", href: "/apply" }, { label: "Responses" }]}>
      <main className="space-y-5">
        <PageTitle eyebrow="Response operations" title="Responses" description="All drafted answers across the active workspace. Open the tender workspace to edit, attach evidence, or send an answer for review." />
        <MetricRow values={[["Answers", counts.total], ["Needs review", counts.needsReview], ["Evidence linked", Math.max(0, counts.total - counts.missingEvidence)]]} />
        <QueueFilters items={filters} value={quickFilter} onChange={selectQuickFilter} />
        <section className="grid gap-3 rounded-[10px] border border-slate-200 bg-white p-4 md:grid-cols-[minmax(220px,1.4fr)_repeat(3,minmax(120px,1fr))] xl:grid-cols-[minmax(240px,1.6fr)_repeat(6,minmax(120px,1fr))_auto]">
          <label className="text-xs font-semibold text-slate-600">Search<input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder="Answer, tender, question, reviewer..." className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-950 outline-none focus:border-[#155EEF]" /></label>
          <FilterSelect label="Status" value={status} onChange={(value) => { setStatus(value); setQuickFilter("all"); setPage(1); }} options={["all", "DRAFT", "GENERATED", "IN_REVIEW", "CHANGES_REQUESTED", "APPROVED", "REJECTED", "FINAL"]} />
          <FilterSelect label="Source" value={source} onChange={(value) => { setSource(value); setQuickFilter("all"); setPage(1); }} options={["all", "MANUAL", "IMPORTED", "AI_GENERATED"]} />
          <FilterSelect label="Evidence" value={evidence} onChange={(value) => { setEvidence(value); setQuickFilter("all"); setPage(1); }} options={["all", "missing", "linked"]} />
          <FilterSelect label="Confidence" value={confidence} onChange={(value) => { setConfidence(value); setQuickFilter("all"); setPage(1); }} options={["all", "low", "medium", "high"]} />
          <FilterSelect label="Review" value={review} onChange={(value) => { setReview(value); setQuickFilter("all"); setPage(1); }} options={["all", "not_sent", "pending", "changes_requested", "approved", "rejected"]} />
          <FilterSelect label="Sort" value={sort} onChange={(value) => { setSort(value); setPage(1); }} options={["updated_desc", "updated_asc", "confidence_asc", "confidence_desc", "evidence_asc", "review_urgency"]} />
          <button type="button" onClick={clearFilters} className="self-end rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Clear all</button>
        </section>
        {queueQuery.isLoading ? <section className="rounded-[10px] border border-slate-200 bg-white p-4"><TendyySkeletonRows count={7} /></section> : queueQuery.isError ? <TendyyErrorState message="Responses could not be loaded. Check the API and selected workspace, then retry." onRetry={() => void queueQuery.refetch()} /> : rows.length ? <><TendyyResponsiveDataView desktop={<section className="overflow-hidden rounded-[10px] border border-slate-200 bg-white"><table className="w-full table-fixed text-left text-[13px]"><thead className="bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500"><tr><th className="w-[30%] px-4 py-3">Response</th><th className="w-[20%] px-4 py-3">Tender</th><th className="w-[20%] px-4 py-3">Question</th><th className="px-4 py-3">Evidence</th><th className="px-4 py-3">Confidence</th><th className="px-4 py-3">Review</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.answer.id} className="hover:bg-slate-50"><td className="px-4 py-3 align-top"><Link href={row.navigation.primaryHref} className="tendyy-wrap-anywhere font-semibold text-slate-950 hover:text-[#155EEF]">{excerpt(row.answer.answerText, 110)}</Link><p className="mt-1 text-xs text-slate-500">{formatLabel(row.answer.source)} · Updated {formatDate(row.answer.updatedAt)}</p></td><td className="px-4 py-3 align-top"><Link href={row.navigation.applyHref} className="tendyy-wrap-anywhere font-medium text-[#155EEF] hover:underline">{row.tender.title}</Link><p className="mt-1 text-xs text-slate-500">{row.tender.buyerName || "No buyer"}</p></td><td className="px-4 py-3 align-top"><p className="line-clamp-2 text-slate-700">{row.requirement?.title ?? row.question.questionText}</p>{row.linkedRequirementCount > 1 ? <p className="mt-1 text-xs text-slate-500">{row.linkedRequirementCount} linked requirements</p> : null}</td><td className="px-4 py-3 align-top text-slate-600">{row.answer.evidenceCount} linked</td><td className="px-4 py-3 align-top text-slate-600">{Math.round(row.answer.confidence * 100)}%</td><td className="px-4 py-3 align-top"><RfpStatusBadge tone={row.reviewSummary.counts.changesRequested ? "warning" : row.reviewSummary.counts.approved ? "success" : row.reviewSummary.counts.pending ? "neutral" : "neutral"}>{row.reviewSummary.latestStatus ? formatLabel(row.reviewSummary.latestStatus) : "Not sent"}</RfpStatusBadge>{row.reviewSummary.latestComment ? <p className="mt-1 line-clamp-2 text-xs text-slate-500">{row.reviewSummary.latestReviewerName ? `${row.reviewSummary.latestReviewerName}: ` : ""}{row.reviewSummary.latestComment}</p> : null}</td><td className="px-4 py-3 align-top"><RfpStatusBadge tone={statusTone(row.answer.status)}>{formatLabel(row.answer.status)}</RfpStatusBadge></td></tr>)}</tbody></table></section>} mobile={<div className="space-y-3">{rows.map((row) => <article key={row.answer.id} className="min-w-0 rounded-[10px] border border-slate-200 bg-white p-4"><div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><Link href={row.navigation.primaryHref} className="tendyy-wrap-anywhere min-w-0 flex-1 font-semibold text-slate-950">{excerpt(row.answer.answerText, 130)}</Link><RfpStatusBadge tone={statusTone(row.answer.status)}>{formatLabel(row.answer.status)}</RfpStatusBadge></div><p className="mt-2 tendyy-wrap-anywhere text-xs font-medium text-[#155EEF]">{row.tender.title}</p><p className="mt-2 line-clamp-2 text-xs text-slate-600">{row.requirement?.title ?? row.question.questionText}</p><dl className="mt-3 grid grid-cols-2 gap-3 text-xs"><CardField label="Evidence" value={`${row.answer.evidenceCount} linked`} /><CardField label="Confidence" value={`${Math.round(row.answer.confidence * 100)}%`} /><CardField label="Review" value={row.reviewSummary.latestStatus ? formatLabel(row.reviewSummary.latestStatus) : "Not sent"} /><CardField label="Updated" value={formatDate(row.answer.updatedAt)} /></dl>{row.reviewSummary.latestComment ? <p className="mt-3 line-clamp-2 text-xs text-slate-500">{row.reviewSummary.latestComment}</p> : null}<div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold"><Link href={row.navigation.primaryHref} className="text-[#155EEF]">Open response</Link><Link href={row.navigation.applyHref} className="text-slate-600">Open application</Link></div></article>)}</div>} /><div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500"><span>Showing {rows.length} of {total} responses</span><div className="flex items-center gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 disabled:opacity-40">Previous</button><span>Page {page} of {totalPages}</span><button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 disabled:opacity-40">Next</button></div></div></> : <RfpEmptyState title={hasActiveFilters ? "No matching responses" : "No responses yet"} description={hasActiveFilters ? "Clear filters or adjust the search to widen the queue." : "Draft or generate a response from an application workspace to populate this queue."} actionHref={hasActiveFilters ? undefined : "/tenders"} actionLabel={hasActiveFilters ? undefined : "Open tenders"} />}
      </main>
    </AppShell>
  );
}

export function NotificationsPage() {
  const dashboardQuery = useDashboardSummary(25);
  const activitiesQuery = useActivities();
  const attention = dashboardQuery.data?.attention ?? [];
  const activities = activitiesQuery.data?.items ?? [];
  return <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Notifications" }]}><main className="space-y-5"><PageTitle eyebrow="Workspace updates" title="Notifications" description="Validation alerts and the most recent workspace activity." /><section className="grid gap-4 xl:grid-cols-2"><Panel title={`Attention (${attention.length})`}>{attention.length ? attention.map((item) => <div key={item.id} className="border-b border-slate-100 py-3 last:border-0"><p className="font-semibold text-slate-950">{item.title}</p><p className="mt-1 text-sm text-slate-600">{item.detail}</p>{item.href ? <Link href={item.href} className="mt-2 inline-block text-sm font-semibold text-[#155EEF]">Open item</Link> : null}</div>) : <EmptyCopy text="No validation alerts right now." />}</Panel><Panel title="Recent activity">{activities.length ? activities.map((item) => <div key={item.id} className="border-b border-slate-100 py-3 last:border-0"><p className="font-semibold text-slate-950">{item.label}</p><p className="mt-1 text-sm text-slate-600">{item.summary}</p><p className="mt-1 text-xs text-slate-500">{formatDate(item.createdAt)}</p></div>) : <EmptyCopy text="No recent workspace activity." />}</Panel></section></main></AppShell>;
}

export function AuditPage() {
  const auditQuery = useAudits();
  const rows = auditQuery.data?.items ?? [];
  return <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Organization", href: "/organization" }, { label: "Audit log" }]}><main className="space-y-5"><PageTitle eyebrow="Governance" title="Audit log" description="Organization and workspace actions recorded by the active API." />{rows.length ? <Panel title={`${rows.length} recorded events`}><div className="divide-y divide-slate-100">{rows.map((item) => <div key={item.id} className="grid gap-1 py-3 sm:grid-cols-[1fr_auto]"><div><p className="font-semibold text-slate-950">{formatLabel(item.action)}</p><p className="mt-1 text-sm text-slate-600">{item.entityType} {item.entityId}</p></div><p className="text-xs text-slate-500">{formatDate(item.createdAt)}</p></div>)}</div></Panel> : <RfpEmptyState title="No audit records yet" description="Audit records appear after organization, workspace, and tender actions are performed." />}</main></AppShell>;
}

export function TemplatesPage() {
  const templatesQuery = useKnowledgeList({ pageSize: 100 });
  const createTemplate = useCreateKnowledge();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const templates = (templatesQuery.data?.items ?? []).filter((item) => /template/i.test(`${item.type} ${item.category}`));
  return <AppShell breadcrumbs={[{ label: "Knowledge", href: "/knowledge" }, { label: "Templates" }]}><main className="space-y-5"><PageTitle eyebrow="Reusable knowledge" title="Response templates" description="Create reusable answer structures as knowledge records, then use them as governed source material in tender responses." />{creating ? <Panel title="Create response template"><form className="space-y-3" onSubmit={(event) => { event.preventDefault(); createTemplate.mutate({ name, summary, type: "TEMPLATE", category: "RESPONSE_TEMPLATE", authority: "medium" }, { onSuccess: () => { setName(""); setSummary(""); setCreating(false); } }); }}><label className="block text-sm font-medium text-slate-700">Template name<input required value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-950" /></label><label className="block text-sm font-medium text-slate-700">Guidance<textarea required value={summary} onChange={(event) => setSummary(event.target.value)} className="mt-1.5 min-h-28 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-950" /></label><div className="flex gap-2"><button type="submit" disabled={createTemplate.isPending} className="rounded-lg bg-[#05091A] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{createTemplate.isPending ? "Creating..." : "Create template"}</button><button type="button" onClick={() => setCreating(false)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900">Cancel</button></div></form></Panel> : <button type="button" onClick={() => setCreating(true)} className="rounded-lg bg-[#05091A] px-4 py-2 text-sm font-semibold text-white">Create template</button>}{templates.length ? <section className="grid gap-3 md:grid-cols-2">{templates.map((item) => <Link key={item.id} href={`/knowledge/${item.id}`} className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] hover:border-[#155EEF]"><p className="font-semibold text-slate-950">{item.name}</p><p className="mt-2 line-clamp-3 text-sm text-slate-600">{item.summary}</p><p className="mt-3 text-xs font-semibold text-[#155EEF]">Open template</p></Link>)}</section> : <RfpEmptyState title="No templates yet" description="Create your first reusable response template for common tender questions." />}</main></AppShell>;
}

function PageTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]"><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#155EEF]">{eyebrow}</p><h1 className="mt-2 text-[29px] font-semibold tracking-tight text-slate-950">{title}</h1><p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-600">{description}</p></section>; }
function MetricRow({ values }: { values: Array<[string, number]> }) { return <section className="grid gap-3 sm:grid-cols-3">{values.map(([label, value]) => <div key={label} className="rounded-[10px] border border-slate-200 bg-white p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p></div>)}</section>; }
function QueueFilters({ items, value, onChange }: { items: Array<[string, string]>; value: string; onChange: (value: string) => void }) { return <div className="flex flex-wrap gap-2">{items.map(([key, label]) => <button key={key} type="button" onClick={() => onChange(key)} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${value === key ? "border-[#155EEF] bg-sky-50 text-[#155EEF]" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{label}</button>)}</div>; }
function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) { return <label className="text-xs font-semibold text-slate-600">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-950 outline-none focus:border-[#155EEF]">{options.map((option) => <option key={option} value={option}>{formatLabel(option)}</option>)}</select></label>; }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]"><h2 className="text-lg font-semibold text-slate-950">{title}</h2><div className="mt-3">{children}</div></section>; }
function EmptyCopy({ text }: { text: string }) { return <p className="py-4 text-sm text-slate-500">{text}</p>; }
function CardField({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</dt><dd className="tendyy-wrap-anywhere mt-1 text-slate-700">{value}</dd></div>; }
function excerpt(value: string, length: number) { const text = value.trim() || "Untitled answer"; return text.length > length ? `${text.slice(0, length - 1)}...` : text; }
function formatLabel(value: string) { return value.replace(/[_-]+/g, " ").toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase()); }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
