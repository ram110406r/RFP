"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import {
  AlertTriangle,
  Archive,
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  Copy,
  FileText,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Wrench,
} from "lucide-react";

import { Button } from "@rfp-os/ui";

import { AppShell } from "./app-shell";
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
} from "./tendyy-ui";
import { ApiError } from "../lib/api";
import type { KnowledgeItem, KnowledgeIssue, ResponseTemplate } from "../lib/models";
import {
  useActivities,
  useApproveKnowledgeSource,
  useApproveResponseTemplate,
  useArchiveKnowledge,
  useArchiveKnowledgeSource,
  useArchiveResponseTemplate,
  useCreateKnowledgeSource,
  useCreateResponseTemplate,
  useDuplicateResponseTemplate,
  useKnowledgeIssues,
  useKnowledgeItem,
  useKnowledgeList,
  useKnowledgeSources,
  useKnowledgeSummary,
  useResolveKnowledgeIssue,
  useResponseTemplates,
  useUpdateKnowledgeSource,
  useUpdateResponseTemplate,
  useVerifyKnowledgeSource,
} from "../lib/queries";

const CATEGORIES = ["Security", "Commercial", "Compliance", "Product", "Legal", "Architecture", "Support"];
const PAGE_SIZE = 25;

type SourceFormState = {
  name: string;
  type: string;
  category: string;
  authority: "high" | "medium" | "low";
  sourceKind: string;
  version: string;
  summary: string;
  lastVerified: string;
  expiresAt: string;
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
  type: "Manual Source",
  category: "Security",
  authority: "medium",
  sourceKind: "manual",
  version: "1.0",
  summary: "",
  lastVerified: "",
  expiresAt: "",
};

const emptyTemplateForm: TemplateFormState = {
  name: "",
  category: "Security",
  description: "",
  sectionTitle: "Answer",
  sectionBody: "",
  variables: "company_name, product_name",
};

export function KnowledgeOverviewPage() {
  const summaryQuery = useKnowledgeSummary();
  const listQuery = useKnowledgeList({ page: 1, pageSize: PAGE_SIZE });
  const templatesQuery = useResponseTemplates({ status: "ALL", page: 1, pageSize: 5 });
  const activityQuery = useActivities({ entityType: "knowledge_source", q: "knowledge" });
  const summary = summaryQuery.data ?? null;
  const items = listQuery.data?.items ?? summary?.items ?? [];
  const counts = summary?.counts ?? buildCounts(items);
  const loading = summaryQuery.isLoading || listQuery.isLoading;
  const issueCount = (counts.draft ?? 0) + (counts.stale ?? 0) + (counts.expired ?? 0) + (counts.expiring ?? 0) + (counts.conflicts ?? 0);

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Knowledge" }]}>
      <div className="min-w-0 space-y-5 pb-8">
        <TendyyPageHeader
          eyebrow="Knowledge"
          title="Knowledge"
          description="Manage source-backed facts, response templates, and remediation queues used across RFP workflows."
          actions={
            <>
              <Button asChild variant="secondary"><Link href="/knowledge/issues"><Wrench className="h-4 w-4" />Issues</Link></Button>
              <Button asChild variant="secondary"><Link href="/templates"><FileText className="h-4 w-4" />Templates</Link></Button>
              <Button asChild><Link href="/knowledge/sources"><BookOpen className="h-4 w-4" />Sources</Link></Button>
            </>
          }
        />

        {summaryQuery.isError || listQuery.isError ? (
          <TendyyErrorState
            title="Unable to load knowledge"
            message={errorMessage(summaryQuery.error ?? listQuery.error, "The knowledge service did not return data.")}
            onRetry={() => {
              void summaryQuery.refetch();
              void listQuery.refetch();
            }}
          />
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Knowledge health metrics">
          <TendyyMetricCard label="Total sources" value={counts.total} detail="Source records in this workspace" icon={<BookOpen className="h-5 w-5" />} loading={loading} />
          <TendyyMetricCard label="Verified" value={counts.active} detail={formatPercent(counts.active, counts.total)} icon={<ShieldCheck className="h-5 w-5" />} loading={loading} tone="success" />
          <TendyyMetricCard label="Templates" value={counts.templates ?? templatesQuery.data?.total ?? 0} detail="Reusable answer structures" icon={<FileText className="h-5 w-5" />} loading={loading || templatesQuery.isLoading} tone="primary" />
          <TendyyMetricCard label="Open issues" value={issueCount} detail="Lifecycle and conflict work" icon={<AlertTriangle className="h-5 w-5" />} loading={loading} tone={issueCount > 0 ? "warning" : "neutral"} />
        </section>

        <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]">
          <TendyyCard>
            <TendyySectionHeader eyebrow="Knowledge health" title="Lifecycle and governance" actionHref="/knowledge/issues" actionLabel="View issues" />
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <HealthTile label="Draft" value={counts.draft} total={counts.total} tone="warning" />
              <HealthTile label="Stale" value={counts.stale} total={counts.total} tone="danger" />
              <HealthTile label="Expired" value={counts.expired ?? 0} total={counts.total} tone="danger" />
              <HealthTile label="Conflicts" value={counts.conflicts ?? 0} total={Math.max(1, counts.total)} tone="warning" />
            </div>
          </TendyyCard>

          <TendyyCard>
            <TendyySectionHeader eyebrow="Activity" title="Recent knowledge activity" actionHref="/notifications" actionLabel="View all" />
            <div className="mt-4 space-y-2">
              {activityQuery.isLoading ? <TendyySkeletonRows count={4} /> : (activityQuery.data?.items ?? []).length > 0 ? (
                (activityQuery.data?.items ?? []).slice(0, 5).map((item) => (
                  <div key={item.id} className="tendyy-nested-surface p-3">
                    <p className="truncate text-[13px] font-semibold text-[var(--text)]">{item.label || item.summary}</p>
                    <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[var(--muted)]">{item.summary || "Knowledge activity recorded."}</p>
                    <p className="mt-1 text-[11px] text-[var(--muted-subtle)]">{relativeTime(item.createdAt)}</p>
                  </div>
                ))
              ) : (
                <TendyyEmptyState title="No knowledge activity" description="Knowledge lifecycle events will appear here after sources, templates, or approvals change." />
              )}
            </div>
          </TendyyCard>
        </section>

        <KnowledgeListPanel title="Recent sources" items={items.slice(0, 8)} loading={loading} emptyTitle="No source records yet" />
      </div>
    </AppShell>
  );
}

export function KnowledgeLibraryPage() {
  const [search, setSearch] = useState("");
  const listQuery = useKnowledgeList({ page: 1, pageSize: 100, search: clean(search) });
  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Knowledge", href: "/knowledge" }, { label: "Library" }]}>
      <div className="min-w-0 space-y-5 pb-8">
        <TendyyPageHeader eyebrow="Knowledge" title="Knowledge library" description="Browse verified claims, reusable facts, and source-backed company knowledge." />
        <SearchBox value={search} onChange={setSearch} placeholder="Search knowledge records" />
        {listQuery.isError ? <TendyyErrorState message={errorMessage(listQuery.error, "Unable to load knowledge library.")} onRetry={() => void listQuery.refetch()} /> : null}
        <KnowledgeListPanel title="Knowledge library" items={listQuery.data?.items ?? []} loading={listQuery.isLoading} emptyTitle="No knowledge records" />
      </div>
    </AppShell>
  );
}

export function SourcesPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [editing, setEditing] = useState<KnowledgeItem | null>(null);
  const [creating, setCreating] = useState(false);
  const query = useKnowledgeSources({ page: 1, pageSize: 100, search: clean(search), status: status === "ALL" ? null : status });
  const approve = useApproveKnowledgeSource();
  const archive = useArchiveKnowledgeSource();
  const verify = useVerifyKnowledgeSource();

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Knowledge", href: "/knowledge" }, { label: "Sources" }]}>
      <div className="min-w-0 space-y-5 pb-8">
        <TendyyPageHeader eyebrow="Source layer" title="Sources" description="Create, verify, approve, and archive manual source records that power company knowledge." actions={<Button type="button" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New source</Button>} />
        <TendyyCard>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
            <SearchBox value={search} onChange={setSearch} placeholder="Search sources" bare />
            <select value={status} onChange={(event) => setStatus(event.target.value)} className={tendyyInputClass} aria-label="Source status">
              <option value="ALL">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Verified</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>
        </TendyyCard>
        {query.isError ? <TendyyErrorState message={errorMessage(query.error, "Unable to load sources.")} onRetry={() => void query.refetch()} /> : null}
        <SourcesTable
          items={query.data?.items ?? []}
          loading={query.isLoading}
          onEdit={setEditing}
          onApprove={(id) => approve.mutate(id)}
          onVerify={(id) => verify.mutate({ id, note: "Verified from source list." })}
          onArchive={(id) => archive.mutate(id)}
          busy={approve.isPending || verify.isPending || archive.isPending}
        />
        <SourceSheet key={creating ? "new-source" : "closed-source"} open={creating} onClose={() => setCreating(false)} />
        <SourceSheet key={editing?.id ?? "no-edit-source"} item={editing} open={Boolean(editing)} onClose={() => setEditing(null)} />
      </div>
    </AppShell>
  );
}

export function ResponseTemplatesPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"ALL" | "DRAFT" | "ACTIVE" | "ARCHIVED">("ALL");
  const [editing, setEditing] = useState<ResponseTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const query = useResponseTemplates({ page: 1, pageSize: 100, search: clean(search), status });
  const approve = useApproveResponseTemplate();
  const archive = useArchiveResponseTemplate();
  const duplicate = useDuplicateResponseTemplate();

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Knowledge", href: "/knowledge" }, { label: "Templates" }]}>
      <div className="min-w-0 space-y-5 pb-8">
        <TendyyPageHeader eyebrow="Reusable knowledge" title="Response templates" description="Manage first-class answer templates with sections, variables, ownership, and lifecycle state." actions={<Button type="button" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New template</Button>} />
        <TendyyCard>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
            <SearchBox value={search} onChange={setSearch} placeholder="Search templates" bare />
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
          loading={query.isLoading}
          onEdit={setEditing}
          onApprove={(id) => approve.mutate(id)}
          onArchive={(id) => archive.mutate(id)}
          onDuplicate={(id) => duplicate.mutate(id)}
          busy={approve.isPending || archive.isPending || duplicate.isPending}
        />
        <TemplateSheet key={creating ? "new-template" : "closed-template"} open={creating} onClose={() => setCreating(false)} />
        <TemplateSheet key={editing?.id ?? "no-edit-template"} item={editing} open={Boolean(editing)} onClose={() => setEditing(null)} />
      </div>
    </AppShell>
  );
}

export function KnowledgeIssuesPage() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("ALL");
  const query = useKnowledgeIssues({ page: 1, pageSize: 100, search: clean(search), type: type === "ALL" ? undefined : type, status: "OPEN" });
  const resolve = useResolveKnowledgeIssue();

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Knowledge", href: "/knowledge" }, { label: "Issues" }]}>
      <div className="min-w-0 space-y-5 pb-8">
        <TendyyPageHeader eyebrow="Knowledge" title="Knowledge issues" description="Resolve draft, stale, expired, expiring, and conflicting knowledge records." />
        <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <TendyyMetricCard label="Open" value={query.data?.counts.total ?? 0} icon={<Wrench className="h-5 w-5" />} loading={query.isLoading} />
          <TendyyMetricCard label="Draft" value={query.data?.counts.draft ?? 0} tone="warning" loading={query.isLoading} />
          <TendyyMetricCard label="Stale" value={query.data?.counts.stale ?? 0} tone="danger" loading={query.isLoading} />
          <TendyyMetricCard label="Expired" value={query.data?.counts.expired ?? 0} tone="danger" loading={query.isLoading} />
          <TendyyMetricCard label="Expiring" value={query.data?.counts.expiring_soon ?? 0} tone="warning" loading={query.isLoading} />
          <TendyyMetricCard label="Conflicts" value={query.data?.counts.conflict ?? 0} tone="warning" loading={query.isLoading} />
        </section>
        <TendyyCard>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_190px]">
            <SearchBox value={search} onChange={setSearch} placeholder="Search issues" bare />
            <select value={type} onChange={(event) => setType(event.target.value)} className={tendyyInputClass} aria-label="Issue type">
              <option value="ALL">All issue types</option>
              <option value="DRAFT">Draft</option>
              <option value="STALE">Stale</option>
              <option value="EXPIRED">Expired</option>
              <option value="EXPIRING_SOON">Expiring soon</option>
              <option value="CONFLICT">Conflict</option>
            </select>
          </div>
        </TendyyCard>
        {query.isError ? <TendyyErrorState message={errorMessage(query.error, "Unable to load knowledge issues.")} onRetry={() => void query.refetch()} /> : null}
        <IssuesTable items={query.data?.items ?? []} loading={query.isLoading} busy={resolve.isPending} onResolve={(id, action) => resolve.mutate({ id, action, note: "Resolved from issue queue." })} />
      </div>
    </AppShell>
  );
}

export function KnowledgeDetailPage({ knowledgeId }: { knowledgeId: string }) {
  const itemQuery = useKnowledgeItem(knowledgeId);
  const approve = useApproveKnowledgeSource();
  const archive = useArchiveKnowledge();
  const verify = useVerifyKnowledgeSource();
  const item = itemQuery.data ?? null;

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Knowledge", href: "/knowledge" }, { label: item?.name ?? "Knowledge detail" }]}>
      <div className="min-w-0 space-y-5 pb-8">
        {itemQuery.isLoading ? <TendyySkeletonRows count={3} /> : itemQuery.isError ? (
          <TendyyErrorState message={errorMessage(itemQuery.error, "Unable to load this knowledge record.")} onRetry={() => void itemQuery.refetch()} />
        ) : item ? (
          <>
            <TendyyPageHeader
              eyebrow="Knowledge detail"
              title={item.name}
              description={item.summary || "No summary has been provided for this knowledge record."}
              badge={<TendyyStatusBadge tone={toneFromStatus(item.status)}>{formatKnowledgeStatus(item.status)}</TendyyStatusBadge>}
              actions={
                <>
                  <Button type="button" variant="secondary" onClick={() => verify.mutate({ id: item.id, note: "Verified from detail view." })} disabled={verify.isPending || item.status === "ARCHIVED"}><RefreshCw className="h-4 w-4" />Verify</Button>
                  <Button type="button" variant="secondary" onClick={() => approve.mutate(item.id)} disabled={approve.isPending || item.status === "ACTIVE"}><BadgeCheck className="h-4 w-4" />Approve</Button>
                  <Button type="button" variant="secondary" onClick={() => archive.mutate(item.id)} disabled={archive.isPending || item.status === "ARCHIVED"}><Archive className="h-4 w-4" />Archive</Button>
                </>
              }
            />
            <section className="grid min-w-0 gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
              <TendyyCard>
                <TendyySectionHeader eyebrow="Metadata" title="Record details" />
                <dl className="mt-4 space-y-2">
                  <InfoRow label="Type" value={item.type} />
                  <InfoRow label="Category" value={item.category} />
                  <InfoRow label="Authority" value={formatStatus(item.authority)} />
                  <InfoRow label="Source kind" value={String(item.metadata?.sourceKind ?? item.metadata?.source ?? "manual")} />
                  <InfoRow label="Owner" value={shortLabel(item.ownerId)} />
                  <InfoRow label="Version" value={item.version || "Not set"} />
                  <InfoRow label="Last verified" value={formatDate(item.lastVerified)} />
                  <InfoRow label="Expires" value={formatDate(item.expiresAt)} />
                </dl>
              </TendyyCard>
              <div className="min-w-0 space-y-5">
                <TendyyCard><TendyySectionHeader eyebrow="Knowledge" title="Summary" /><p className="mt-4 text-[14px] leading-7 text-[var(--text-soft)]">{item.summary || "No summary is stored for this record."}</p></TendyyCard>
                <TendyyCard>
                  <TendyySectionHeader eyebrow="Claims" title="Extracted claims" />
                  <div className="mt-4 space-y-2">
                    {item.claims?.length ? item.claims.map((claim) => (
                      <div key={claim.id ?? claim.label} className="tendyy-nested-surface p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div><p className="text-[13px] font-semibold text-[var(--text)]">{claim.label}</p><p className="mt-1 text-[13px] leading-6 text-[var(--muted)]">{claim.value}</p></div>
                          <TendyyStatusBadge tone="primary">{Math.round(claim.confidence * 100)}%</TendyyStatusBadge>
                        </div>
                      </div>
                    )) : <TendyyEmptyState title="No claims exposed" description="This source does not include claim-level data." />}
                  </div>
                </TendyyCard>
                <TendyyCard>
                  <TendyySectionHeader eyebrow="Conflicts" title="Conflict state" />
                  <div className="mt-4 space-y-2">
                    {item.conflicts?.length ? item.conflicts.map((conflict) => (
                      <div key={conflict.id} className="tendyy-nested-surface p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div><p className="text-[13px] font-semibold text-[var(--text)]">{conflict.topic}</p><p className="mt-1 text-[13px] leading-6 text-[var(--muted)]">{conflict.action || conflict.recommended}</p></div>
                          <TendyyStatusBadge tone={conflict.status === "RESOLVED" ? "success" : "warning"}>{formatStatus(conflict.status)}</TendyyStatusBadge>
                        </div>
                      </div>
                    )) : <TendyyEmptyState title="No conflicts" description="No unresolved or historical conflicts are attached to this source." />}
                  </div>
                </TendyyCard>
                <TendyyCard>
                  <TendyySectionHeader eyebrow="History" title="Version history" />
                  <div className="mt-4 space-y-2">
                    {item.versions?.length ? item.versions.map((version) => <div key={version.id} className="tendyy-nested-surface p-3"><p className="text-[13px] font-semibold text-[var(--text)]">{version.version}</p><p className="mt-1 text-[12px] text-[var(--muted)]">{formatDate(version.date)} - {version.note}</p></div>) : <TendyyEmptyState title="No version history" description="Version rows will appear after source changes." />}
                  </div>
                </TendyyCard>
              </div>
            </section>
          </>
        ) : (
          <TendyyEmptyState title="Knowledge record not found" description="The requested knowledge item was not returned by the API." actionHref="/knowledge" actionLabel="Back to knowledge" />
        )}
      </div>
    </AppShell>
  );
}

function SourcesTable({ items, loading, busy, onEdit, onApprove, onVerify, onArchive }: { items: KnowledgeItem[]; loading: boolean; busy: boolean; onEdit: (item: KnowledgeItem) => void; onApprove: (id: string) => void; onVerify: (id: string) => void; onArchive: (id: string) => void }) {
  return (
    <TendyyCard>
      <TendyySectionHeader eyebrow="Sources" title={`Source records (${items.length})`} />
      <div className="mt-4">{loading ? <TendyySkeletonRows count={5} /> : items.length ? (
        <TendyyTable minWidth={920}>
          <thead className="tendyy-table-head"><tr><th className="px-4 py-3">Source</th><th className="px-3 py-3">Category</th><th className="px-3 py-3">Authority</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Verified</th><th className="px-4 py-3">Actions</th></tr></thead>
          <tbody>{items.map((item) => <tr key={item.id} className="tendyy-table-row align-top"><td className="px-4 py-3"><Link href={`/knowledge/${item.id}`} className="font-semibold text-[var(--text)] hover:text-[var(--primary)]">{item.name}</Link><p className="mt-1 line-clamp-2 text-[12px] text-[var(--muted)]">{item.summary || item.type}</p></td><td className="px-3 py-3 text-[var(--text-soft)]">{item.category}</td><td className="px-3 py-3 text-[var(--text-soft)]">{formatStatus(item.authority)}</td><td className="px-3 py-3"><TendyyStatusBadge tone={toneFromStatus(item.status)}>{formatKnowledgeStatus(item.status)}</TendyyStatusBadge></td><td className="whitespace-nowrap px-3 py-3 text-[var(--muted)]">{formatDate(item.lastVerified)}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => onEdit(item)} disabled={busy}>Edit</Button><Button type="button" variant="secondary" onClick={() => onVerify(item.id)} disabled={busy || item.status === "ARCHIVED"}><RefreshCw className="h-4 w-4" />Verify</Button><Button type="button" variant="secondary" onClick={() => onApprove(item.id)} disabled={busy || item.status === "ACTIVE"}><BadgeCheck className="h-4 w-4" />Approve</Button><Button type="button" variant="secondary" onClick={() => onArchive(item.id)} disabled={busy || item.status === "ARCHIVED"}><Archive className="h-4 w-4" />Archive</Button></div></td></tr>)}</tbody>
        </TendyyTable>
      ) : <TendyyEmptyState title="No sources" description="Create a manual source record to start building the source layer." />}</div>
    </TendyyCard>
  );
}

function TemplatesTable({ items, loading, busy, onEdit, onApprove, onArchive, onDuplicate }: { items: ResponseTemplate[]; loading: boolean; busy: boolean; onEdit: (item: ResponseTemplate) => void; onApprove: (id: string) => void; onArchive: (id: string) => void; onDuplicate: (id: string) => void }) {
  return (
    <TendyyCard>
      <TendyySectionHeader eyebrow="Templates" title={`Response templates (${items.length})`} />
      <div className="mt-4">{loading ? <TendyySkeletonRows count={5} /> : items.length ? (
        <TendyyTable minWidth={920}>
          <thead className="tendyy-table-head"><tr><th className="px-4 py-3">Template</th><th className="px-3 py-3">Category</th><th className="px-3 py-3">Variables</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Updated</th><th className="px-4 py-3">Actions</th></tr></thead>
          <tbody>{items.map((item) => <tr key={item.id} className="tendyy-table-row align-top"><td className="px-4 py-3"><button type="button" onClick={() => onEdit(item)} className="text-left font-semibold text-[var(--text)] hover:text-[var(--primary)]">{item.name}</button><p className="mt-1 line-clamp-2 text-[12px] text-[var(--muted)]">{item.description || item.sections[0]?.body}</p></td><td className="px-3 py-3 text-[var(--text-soft)]">{item.category}</td><td className="px-3 py-3 text-[var(--text-soft)]">{item.variables.length}</td><td className="px-3 py-3"><TendyyStatusBadge tone={toneFromStatus(item.status)}>{formatStatus(item.status)}</TendyyStatusBadge></td><td className="whitespace-nowrap px-3 py-3 text-[var(--muted)]">{formatDate(item.updatedAt)}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => onEdit(item)} disabled={busy}>Edit</Button><Button type="button" variant="secondary" onClick={() => onDuplicate(item.id)} disabled={busy}><Copy className="h-4 w-4" />Duplicate</Button><Button type="button" variant="secondary" onClick={() => onApprove(item.id)} disabled={busy || item.status === "ACTIVE"}><CheckCircle2 className="h-4 w-4" />Approve</Button><Button type="button" variant="secondary" onClick={() => onArchive(item.id)} disabled={busy || item.status === "ARCHIVED"}><Archive className="h-4 w-4" />Archive</Button></div></td></tr>)}</tbody>
        </TendyyTable>
      ) : <TendyyEmptyState title="No templates" description="Create a reusable response template with sections and variables." />}</div>
    </TendyyCard>
  );
}

function IssuesTable({ items, loading, busy, onResolve }: { items: KnowledgeIssue[]; loading: boolean; busy: boolean; onResolve: (id: string, action: "approve" | "verify" | "archive" | "resolve_conflict") => void }) {
  return (
    <TendyyCard>
      <TendyySectionHeader eyebrow="Queue" title={`Issue queue (${items.length})`} />
      <div className="mt-4">{loading ? <TendyySkeletonRows count={5} /> : items.length ? (
        <TendyyTable minWidth={960}>
          <thead className="tendyy-table-head"><tr><th className="px-4 py-3">Issue</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Source</th><th className="px-3 py-3">Recommendation</th><th className="px-4 py-3">Actions</th></tr></thead>
          <tbody>{items.map((item) => <tr key={item.id} className="tendyy-table-row align-top"><td className="px-4 py-3"><p className="font-semibold text-[var(--text)]">{item.title}</p><p className="mt-1 line-clamp-2 text-[12px] text-[var(--muted)]">{item.detail}</p></td><td className="px-3 py-3"><TendyyStatusBadge tone={item.type === "CONFLICT" ? "warning" : "danger"}>{formatStatus(item.type)}</TendyyStatusBadge></td><td className="px-3 py-3"><TextLink href={`/knowledge/${item.source.id}`}>{item.source.name}</TextLink></td><td className="px-3 py-3 text-[var(--muted)]">{item.recommendedAction}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-2">{item.type === "DRAFT" ? <Button type="button" variant="secondary" disabled={busy} onClick={() => onResolve(item.id, "approve")}>Approve</Button> : null}{["STALE", "EXPIRED", "EXPIRING_SOON"].includes(item.type) ? <Button type="button" variant="secondary" disabled={busy} onClick={() => onResolve(item.id, "verify")}>Verify</Button> : null}{item.type === "CONFLICT" ? <Button type="button" variant="secondary" disabled={busy} onClick={() => onResolve(item.id, "resolve_conflict")}>Resolve</Button> : null}<Button type="button" variant="secondary" disabled={busy || item.type === "CONFLICT"} onClick={() => onResolve(item.id, "archive")}>Archive</Button></div></td></tr>)}</tbody>
        </TendyyTable>
      ) : <TendyyEmptyState title="No open issues" description="Draft, stale, expired, expiring, and conflict records will appear here." />}</div>
    </TendyyCard>
  );
}

function SourceSheet({ open, item, onClose }: { open: boolean; item?: KnowledgeItem | null; onClose: () => void }) {
  const create = useCreateKnowledgeSource();
  const update = useUpdateKnowledgeSource();
  const [form, setForm] = useState<SourceFormState>(() => sourceFormFromItem(item));
  useEffect(() => setForm(sourceFormFromItem(item)), [item, open]);
  const submitting = create.isPending || update.isPending;
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const body = sourceBody(form);
    if (item) update.mutate({ id: item.id, body }, { onSuccess: onClose });
    else create.mutate(body, { onSuccess: onClose });
  };
  return (
    <TendyySheet open={open} title={item ? "Edit source" : "New source"} onClose={onClose} footer={<Button type="submit" form="source-form" disabled={submitting}>{item ? "Save source" : "Create source"}</Button>}>
      <form id="source-form" onSubmit={onSubmit} className="space-y-3">
        <TendyyField label="Name" required><input className={tendyyInputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></TendyyField>
        <TendyyField label="Type" required><input className={tendyyInputClass} value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} /></TendyyField>
        <TendyyField label="Category"><select className={tendyyInputClass} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></TendyyField>
        <TendyyField label="Authority"><select className={tendyyInputClass} value={form.authority} onChange={(event) => setForm({ ...form, authority: event.target.value as SourceFormState["authority"] })}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></TendyyField>
        <TendyyField label="Source kind"><input className={tendyyInputClass} value={form.sourceKind} onChange={(event) => setForm({ ...form, sourceKind: event.target.value })} /></TendyyField>
        <TendyyField label="Version"><input className={tendyyInputClass} value={form.version} onChange={(event) => setForm({ ...form, version: event.target.value })} /></TendyyField>
        <TendyyField label="Last verified"><input type="date" className={tendyyInputClass} value={form.lastVerified} onChange={(event) => setForm({ ...form, lastVerified: event.target.value })} /></TendyyField>
        <TendyyField label="Expires"><input type="date" className={tendyyInputClass} value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} /></TendyyField>
        <TendyyField label="Summary"><textarea className={tendyyInputClass} rows={5} value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} /></TendyyField>
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
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const body = templateBody(form);
    if (item) update.mutate({ id: item.id, body }, { onSuccess: onClose });
    else create.mutate(body, { onSuccess: onClose });
  };
  return (
    <TendyySheet open={open} title={item ? "Edit template" : "New template"} onClose={onClose} footer={<Button type="submit" form="template-form" disabled={submitting}>{item ? "Save template" : "Create template"}</Button>}>
      <form id="template-form" onSubmit={onSubmit} className="space-y-3">
        <TendyyField label="Name" required><input className={tendyyInputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></TendyyField>
        <TendyyField label="Category"><select className={tendyyInputClass} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></TendyyField>
        <TendyyField label="Description"><textarea className={tendyyInputClass} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></TendyyField>
        <TendyyField label="Section title" required><input className={tendyyInputClass} value={form.sectionTitle} onChange={(event) => setForm({ ...form, sectionTitle: event.target.value })} /></TendyyField>
        <TendyyField label="Section body" required><textarea className={tendyyInputClass} rows={7} value={form.sectionBody} onChange={(event) => setForm({ ...form, sectionBody: event.target.value })} /></TendyyField>
        <TendyyField label="Variables" hint="Comma-separated variable keys."><input className={tendyyInputClass} value={form.variables} onChange={(event) => setForm({ ...form, variables: event.target.value })} /></TendyyField>
      </form>
    </TendyySheet>
  );
}

function KnowledgeListPanel({ title, items, loading, emptyTitle }: { title: string; items: KnowledgeItem[]; loading: boolean; emptyTitle: string }) {
  return (
    <TendyyCard>
      <TendyySectionHeader eyebrow="Library" title={`${title} (${items.length})`} actionHref="/knowledge/library" actionLabel="Open library" />
      <div className="mt-4">
        {loading ? <TendyySkeletonRows count={5} /> : items.length ? (
          <TendyyTable minWidth={880}>
            <thead className="tendyy-table-head"><tr><th className="px-4 py-3">Knowledge</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Authority</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Last verified</th><th className="px-4 py-3" /></tr></thead>
            <tbody>{items.map((item) => <tr key={item.id} className="tendyy-table-row align-top"><td className="max-w-[340px] px-4 py-3"><Link href={`/knowledge/${item.id}`} className="font-semibold text-[var(--text)] hover:text-[var(--primary)]">{item.name}</Link><p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[var(--muted)]">{item.summary || item.category}</p></td><td className="px-3 py-3 text-[var(--text-soft)]">{item.type}</td><td className="px-3 py-3 text-[var(--text-soft)]">{formatStatus(item.authority)}</td><td className="px-3 py-3"><TendyyStatusBadge tone={toneFromStatus(item.status)}>{formatKnowledgeStatus(item.status)}</TendyyStatusBadge></td><td className="whitespace-nowrap px-3 py-3 text-[var(--muted)]">{formatDate(item.lastVerified)}</td><td className="px-4 py-3"><TextLink href={`/knowledge/${item.id}`}>Open</TextLink></td></tr>)}</tbody>
          </TendyyTable>
        ) : <TendyyEmptyState title={emptyTitle} description="Records will appear here when the API returns them." />}
      </div>
    </TendyyCard>
  );
}

function SearchBox({ value, onChange, placeholder, bare = false }: { value: string; onChange: (value: string) => void; placeholder: string; bare?: boolean }) {
  const input = <label className="flex h-10 items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-3 text-[var(--muted)] focus-within:border-[var(--primary)]"><Search className="h-4 w-4" /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--muted-subtle)]" /></label>;
  return bare ? input : <TendyyCard>{input}</TendyyCard>;
}

function HealthTile({ label, value, total, tone }: { label: string; value: number; total: number; tone: "success" | "warning" | "danger" | "neutral" }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  return <div className="tendyy-nested-surface p-3"><div className="flex items-center justify-between gap-3"><p className="text-[13px] font-semibold text-[var(--text)]">{label}</p><TendyyStatusBadge tone={tone}>{percent}%</TendyyStatusBadge></div><p className="mt-2 text-[24px] font-semibold text-[var(--text)]">{value}</p><div className="mt-2 h-1.5 rounded-full bg-[var(--border)]"><div className="h-1.5 rounded-full bg-[var(--primary)]" style={{ width: `${percent}%` }} /></div></div>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-3 rounded-[var(--radius-sm)] bg-[var(--surface-muted)] px-3 py-2"><dt className="text-[12px] text-[var(--muted)]">{label}</dt><dd className="text-right text-[12px] font-semibold text-[var(--text)]">{value}</dd></div>;
}

function buildCounts(items: KnowledgeItem[]) {
  return { total: items.length, active: items.filter((item) => item.status === "ACTIVE").length, draft: items.filter((item) => item.status === "DRAFT").length, archived: items.filter((item) => item.status === "ARCHIVED").length, stale: items.filter(isReviewDue).length, expired: items.filter(isExpired).length, expiring: items.filter(isExpiringSoon).length, templates: 0, conflicts: 0 };
}

function sourceFormFromItem(item?: KnowledgeItem | null): SourceFormState {
  if (!item) return emptySourceForm;
  return { name: item.name, type: item.type, category: item.category, authority: item.authority as SourceFormState["authority"], sourceKind: String(item.metadata?.sourceKind ?? item.metadata?.source ?? "manual"), version: item.version, summary: item.summary, lastVerified: item.lastVerified ?? "", expiresAt: item.expiresAt ?? "" };
}

function sourceBody(form: SourceFormState) {
  return { name: form.name, type: form.type, category: form.category, authority: form.authority, sourceKind: form.sourceKind, version: form.version || "1.0", summary: form.summary, lastVerified: clean(form.lastVerified), expiresAt: clean(form.expiresAt) ?? null, metadata: { sourceKind: form.sourceKind, source: form.sourceKind } };
}

function templateFormFromItem(item?: ResponseTemplate | null): TemplateFormState {
  if (!item) return emptyTemplateForm;
  return { name: item.name, category: item.category, description: item.description, sectionTitle: item.sections[0]?.title ?? "Answer", sectionBody: item.sections[0]?.body ?? "", variables: item.variables.map((variable) => variable.key).join(", ") };
}

function templateBody(form: TemplateFormState) {
  const variables = form.variables.split(",").map((value) => value.trim()).filter(Boolean).map((key) => ({ key, label: formatStatus(key), required: false }));
  return { name: form.name, category: form.category, description: form.description, sections: [{ title: form.sectionTitle, body: form.sectionBody }], variables };
}

function isReviewDue(item: KnowledgeItem) {
  return item.status === "ACTIVE" && Boolean(item.lastVerified) && daysSince(item.lastVerified) > 180;
}

function isExpired(item: KnowledgeItem) {
  return Boolean(item.expiresAt) && new Date(item.expiresAt!).getTime() < Date.now();
}

function isExpiringSoon(item: KnowledgeItem) {
  if (!item.expiresAt || isExpired(item)) return false;
  return daysUntil(item.expiresAt) <= 30;
}

function daysSince(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
}

function daysUntil(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not set" : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatPercent(value: number, total: number) {
  if (!total) return "No records yet";
  return `${Math.round((value / total) * 100)}% of total`;
}

function formatStatus(value: string) {
  return value.replace(/[_-]+/g, " ").toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatKnowledgeStatus(status: string) {
  if (status === "ACTIVE") return "Verified";
  return formatStatus(status);
}

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function shortLabel(value: string | null | undefined) {
  if (!value) return "Not assigned";
  return value.length > 12 ? `${value.slice(0, 4)}...${value.slice(-4)}` : value;
}

function clean(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}
