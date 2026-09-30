"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  analyzeTender,
  extractTenderRequirements,
  fetchTenderRequirementCandidates,
  ApiError,
  completeTenderSourceUpload,
  createTender,
  createTenderSourceUploadIntent,
  fetchTenderQuestions,
  fetchTenderRequirements,
  parseTenderSource,
  updateTender,
  uploadTenderSourceBytes,
} from "../lib/api";
import type { TenderAnalysisPayload, TenderQuestion, TenderRequirement, TenderSource } from "../lib/models";
import { useWorkspaces } from "../lib/queries";
import { useAuthSession } from "./auth-gate";

type Step = 1 | 2 | 3 | 4;
type Mode = "create" | "import";
type UploadStatus = "registering" | "uploading" | "completing" | "parsing" | "parsed" | "failed";
type Upload = { id: string; name: string; size: number; status: UploadStatus; source?: TenderSource; error?: string };

const STEPS = ["Details", "Documents", "Configure", "Analyze"];
const CATEGORIES = ["Technical", "Security", "Commercial", "Legal", "Compliance", "Product", "Implementation"];
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
const UPLOAD_FINALIZE_TIMEOUT_MS = 60_000;
const UPLOAD_PARSE_TIMEOUT_MS = 120_000;

export function RfpIntakeWizard({ mode }: { mode: Mode }) {
  const router = useRouter();
  const session = useAuthSession();
  const workspacesQuery = useWorkspaces();
  const fileInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>(1);
  const [tenderId, setTenderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [analysis, setAnalysis] = useState<TenderAnalysisPayload | null>(null);
  const [requirements, setRequirements] = useState<TenderRequirement[]>([]);
  const [candidateCount, setCandidateCount] = useState<number | null>(null);
  const [questions, setQuestions] = useState<TenderQuestion[]>([]);
  const [categories, setCategories] = useState([...CATEGORIES]);
  const [preferences, setPreferences] = useState({ analyzeRequirements: true, detectMandatory: true, detectRisks: true, searchKnowledge: true, generateInitialAnswers: false });
  const [form, setForm] = useState({ workspaceId: "", title: "", customer: "", opportunity: "", referenceNumber: "", dueAt: "", estimatedValue: "0", currency: "INR", location: "", tenderType: "DOCUMENT", sourceType: "DOCUMENT_UPLOAD", sourceUrl: "", description: "" });

  const workspaces = workspacesQuery.data?.items ?? [];
  const defaultWorkspaceId = workspaces[0]?.id ?? "";
  const parsedUploads = uploads.filter((upload) => upload.status === "parsed");
  const hasUploadsInProgress = uploads.some((upload) => isUploadInProgress(upload.status));
  const owner = session?.profile?.displayName || session?.user?.displayName || session?.user?.email || "Signed-in user";

  useEffect(() => {
    if (!form.workspaceId && defaultWorkspaceId) setForm((current) => ({ ...current, workspaceId: defaultWorkspaceId }));
  }, [defaultWorkspaceId, form.workspaceId]);

  function errorMessage(cause: unknown) {
    return cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "Something went wrong.";
  }

  function validate() {
    if (!form.workspaceId) return "Select a workspace.";
    if (form.title.trim().length < 2) return "Enter an RFP name.";
    if (!form.customer.trim()) return "Enter the customer organization.";
    if (Number(form.estimatedValue) < 0 || !Number.isFinite(Number(form.estimatedValue))) return "Estimated value must be zero or greater.";
    if (!/^[A-Z]{3}$/.test(form.currency.trim().toUpperCase())) return "Currency must be a three-letter ISO code.";
    if (form.dueAt && Number.isNaN(new Date(form.dueAt).getTime())) return "Enter a valid submission deadline.";
    if (form.sourceUrl.trim()) {
      try {
        new URL(form.sourceUrl.trim());
      } catch {
        return "Enter a valid source URL.";
      }
    }
    return null;
  }

  function metadata(nextStep: Step) {
    return { intake: { mode, step: nextStep, opportunity: form.opportunity.trim(), estimatedContractValue: Number(form.estimatedValue || 0), currency: form.currency.trim().toUpperCase() || "INR", location: form.location.trim(), tenderType: form.tenderType, sourceType: form.sourceType, sourceUrl: form.sourceUrl.trim() || null, categories, preferences } };
  }

  async function persistDetails(nextStep: Step) {
    const invalid = validate();
    if (invalid) throw new Error(invalid);
    const values = {
      name: form.customer.trim(),
      title: form.title.trim(),
      referenceNumber: form.referenceNumber.trim() || undefined,
      description: form.description.trim() || undefined,
      buyerName: form.customer.trim(),
      location: form.location.trim() || undefined,
      estimatedValue: Number(form.estimatedValue || 0),
      currency: form.currency.trim().toUpperCase() || "INR",
      tenderType: form.tenderType as "DOCUMENT" | "ONLINE",
      sourceType: form.sourceType as "DOCUMENT_UPLOAD" | "EMAIL_IMPORT" | "PORTAL" | "MANUAL",
      sourceUrl: form.sourceUrl.trim() || undefined,
      dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : undefined,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      metadata: metadata(nextStep),
    };
    if (tenderId) {
      await updateTender(tenderId, values);
      return tenderId;
    }
    const tender = await createTender({ workspaceId: form.workspaceId, ...values });
    setTenderId(tender.id);
    return tender.id;
  }

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
      return true;
    } catch (cause) {
      setError(errorMessage(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    await run(async () => router.push(`/tenders/${await persistDetails(step)}`));
  }

  async function uploadFile(file: File) {
    if (!tenderId) return;
    const id = crypto.randomUUID();
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const mimeType = file.type || MIME_BY_EXTENSION[extension];
    if (!mimeType || !MIME_BY_EXTENSION[extension]) {
      setUploads((current) => [...current, { id, name: file.name, size: file.size, status: "failed", error: "Unsupported file type." }]);
      return;
    }
    setUploads((current) => [...current, { id, name: file.name, size: file.size, status: "registering" }]);
    try {
      const intent = await createTenderSourceUploadIntent(tenderId, { sourceType: "DOCUMENT", name: file.name, filename: file.name, mimeType, sizeBytes: file.size, metadata: { intakeMode: mode } });
      setUploads((current) => current.map((upload) => upload.id === id ? { ...upload, status: "uploading" } : upload));
      await uploadTenderSourceBytes(intent.uploadUrl, file, mimeType);
      setUploads((current) => current.map((upload) => upload.id === id ? { ...upload, status: "completing" } : upload));
      await withTimeout(completeTenderSourceUpload(tenderId, intent.sourceId), UPLOAD_FINALIZE_TIMEOUT_MS, "Upload finalization timed out. Check that local object storage is reachable.");
      setUploads((current) => current.map((upload) => upload.id === id ? { ...upload, status: "parsing" } : upload));
      const source = await withTimeout(parseTenderSource(tenderId, intent.sourceId), UPLOAD_PARSE_TIMEOUT_MS, "Document parsing timed out. Try a smaller PDF/DOCX or check the API parser logs.");
      setUploads((current) => current.map((upload) => upload.id === id ? { ...upload, status: "parsed", source } : upload));
    } catch (cause) {
      setUploads((current) => current.map((upload) => upload.id === id ? { ...upload, status: "failed", error: errorMessage(cause) } : upload));
    }
  }

  function addFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) void uploadFile(file);
  }

  async function startAnalysis(id: string) {
    setBusy(true);
    setError(null);
    setAnalysis(null);
    try {
      if (parsedUploads.length > 0) {
        await extractTenderRequirements(id);
        const candidates = await fetchTenderRequirementCandidates(id);
        setCandidateCount(candidates.items.filter((item) => item.status === "PENDING").length);
      }
      const result = preferences.analyzeRequirements ? await analyzeTender(id) : null;
      const [requirementResult, questionResult] = await Promise.all([fetchTenderRequirements(id), fetchTenderQuestions(id)]);
      setAnalysis(result);
      setRequirements(requirementResult.items);
      setQuestions(questionResult.items);
      await updateTender(id, { metadata: metadata(4) });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    if (step === 1) return run(async () => { await persistDetails(2); setStep(2); });
    if (step === 2) {
      if (mode === "import" && parsedUploads.length === 0) return setError("Upload and parse at least one RFP document before continuing.");
      setError(null);
      return setStep(3);
    }
    if (!tenderId) return;
    const saved = await run(async () => {
      await updateTender(tenderId, { dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null, buyerName: form.customer.trim(), location: form.location.trim() || null, estimatedValue: Number(form.estimatedValue || 0), currency: form.currency.trim().toUpperCase() || "INR", tenderType: form.tenderType as "DOCUMENT" | "ONLINE", sourceType: form.sourceType as "DOCUMENT_UPLOAD" | "EMAIL_IMPORT" | "PORTAL" | "MANUAL", sourceUrl: form.sourceUrl.trim() || null, metadata: metadata(4) });
      setStep(4);
    });
    if (saved) void startAnalysis(tenderId);
  }

  const mandatory = requirements.filter((item) => item.mandatory).length;
  const security = requirements.filter((item) => `${item.requirementType} ${item.title}`.toLowerCase().includes("security")).length;
  const commercial = requirements.filter((item) => `${item.requirementType} ${item.title}`.toLowerCase().includes("commercial")).length;

  return (
    <div className="mx-auto max-w-[1180px] space-y-6 pb-10">
      <header><p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--muted)]">{mode === "import" ? "Import request" : "New request"}</p><h1 className="mt-2 text-[29px] font-semibold tracking-normal text-[var(--text)] sm:text-[30px]">{mode === "import" ? "Import RFP" : "Create New RFP"}</h1></header>
      <Stepper current={step} />
      {error ? <div role="alert" className="rounded-[var(--radius-md)] border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-800">{error}</div> : null}

      {step === 1 ? <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel title="Basic information"><div className="grid gap-5 sm:grid-cols-2">
          <Field label="Workspace" required wide><select value={form.workspaceId} onChange={(event) => setForm({ ...form, workspaceId: event.target.value })} className={input}><option value="">Select workspace</option>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></Field>
          <Field label="RFP name" required wide><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Enterprise Platform RFP" className={input} /></Field>
          <Field label="Customer" required><input value={form.customer} onChange={(event) => setForm({ ...form, customer: event.target.value })} placeholder="Customer organization" className={input} /></Field>
          <Field label="Opportunity"><input value={form.opportunity} onChange={(event) => setForm({ ...form, opportunity: event.target.value })} placeholder="Platform expansion" className={input} /></Field>
          <Field label="RFP owner"><div className={`${input} flex items-center bg-slate-100 text-slate-700`}>{owner}</div></Field>
          <Field label="Submission deadline"><input type="datetime-local" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} className={input} /></Field>
          <Field label="Estimated contract value"><input type="number" min="0" value={form.estimatedValue} onChange={(event) => setForm({ ...form, estimatedValue: event.target.value })} className={input} /></Field>
          <Field label="Currency"><input value={form.currency} maxLength={3} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} className={input} /></Field>
          <Field label="Location"><input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="City, state, region" className={input} /></Field>
          <Field label="Tender type"><select value={form.tenderType} onChange={(event) => setForm({ ...form, tenderType: event.target.value })} className={input}><option value="DOCUMENT">Document</option><option value="ONLINE">Online portal</option></select></Field>
          <Field label="Source"><select value={form.sourceType} onChange={(event) => setForm({ ...form, sourceType: event.target.value })} className={input}><option value="DOCUMENT_UPLOAD">Document upload</option><option value="EMAIL_IMPORT">Email import</option><option value="PORTAL">Portal</option><option value="MANUAL">Manual</option></select></Field>
          <Field label="Reference"><input value={form.referenceNumber} onChange={(event) => setForm({ ...form, referenceNumber: event.target.value })} placeholder="RFP-2026-014" className={input} /></Field>
          <Field label="Source URL" wide><input type="url" value={form.sourceUrl} onChange={(event) => setForm({ ...form, sourceUrl: event.target.value })} placeholder="https://portal.example.com/tenders/..." className={input} /></Field>
          <Field label="Description" wide><textarea rows={4} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={input} /></Field>
        </div></Panel>
        <Panel title="RFP summary" description="Preview of the persisted draft."><Summary label="Name" value={form.title} /><Summary label="Customer" value={form.customer} /><Summary label="Location" value={form.location} /><Summary label="Opportunity" value={form.opportunity} /><Summary label="Tender type" value={form.tenderType} /><Summary label="Source" value={form.sourceType} /><Summary label="Deadline" value={form.dueAt ? new Date(form.dueAt).toLocaleString() : ""} /><Summary label="Est. value" value={new Intl.NumberFormat("en-IN", { style: "currency", currency: form.currency || "INR", maximumFractionDigits: 0 }).format(Number(form.estimatedValue || 0))} /></Panel>
      </div> : null}

      {step === 2 ? <Panel title="Upload documents" description="Files use the real object-storage upload, completion, and parse pipeline.">
        <div onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }} className={`flex min-h-64 flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed px-6 text-center ${dragging ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--border-strong)] bg-[var(--surface-muted)]"}`}>
          <UploadIcon /><p className="mt-4 text-base font-semibold text-[var(--text)]">Upload tender documents</p><p className="mt-2 text-sm text-[var(--muted)]">Supported now: PDF and DOCX</p>
          <button type="button" onClick={() => fileInput.current?.click()} className={`${secondary} mt-5`}>Browse files</button><input ref={fileInput} type="file" multiple accept=".pdf,.docx" className="sr-only" onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.target.value = ""; }} />
        </div>
        {uploads.length ? <div className="mt-5 space-y-3">{uploads.map((upload) => <UploadRow key={upload.id} upload={upload} />)}</div> : null}
        {mode === "create" && !uploads.length ? <p className="mt-4 text-sm text-slate-500">A manual RFP can continue without a file; real extraction counts will remain zero.</p> : null}
      </Panel> : null}

      {step === 3 ? <div className="space-y-5">
        <Panel title="Assignment"><div className="grid gap-5 sm:grid-cols-2"><Field label="Response deadline"><input type="datetime-local" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} className={input} /></Field><Field label="RFP owner"><div className={`${input} flex items-center bg-slate-100 text-slate-700`}>{owner}</div></Field></div></Panel>
        <Panel title="RFP categories" description="Saved as the requested analysis focus."><div className="flex flex-wrap gap-2">{CATEGORIES.map((category) => { const active = categories.includes(category); return <button key={category} type="button" aria-pressed={active} onClick={() => setCategories(active ? categories.filter((item) => item !== category) : [...categories, category])} className={`rounded-full border px-4 py-2 text-sm font-semibold ${active ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-300 text-slate-500"}`}>{category}</button>; })}</div></Panel>
        <Panel title="Processing preferences" description="Preferences are persisted. AI runs only after Continue.">
          <Preference label="Analyze requirements" text="Run the real brief and requirement-classification endpoint." value={preferences.analyzeRequirements} toggle={() => setPreferences({ ...preferences, analyzeRequirements: !preferences.analyzeRequirements })} />
          <Preference label="Detect mandatory requirements" text="Persist mandatory-detection intent." value={preferences.detectMandatory} toggle={() => setPreferences({ ...preferences, detectMandatory: !preferences.detectMandatory })} />
          <Preference label="Detect risks" text="Persist risk-analysis intent." value={preferences.detectRisks} toggle={() => setPreferences({ ...preferences, detectRisks: !preferences.detectRisks })} />
          <Preference label="Search knowledge" text="Allow organization-scoped evidence retrieval." value={preferences.searchKnowledge} toggle={() => setPreferences({ ...preferences, searchKnowledge: !preferences.searchKnowledge })} />
          <Preference label="Generate initial answers" text="Never runs automatically on page load." value={preferences.generateInitialAnswers} toggle={() => setPreferences({ ...preferences, generateInitialAnswers: !preferences.generateInitialAnswers })} />
        </Panel>
      </div> : null}

      {step === 4 ? <div className="mx-auto max-w-3xl space-y-6">
        <Panel title={busy ? "Analyzing your RFP" : analysis || !preferences.analyzeRequirements ? "Analysis complete" : "Analysis needs attention"} description={busy ? "TENDYY is calling the real analysis pipeline once." : "Results come from persisted tender data."}>
          <div className="h-2 overflow-hidden bg-[var(--border)]"><div className={`h-full bg-[var(--primary)] transition-[width] ${busy ? "w-2/3 animate-pulse" : "w-full"}`} /></div><div className="mt-6 space-y-3"><Stage label="Documents uploaded" state={uploads.length ? "done" : "empty"} /><Stage label="Documents parsed" state={uploads.length && parsedUploads.length === uploads.length ? "done" : uploads.length ? "active" : "empty"} /><Stage label="Questions accepted" state={busy ? "active" : questions.length ? "done" : "empty"} count={busy ? undefined : questions.length} /><Stage label="Requirements awaiting confirmation in Apply" state={busy ? "pending" : candidateCount === null ? "empty" : "done"} count={candidateCount ?? undefined} /><Stage label="Initial RFP intelligence" state={busy ? "pending" : analysis || !preferences.analyzeRequirements ? "done" : "error"} /></div>
        </Panel>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Requirements" value={requirements.length} /><Metric label="Mandatory" value={mandatory} /><Metric label="Security" value={security} /><Metric label="Commercial" value={commercial} /></div>
        {!busy && tenderId ? <div className="flex justify-center gap-3">{!analysis && preferences.analyzeRequirements ? <button type="button" onClick={() => void startAnalysis(tenderId)} className={primary}>Retry analysis</button> : null}<Link href={`/tenders/${tenderId}`} className={primary}>Open RFP workspace</Link></div> : null}
      </div> : null}

      {step !== 4 ? <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-2"><Link href="/tenders" className={ghost}>Cancel</Link><button type="button" disabled={busy} onClick={() => void saveDraft()} className={secondary}>Save draft</button></div><div className="flex gap-2">{step > 1 ? <button type="button" onClick={() => { setError(null); setStep((step - 1) as Step); }} className={secondary}>Back</button> : null}<button type="button" disabled={busy || hasUploadsInProgress} onClick={() => void next()} className={primary}>{busy ? "Saving..." : "Continue"}</button></div></footer> : null}
    </div>
  );
}

function Stepper({ current }: { current: Step }) { return <ol className="flex items-center" aria-label="RFP intake progress">{STEPS.map((label, index) => { const number = (index + 1) as Step; const done = number < current; const active = number === current; return <li key={label} className={`flex items-center ${index < 3 ? "flex-1" : ""}`}><div className="flex shrink-0 items-center gap-2"><span className={`flex h-8 min-w-8 items-center justify-center rounded-[var(--radius-sm)] border px-1.5 text-[11px] font-bold ${done ? "border-[var(--primary)] bg-[var(--primary)] text-white" : active ? "border-[var(--primary)] text-[var(--primary)]" : "border-[var(--border-strong)] text-[var(--muted)]"}`}>{done ? "OK" : String(number).padStart(2, "0")}</span><span className={`hidden text-sm font-semibold sm:inline ${active || done ? "text-[var(--text)]" : "text-[var(--muted)]"}`}>{label}</span></div>{index < 3 ? <span className={`mx-3 h-px flex-1 ${done ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`} /> : null}</li>; })}</ol>; }
function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) { return <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-card)] sm:p-5"><h2 className="text-[19px] font-semibold text-[var(--text)]">{title}</h2>{description ? <p className="mt-1 text-[13px] leading-6 text-[var(--muted)]">{description}</p> : null}<div className="mt-4">{children}</div></section>; }
function Field({ label, required, wide, children }: { label: string; required?: boolean; wide?: boolean; children: React.ReactNode }) { return <label className={wide ? "block sm:col-span-2" : "block"}><span className="mb-2 block text-sm font-semibold text-slate-900">{label}{required ? <span className="text-rose-600"> *</span> : null}</span>{children}</label>; }
function Summary({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4 py-2 text-sm"><span className="text-slate-500">{label}</span><span className="max-w-[60%] text-right font-semibold text-slate-900">{value || "-"}</span></div>; }
function UploadRow({ upload }: { upload: Upload }) { return <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-3"><span className={`h-2.5 w-2.5 ${upload.status === "parsed" ? "bg-emerald-500" : upload.status === "failed" ? "bg-rose-500" : "animate-pulse bg-blue-500"}`} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[var(--text)]">{upload.name}</p><p className="text-xs text-[var(--muted)]">{formatBytes(upload.size)}{upload.error ? ` - ${upload.error}` : ""}</p></div><span className="text-xs font-bold uppercase text-[var(--muted)]">{uploadStatusLabel(upload.status)}</span></div>; }
function Preference({ label, text, value, toggle }: { label: string; text: string; value: boolean; toggle: () => void }) { return <div className="flex items-center justify-between gap-5 border-b border-slate-200 py-4 last:border-0"><div><p className="text-sm font-semibold text-slate-950">{label}</p><p className="mt-1 text-sm text-slate-500">{text}</p></div><button type="button" role="switch" aria-checked={value} onClick={toggle} className={`relative h-7 w-12 shrink-0 rounded-[999px] ${value ? "bg-[var(--primary)]" : "bg-slate-300"}`}><span className={`absolute top-1 h-5 w-5 rounded-[999px] bg-white shadow transition-[left] ${value ? "left-6" : "left-1"}`} /></button></div>; }
function Stage({ label, state, count }: { label: string; state: "done" | "active" | "pending" | "empty" | "error"; count?: number }) { return <div className="flex items-center gap-3 text-sm"><span className={`flex h-5 min-w-5 items-center justify-center rounded-[5px] border px-1 text-[10px] ${state === "done" ? "border-emerald-600 text-emerald-700" : state === "active" ? "animate-pulse border-[var(--primary)] bg-[var(--primary)] text-white" : state === "error" ? "border-rose-500 text-rose-600" : "border-slate-300 text-slate-300"}`}>{state === "done" ? "OK" : state === "active" ? "..." : state === "error" ? "!" : ""}</span><span className={state === "pending" || state === "empty" ? "text-slate-400" : "font-medium text-slate-800"}>{label}</span>{count !== undefined ? <span className="ml-auto font-bold">{count}</span> : null}</div>; }
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-[10px] border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-2 text-[24px] font-semibold text-slate-950">{value}</p></div>; }
function UploadIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8 fill-none stroke-slate-500" strokeWidth="1.7"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" /></svg>; }
function formatBytes(bytes: number) { return bytes < 1_000_000 ? `${Math.max(1, Math.round(bytes / 1_000))} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`; }
function isUploadInProgress(status: UploadStatus) { return status !== "parsed" && status !== "failed"; }
function uploadStatusLabel(status: UploadStatus) {
  if (status === "registering") return "Preparing";
  if (status === "uploading") return "Uploading";
  if (status === "completing") return "Finalizing";
  if (status === "parsing") return "Parsing";
  return status;
}
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
  const timer = new Promise<never>((_, reject) => {
    timeout = globalThis.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timer]).finally(() => {
    if (timeout) globalThis.clearTimeout(timeout);
  });
}

const input = "min-h-11 w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-white px-4 py-2.5 text-sm text-[var(--text)] outline-none transition-colors focus:border-[var(--primary)] focus:ring-2 focus:ring-[rgba(21,94,239,0.1)]";
const primary = "inline-flex min-h-10 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--primary-hover)] disabled:opacity-50";
const secondary = "inline-flex min-h-10 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-white px-5 py-2.5 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-muted)] disabled:opacity-50";
const ghost = "inline-flex min-h-10 items-center justify-center rounded-[var(--radius-sm)] px-4 py-2.5 text-sm font-semibold text-[var(--text-soft)] hover:bg-[var(--surface-muted)]";
