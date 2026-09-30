"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  Copy,
  FileText,
  GitPullRequestArrow,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Wrench,
  X,
} from "lucide-react";

import { Button } from "@rfp-os/ui";

import { AppShell } from "./app-shell";
import { FileDropzone, formatBytes } from "./file-dropzone";
import {
  TendyyCard,
  TendyyEmptyState,
  TendyyErrorState,
  TendyyField,
  TendyyMetricCard,
  TendyyPageHeader,
  TendyySectionHeader,
  TendyySheet,
  TendyySkeletonRows,
  TendyyStatusBadge,
  TendyyTable,
  TextLink,
  tendyyInputClass,
  toneFromStatus,
  type TendyyTone,
} from "./tendyy-ui";
import { ApiError, type KnowledgeIssueAction, type KnowledgeListParams } from "../lib/api";
import type {
  KnowledgeClaim,
  KnowledgeDocument,
  KnowledgeIssue,
  KnowledgeItem,
  KnowledgeReviewState,
  KnowledgeRevision,
  ResponseTemplate,
} from "../lib/models";
import {
  useActivities,
  useApplyKnowledgeRevision,
  useApproveKnowledgeSource,
  useApproveResponseTemplate,
  useArchiveKnowledgeSource,
  useArchiveResponseTemplate,
  useCreateKnowledgeSource,
  useCreateResponseTemplate,
  useDecideKnowledgeClaims,
  useDeleteKnowledgeDocument,
  useDuplicateResponseTemplate,
  useKnowledgeIssues,
  useKnowledgeItem,
  useKnowledgeList,
  useKnowledgeSources,
  useKnowledgeSummary,
  useOrganizationMembers,
  useRejectKnowledgeRevision,
  useReprocessKnowledgeDocument,
  useResolveKnowledgeIssue,
  useResponseTemplates,
  useUpdateKnowledgeSource,
  useUpdateResponseTemplate,
  useUploadKnowledgeDocument,
  useVerifyKnowledgeSource,
} from "../lib/queries";
import { toast } from "../lib/toast";
import { useDebouncedValue, useNow } from "../lib/use-debounced-value";

const CATEGORIES = ["Security", "Commercial", "Compliance", "Product", "Legal", "Architecture", "Support"];
const PAGE_SIZE = 25;
type KnowledgeSort = NonNullable<KnowledgeListParams["sort"]>;

type SourceFormState = {
  name: string;
  type: string;
  category: string;
  authority: "high" | "medium" | "low";
  sourceKind: string;
  summary: string;
  lastVerified: string;
  expiresAt: string;
  claims: Array<{ id?: string; label: string; value: string; confidence: number }>;
};

type TemplateFormState = {
  name: string;
  category: string;
  description: string;
  sectionTitle: string;
  sectionBody: string;
  variables: string;
};

const emptySourceForm: SourceFormState = {
  name: "",
  type: "Policy",
  category: "Security",
  authority: "medium",
  sourceKind: "manual",
  summary: "",
  lastVerified: "",
  expiresAt: "",
  claims: [],
};

const emptyTemplateForm: TemplateFormState = {
  name: "",
  category: "Security",
  description: "",
  sectionTitle: "Answer",
  sectionBody: "",
  variables: "",
};

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export function KnowledgeOverviewPage() {
  const summaryQuery = useKnowledgeSummary();
  const activityQuery = useActivities({ entityType: "knowledge_source" });
  const owners = useOwnerNames();
  const summary = summaryQuery.data ?? null;
  const counts = summary?.counts;
  const loading = summaryQuery.isLoading;
  const needsVerification = (counts?.stale ?? 0) + (counts?.unverified ?? 0);
  const healthy = Math.max(0, (counts?.active ?? 0) - needsVerification - (counts?.expired ?? 0) - (counts?.expiring ?? 0));

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Knowledge" }]}>
      <div className="min-w-0 space-y-5 pb-8">
        <TendyyPageHeader
          eyebrow="Knowledge"
          title="Knowledge Brain"
          description="The verified facts, documents and templates every tender answer is drafted from. Keep them fresh and they keep answers accurate."
          actions={
            <>
              <RefreshIndicator updatedAt={summaryQuery.dataUpdatedAt} fetching={summaryQuery.isFetching} onRefresh={() => void summaryQuery.refetch()} />
              <Button asChild variant="secondary"><Link href="/knowledge/issues"><Wrench className="h-4 w-4" />Issues</Link></Button>
              <Button asChild><Link href="/knowledge/sources#upload"><Upload className="h-4 w-4" />Upload document</Link></Button>
            </>
          }
        />

        {summaryQuery.isError ? (
          <TendyyErrorState
            title="Unable to load knowledge"
            message={errorMessage(summaryQuery.error, "The knowledge service did not return data.")}
            onRetry={() => void summaryQuery.refetch()}
          />
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Knowledge health metrics">
          <TendyyMetricCard
            label="Sources"
            value={counts?.total ?? 0}
            detail={counts ? `${counts.documentBacked} backed by uploaded documents` : undefined}
            icon={<BookOpen className="h-5 w-5" />}
            loading={loading}
          />
          <TendyyMetricCard
            label="Verified and current"
            value={healthy}
            detail={counts ? `${formatPercent(healthy, counts.active)} of live sources` : undefined}
            icon={<ShieldCheck className="h-5 w-5" />}
            loading={loading}
            tone="success"
          />
          <TendyyMetricCard
            label="Templates"
            value={counts?.templates ?? 0}
            detail="Shape answer structure when drafting"
            icon={<FileText className="h-5 w-5" />}
            loading={loading}
            tone="primary"
          />
          <TendyyMetricCard
            label="Open issues"
            value={counts?.openIssues ?? 0}
            detail={counts && counts.openIssues > 0 ? "Stale knowledge is skipped when drafting" : "Nothing needs attention"}
            icon={<AlertTriangle className="h-5 w-5" />}
            loading={loading}
            tone={(counts?.openIssues ?? 0) > 0 ? "warning" : "neutral"}
          />
        </section>

        {counts && (counts.processingDocuments > 0 || counts.suggestedClaims > 0 || counts.pendingRevisions > 0) ? (
          <TendyyCard>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-[var(--text-soft)]">
              {counts.processingDocuments > 0 ? (
                <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin text-[var(--primary)]" />{counts.processingDocuments} document{plural(counts.processingDocuments)} processing</span>
              ) : null}
              {counts.suggestedClaims > 0 ? (
                <span className="inline-flex items-center gap-2"><Sparkles className="h-4 w-4 text-[var(--primary)]" />{counts.suggestedClaims} extracted claim{plural(counts.suggestedClaims)} waiting for review</span>
              ) : null}
              {counts.pendingRevisions > 0 ? (
                <Link href="/knowledge/issues?type=REVISION" className="inline-flex items-center gap-2 hover:text-[var(--primary)]"><GitPullRequestArrow className="h-4 w-4" />{counts.pendingRevisions} edit{plural(counts.pendingRevisions)} waiting for review</Link>
              ) : null}
            </div>
          </TendyyCard>
        ) : null}

        <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]">
          <TendyyCard>
            <TendyySectionHeader eyebrow="Knowledge health" title="What needs attention" actionHref="/knowledge/issues" actionLabel="Open issue queue" />
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <HealthTile label="Awaiting approval" value={counts?.draft ?? 0} total={counts?.total ?? 0} tone="warning" href="/knowledge/issues?type=DRAFT" />
              <HealthTile label="Needs re-verification" value={needsVerification} total={counts?.active ?? 0} tone="danger" href="/knowledge/issues?type=STALE" />
              <HealthTile label="Expired or expiring" value={(counts?.expired ?? 0) + (counts?.expiring ?? 0)} total={counts?.active ?? 0} tone="danger" href="/knowledge/issues?type=EXPIRED" />
              <HealthTile label="Conflicts" value={counts?.conflicts ?? 0} total={Math.max(1, counts?.active ?? 0)} tone="warning" href="/knowledge/issues?type=CONFLICT" />
            </div>
            <div className="mt-5 space-y-2">
              {loading ? <TendyySkeletonRows count={3} /> : (summary?.attention ?? []).length ? (
                (summary?.attention ?? []).map((item) => (
                  <Link key={item.id} href={`/knowledge/${item.id}`} className="tendyy-nested-surface flex items-center justify-between gap-3 p-3 hover:border-[var(--primary)]">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-[var(--text)]">{item.name}</p>
                      <p className="mt-0.5 text-[12px] text-[var(--muted)]">{attentionReason(item)} · Owner {owners.name(item.ownerId)}</p>
                    </div>
                    <ReviewBadge item={item} />
                  </Link>
                ))
              ) : (
                <p className="text-[13px] text-[var(--muted)]">Every live source is verified and within date.</p>
              )}
            </div>
          </TendyyCard>

          <TendyyCard>
            <TendyySectionHeader eyebrow="Activity" title="Recent knowledge activity" actionHref="/notifications" actionLabel="View all" />
            <div className="mt-4 space-y-2">
              {activityQuery.isLoading ? <TendyySkeletonRows count={4} /> : (activityQuery.data?.items ?? []).length > 0 ? (
                (activityQuery.data?.items ?? []).slice(0, 6).map((item) => (
                  <div key={item.id} className="tendyy-nested-surface p-3">
                    <p className="truncate text-[13px] font-semibold text-[var(--text)]">{item.label || item.summary}</p>
                    {item.summary && item.summary !== item.label ? <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[var(--muted)]">{item.summary}</p> : null}
                    <RelativeTime value={item.createdAt} className="mt-1 text-[11px] text-[var(--muted-subtle)]" />
                  </div>
                ))
              ) : (
                <TendyyEmptyState title="No knowledge activity yet" description="Uploads, approvals, verifications and edits will show here as they happen." />
              )}
            </div>
          </TendyyCard>
        </section>

        <KnowledgeListPanel
          title="Recently updated"
          items={summary?.items ?? []}
          total={summary?.items.length ?? 0}
          loading={loading}
          emptyTitle="No knowledge yet"
          emptyDescription="Upload a policy, questionnaire or product document, or add a source by hand, to start answering from verified knowledge."
          owners={owners}
        />
      </div>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

export function KnowledgeLibraryPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<KnowledgeSort>("updatedAt:desc");
  const debouncedSearch = useDebouncedValue(search);
  useEffect(() => setPage(1), [debouncedSearch, sort]);
  const listQuery = useKnowledgeList({ page, pageSize: PAGE_SIZE, search: clean(debouncedSearch), sort, status: "ACTIVE" });
  const owners = useOwnerNames();
  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Knowledge", href: "/knowledge" }, { label: "Library" }]}>
      <div className="min-w-0 space-y-5 pb-8">
        <TendyyPageHeader
          eyebrow="Knowledge"
          title="Knowledge library"
          description="Every approved source that tender answers can cite."
          actions={<RefreshIndicator updatedAt={listQuery.dataUpdatedAt} fetching={listQuery.isFetching} onRefresh={() => void listQuery.refetch()} />}
        />
        <TendyyCard>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <SearchBox value={search} onChange={setSearch} placeholder="Search approved knowledge" />
            <SortSelect value={sort} onChange={setSort} />
          </div>
        </TendyyCard>
        {listQuery.isError ? <TendyyErrorState message={errorMessage(listQuery.error, "Unable to load the knowledge library.")} onRetry={() => void listQuery.refetch()} /> : null}
        <KnowledgeListPanel
          title="Approved knowledge"
          items={listQuery.data?.items ?? []}
          total={listQuery.data?.total ?? 0}
          loading={listQuery.isLoading}
          emptyTitle={debouncedSearch ? "No matches" : "Nothing approved yet"}
          emptyDescription={debouncedSearch ? "Try a different search term." : "Approved sources appear here once they are reviewed."}
          owners={owners}
          hideLibraryLink
          footer={<Pager page={page} pageSize={PAGE_SIZE} total={listQuery.data?.total ?? 0} onPage={setPage} />}
        />
      </div>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export function SourcesPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [reviewState, setReviewState] = useState<NonNullable<KnowledgeListParams["reviewState"]>>("all");
  const [sort, setSort] = useState<KnowledgeSort>("updatedAt:desc");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<KnowledgeItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const debouncedSearch = useDebouncedValue(search);
  useEffect(() => setPage(1), [debouncedSearch, status, reviewState, sort]);
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#upload") setUploading(true);
  }, []);
  const query = useKnowledgeSources({
    page,
    pageSize: PAGE_SIZE,
    search: clean(debouncedSearch),
    status: status === "ALL" ? null : status,
    reviewState: reviewState === "all" ? undefined : reviewState,
    sort,
  });
  const approve = useApproveKnowledgeSource();
  const archive = useArchiveKnowledgeSource();
  const verify = useVerifyKnowledgeSource();
  const owners = useOwnerNames();
  const pendingId = pendingKey(approve) ?? pendingKey(archive) ?? pendingKey(verify);

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Knowledge", href: "/knowledge" }, { label: "Sources" }]}>
      <div className="min-w-0 space-y-5 pb-8">
        <TendyyPageHeader
          eyebrow="Source layer"
          title="Sources"
          description="Upload documents or write sources by hand. Only approved, current sources are used when drafting tender answers."
          actions={
            <>
              <RefreshIndicator updatedAt={query.dataUpdatedAt} fetching={query.isFetching} onRefresh={() => void query.refetch()} />
              <Button type="button" variant="secondary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New source</Button>
              <Button type="button" onClick={() => setUploading(true)}><Upload className="h-4 w-4" />Upload document</Button>
            </>
          }
        />
        <TendyyCard>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_190px_200px]">
            <SearchBox value={search} onChange={setSearch} placeholder="Search sources" />
            <select value={status} onChange={(event) => setStatus(event.target.value)} className={tendyyInputClass} aria-label="Source status">
              <option value="ALL">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Approved</option>
              <option value="ARCHIVED">Archived</option>
            </select>
            <select value={reviewState} onChange={(event) => setReviewState(event.target.value as typeof reviewState)} className={tendyyInputClass} aria-label="Freshness">
              <option value="all">Any freshness</option>
              <option value="healthy">Current</option>
              <option value="unverified">Never verified</option>
              <option value="stale">Stale</option>
              <option value="expiring">Expiring soon</option>
              <option value="expired">Expired</option>
            </select>
            <SortSelect value={sort} onChange={setSort} />
          </div>
        </TendyyCard>
        {query.isError ? <TendyyErrorState message={errorMessage(query.error, "Unable to load sources.")} onRetry={() => void query.refetch()} /> : null}
        <SourcesTable
          items={query.data?.items ?? []}
          total={query.data?.total ?? 0}
          loading={query.isLoading}
          pendingId={pendingId}
          owners={owners}
          onEdit={setEditing}
          onApprove={(id) => approve.mutate(id)}
          onVerify={(id) => verify.mutate({ id, note: "Verified from the source list." })}
          onArchive={(id) => archive.mutate(id)}
          footer={<Pager page={page} pageSize={PAGE_SIZE} total={query.data?.total ?? 0} onPage={setPage} />}
        />
        <SourceSheet key={creating ? "new-source" : "closed-source"} open={creating} onClose={() => setCreating(false)} />
        <SourceSheet key={editing?.id ?? "no-edit-source"} item={editing} open={Boolean(editing)} onClose={() => setEditing(null)} />
        <UploadSourceSheet open={uploading} onClose={() => { setUploading(false); if (window.location.hash === "#upload") history.replaceState(null, "", window.location.pathname); }} />
      </div>
    </AppShell>
  );
}

/**
 * Upload-first flow: each file becomes its own DRAFT source named after the
 * file, and the user lands on the source to watch it process and review what
 * was extracted.
 */
function UploadSourceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const create = useCreateKnowledgeSource();
  const upload = useUploadKnowledgeDocument();
  const [category, setCategory] = useState("Security");
  const [authority, setAuthority] = useState<"high" | "medium" | "low">("medium");
  const [files, setFiles] = useState<Array<{ file: File; mimeType: string }>>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) setFiles([]);
  }, [open]);

  const submit = async () => {
    if (!files.length) return;
    setBusy(true);
    let lastId: string | null = null;
    try {
      for (const { file, mimeType } of files) {
        const source = await create.mutateAsync({
          name: file.name.replace(/\.[^.]+$/, ""),
          type: "Document",
          category,
          authority,
          sourceKind: "document",
          summary: "",
        });
        await upload.mutateAsync({ sourceId: source.id, file, mimeType });
        lastId = source.id;
      }
      onClose();
      if (lastId && files.length === 1) router.push(`/knowledge/${lastId}`);
    } catch {
      // The failing mutation already reported itself as a toast.
    } finally {
      setBusy(false);
    }
  };

  return (
    <TendyySheet
      open={open}
      title="Upload knowledge documents"
      onClose={onClose}
      footer={<Button type="button" disabled={busy || files.length === 0} onClick={() => void submit()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{busy ? "Uploading" : `Upload ${files.length || ""} file${files.length === 1 ? "" : "s"}`}</Button>}
    >
      <div className="space-y-4">
        <p className="text-[13px] leading-6 text-[var(--muted)]">
          Each file becomes a draft source. It is parsed and indexed for search, and the facts it states are suggested as claims for you to review. Nothing is used in tender answers until you approve it.
        </p>
        <FileDropzone
          compact
          disabled={busy}
          onFiles={(accepted) => setFiles((current) => [...current, ...accepted])}
          onReject={(rejected) => toast.error("Unsupported file type", `${rejected.map((file) => file.name).join(", ")}: only PDF and DOCX are supported.`)}
        />
        {files.length ? (
          <ul className="space-y-2">
            {files.map(({ file }, index) => (
              <li key={`${file.name}-${index}`} className="tendyy-nested-surface flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                <span className="min-w-0 truncate font-semibold text-[var(--text)]">{file.name}</span>
                <span className="flex shrink-0 items-center gap-2 text-[12px] text-[var(--muted)]">
                  {formatBytes(file.size)}
                  <button type="button" disabled={busy} aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((_, i) => i !== index))} className="rounded p-0.5 hover:text-[var(--text)]"><X className="h-3.5 w-3.5" /></button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <TendyyField label="Category"><select className={tendyyInputClass} value={category} onChange={(event) => setCategory(event.target.value)}>{CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}</select></TendyyField>
          <TendyyField label="Authority" hint="How much weight it carries when sources disagree."><select className={tendyyInputClass} value={authority} onChange={(event) => setAuthority(event.target.value as typeof authority)}><option value="high">High (approved policy, audit report)</option><option value="medium">Medium (product documentation)</option><option value="low">Low (past answers, drafts)</option></select></TendyyField>
        </div>
      </div>
    </TendyySheet>
  );
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export function ResponseTemplatesPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"ALL" | "DRAFT" | "ACTIVE" | "ARCHIVED">("ALL");
  const [editing, setEditing] = useState<ResponseTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const debouncedSearch = useDebouncedValue(search);
  const query = useResponseTemplates({ page: 1, pageSize: 100, search: clean(debouncedSearch), status });
  const approve = useApproveResponseTemplate();
  const archive = useArchiveResponseTemplate();
  const duplicate = useDuplicateResponseTemplate();
  const pendingId = pendingKey(approve) ?? pendingKey(archive) ?? pendingKey(duplicate);

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Knowledge", href: "/knowledge" }, { label: "Templates" }]}>
      <div className="min-w-0 space-y-5 pb-8">
        <TendyyPageHeader
          eyebrow="Reusable knowledge"
          title="Response templates"
          description="An active template shapes the structure and tone of drafted answers in its category. Facts still come only from approved knowledge."
          actions={
            <>
              <RefreshIndicator updatedAt={query.dataUpdatedAt} fetching={query.isFetching} onRefresh={() => void query.refetch()} />
              <Button type="button" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New template</Button>
            </>
          }
        />
        <TendyyCard>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
            <SearchBox value={search} onChange={setSearch} placeholder="Search templates" />
            <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className={tendyyInputClass} aria-label="Template status">
              <option value="ALL">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>
        </TendyyCard>
        {query.isError ? <TendyyErrorState message={errorMessage(query.error, "Unable to load templates.")} onRetry={() => void query.refetch()} /> : null}
        <TemplatesTable
          items={query.data?.items ?? []}
          total={query.data?.total ?? 0}
          loading={query.isLoading}
          pendingId={pendingId}
          onEdit={setEditing}
          onApprove={(id) => approve.mutate(id)}
          onArchive={(id) => archive.mutate(id)}
          onDuplicate={(id) => duplicate.mutate(id)}
        />
        <TemplateSheet key={creating ? "new-template" : "closed-template"} open={creating} onClose={() => setCreating(false)} />
        <TemplateSheet key={editing?.id ?? "no-edit-template"} item={editing} open={Boolean(editing)} onClose={() => setEditing(null)} />
      </div>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

const ISSUE_TYPES: Array<{ value: KnowledgeIssue["type"]; label: string }> = [
  { value: "DRAFT", label: "Awaiting approval" },
  { value: "REVISION", label: "Edit to review" },
  { value: "UNVERIFIED", label: "Never verified" },
  { value: "STALE", label: "Stale" },
  { value: "EXPIRED", label: "Expired" },
  { value: "EXPIRING_SOON", label: "Expiring soon" },
  { value: "CONFLICT", label: "Conflict" },
];

export function KnowledgeIssuesPage() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("ALL");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("type");
    if (initial && ISSUE_TYPES.some((option) => option.value === initial)) setType(initial);
  }, []);
  const debouncedSearch = useDebouncedValue(search);
  useEffect(() => setPage(1), [debouncedSearch, type]);
  const query = useKnowledgeIssues({ page, pageSize: 50, search: clean(debouncedSearch), type: type === "ALL" ? undefined : type, status: "OPEN" });
  const resolve = useResolveKnowledgeIssue();
  const counts = query.data?.counts;

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Knowledge", href: "/knowledge" }, { label: "Issues" }]}>
      <div className="min-w-0 space-y-5 pb-8">
        <TendyyPageHeader
          eyebrow="Knowledge"
          title="Knowledge issues"
          description="Stale, expired and unapproved knowledge is skipped when drafting tender answers. Clearing this queue keeps answers complete."
          actions={<RefreshIndicator updatedAt={query.dataUpdatedAt} fetching={query.isFetching} onRefresh={() => void query.refetch()} />}
        />
        <section className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          <TendyyMetricCard label="Open" value={counts?.total ?? 0} icon={<Wrench className="h-5 w-5" />} loading={query.isLoading} />
          <TendyyMetricCard label="Awaiting review" value={(counts?.draft ?? 0) + (counts?.revision ?? 0)} tone="warning" loading={query.isLoading} />
          <TendyyMetricCard label="Needs verification" value={(counts?.stale ?? 0) + (counts?.unverified ?? 0) + (counts?.expired ?? 0) + (counts?.expiring_soon ?? 0)} tone="danger" loading={query.isLoading} />
          <TendyyMetricCard label="Conflicts" value={counts?.conflict ?? 0} tone="warning" loading={query.isLoading} />
        </section>
        <TendyyCard>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_200px]">
            <SearchBox value={search} onChange={setSearch} placeholder="Search by source name" />
            <select value={type} onChange={(event) => setType(event.target.value)} className={tendyyInputClass} aria-label="Issue type">
              <option value="ALL">All issue types</option>
              {ISSUE_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </TendyyCard>
        {query.isError ? <TendyyErrorState message={errorMessage(query.error, "Unable to load knowledge issues.")} onRetry={() => void query.refetch()} /> : null}
        <IssuesTable
          items={query.data?.items ?? []}
          total={query.data?.total ?? 0}
          loading={query.isLoading}
          pendingId={pendingKey(resolve)}
          onResolve={(id, action) => resolve.mutate({ id, action, note: "Resolved from the issue queue." })}
          footer={<Pager page={page} pageSize={50} total={query.data?.total ?? 0} onPage={setPage} />}
        />
      </div>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export function KnowledgeDetailPage({ knowledgeId }: { knowledgeId: string }) {
  const itemQuery = useKnowledgeItem(knowledgeId);
  const approve = useApproveKnowledgeSource();
  const archive = useArchiveKnowledgeSource();
  const verify = useVerifyKnowledgeSource();
  const owners = useOwnerNames();
  const [editing, setEditing] = useState(false);
  const item = itemQuery.data ?? null;
  const busy = approve.isPending || archive.isPending || verify.isPending;

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Knowledge", href: "/knowledge" }, { label: "Sources", href: "/knowledge/sources" }, { label: item?.name ?? "Source" }]}>
      <div className="min-w-0 space-y-5 pb-8">
        {itemQuery.isLoading ? <TendyySkeletonRows count={3} /> : itemQuery.isError ? (
          <TendyyErrorState message={errorMessage(itemQuery.error, "Unable to load this knowledge source.")} onRetry={() => void itemQuery.refetch()} />
        ) : item ? (
          <>
            <TendyyPageHeader
              eyebrow={`${item.category} · v${item.version}`}
              title={item.name}
              description={item.summary || (item.documents?.length ? "Knowledge from the uploaded documents below." : "No summary yet.")}
              badge={<div className="flex flex-wrap gap-2"><TendyyStatusBadge tone={toneFromStatus(item.status)}>{formatKnowledgeStatus(item.status)}</TendyyStatusBadge><ReviewBadge item={item} /></div>}
              actions={
                <>
                  <RefreshIndicator updatedAt={itemQuery.dataUpdatedAt} fetching={itemQuery.isFetching} onRefresh={() => void itemQuery.refetch()} />
                  <Button type="button" variant="secondary" onClick={() => setEditing(true)} disabled={item.status === "ARCHIVED"}><Pencil className="h-4 w-4" />Edit</Button>
                  {item.status === "DRAFT" ? (
                    <Button type="button" onClick={() => approve.mutate(item.id)} disabled={busy}><BadgeCheck className="h-4 w-4" />Approve</Button>
                  ) : (
                    <Button type="button" variant="secondary" onClick={() => verify.mutate({ id: item.id, note: "Verified from the source page." })} disabled={busy || item.status === "ARCHIVED"}><ShieldCheck className="h-4 w-4" />Mark verified</Button>
                  )}
                  <Button type="button" variant="secondary" onClick={() => archive.mutate(item.id)} disabled={busy || item.status === "ARCHIVED"}><Archive className="h-4 w-4" />Archive</Button>
                </>
              }
            />

            {item.status === "DRAFT" ? (
              <Callout tone="warning" title="Not used in tender answers yet">
                Drafts are never cited. Review the content below and approve it to make it available to drafting.
              </Callout>
            ) : item.reviewState && item.reviewState !== "fresh" ? (
              <Callout tone="danger" title={reviewStateHeadline(item.reviewState)}>
                {reviewStateExplanation(item)}
              </Callout>
            ) : null}

            {item.pendingRevision ? <PendingRevisionPanel item={item} revision={item.pendingRevision} /> : null}

            <section className="grid min-w-0 gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="min-w-0 space-y-5">
                <TendyyCard>
                  <TendyySectionHeader eyebrow="Details" title="Source record" />
                  <dl className="mt-4 space-y-2">
                    <InfoRow label="Type" value={item.type} />
                    <InfoRow label="Authority" value={formatStatus(item.authority)} />
                    <InfoRow label="Owner" value={owners.name(item.ownerId)} />
                    <InfoRow label="Last verified" value={formatDate(item.lastVerified)} />
                    <InfoRow label="Expires" value={item.expiresAt ? `${formatDate(item.expiresAt)}${item.daysUntilExpiry !== null && item.daysUntilExpiry !== undefined && item.daysUntilExpiry >= 0 ? ` (${item.daysUntilExpiry}d)` : ""}` : "No expiry"} />
                    <InfoRow label="Last updated" value={formatDate(item.updatedAt)} />
                  </dl>
                </TendyyCard>
                <UsagePanel item={item} />
              </div>
              <div className="min-w-0 space-y-5">
                <DocumentsPanel item={item} />
                {item.suggestedClaims?.length ? <SuggestedClaimsPanel item={item} /> : null}
                <TendyyCard>
                  <TendyySectionHeader eyebrow="Claims" title={`Citable facts (${item.claims?.length ?? 0})`} />
                  <div className="mt-4 space-y-2">
                    {item.claims?.length ? item.claims.map((claim) => <ClaimRow key={claim.id ?? claim.label} claim={claim} document={documentFor(item, claim)} />) : (
                      <TendyyEmptyState title="No claims yet" description={item.documents?.length ? "Claims extracted from the documents appear above for review." : "Add claims in Edit, or upload a document to have them suggested."} />
                    )}
                  </div>
                </TendyyCard>
                <TendyyCard>
                  <TendyySectionHeader eyebrow="Conflicts" title="Disagreements with other sources" />
                  <div className="mt-4 space-y-2">
                    {item.conflicts?.length ? item.conflicts.map((conflict) => (
                      <div key={conflict.id} className="tendyy-nested-surface p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-[var(--text)]">{conflict.topic}</p>
                            <ul className="mt-1 space-y-0.5 text-[12px] text-[var(--text-soft)]">{conflict.variants.map((variant) => <li key={variant.id}><span className="font-semibold">{variant.label}:</span> {variant.value}</li>)}</ul>
                            <p className="mt-1 text-[12px] leading-5 text-[var(--muted)]">{conflict.status === "RESOLVED" ? conflict.resolutionNote : conflict.recommended}</p>
                          </div>
                          <TendyyStatusBadge tone={conflict.status === "RESOLVED" ? "success" : "warning"}>{formatStatus(conflict.status)}</TendyyStatusBadge>
                        </div>
                      </div>
                    )) : <p className="text-[13px] text-[var(--muted)]">No conflicts detected. Approved claims are checked against the rest of the library automatically.</p>}
                  </div>
                </TendyyCard>
                <VersionHistory item={item} owners={owners} />
              </div>
            </section>
            <SourceSheet key={editing ? `edit-${item.id}` : "closed-detail-edit"} item={item} open={editing} onClose={() => setEditing(false)} />
          </>
        ) : (
          <TendyyEmptyState title="Knowledge source not found" description="It may have been removed, or you may not have access." actionHref="/knowledge/sources" actionLabel="Back to sources" />
        )}
      </div>
    </AppShell>
  );
}

function PendingRevisionPanel({ item, revision }: { item: KnowledgeItem; revision: KnowledgeRevision }) {
  const apply = useApplyKnowledgeRevision();
  const reject = useRejectKnowledgeRevision();
  const busy = apply.isPending || reject.isPending;
  const changes = revision.changes;
  const rows: Array<{ label: string; before: string; after: string }> = [];
  if (changes.name !== undefined) rows.push({ label: "Name", before: item.name, after: changes.name });
  if (changes.type !== undefined) rows.push({ label: "Type", before: item.type, after: changes.type });
  if (changes.authority !== undefined) rows.push({ label: "Authority", before: formatStatus(item.authority), after: formatStatus(changes.authority) });
  if (changes.summary !== undefined) rows.push({ label: "Summary", before: item.summary || "(empty)", after: changes.summary || "(empty)" });
  if (changes.claims !== undefined) {
    rows.push({
      label: "Claims",
      before: (item.claims ?? []).map((claim) => `${claim.label}: ${claim.value}`).join("\n") || "(none)",
      after: changes.claims.map((claim) => `${claim.label}: ${claim.value}`).join("\n") || "(none)",
    });
  }
  return (
    <TendyyCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--warning,#b54708)]">Pending revision</p>
          <h2 className="mt-1 text-[16px] font-semibold text-[var(--text)]">An edit is waiting for review</h2>
          <p className="mt-1 text-[13px] text-[var(--muted)]">Tenders keep citing v{revision.baseVersion} until this is applied. Updated <RelativeTime value={revision.updatedAt} />.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={() => reject.mutate({ sourceId: item.id, revisionId: revision.id })}><X className="h-4 w-4" />Reject</Button>
          <Button type="button" disabled={busy} onClick={() => apply.mutate({ sourceId: item.id, revisionId: revision.id })}><CheckCircle2 className="h-4 w-4" />Apply revision</Button>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="grid gap-2 md:grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)]">
            <p className="text-[12px] font-semibold text-[var(--text)]">{row.label}</p>
            <p className="whitespace-pre-wrap rounded-[var(--radius-sm)] bg-[rgba(180,35,24,0.06)] p-2 text-[12px] leading-5 text-[var(--text-soft)] line-through decoration-[rgba(180,35,24,0.4)]">{row.before}</p>
            <p className="whitespace-pre-wrap rounded-[var(--radius-sm)] bg-[rgba(6,118,71,0.07)] p-2 text-[12px] leading-5 text-[var(--text)]">{row.after}</p>
          </div>
        ))}
      </div>
    </TendyyCard>
  );
}

function DocumentsPanel({ item }: { item: KnowledgeItem }) {
  const upload = useUploadKnowledgeDocument();
  const reprocess = useReprocessKnowledgeDocument();
  const remove = useDeleteKnowledgeDocument();
  const documents = item.documents ?? [];
  const archived = item.status === "ARCHIVED";
  return (
    <TendyyCard>
      <TendyySectionHeader eyebrow="Documents" title={`Uploaded documents (${documents.length})`} />
      <div className="mt-4 space-y-3">
        {documents.map((document) => {
          const rowBusy =
            (reprocess.isPending && reprocess.variables?.documentId === document.id) || (remove.isPending && remove.variables?.documentId === document.id);
          return (
            <div key={document.id} className="tendyy-nested-surface flex flex-wrap items-center gap-3 p-3">
              <FileText className="h-4 w-4 shrink-0 text-[var(--muted)]" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-[var(--text)]">{document.fileName}</p>
                <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                  {formatBytes(document.sizeBytes)}
                  {document.pageCount ? ` · ${document.pageCount} page${plural(document.pageCount)}` : ""}
                  {document.chunkCount ? ` · ${document.chunkCount} passage${plural(document.chunkCount)} indexed` : ""}
                  {document.status === "failed" && document.failureReason ? ` · ${document.failureReason}` : ""}
                </p>
              </div>
              <DocumentStatusBadge document={document} />
              {!archived ? (
                <div className="flex gap-1">
                  {document.status === "failed" || document.status === "parsed" || document.status === "embedded" ? (
                    <Button type="button" variant="secondary" disabled={rowBusy} onClick={() => reprocess.mutate({ sourceId: item.id, documentId: document.id })} aria-label={`Reprocess ${document.fileName}`}><RotateCcw className="h-4 w-4" /></Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={rowBusy}
                    onClick={() => {
                      if (window.confirm(`Remove ${document.fileName}? Its indexed passages are deleted; claims already accepted are kept.`)) {
                        remove.mutate({ sourceId: item.id, documentId: document.id });
                      }
                    }}
                    aria-label={`Remove ${document.fileName}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
        {!archived ? (
          <FileDropzone
            compact
            disabled={upload.isPending}
            title={upload.isPending ? "Uploading…" : documents.length ? "Add another document" : "Upload the document behind this source"}
            onFiles={(files) => {
              for (const { file, mimeType } of files) upload.mutate({ sourceId: item.id, file, mimeType });
            }}
            onReject={(rejected) => toast.error("Unsupported file type", `${rejected.map((file) => file.name).join(", ")}: only PDF and DOCX are supported.`)}
          />
        ) : null}
      </div>
    </TendyyCard>
  );
}

function DocumentStatusBadge({ document }: { document: KnowledgeDocument }) {
  switch (document.status) {
    case "uploaded":
      return <TendyyStatusBadge tone="neutral">Upload incomplete</TendyyStatusBadge>;
    case "queued":
      return <TendyyStatusBadge tone="primary"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Queued</TendyyStatusBadge>;
    case "processing":
      return <TendyyStatusBadge tone="primary"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Reading</TendyyStatusBadge>;
    case "parsed":
      return <TendyyStatusBadge tone="success">Indexed (keyword)</TendyyStatusBadge>;
    case "embedded":
      return <TendyyStatusBadge tone="success">Indexed</TendyyStatusBadge>;
    case "failed":
      return <TendyyStatusBadge tone="danger">Failed</TendyyStatusBadge>;
    default:
      return null;
  }
}

function SuggestedClaimsPanel({ item }: { item: KnowledgeItem }) {
  const decide = useDecideKnowledgeClaims();
  const suggestions = item.suggestedClaims ?? [];
  const ids = suggestions.map((claim) => claim.id).filter((id): id is string => Boolean(id));
  const pendingIds = decide.isPending ? decide.variables?.claimIds ?? [] : [];
  return (
    <TendyyCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <TendyySectionHeader eyebrow="Extracted" title={`Suggested claims (${suggestions.length})`} />
        <Button type="button" variant="secondary" disabled={decide.isPending || ids.length === 0} onClick={() => decide.mutate({ sourceId: item.id, claimIds: ids, decision: "accept" })}><CheckCircle2 className="h-4 w-4" />Accept all</Button>
      </div>
      <p className="mt-2 text-[12px] leading-5 text-[var(--muted)]">Read from the uploaded documents. Only accepted claims can be cited in tender answers.</p>
      <div className="mt-4 space-y-2">
        {suggestions.map((claim) => {
          const busy = Boolean(claim.id && pendingIds.includes(claim.id));
          return (
            <div key={claim.id ?? claim.label} className="tendyy-nested-surface flex flex-wrap items-start justify-between gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-[var(--text)]">{claim.label}</p>
                <p className="mt-1 text-[13px] leading-6 text-[var(--text-soft)]">{claim.value}</p>
                <p className="mt-1 text-[11px] text-[var(--muted-subtle)]">{documentFor(item, claim)?.fileName ?? "Document"} · {Math.round(claim.confidence * 100)}% explicit</p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" disabled={busy || !claim.id} onClick={() => claim.id && decide.mutate({ sourceId: item.id, claimIds: [claim.id], decision: "reject" })} aria-label={`Reject ${claim.label}`}><X className="h-4 w-4" /></Button>
                <Button type="button" disabled={busy || !claim.id} onClick={() => claim.id && decide.mutate({ sourceId: item.id, claimIds: [claim.id], decision: "accept" })}><CheckCircle2 className="h-4 w-4" />Accept</Button>
              </div>
            </div>
          );
        })}
      </div>
    </TendyyCard>
  );
}

function ClaimRow({ claim, document }: { claim: KnowledgeClaim; document?: KnowledgeDocument }) {
  return (
    <div className="tendyy-nested-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[var(--text)]">{claim.label}</p>
          <p className="mt-1 text-[13px] leading-6 text-[var(--muted)]">{claim.value}</p>
          {document ? <p className="mt-1 text-[11px] text-[var(--muted-subtle)]">From {document.fileName}</p> : null}
        </div>
        <TendyyStatusBadge tone={claim.confidence >= 0.8 ? "success" : claim.confidence >= 0.6 ? "primary" : "warning"}>{Math.round(claim.confidence * 100)}%</TendyyStatusBadge>
      </div>
    </div>
  );
}

function UsagePanel({ item }: { item: KnowledgeItem }) {
  const usage = item.usage;
  return (
    <TendyyCard>
      <TendyySectionHeader eyebrow="Usage" title={`Cited ${item.usageCount ?? usage?.totalCitations ?? 0} time${plural(item.usageCount ?? usage?.totalCitations ?? 0)}`} />
      <div className="mt-3 space-y-2">
        {usage?.tenders.length ? usage.tenders.map((tender) => (
          <Link key={tender.tenderId} href={`/tenders/${tender.tenderId}`} className="tendyy-nested-surface flex items-center justify-between gap-2 p-2.5 hover:border-[var(--primary)]">
            <span className="min-w-0 truncate text-[12px] font-semibold text-[var(--text)]">{tender.tenderName}</span>
            <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-[var(--muted)]">
              {tender.flaggedCitations > 0 ? <TendyyStatusBadge tone="warning">{tender.flaggedCitations} outdated</TendyyStatusBadge> : null}
              {tender.citations}×
            </span>
          </Link>
        )) : <p className="text-[12px] leading-5 text-[var(--muted)]">Not cited in any tender answer yet.</p>}
        {item.lastUsedAt ? <p className="text-[11px] text-[var(--muted-subtle)]">Last cited <RelativeTime value={item.lastUsedAt} /></p> : null}
      </div>
    </TendyyCard>
  );
}

function VersionHistory({ item, owners }: { item: KnowledgeItem; owners: OwnerNames }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <TendyyCard>
      <TendyySectionHeader eyebrow="History" title="Version history" />
      <div className="mt-4 space-y-2">
        {item.versions?.length ? item.versions.map((version) => (
          <div key={version.id} className="tendyy-nested-surface p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-[var(--text)]">v{version.version}</p>
              <p className="text-[12px] text-[var(--muted)]">{formatDate(version.createdAt ?? version.date)}{version.createdBy ? ` · ${owners.name(version.createdBy)}` : ""}</p>
            </div>
            <p className="mt-1 text-[12px] text-[var(--text-soft)]">{version.note}</p>
            {version.snapshot ? (
              <button type="button" className="mt-2 text-[12px] font-semibold text-[var(--primary)]" onClick={() => setOpen(open === version.id ? null : version.id)}>
                {open === version.id ? "Hide content" : "Show what it said"}
              </button>
            ) : null}
            {open === version.id && version.snapshot ? (
              <div className="mt-2 space-y-1 rounded-[var(--radius-sm)] bg-[var(--surface-muted)] p-2 text-[12px] leading-5 text-[var(--text-soft)]">
                {version.snapshot.summary ? <p>{version.snapshot.summary}</p> : null}
                {(version.snapshot.claims ?? []).map((claim) => <p key={claim.id}><span className="font-semibold">{claim.label}:</span> {claim.value}</p>)}
              </div>
            ) : null}
          </div>
        )) : <p className="text-[13px] text-[var(--muted)]">No versions recorded yet.</p>}
      </div>
    </TendyyCard>
  );
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

function SourcesTable({ items, total, loading, pendingId, owners, onEdit, onApprove, onVerify, onArchive, footer }: {
  items: KnowledgeItem[];
  total: number;
  loading: boolean;
  pendingId: string | null;
  owners: OwnerNames;
  onEdit: (item: KnowledgeItem) => void;
  onApprove: (id: string) => void;
  onVerify: (id: string) => void;
  onArchive: (id: string) => void;
  footer?: React.ReactNode;
}) {
  return (
    <TendyyCard>
      <TendyySectionHeader eyebrow="Sources" title={`Source records (${total})`} />
      <div className="mt-4">{loading ? <TendyySkeletonRows count={5} /> : items.length ? (
        <TendyyTable minWidth={1020}>
          <thead className="tendyy-table-head"><tr><th className="px-4 py-3">Source</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Owner</th><th className="px-3 py-3">Verified</th><th className="px-3 py-3">Cited</th><th className="px-4 py-3">Actions</th></tr></thead>
          <tbody>{items.map((item) => {
            const busy = pendingId === item.id;
            return (
              <tr key={item.id} className="tendyy-table-row align-top">
                <td className="max-w-[360px] px-4 py-3">
                  <Link href={`/knowledge/${item.id}`} className="font-semibold text-[var(--text)] hover:text-[var(--primary)]">{item.name}</Link>
                  <p className="mt-1 line-clamp-2 text-[12px] text-[var(--muted)]">{item.summary || `${item.type} · ${item.category}`}</p>
                </td>
                <td className="px-3 py-3"><div className="flex flex-col items-start gap-1"><TendyyStatusBadge tone={toneFromStatus(item.status)}>{formatKnowledgeStatus(item.status)}</TendyyStatusBadge><ReviewBadge item={item} /></div></td>
                <td className="px-3 py-3 text-[var(--text-soft)]">{owners.name(item.ownerId)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-[var(--muted)]">{formatDate(item.lastVerified)}<p className="text-[11px] text-[var(--muted-subtle)]">Updated <RelativeTime value={item.updatedAt} /></p></td>
                <td className="px-3 py-3 text-[var(--text-soft)]">{item.usageCount ?? 0}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin text-[var(--primary)]" aria-label="Working" /> : null}
                    <Button type="button" variant="secondary" onClick={() => onEdit(item)} disabled={busy || item.status === "ARCHIVED"}>Edit</Button>
                    {item.status === "DRAFT" ? (
                      <Button type="button" variant="secondary" onClick={() => onApprove(item.id)} disabled={busy}><BadgeCheck className="h-4 w-4" />Approve</Button>
                    ) : (
                      <Button type="button" variant="secondary" onClick={() => onVerify(item.id)} disabled={busy || item.status === "ARCHIVED"}><ShieldCheck className="h-4 w-4" />Verify</Button>
                    )}
                    <Button type="button" variant="secondary" onClick={() => onArchive(item.id)} disabled={busy || item.status === "ARCHIVED"} aria-label={`Archive ${item.name}`}><Archive className="h-4 w-4" /></Button>
                  </div>
                </td>
              </tr>
            );
          })}</tbody>
        </TendyyTable>
      ) : <TendyyEmptyState title="No sources match" description="Upload a document or create a source by hand to build the knowledge layer." />}</div>
      {footer}
    </TendyyCard>
  );
}

function TemplatesTable({ items, total, loading, pendingId, onEdit, onApprove, onArchive, onDuplicate }: {
  items: ResponseTemplate[];
  total: number;
  loading: boolean;
  pendingId: string | null;
  onEdit: (item: ResponseTemplate) => void;
  onApprove: (id: string) => void;
  onArchive: (id: string) => void;
  onDuplicate: (id: string) => void;
}) {
  return (
    <TendyyCard>
      <TendyySectionHeader eyebrow="Templates" title={`Response templates (${total})`} />
      <div className="mt-4">{loading ? <TendyySkeletonRows count={5} /> : items.length ? (
        <TendyyTable minWidth={960}>
          <thead className="tendyy-table-head"><tr><th className="px-4 py-3">Template</th><th className="px-3 py-3">Category</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Used</th><th className="px-3 py-3">Updated</th><th className="px-4 py-3">Actions</th></tr></thead>
          <tbody>{items.map((item) => {
            const busy = pendingId === item.id;
            const uses = Number((item.usageMetadata as Record<string, unknown> | undefined)?.count ?? 0);
            return (
              <tr key={item.id} className="tendyy-table-row align-top">
                <td className="px-4 py-3"><button type="button" onClick={() => onEdit(item)} className="text-left font-semibold text-[var(--text)] hover:text-[var(--primary)]">{item.name}</button><p className="mt-1 line-clamp-2 text-[12px] text-[var(--muted)]">{item.description || item.sections[0]?.body}</p></td>
                <td className="px-3 py-3 text-[var(--text-soft)]">{item.category}</td>
                <td className="px-3 py-3"><TendyyStatusBadge tone={toneFromStatus(item.status)}>{formatStatus(item.status)}</TendyyStatusBadge></td>
                <td className="px-3 py-3 text-[var(--text-soft)]">{uses > 0 ? `${uses}×` : "Not yet"}</td>
                <td className="whitespace-nowrap px-3 py-3 text-[var(--muted)]"><RelativeTime value={item.updatedAt} /></td>
                <td className="px-4 py-3"><div className="flex flex-wrap items-center gap-2">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin text-[var(--primary)]" aria-label="Working" /> : null}
                  <Button type="button" variant="secondary" onClick={() => onEdit(item)} disabled={busy || item.status === "ARCHIVED"}>Edit</Button>
                  <Button type="button" variant="secondary" onClick={() => onDuplicate(item.id)} disabled={busy} aria-label={`Duplicate ${item.name}`}><Copy className="h-4 w-4" /></Button>
                  <Button type="button" variant="secondary" onClick={() => onApprove(item.id)} disabled={busy || item.status !== "DRAFT"}><CheckCircle2 className="h-4 w-4" />Activate</Button>
                  <Button type="button" variant="secondary" onClick={() => onArchive(item.id)} disabled={busy || item.status === "ARCHIVED"} aria-label={`Archive ${item.name}`}><Archive className="h-4 w-4" /></Button>
                </div></td>
              </tr>
            );
          })}</tbody>
        </TendyyTable>
      ) : <TendyyEmptyState title="No templates" description="Create a template to give drafted answers a consistent structure in one category." />}</div>
    </TendyyCard>
  );
}

function IssuesTable({ items, total, loading, pendingId, onResolve, footer }: {
  items: KnowledgeIssue[];
  total: number;
  loading: boolean;
  pendingId: string | null;
  onResolve: (id: string, action: KnowledgeIssueAction) => void;
  footer?: React.ReactNode;
}) {
  return (
    <TendyyCard>
      <TendyySectionHeader eyebrow="Queue" title={`Issue queue (${total})`} />
      <div className="mt-4">{loading ? <TendyySkeletonRows count={5} /> : items.length ? (
        <TendyyTable minWidth={960}>
          <thead className="tendyy-table-head"><tr><th className="px-4 py-3">Issue</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Source</th><th className="px-3 py-3">What to do</th><th className="px-4 py-3">Actions</th></tr></thead>
          <tbody>{items.map((item) => {
            const busy = pendingId === item.id;
            return (
              <tr key={item.id} className="tendyy-table-row align-top">
                <td className="px-4 py-3"><p className="font-semibold text-[var(--text)]">{item.title}</p><p className="mt-1 line-clamp-2 text-[12px] text-[var(--muted)]">{item.detail}</p></td>
                <td className="px-3 py-3"><TendyyStatusBadge tone={issueTone(item.type)}>{ISSUE_TYPES.find((option) => option.value === item.type)?.label ?? formatStatus(item.type)}</TendyyStatusBadge></td>
                <td className="px-3 py-3"><TextLink href={`/knowledge/${item.source.id}`}>{item.source.name}</TextLink></td>
                <td className="px-3 py-3 text-[var(--muted)]">{item.recommendedAction}</td>
                <td className="px-4 py-3"><div className="flex flex-wrap items-center gap-2">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin text-[var(--primary)]" aria-label="Working" /> : null}
                  {item.type === "DRAFT" ? <Button type="button" variant="secondary" disabled={busy} onClick={() => onResolve(item.id, "approve")}>Approve</Button> : null}
                  {item.type === "REVISION" ? <>
                    <Button type="button" variant="secondary" disabled={busy} onClick={() => onResolve(item.id, "apply_revision")}>Apply</Button>
                    <Button type="button" variant="secondary" disabled={busy} onClick={() => onResolve(item.id, "reject_revision")}>Reject</Button>
                  </> : null}
                  {["UNVERIFIED", "STALE", "EXPIRED", "EXPIRING_SOON"].includes(item.type) ? <Button type="button" variant="secondary" disabled={busy} onClick={() => onResolve(item.id, "verify")}>Verify</Button> : null}
                  {item.type === "CONFLICT" ? <Button type="button" variant="secondary" disabled={busy} onClick={() => onResolve(item.id, "resolve_conflict")}>Mark resolved</Button> : null}
                  {item.type !== "CONFLICT" && item.type !== "REVISION" ? <Button type="button" variant="secondary" disabled={busy} onClick={() => onResolve(item.id, "archive")} aria-label={`Archive ${item.source.name}`}><Archive className="h-4 w-4" /></Button> : null}
                </div></td>
              </tr>
            );
          })}</tbody>
        </TendyyTable>
      ) : <TendyyEmptyState title="Nothing to fix" description="Every live source is approved, verified and within date." />}</div>
      {footer}
    </TendyyCard>
  );
}

function KnowledgeListPanel({ title, items, total, loading, emptyTitle, emptyDescription, owners, hideLibraryLink = false, footer }: {
  title: string;
  items: KnowledgeItem[];
  total: number;
  loading: boolean;
  emptyTitle: string;
  emptyDescription: string;
  owners: OwnerNames;
  hideLibraryLink?: boolean;
  footer?: React.ReactNode;
}) {
  return (
    <TendyyCard>
      <TendyySectionHeader eyebrow="Library" title={`${title} (${total})`} actionHref={hideLibraryLink ? undefined : "/knowledge/library"} actionLabel={hideLibraryLink ? undefined : "Open library"} />
      <div className="mt-4">
        {loading ? <TendyySkeletonRows count={5} /> : items.length ? (
          <TendyyTable minWidth={880}>
            <thead className="tendyy-table-head"><tr><th className="px-4 py-3">Knowledge</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Owner</th><th className="px-3 py-3">Verified</th><th className="px-3 py-3">Updated</th></tr></thead>
            <tbody>{items.map((item) => (
              <tr key={item.id} className="tendyy-table-row align-top">
                <td className="max-w-[360px] px-4 py-3"><Link href={`/knowledge/${item.id}`} className="font-semibold text-[var(--text)] hover:text-[var(--primary)]">{item.name}</Link><p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[var(--muted)]">{item.summary || `${item.type} · ${item.category}`}</p></td>
                <td className="px-3 py-3"><div className="flex flex-col items-start gap-1"><TendyyStatusBadge tone={toneFromStatus(item.status)}>{formatKnowledgeStatus(item.status)}</TendyyStatusBadge><ReviewBadge item={item} /></div></td>
                <td className="px-3 py-3 text-[var(--text-soft)]">{owners.name(item.ownerId)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-[var(--muted)]">{formatDate(item.lastVerified)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-[var(--muted)]"><RelativeTime value={item.updatedAt} /></td>
              </tr>
            ))}</tbody>
          </TendyyTable>
        ) : <TendyyEmptyState title={emptyTitle} description={emptyDescription} />}
      </div>
      {footer}
    </TendyyCard>
  );
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------

function SourceSheet({ open, item, onClose }: { open: boolean; item?: KnowledgeItem | null; onClose: () => void }) {
  const create = useCreateKnowledgeSource();
  const update = useUpdateKnowledgeSource();
  const [form, setForm] = useState<SourceFormState>(() => sourceFormFromItem(item));
  useEffect(() => setForm(sourceFormFromItem(item)), [item, open]);
  const submitting = create.isPending || update.isPending;
  const error = create.error ?? update.error;
  const live = item?.status === "ACTIVE";
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const body = sourceBody(form);
    if (item) update.mutate({ id: item.id, body }, { onSuccess: onClose });
    else create.mutate(body, { onSuccess: onClose });
  };
  const setClaim = (index: number, patch: Partial<SourceFormState["claims"][number]>) =>
    setForm({ ...form, claims: form.claims.map((claim, i) => (i === index ? { ...claim, ...patch } : claim)) });
  return (
    <TendyySheet open={open} title={item ? "Edit source" : "New source"} onClose={onClose} footer={<Button type="submit" form="source-form" disabled={submitting}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{item ? (live ? "Save" : "Save source") : "Create draft"}</Button>}>
      <form id="source-form" onSubmit={onSubmit} className="space-y-3">
        {live ? (
          <p className="rounded-[var(--radius-sm)] bg-[var(--surface-muted)] p-2.5 text-[12px] leading-5 text-[var(--text-soft)]">
            This source is live. Owner, category and dates save immediately. Changes to the name, summary, authority or claims are saved as a revision for review, and tenders keep using the approved version until then.
          </p>
        ) : null}
        {error ? <p role="alert" className="rounded-[var(--radius-sm)] bg-[rgba(180,35,24,0.07)] p-2.5 text-[12px] text-[var(--danger,#b42318)]">{errorMessage(error, "Could not save.")}</p> : null}
        <TendyyField label="Name" required><input className={tendyyInputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></TendyyField>
        <div className="grid gap-3 sm:grid-cols-2">
          <TendyyField label="Type" required><input className={tendyyInputClass} value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} required /></TendyyField>
          <TendyyField label="Category"><select className={tendyyInputClass} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></TendyyField>
          <TendyyField label="Authority"><select className={tendyyInputClass} value={form.authority} onChange={(event) => setForm({ ...form, authority: event.target.value as SourceFormState["authority"] })}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></TendyyField>
          <TendyyField label="Expires" hint="Drafting stops using it after this date."><input type="date" className={tendyyInputClass} value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} /></TendyyField>
        </div>
        <TendyyField label="Summary"><textarea className={tendyyInputClass} rows={4} value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} /></TendyyField>
        <div>
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-[var(--text)]">Claims</p>
            <button type="button" className="text-[12px] font-semibold text-[var(--primary)]" onClick={() => setForm({ ...form, claims: [...form.claims, { label: "", value: "", confidence: 0.9 }] })}>+ Add claim</button>
          </div>
          <p className="mt-0.5 text-[12px] text-[var(--muted)]">Short facts answers can cite, such as &quot;RPO: 4 hours&quot;.</p>
          <div className="mt-2 space-y-2">
            {form.claims.map((claim, index) => (
              <div key={claim.id ?? `new-${index}`} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto] gap-2">
                <input className={tendyyInputClass} placeholder="Label" aria-label="Claim label" value={claim.label} onChange={(event) => setClaim(index, { label: event.target.value })} />
                <input className={tendyyInputClass} placeholder="Value" aria-label="Claim value" value={claim.value} onChange={(event) => setClaim(index, { value: event.target.value })} />
                <button type="button" aria-label="Remove claim" className="rounded px-2 text-[var(--muted)] hover:text-[var(--text)]" onClick={() => setForm({ ...form, claims: form.claims.filter((_, i) => i !== index) })}><X className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        </div>
      </form>
    </TendyySheet>
  );
}

function TemplateSheet({ open, item, onClose }: { open: boolean; item?: ResponseTemplate | null; onClose: () => void }) {
  const create = useCreateResponseTemplate();
  const update = useUpdateResponseTemplate();
  const [form, setForm] = useState<TemplateFormState>(() => templateFormFromItem(item));
  useEffect(() => setForm(templateFormFromItem(item)), [item, open]);
  const submitting = create.isPending || update.isPending;
  const error = create.error ?? update.error;
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const body = templateBody(form);
    if (item) update.mutate({ id: item.id, body }, { onSuccess: onClose });
    else create.mutate(body, { onSuccess: onClose });
  };
  return (
    <TendyySheet open={open} title={item ? "Edit template" : "New template"} onClose={onClose} footer={<Button type="submit" form="template-form" disabled={submitting}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{item ? "Save template" : "Create template"}</Button>}>
      <form id="template-form" onSubmit={onSubmit} className="space-y-3">
        {item?.status === "ACTIVE" ? <p className="rounded-[var(--radius-sm)] bg-[var(--surface-muted)] p-2.5 text-[12px] leading-5 text-[var(--text-soft)]">Changing the sections or variables moves this template back to draft until it is activated again.</p> : null}
        {error ? <p role="alert" className="rounded-[var(--radius-sm)] bg-[rgba(180,35,24,0.07)] p-2.5 text-[12px] text-[var(--danger,#b42318)]">{errorMessage(error, "Could not save.")}</p> : null}
        <TendyyField label="Name" required><input className={tendyyInputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></TendyyField>
        <TendyyField label="Category" hint="Used for requirements in this category."><select className={tendyyInputClass} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></TendyyField>
        <TendyyField label="Description"><textarea className={tendyyInputClass} rows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></TendyyField>
        <TendyyField label="Section title" required><input className={tendyyInputClass} value={form.sectionTitle} onChange={(event) => setForm({ ...form, sectionTitle: event.target.value })} required /></TendyyField>
        <TendyyField label="Section body" required hint="The structure and tone to follow. Facts are still taken only from approved knowledge."><textarea className={tendyyInputClass} rows={7} value={form.sectionBody} onChange={(event) => setForm({ ...form, sectionBody: event.target.value })} required /></TendyyField>
        <TendyyField label="Variables" hint="Comma-separated keys, e.g. company_name, product_name."><input className={tendyyInputClass} value={form.variables} onChange={(event) => setForm({ ...form, variables: event.target.value })} /></TendyyField>
      </form>
    </TendyySheet>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

type OwnerNames = { name: (id: string | null | undefined) => string };

/** Member id → display name, from the org member list the app already caches. */
function useOwnerNames(): OwnerNames {
  const members = useOrganizationMembers();
  return useMemo(() => {
    const byId = new Map((members.data?.members ?? []).map((member) => [member.userId, member.name || member.email]));
    return { name: (id) => (id ? byId.get(id) ?? "Former member" : "Unassigned") };
  }, [members.data]);
}

/** "Updated 12s ago" plus a manual refresh, so the page never looks silently frozen. */
function RefreshIndicator({ updatedAt, fetching, onRefresh }: { updatedAt: number; fetching: boolean; onRefresh: () => void }) {
  useNow(10_000);
  return (
    <button
      type="button"
      onClick={onRefresh}
      className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-sm)] px-2 text-[12px] text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
      aria-label="Refresh"
      title="Refresh now"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${fetching ? "animate-spin" : ""}`} />
      {updatedAt ? `Updated ${relativeTime(new Date(updatedAt).toISOString())}` : "Loading"}
    </button>
  );
}

function RelativeTime({ value, className }: { value: string | null | undefined; className?: string }) {
  useNow(30_000);
  if (!value) return null;
  return <time dateTime={value} title={new Date(value).toLocaleString()} className={className}>{relativeTime(value)}</time>;
}

function ReviewBadge({ item }: { item: Pick<KnowledgeItem, "status" | "reviewState" | "daysUntilExpiry"> }) {
  if (item.status !== "ACTIVE" || !item.reviewState) return null;
  const map: Record<KnowledgeReviewState, { tone: TendyyTone; label: string }> = {
    fresh: { tone: "success", label: "Current" },
    unverified: { tone: "warning", label: "Never verified" },
    stale: { tone: "danger", label: "Stale" },
    expiring: { tone: "warning", label: item.daysUntilExpiry !== null && item.daysUntilExpiry !== undefined ? `Expires in ${item.daysUntilExpiry}d` : "Expiring" },
    expired: { tone: "danger", label: "Expired" },
  };
  const entry = map[item.reviewState];
  return <TendyyStatusBadge tone={entry.tone}>{entry.label}</TendyyStatusBadge>;
}

function Callout({ tone, title, children }: { tone: "warning" | "danger"; title: string; children: React.ReactNode }) {
  const color = tone === "danger" ? "border-[rgba(180,35,24,0.3)] bg-[rgba(180,35,24,0.05)]" : "border-[rgba(181,71,8,0.3)] bg-[rgba(181,71,8,0.05)]";
  return (
    <div className={`flex gap-3 rounded-[var(--radius-md)] border p-3 ${color}`} role="status">
      <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${tone === "danger" ? "text-[var(--danger,#b42318)]" : "text-[var(--warning,#b54708)]"}`} aria-hidden />
      <div><p className="text-[13px] font-semibold text-[var(--text)]">{title}</p><p className="mt-0.5 text-[12px] leading-5 text-[var(--text-soft)]">{children}</p></div>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="flex h-10 items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-3 text-[var(--muted)] focus-within:border-[var(--primary)]">
      <Search className="h-4 w-4" aria-hidden />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--muted-subtle)]" />
    </label>
  );
}

function SortSelect({ value, onChange }: { value: KnowledgeSort; onChange: (value: KnowledgeSort) => void }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value as KnowledgeSort)} className={tendyyInputClass} aria-label="Sort">
      <option value="updatedAt:desc">Recently updated</option>
      <option value="lastVerified:asc">Least recently verified</option>
      <option value="usage:desc">Most cited</option>
      <option value="lastUsed:desc">Recently cited</option>
      <option value="name:asc">Name A–Z</option>
    </select>
  );
}

function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-[12px] text-[var(--muted)]">
      <span>{(page - 1) * pageSize + 1}–{Math.min(total, page * pageSize)} of {total}</span>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <Button type="button" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}

function HealthTile({ label, value, total, tone, href }: { label: string; value: number; total: number; tone: "success" | "warning" | "danger" | "neutral"; href: string }) {
  const percent = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <Link href={href} className="tendyy-nested-surface block p-3 hover:border-[var(--primary)]">
      <div className="flex items-center justify-between gap-3"><p className="text-[13px] font-semibold text-[var(--text)]">{label}</p>{value > 0 ? <TendyyStatusBadge tone={tone}>{percent}%</TendyyStatusBadge> : null}</div>
      <p className="mt-2 text-[24px] font-semibold text-[var(--text)]">{value}</p>
      <div className="mt-2 h-1.5 rounded-full bg-[var(--border)]"><div className={`h-1.5 rounded-full ${value > 0 ? "bg-[var(--primary)]" : ""}`} style={{ width: `${percent}%` }} /></div>
    </Link>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-3 rounded-[var(--radius-sm)] bg-[var(--surface-muted)] px-3 py-2"><dt className="text-[12px] text-[var(--muted)]">{label}</dt><dd className="text-right text-[12px] font-semibold text-[var(--text)]">{value}</dd></div>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The id a row-level mutation is working on, so only that row shows as busy. */
function pendingKey(mutation: { isPending: boolean; variables?: unknown }): string | null {
  if (!mutation.isPending) return null;
  const variables = mutation.variables;
  if (typeof variables === "string") return variables;
  if (variables && typeof variables === "object" && "id" in variables) return String((variables as { id: unknown }).id);
  return null;
}

function documentFor(item: KnowledgeItem, claim: KnowledgeClaim) {
  return claim.documentId ? item.documents?.find((document) => document.id === claim.documentId) : undefined;
}

function attentionReason(item: KnowledgeItem): string {
  switch (item.reviewState) {
    case "expired":
      return `Expired ${formatDate(item.expiresAt)}`;
    case "expiring":
      return `Expires ${formatDate(item.expiresAt)}`;
    case "stale":
      return `Last verified ${formatDate(item.lastVerified)}`;
    case "unverified":
      return "Never verified";
    default:
      return item.status === "DRAFT" ? "Awaiting approval" : "Needs review";
  }
}

function reviewStateHeadline(state: KnowledgeReviewState): string {
  switch (state) {
    case "expired":
      return "Expired: skipped when drafting answers";
    case "stale":
      return "Stale: skipped when drafting answers";
    case "expiring":
      return "Expiring soon";
    case "unverified":
      return "Never verified";
    default:
      return "Current";
  }
}

function reviewStateExplanation(item: KnowledgeItem): string {
  switch (item.reviewState) {
    case "expired":
      return `It passed its expiry date (${formatDate(item.expiresAt)}). Confirm it is still accurate and mark it verified with a new expiry, or archive it.`;
    case "stale":
      return `It was last verified ${formatDate(item.lastVerified)}, more than 180 days ago. Confirm it is still accurate and mark it verified.`;
    case "expiring":
      return `It expires ${formatDate(item.expiresAt)}. Verify it before then to keep it in use.`;
    case "unverified":
      return "It is in use, but nobody has confirmed it is accurate. Mark it verified once the owner has checked it.";
    default:
      return "";
  }
}

function issueTone(type: KnowledgeIssue["type"]): TendyyTone {
  if (type === "EXPIRED" || type === "STALE") return "danger";
  if (type === "DRAFT" || type === "REVISION") return "primary";
  return "warning";
}

function sourceFormFromItem(item?: KnowledgeItem | null): SourceFormState {
  if (!item) return emptySourceForm;
  return {
    name: item.name,
    type: item.type,
    category: item.category,
    authority: item.authority as SourceFormState["authority"],
    sourceKind: String(item.metadata?.sourceKind ?? item.metadata?.source ?? "manual"),
    summary: item.summary,
    lastVerified: item.lastVerified ?? "",
    expiresAt: item.expiresAt ?? "",
    claims: (item.claims ?? []).map((claim) => ({ id: claim.id, label: claim.label, value: claim.value, confidence: claim.confidence })),
  };
}

function sourceBody(form: SourceFormState) {
  return {
    name: form.name,
    type: form.type,
    category: form.category,
    authority: form.authority,
    sourceKind: form.sourceKind,
    summary: form.summary,
    expiresAt: clean(form.expiresAt) ?? null,
    // Existing claims carry their id so the server updates them in place and
    // tender citations of them stay valid.
    claims: form.claims
      .filter((claim) => claim.label.trim() && claim.value.trim())
      .map((claim) => ({ ...(claim.id ? { id: claim.id } : {}), label: claim.label.trim(), value: claim.value.trim(), confidence: claim.confidence })),
  };
}

function templateFormFromItem(item?: ResponseTemplate | null): TemplateFormState {
  if (!item) return emptyTemplateForm;
  return { name: item.name, category: item.category, description: item.description, sectionTitle: item.sections[0]?.title ?? "Answer", sectionBody: item.sections[0]?.body ?? "", variables: item.variables.map((variable) => variable.key).join(", ") };
}

function templateBody(form: TemplateFormState) {
  const variables = form.variables.split(",").map((value) => value.trim()).filter(Boolean).map((key) => ({ key, label: formatStatus(key), required: false }));
  return { name: form.name, category: form.category, description: form.description, sections: [{ title: form.sectionTitle, body: form.sectionBody }], variables };
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Never" : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatPercent(value: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function formatStatus(value: string) {
  return value.replace(/[_-]+/g, " ").toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatKnowledgeStatus(status: string) {
  if (status === "ACTIVE") return "Approved";
  return formatStatus(status);
}

function relativeTime(value: string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 45) return `${days}d ago`;
  return formatDate(value);
}

function plural(count: number) {
  return count === 1 ? "" : "s";
}

function clean(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}
