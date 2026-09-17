"use client";

import Link from "next/link";
import { useQueries } from "@tanstack/react-query";
import { useState } from "react";

import { AppShell } from "./app-shell";
import { RfpEmptyState, RfpStatusBadge, statusTone } from "./rfp-foundation";
import { TendyyResponsiveDataView } from "./tendyy-ui";
import { fetchTenderAnswers, fetchTenderRequirements, fetchTenderReviews } from "../lib/api";
import { tenderKeys, useActivities, useAudits, useCreateKnowledge, useDashboardSummary, useKnowledgeList, useTenders } from "../lib/queries";

export function RequirementsPage() {
  const [filter, setFilter] = useState("all");
  const tendersQuery = useTenders({ pageSize: 100, includeArchived: false });
  const tenders = tendersQuery.data?.items ?? [];
  const requirementQueries = useQueries({
    queries: tenders.map((tender) => ({
      queryKey: tenderKeys.requirements(tender.id),
      queryFn: () => fetchTenderRequirements(tender.id),
    })),
  });
  const answerQueries = useQueries({ queries: tenders.map((tender) => ({ queryKey: tenderKeys.answers(tender.id), queryFn: () => fetchTenderAnswers(tender.id) })) });
  const reviewQueries = useQueries({ queries: tenders.map((tender) => ({ queryKey: tenderKeys.reviews(tender.id), queryFn: () => fetchTenderReviews(tender.id) })) });
  const rows = tenders.flatMap((tender, index) => {
    const answers = answerQueries[index]?.data?.items ?? [];
    const reviews = reviewQueries[index]?.data?.items ?? [];
    const pendingReviewAnswerIds = new Set(reviews.filter((review) => review.status === "PENDING" || review.status === "CHANGES_REQUESTED").map((review) => review.answerId));
    return (requirementQueries[index]?.data?.items ?? []).map((requirement) => {
      const linkedAnswers = answers.filter((answer) => requirement.questionIds.includes(answer.questionId));
      const answered = linkedAnswers.some((answer) => answer.answerText.trim().length > 0);
      const pendingReview = linkedAnswers.some((answer) => pendingReviewAnswerIds.has(answer.id) || /REVIEW|PENDING/i.test(answer.status));
      const approved = linkedAnswers.some((answer) => /APPROVED|FINAL/i.test(answer.status));
      const lowConfidence = linkedAnswers.some((answer) => answer.confidence < 0.65);
      return { tender, requirement, answered, pendingReview, approved, lowConfidence };
    });
  });
  const filteredRows = rows.filter((row) =>
    filter === "all"
    || (filter === "mandatory" && row.requirement.mandatory)
    || (filter === "unanswered" && !row.answered)
    || (filter === "high-risk" && (row.requirement.mandatory && (!row.answered || row.lowConfidence)))
    || (filter === "pending-review" && row.pendingReview)
    || (filter === "approved" && row.approved)
    || (filter === "blocked" && /BLOCKED|FAILED/i.test(row.requirement.status)),
  );
  const filters: Array<[string, string]> = [
    ["all", `All (${rows.length})`],
    ["mandatory", `Mandatory (${rows.filter((row) => row.requirement.mandatory).length})`],
    ["unanswered", `Unanswered (${rows.filter((row) => !row.answered).length})`],
    ["high-risk", `High risk (${rows.filter((row) => row.requirement.mandatory && (!row.answered || row.lowConfidence)).length})`],
    ["pending-review", `Pending review (${rows.filter((row) => row.pendingReview).length})`],
    ["approved", `Approved (${rows.filter((row) => row.approved).length})`],
    ["blocked", `Blocked (${rows.filter((row) => /BLOCKED|FAILED/i.test(row.requirement.status)).length})`],
  ];

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Apply", href: "/apply" }, { label: "Requirements" }]}>
      <main className="space-y-5">
        <PageTitle eyebrow="Response planning" title="Requirements" description="A workspace-wide view of tender requirements. Open a requirement to draft, evidence, and review its answer." />
        <MetricRow values={[["Tenders", tenders.length], ["Requirements", rows.length], ["Mandatory", rows.filter(({ requirement }) => requirement.mandatory).length]]} />
        <QueueFilters items={filters} value={filter} onChange={setFilter} />
        {filteredRows.length ? <TendyyResponsiveDataView desktop={<section className="overflow-hidden rounded-[10px] border border-slate-200 bg-white"><table className="w-full table-fixed text-left text-[13px]"><thead className="bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500"><tr><th className="w-2/5 px-4 py-3">Requirement</th><th className="px-4 py-3">Tender</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Answer</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredRows.map(({ tender, requirement, answered, pendingReview, approved }) => <tr key={requirement.id} className="hover:bg-slate-50"><td className="px-4 py-3"><Link href={`/tenders/${tender.id}/requirements/${requirement.id}`} className="tendyy-wrap-anywhere font-semibold text-slate-950 hover:text-[#155EEF]">{requirement.title}</Link><p className="mt-1 line-clamp-2 text-xs text-slate-500">{requirement.description || "No description"}</p></td><td className="px-4 py-3"><Link href={`/apply/${tender.id}`} className="tendyy-wrap-anywhere font-medium text-[#155EEF] hover:underline">{tender.title}</Link></td><td className="px-4 py-3 text-slate-600">{formatLabel(requirement.requirementType)}</td><td className="px-4 py-3"><RfpStatusBadge tone={requirement.mandatory ? "warning" : "neutral"}>{requirement.mandatory ? "Mandatory" : "Standard"}</RfpStatusBadge></td><td className="px-4 py-3"><RfpStatusBadge tone={approved ? "success" : pendingReview ? "warning" : answered ? "neutral" : "danger"}>{approved ? "Approved" : pendingReview ? "Pending review" : answered ? "Answered" : "Unanswered"}</RfpStatusBadge></td><td className="px-4 py-3"><RfpStatusBadge tone={statusTone(requirement.status)}>{formatLabel(requirement.status)}</RfpStatusBadge></td></tr>)}</tbody></table></section>} mobile={<div className="space-y-3">{filteredRows.map(({ tender, requirement, answered, pendingReview, approved }) => <article key={requirement.id} className="min-w-0 rounded-[10px] border border-slate-200 bg-white p-4"><div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><Link href={`/tenders/${tender.id}/requirements/${requirement.id}`} className="tendyy-wrap-anywhere min-w-0 flex-1 font-semibold text-slate-950">{requirement.title}</Link><RfpStatusBadge tone={statusTone(requirement.status)}>{formatLabel(requirement.status)}</RfpStatusBadge></div><p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600">{requirement.description || "No description"}</p><dl className="mt-3 grid grid-cols-2 gap-3 text-xs"><CardField label="Tender" value={tender.title} /><CardField label="Type" value={formatLabel(requirement.requirementType)} /><CardField label="Priority" value={requirement.mandatory ? "Mandatory" : "Standard"} /><CardField label="Answer" value={approved ? "Approved" : pendingReview ? "Pending review" : answered ? "Answered" : "Unanswered"} /></dl><Link href={`/tenders/${tender.id}/requirements/${requirement.id}`} className="mt-4 inline-flex text-xs font-semibold text-[#155EEF]">Open requirement</Link></article>)}</div>} /> : <RfpEmptyState title="No matching requirements" description="Try another queue filter or import a tender to populate this page." actionHref="/tenders/import" actionLabel="Import RFP" />}
      </main>
    </AppShell>
  );
}

export function ResponsesPage() {
  const [filter, setFilter] = useState("all");
  const tendersQuery = useTenders({ pageSize: 100, includeArchived: false });
  const tenders = tendersQuery.data?.items ?? [];
  const answerQueries = useQueries({
    queries: tenders.map((tender) => ({ queryKey: tenderKeys.answers(tender.id), queryFn: () => fetchTenderAnswers(tender.id) })),
  });
  const reviewQueries = useQueries({ queries: tenders.map((tender) => ({ queryKey: tenderKeys.reviews(tender.id), queryFn: () => fetchTenderReviews(tender.id) })) });
  const rows = tenders.flatMap((tender, index) => {
    const reviews = reviewQueries[index]?.data?.items ?? [];
    return (answerQueries[index]?.data?.items ?? []).map((answer) => ({ tender, answer, reviews: reviews.filter((review) => review.answerId === answer.id) }));
  });
  const filteredRows = rows.filter((row) =>
    filter === "all"
    || (filter === "draft" && /DRAFT/i.test(row.answer.status))
    || (filter === "missing-evidence" && row.answer.evidenceCount === 0)
    || (filter === "low-confidence" && row.answer.confidence < 0.65)
    || (filter === "changes-requested" && row.reviews.some((review) => review.status === "CHANGES_REQUESTED"))
    || (filter === "final" && /FINAL|APPROVED/i.test(row.answer.status)),
  );
  const filters: Array<[string, string]> = [
    ["all", `All (${rows.length})`],
    ["draft", `Draft (${rows.filter((row) => /DRAFT/i.test(row.answer.status)).length})`],
    ["missing-evidence", `Missing evidence (${rows.filter((row) => row.answer.evidenceCount === 0).length})`],
    ["low-confidence", `Low confidence (${rows.filter((row) => row.answer.confidence < 0.65).length})`],
    ["changes-requested", `Changes requested (${rows.filter((row) => row.reviews.some((review) => review.status === "CHANGES_REQUESTED")).length})`],
    ["final", `Final (${rows.filter((row) => /FINAL|APPROVED/i.test(row.answer.status)).length})`],
  ];

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Apply", href: "/apply" }, { label: "Responses" }]}>
      <main className="space-y-5">
        <PageTitle eyebrow="Response operations" title="Responses" description="All drafted answers across the active workspace. Open the tender workspace to edit, attach evidence, or send an answer for review." />
        <MetricRow values={[["Answers", rows.length], ["Needs review", rows.filter(({ answer }) => /REVIEW|PENDING/i.test(answer.status)).length], ["Evidence linked", rows.filter(({ answer }) => answer.evidenceCount > 0).length]]} />
        <QueueFilters items={filters} value={filter} onChange={setFilter} />
        {filteredRows.length ? <TendyyResponsiveDataView desktop={<section className="overflow-hidden rounded-[10px] border border-slate-200 bg-white"><table className="w-full table-fixed text-left text-[13px]"><thead className="bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500"><tr><th className="w-2/5 px-4 py-3">Response</th><th className="px-4 py-3">Tender</th><th className="px-4 py-3">Evidence</th><th className="px-4 py-3">Confidence</th><th className="px-4 py-3">Review</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredRows.map(({ tender, answer, reviews }) => <tr key={answer.id} className="hover:bg-slate-50"><td className="px-4 py-3"><Link href={`/apply/${tender.id}`} className="tendyy-wrap-anywhere font-semibold text-slate-950 hover:text-[#155EEF]">{answer.answerText.slice(0, 92) || "Untitled answer"}</Link><p className="mt-1 text-xs text-slate-500">Updated {formatDate(answer.updatedAt)}</p></td><td className="px-4 py-3"><Link href={`/apply/${tender.id}`} className="tendyy-wrap-anywhere font-medium text-[#155EEF] hover:underline">{tender.title}</Link></td><td className="px-4 py-3 text-slate-600">{answer.evidenceCount} linked</td><td className="px-4 py-3 text-slate-600">{Math.round(answer.confidence * 100)}%</td><td className="px-4 py-3"><RfpStatusBadge tone={reviews.some((review) => review.status === "CHANGES_REQUESTED") ? "warning" : reviews.some((review) => review.status === "APPROVED") ? "success" : "neutral"}>{reviews[0] ? formatLabel(reviews[0].status) : "Not sent"}</RfpStatusBadge></td><td className="px-4 py-3"><RfpStatusBadge tone={statusTone(answer.status)}>{formatLabel(answer.status)}</RfpStatusBadge></td></tr>)}</tbody></table></section>} mobile={<div className="space-y-3">{filteredRows.map(({ tender, answer, reviews }) => <article key={answer.id} className="min-w-0 rounded-[10px] border border-slate-200 bg-white p-4"><div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><Link href={`/apply/${tender.id}`} className="tendyy-wrap-anywhere min-w-0 flex-1 font-semibold text-slate-950">{answer.answerText.slice(0, 120) || "Untitled answer"}</Link><RfpStatusBadge tone={statusTone(answer.status)}>{formatLabel(answer.status)}</RfpStatusBadge></div><p className="mt-2 tendyy-wrap-anywhere text-xs text-slate-600">{tender.title}</p><dl className="mt-3 grid grid-cols-2 gap-3 text-xs"><CardField label="Evidence" value={`${answer.evidenceCount} linked`} /><CardField label="Confidence" value={`${Math.round(answer.confidence * 100)}%`} /><CardField label="Review" value={reviews[0] ? formatLabel(reviews[0].status) : "Not sent"} /><CardField label="Updated" value={formatDate(answer.updatedAt)} /></dl><Link href={`/apply/${tender.id}`} className="mt-4 inline-flex text-xs font-semibold text-[#155EEF]">Open application</Link></article>)}</div>} /> : <RfpEmptyState title="No matching responses" description="Try another response queue filter or draft an answer first." actionHref="/tenders" actionLabel="Open tenders" />}
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
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]"><h2 className="text-lg font-semibold text-slate-950">{title}</h2><div className="mt-3">{children}</div></section>; }
function EmptyCopy({ text }: { text: string }) { return <p className="py-4 text-sm text-slate-500">{text}</p>; }
function CardField({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</dt><dd className="tendyy-wrap-anywhere mt-1 text-slate-700">{value}</dd></div>; }
function formatLabel(value: string) { return value.replace(/[_-]+/g, " ").toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase()); }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
