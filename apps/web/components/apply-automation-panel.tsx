"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Clock3, Download, FileArchive, Play, RefreshCw, Send, Sparkles, X } from "lucide-react";
import { Button } from "@rfp-os/ui";

import type { TenderSummary } from "../lib/models";
import {
  useApproveTenderPackage,
  useCancelTenderAutomationRun,
  useTransitionTender,
  useCreateTenderAutomationRun,
  useCreateTenderPackage,
  useCreateTenderSubmission,
  useDecideTenderRequirementCandidates,
  useDownloadTenderPackage,
  useExtractTenderRequirements,
  useRetryTenderAutomationRun,
  useTenderAutomationRuns,
  useTenderMilestones,
  useTenderPackages,
  useTenderRequirementCandidates,
  useTenderSubmissions,
  useUpdateTenderMilestones,
} from "../lib/queries";
import { TendyyCard, TendyyEmptyState, TendyyErrorState, TendyySectionHeader, TendyyStatusBadge, toneFromStatus } from "./tendyy-ui";

export function ApplyAutomationPanel({ tender }: { tender: TenderSummary }) {
  const candidates = useTenderRequirementCandidates(tender.id);
  const runs = useTenderAutomationRuns(tender.id);
  const packages = useTenderPackages(tender.id);
  const milestones = useTenderMilestones(tender.id);
  const submissions = useTenderSubmissions(tender.id);
  const extract = useExtractTenderRequirements(tender.id);
  const decide = useDecideTenderRequirementCandidates(tender.id);
  const prepare = useCreateTenderAutomationRun(tender.id);
  const retry = useRetryTenderAutomationRun(tender.id);
  const cancel = useCancelTenderAutomationRun(tender.id);
  const transition = useTransitionTender(tender.id);
  const nextStage = ({ DRAFT: "INTAKE", INTAKE: "PROCESSING", PROCESSING: "READY", READY: "IN_PROGRESS", IN_PROGRESS: "REVIEW" } as Record<string, string>)[tender.status];
  const createPackage = useCreateTenderPackage(tender.id);
  const approvePackage = useApproveTenderPackage(tender.id);
  const download = useDownloadTenderPackage(tender.id);
  const updateMilestones = useUpdateTenderMilestones(tender.id);
  const submit = useCreateTenderSubmission(tender.id);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showSubmit, setShowSubmit] = useState(false);
  const [portal, setPortal] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const pending = candidates.data?.items.filter((item) => item.status === "PENDING") ?? [];
  const latestRun = runs.data?.items[0] ?? null;
  const approvedPackage = packages.data?.items.find((item) => item.status === "APPROVED") ?? null;
  const busy = prepare.isPending || latestRun?.status === "RUNNING" || latestRun?.status === "QUEUED";
  const error = [cancel.error, transition.error,candidates.error, runs.error, packages.error, milestones.error, submissions.error, extract.error, decide.error, prepare.error, retry.error, createPackage.error, approvePackage.error, download.error, updateMilestones.error, submit.error].find(Boolean);
  const runSteps = latestRun?.steps ?? [];
  const selectedCount = selected.size;
  const offsets = useMemo(() => Object.fromEntries((milestones.data?.items ?? []).map((item) => [item.kind, item.offsetDays])), [milestones.data]);

  function toggle(id: string) { setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function decideSelected(decision: "ACCEPTED" | "REJECTED") { if (!selectedCount) return; decide.mutate([...selected].map((candidateId) => ({ candidateId, decision })), { onSuccess: () => setSelected(new Set()) }); }
  function saveMilestones(form: FormData) {
    updateMilestones.mutate((["REVIEW", "APPROVAL", "PACKAGE", "SUBMISSION"] as const).map((kind) => ({ kind, offsetDays: Number(form.get(kind) ?? offsets[kind] ?? 0) })));
  }
  function recordSubmission() {
    if (!approvedPackage || !portal.trim() || !reference.trim()) return;
    submit.mutate({ packageId: approvedPackage.id, portal: portal.trim(), portalReference: reference.trim(), submittedAt: new Date().toISOString(), notes }, { onSuccess: () => { setShowSubmit(false); setPortal(""); setReference(""); setNotes(""); } });
  }

  return (
    <section className="space-y-5" aria-label="Apply automation">
      <TendyyCard>
        <TendyySectionHeader eyebrow="Apply automation" title="Prepare a review-ready response" description="TENDYY extracts response work, grounds drafts in evidence, validates readiness, and leaves approval and submission to your team." />
        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => extract.mutate()} disabled={extract.isPending}>
            <Sparkles className="h-4 w-4" />{extract.isPending ? "Extracting..." : "Extract requirements"}
          </Button>
          <Button type="button" onClick={() => prepare.mutate({ includePackage: false })} disabled={busy || pending.length > 0}>
            <Play className="h-4 w-4" />{busy ? "Preparing..." : "Prepare application"}
          </Button>
          {latestRun && ["FAILED", "PARTIAL", "BLOCKED", "WAITING_FOR_INPUT"].includes(latestRun.status) ? <Button type="button" variant="secondary" onClick={() => retry.mutate(latestRun.id)} disabled={retry.isPending}><RefreshCw className="h-4 w-4" />Retry run</Button> : null}
          {latestRun && ["RUNNING", "QUEUED"].includes(latestRun.status) ? <Button type="button" variant="secondary" onClick={() => cancel.mutate(latestRun.id)} disabled={cancel.isPending}>Cancel preparation</Button> : null}
          {nextStage ? <Button type="button" variant="secondary" onClick={() => transition.mutate({ to: nextStage })} disabled={busy || transition.isPending}>Move to {label(nextStage)}</Button> : null}
        </div>
        {latestRun ? <div className="mt-3 text-sm"><TendyyStatusBadge tone={toneFromStatus(latestRun.status)}>{latestRun.status}</TendyyStatusBadge>{latestRun.failureReason ? <p className="mt-2 text-red-700">{latestRun.failureReason}</p> : null}{latestRun.items?.filter((item) => ["FAILED", "BLOCKED"].includes(item.status)).map((item) => <p key={item.id} className="mt-2 text-amber-800">{item.requirementId}: {item.failureReason ?? String(item.result.reason ?? item.status)}</p>)}</div> : null}
        {pending.length > 0 ? <p className="mt-3 flex items-center gap-2 text-xs font-medium text-amber-800"><AlertTriangle className="h-4 w-4" />Confirm {pending.length} extracted candidate{pending.length === 1 ? "" : "s"} before preparation.</p> : null}
        {error ? <div className="mt-4"><TendyyErrorState title="Automation action failed" message={error instanceof Error ? error.message : "The automation request failed."} /></div> : null}
        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {(["ANALYSIS", "EVIDENCE_RETRIEVAL", "ANSWER_GENERATION", "VALIDATION"] as const).map((kind) => {
            const step = runSteps.find((item) => item.kind === kind);
            return <div key={kind} className="min-w-0 border border-[var(--border-subtle)] bg-[var(--neutral-soft)] p-3"><p className="text-[11px] font-semibold uppercase text-[var(--muted)]">{label(kind)}</p><div className="mt-2"><TendyyStatusBadge tone={toneFromStatus(step?.status ?? "PENDING")}>{step?.status ?? "PENDING"}</TendyyStatusBadge></div>{step?.failureReason ? <p className="tendyy-wrap-anywhere mt-2 text-xs text-red-700">{step.failureReason}</p> : null}</div>;
          })}
        </div>
      </TendyyCard>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <TendyyCard>
          <TendyySectionHeader eyebrow="Human confirmation" title="Requirement candidates" description="Only accepted candidates become canonical requirements and questions." />
          {pending.length ? <><div className="mt-4 flex flex-wrap items-center gap-2"><Button type="button" size="sm" onClick={() => decideSelected("ACCEPTED")} disabled={!selectedCount || decide.isPending}><Check className="h-4 w-4" />Accept selected</Button><Button type="button" size="sm" variant="secondary" onClick={() => decideSelected("REJECTED")} disabled={!selectedCount || decide.isPending}><X className="h-4 w-4" />Reject selected</Button><span className="text-xs text-[var(--muted)]">{selectedCount} selected</span></div><div className="mt-4 max-h-[420px] min-w-0 space-y-2 overflow-y-auto overflow-x-hidden">{pending.map((item) => <label key={item.id} className={`flex min-w-0 cursor-pointer gap-3 border p-3 ${selected.has(item.id) ? "border-blue-400 bg-blue-50" : "border-[var(--border-subtle)] bg-white"}`}><input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} className="mt-1" /><span className="min-w-0"><span className="tendyy-wrap-anywhere flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--text)]">{item.title}<TendyyStatusBadge tone={item.mandatory ? "danger" : "neutral"}>{item.mandatory ? "Mandatory" : "Optional"}</TendyyStatusBadge></span><span className="tendyy-wrap-anywhere mt-1 block text-xs leading-5 text-[var(--muted)]">{item.sourceExcerpt}</span><span className="mt-2 block text-[11px] text-blue-700">{label(item.candidateType)} · {Math.round(Number(item.confidence) * 100)}% confidence</span></span></label>)}</div></> : <div className="mt-4"><TendyyEmptyState title="No candidates awaiting confirmation" description="Run extraction after processing tender documents, or continue with existing requirements." /></div>}
        </TendyyCard>

        <TendyyCard>
          <TendyySectionHeader eyebrow="Internal deadlines" title="Application milestones" description="Offsets are calculated before the official tender deadline." />
          {tender.dueAt ? <form className="mt-4 space-y-3" action={saveMilestones}>{(["REVIEW", "APPROVAL", "PACKAGE", "SUBMISSION"] as const).map((kind) => { const item = milestones.data?.items.find((row) => row.kind === kind); return <label key={kind} className="flex min-w-0 flex-col items-start gap-2 border-b border-[var(--border-subtle)] pb-3 text-sm sm:flex-row sm:items-center sm:justify-between"><span className="min-w-0"><span className="block font-semibold text-[var(--text)]">{label(kind)}</span><span className="tendyy-wrap-anywhere text-xs text-[var(--muted)]">{item ? formatDate(item.dueAt) : "Calculated after save"}</span></span><span className="flex items-center gap-2"><input name={kind} type="number" min="0" max="365" defaultValue={item?.offsetDays ?? ({ REVIEW: 7, APPROVAL: 3, PACKAGE: 2, SUBMISSION: 1 } as const)[kind]} className="h-9 w-16 border border-[var(--border)] px-2 text-right" /><span className="text-xs text-[var(--muted)]">days before</span></span></label>; })}<Button type="submit" size="sm" variant="secondary" disabled={updateMilestones.isPending}><Clock3 className="h-4 w-4" />Save milestones</Button></form> : <div className="mt-4"><TendyyEmptyState title="Deadline required" description="Set the official tender deadline before configuring internal milestones." /></div>}
        </TendyyCard>
      </div>

      <TendyyCard>
        <TendyySectionHeader eyebrow="Submission package" title="Immutable package versions" description="Build DOCX, XLSX, evidence manifest, checklist, and ZIP projections from canonical approved workspace data." />
        <div className="mt-4 flex flex-wrap gap-2"><Button type="button" onClick={() => createPackage.mutate()} disabled={createPackage.isPending}><FileArchive className="h-4 w-4" />{createPackage.isPending ? "Building..." : "Build package"}</Button>{approvedPackage && tender.status === "APPROVED" ? <Button type="button" variant="secondary" onClick={() => setShowSubmit(true)}><Send className="h-4 w-4" />Record submission</Button> : null}</div>
        <div className="mt-4 space-y-2">{packages.data?.items.length ? packages.data.items.map((item) => <div key={item.id} className="flex flex-col gap-3 border border-[var(--border-subtle)] p-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><p className="text-sm font-semibold text-[var(--text)]">Package v{item.version}</p><TendyyStatusBadge tone={toneFromStatus(item.status)}>{item.status}</TendyyStatusBadge></div><p className="mt-1 text-xs text-[var(--muted)]">{item.artifacts.length} artifacts · {formatDate(item.createdAt)}</p>{item.failureReason ? <p className="mt-1 text-xs text-red-700">{item.failureReason}</p> : null}</div><div className="flex gap-2">{["READY", "APPROVED"].includes(item.status) ? <Button type="button" size="sm" variant="secondary" onClick={() => download.mutate(item.id)} disabled={download.isPending}><Download className="h-4 w-4" />Download</Button> : null}{item.status === "READY" ? <Button type="button" size="sm" onClick={() => approvePackage.mutate({ packageId: item.id })} disabled={approvePackage.isPending || tender.status !== "REVIEW"}>Approve</Button> : null}</div></div>) : <TendyyEmptyState title="No package versions" description="Build a package after answers have been reviewed and validation blockers are resolved." />}</div>
        {showSubmit && approvedPackage ? <div className="mt-5 border-t border-[var(--border)] pt-5"><h3 className="text-sm font-semibold text-[var(--text)]">Submission receipt</h3><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-[var(--muted)]">Portal<input value={portal} onChange={(event) => setPortal(event.target.value)} placeholder="GeM, CPPP, email..." className="mt-1 h-10 w-full border border-[var(--border)] px-3 text-sm text-[var(--text)]" /></label><label className="text-xs font-semibold text-[var(--muted)]">Portal reference<input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Submission acknowledgement ID" className="mt-1 h-10 w-full border border-[var(--border)] px-3 text-sm text-[var(--text)]" /></label><label className="text-xs font-semibold text-[var(--muted)] sm:col-span-2">Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1 min-h-20 w-full border border-[var(--border)] p-3 text-sm text-[var(--text)]" /></label></div><div className="mt-3 flex gap-2"><Button type="button" onClick={recordSubmission} disabled={!portal.trim() || !reference.trim() || submit.isPending}>{submit.isPending ? "Recording..." : "Confirm submitted"}</Button><Button type="button" variant="secondary" onClick={() => setShowSubmit(false)}>Cancel</Button></div></div> : null}
        {submissions.data?.items.length ? <div className="mt-5 border-t border-[var(--border)] pt-4"><p className="text-xs font-semibold uppercase text-[var(--muted)]">Submission history</p>{submissions.data.items.map((item) => <div key={item.id} className="mt-2 flex items-center justify-between border border-[var(--border-subtle)] p-3 text-sm"><span><span className="font-semibold text-[var(--text)]">{item.portal}</span><span className="ml-2 text-[var(--muted)]">{item.portalReference}</span></span><span className="text-xs text-[var(--muted)]">{formatDate(item.submittedAt)}</span></div>)}</div> : null}
      </TendyyCard>
    </section>
  );
}

function label(value: string) { return value.toLowerCase().replace(/_/g, " ").replace(/^./, (character) => character.toUpperCase()); }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
