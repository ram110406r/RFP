"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  BadgeCheck,
  BookOpen,
  CircleAlert,
  Search,
  ShieldCheck,
  Upload,
} from "lucide-react";

import { Button } from "@rfp-os/ui";

import { AppShell } from "./app-shell";
import {
  TendyyCard,
  TendyyEmptyState,
  TendyyErrorState,
  TendyyMetricCard,
  TendyyPageHeader,
  TendyyPermissionState,
  TendyySectionHeader,
  TendyySkeletonRows,
  TendyyStatusBadge,
  TendyyTable,
  TextLink,
  toneFromStatus,
} from "./tendyy-ui";
import { ApiError } from "../lib/api";
import type { KnowledgeItem } from "../lib/models";
import {
  useActivities,
  useApproveKnowledge,
  useArchiveKnowledge,
  useKnowledgeItem,
  useKnowledgeList,
  useKnowledgeSummary,
} from "../lib/queries";

const PAGE_SIZE = 25;

export function KnowledgeOverviewPage() {
  const summaryQuery = useKnowledgeSummary();
  const listQuery = useKnowledgeList({ page: 1, pageSize: PAGE_SIZE });
  const activityQuery = useActivities({ entityType: "knowledge_source", q: "knowledge" });
  const summary = summaryQuery.data ?? null;
  const items = listQuery.data?.items ?? summary?.items ?? [];
  const counts = summary?.counts ?? buildCounts(items);
  const reviewDue = items.filter(isReviewDue).length;
  const expiringSoon = items.filter(isExpiringSoon).length;
  const activity = activityQuery.data?.items ?? [];
  const loading = summaryQuery.isLoading || listQuery.isLoading;

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Knowledge" }]}>
      <div className="min-w-0 space-y-5 pb-8">
        <TendyyPageHeader
          eyebrow="Knowledge"
          title="Knowledge"
          description="Manage the source-backed company facts, claims, and evidence TENDYY uses across RFP workflows."
          actions={
            <>
              <Button asChild variant="secondary">
                <Link href="/knowledge/sources">
                  <Upload className="h-4 w-4" />
                  Sources
                </Link>
              </Button>
              <Button asChild>
                <Link href="/knowledge/library">
                  <BookOpen className="h-4 w-4" />
                  Open library
                </Link>
              </Button>
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
          <TendyyMetricCard label="Total knowledge" value={counts.total} detail="Records available to the workspace" icon={<BookOpen className="h-5 w-5" />} loading={loading} />
          <TendyyMetricCard label="Verified" value={counts.active} detail={formatPercent(counts.active, counts.total)} icon={<ShieldCheck className="h-5 w-5" />} loading={loading} tone="success" />
          <TendyyMetricCard label="Needs review" value={reviewDue + counts.draft} detail="Draft or stale verification state" icon={<CircleAlert className="h-5 w-5" />} loading={loading} tone="warning" />
          <TendyyMetricCard label="Expiring soon" value={expiringSoon} detail="Items with near-term expiration" icon={<AlertTriangle className="h-5 w-5" />} loading={loading} tone={expiringSoon > 0 ? "warning" : "neutral"} />
        </section>

        <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]">
          <TendyyCard>
            <TendyySectionHeader eyebrow="Knowledge health" title="Verification and lifecycle" actionHref="/knowledge/issues" actionLabel="View issues" />
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <HealthTile label="Verified" value={counts.active} total={counts.total} tone="success" />
              <HealthTile label="Draft" value={counts.draft} total={counts.total} tone="warning" />
              <HealthTile label="Stale" value={counts.stale} total={counts.total} tone="danger" />
              <HealthTile label="Archived" value={counts.archived} total={counts.total} tone="neutral" />
            </div>
          </TendyyCard>

          <TendyyCard>
            <TendyySectionHeader eyebrow="Activity" title="Recent knowledge activity" actionHref="/notifications" actionLabel="View all" />
            <div className="mt-4 space-y-2">
              {activityQuery.isLoading ? <TendyySkeletonRows count={4} /> : activity.length > 0 ? (
                activity.slice(0, 5).map((item) => (
                  <div key={item.id} className="tendyy-nested-surface p-3">
                    <p className="truncate text-[13px] font-semibold text-[var(--text)]">{item.label || item.summary}</p>
                    <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[var(--muted)]">{item.summary || "Knowledge activity recorded."}</p>
                    <p className="mt-1 text-[11px] text-[var(--muted-subtle)]">{relativeTime(item.createdAt)}</p>
                  </div>
                ))
              ) : (
                <TendyyEmptyState title="No knowledge activity" description="Knowledge lifecycle events will appear here after sources, claims, or approvals change." />
              )}
            </div>
          </TendyyCard>
        </section>

        <KnowledgeListPanel title="Recent knowledge" items={items.slice(0, 8)} loading={loading} emptyTitle="No knowledge records yet" />
      </div>
    </AppShell>
  );
}

export function KnowledgeLibraryPage() {
  return (
    <KnowledgeListRoute
      title="Knowledge library"
      eyebrow="Knowledge"
      description="Browse verified claims, reusable facts, and source-backed company knowledge."
      filter={(item) => item.status !== "ARCHIVED"}
      emptyTitle="No active knowledge"
      emptyDescription="Approved and draft knowledge records will appear here after they are created through the knowledge API."
    />
  );
}

export function SourcesPage() {
  return (
    <KnowledgeListRoute
      title="Sources"
      eyebrow="Source layer"
      description="Source-backed records derived from the existing knowledge service. A dedicated source API is not exposed to this frontend yet."
      filter={(item) => isSourceLike(item)}
      emptyTitle="No source records exposed"
      emptyDescription="The current frontend contract exposes knowledge records. Dedicated source folders, connected apps, and parsed-file rows should be added when the backend exposes those fields."
      contractGap
    />
  );
}

export function ResponseTemplatesPage() {
  return (
    <KnowledgeListRoute
      title="Response templates"
      eyebrow="Reusable knowledge"
      description="Reusable answer structures that exist as real knowledge records."
      filter={(item) => /template/i.test(`${item.type} ${item.category}`)}
      emptyTitle="No response templates"
      emptyDescription="Create reusable answer templates as knowledge records before showing them here."
      actionHref="/knowledge/library"
      actionLabel="Open knowledge library"
    />
  );
}

export function KnowledgeIssuesPage() {
  const listQuery = useKnowledgeList({ page: 1, pageSize: 100 });
  const items = listQuery.data?.items ?? [];
  const issueItems = items.filter((item) => item.status === "DRAFT" || isReviewDue(item) || isExpiringSoon(item));

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Knowledge", href: "/knowledge" }, { label: "Issues" }]}>
      <div className="min-w-0 space-y-5 pb-8">
        <TendyyPageHeader
          eyebrow="Knowledge"
          title="Knowledge issues"
          description="Resolve stale, draft, and expiring knowledge based on fields currently available from the knowledge API."
        />
        {listQuery.isError ? <TendyyErrorState message={errorMessage(listQuery.error, "Unable to load knowledge issues.")} onRetry={() => void listQuery.refetch()} /> : null}
        <KnowledgeListPanel title="Issue queue" items={issueItems} loading={listQuery.isLoading} emptyTitle="No knowledge issues" emptyDescription="No draft, stale, or expiring knowledge records are currently visible." showIssueReason />
      </div>
    </AppShell>
  );
}

export function KnowledgeDetailPage({ knowledgeId }: { knowledgeId: string }) {
  const itemQuery = useKnowledgeItem(knowledgeId);
  const approveKnowledge = useApproveKnowledge();
  const archiveKnowledge = useArchiveKnowledge();
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
                  <Button type="button" variant="secondary" onClick={() => approveKnowledge.mutate(item.id)} disabled={approveKnowledge.isPending || item.status === "ACTIVE"}>
                    <BadgeCheck className="h-4 w-4" />
                    {item.status === "ACTIVE" ? "Approved" : "Approve"}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => archiveKnowledge.mutate(item.id)} disabled={archiveKnowledge.isPending || item.status === "ARCHIVED"}>
                    <Archive className="h-4 w-4" />
                    Archive
                  </Button>
                </>
              }
            />

            <section className="grid min-w-0 gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
              <TendyyCard>
                <TendyySectionHeader eyebrow="Metadata" title="Record details" />
                <dl className="mt-4 space-y-2">
                  <InfoRow label="Type" value={item.type} />
                  <InfoRow label="Category" value={item.category} />
                  <InfoRow label="Authority" value={item.authority} />
                  <InfoRow label="Owner" value={shortLabel(item.ownerId)} />
                  <InfoRow label="Version" value={item.version || "Not set"} />
                  <InfoRow label="Last verified" value={formatDate(item.lastVerified)} />
                  <InfoRow label="Expires" value={formatDate(item.expiresAt)} />
                </dl>
              </TendyyCard>

              <div className="min-w-0 space-y-5">
                <TendyyCard>
                  <TendyySectionHeader eyebrow="Knowledge" title="Summary" />
                  <p className="mt-4 text-[14px] leading-7 text-[var(--text-soft)]">{item.summary || "No summary is stored for this record."}</p>
                </TendyyCard>
                <TendyyCard>
                  <TendyySectionHeader eyebrow="Claims" title="Extracted claims" />
                  <div className="mt-4 space-y-2">
                    {item.claims && item.claims.length > 0 ? item.claims.map((claim) => (
                      <div key={claim.id ?? claim.label} className="tendyy-nested-surface p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[13px] font-semibold text-[var(--text)]">{claim.label}</p>
                            <p className="mt-1 text-[13px] leading-6 text-[var(--muted)]">{claim.value}</p>
                          </div>
                          <TendyyStatusBadge tone="primary">{Math.round(claim.confidence * 100)}%</TendyyStatusBadge>
                        </div>
                      </div>
                    )) : <TendyyEmptyState title="No claims exposed" description="This knowledge record does not include claim-level data in the current API response." />}
                  </div>
                </TendyyCard>
                <TendyyCard>
                  <TendyySectionHeader eyebrow="History" title="Version history" />
                  <div className="mt-4 space-y-2">
                    {item.versions && item.versions.length > 0 ? item.versions.map((version) => (
                      <div key={version.id} className="tendyy-nested-surface p-3">
                        <p className="text-[13px] font-semibold text-[var(--text)]">{version.version}</p>
                        <p className="mt-1 text-[12px] text-[var(--muted)]">{formatDate(version.date)} - {version.note}</p>
                      </div>
                    )) : <TendyyEmptyState title="No version history exposed" description="Version rows will appear here when the knowledge API includes them." />}
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

function KnowledgeListRoute({
  title,
  eyebrow,
  description,
  filter,
  emptyTitle,
  emptyDescription,
  actionHref,
  actionLabel,
  contractGap,
}: {
  title: string;
  eyebrow: string;
  description: string;
  filter: (item: KnowledgeItem) => boolean;
  emptyTitle: string;
  emptyDescription: string;
  actionHref?: string;
  actionLabel?: string;
  contractGap?: boolean;
}) {
  const [search, setSearch] = useState("");
  const listQuery = useKnowledgeList({ page: 1, pageSize: 100, search: search.trim() || undefined });
  const items = useMemo(() => (listQuery.data?.items ?? []).filter(filter), [filter, listQuery.data?.items]);

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Knowledge", href: "/knowledge" }, { label: title }]}>
      <div className="min-w-0 space-y-5 pb-8">
        <TendyyPageHeader
          eyebrow={eyebrow}
          title={title}
          description={description}
          actions={actionHref && actionLabel ? <Button asChild><Link href={actionHref}>{actionLabel}<ArrowRight className="h-4 w-4" /></Link></Button> : null}
        />
        {contractGap ? <TendyyPermissionState title="Backend contract gap" message="This page is intentionally limited to real fields available in the current knowledge API. Dedicated source integrations, folders, and conflict queues are not fabricated." /> : null}
        <TendyyCard>
          <label className="flex h-10 items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-3 text-[var(--muted)] focus-within:border-[var(--primary)]">
            <Search className="h-4 w-4" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search knowledge records" className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--muted-subtle)]" />
          </label>
        </TendyyCard>
        {listQuery.isError ? <TendyyErrorState message={errorMessage(listQuery.error, `Unable to load ${title.toLowerCase()}.`)} onRetry={() => void listQuery.refetch()} /> : null}
        <KnowledgeListPanel title={title} items={items} loading={listQuery.isLoading} emptyTitle={emptyTitle} emptyDescription={emptyDescription} />
      </div>
    </AppShell>
  );
}

function KnowledgeListPanel({
  title,
  items,
  loading,
  emptyTitle,
  emptyDescription = "Records will appear here when the existing API returns them.",
  showIssueReason = false,
}: {
  title: string;
  items: KnowledgeItem[];
  loading: boolean;
  emptyTitle: string;
  emptyDescription?: string;
  showIssueReason?: boolean;
}) {
  return (
    <TendyyCard>
      <TendyySectionHeader eyebrow="Library" title={`${title} (${items.length})`} actionHref="/knowledge/library" actionLabel="Open library" />
      <div className="mt-4">
        {loading ? <TendyySkeletonRows count={5} /> : items.length > 0 ? (
          <TendyyTable minWidth={880}>
            <thead className="tendyy-table-head">
              <tr>
                <th className="px-4 py-3">Knowledge</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Authority</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Last verified</th>
                {showIssueReason ? <th className="px-3 py-3">Issue</th> : null}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="tendyy-table-row align-top">
                  <td className="max-w-[340px] px-4 py-3">
                    <Link href={`/knowledge/${item.id}`} className="font-semibold text-[var(--text)] hover:text-[var(--primary)]">{item.name}</Link>
                    <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[var(--muted)]">{item.summary || item.category}</p>
                  </td>
                  <td className="px-3 py-3 text-[var(--text-soft)]">{item.type}</td>
                  <td className="px-3 py-3 text-[var(--text-soft)]">{formatStatus(item.authority)}</td>
                  <td className="px-3 py-3"><TendyyStatusBadge tone={toneFromStatus(item.status)}>{formatKnowledgeStatus(item.status)}</TendyyStatusBadge></td>
                  <td className="whitespace-nowrap px-3 py-3 text-[var(--muted)]">{formatDate(item.lastVerified)}</td>
                  {showIssueReason ? <td className="px-3 py-3 text-[var(--muted)]">{issueReason(item)}</td> : null}
                  <td className="px-4 py-3"><TextLink href={`/knowledge/${item.id}`}>Open</TextLink></td>
                </tr>
              ))}
            </tbody>
          </TendyyTable>
        ) : (
          <TendyyEmptyState title={emptyTitle} description={emptyDescription} />
        )}
      </div>
    </TendyyCard>
  );
}

function HealthTile({ label, value, total, tone }: { label: string; value: number; total: number; tone: "success" | "warning" | "danger" | "neutral" }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="tendyy-nested-surface p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold text-[var(--text)]">{label}</p>
        <TendyyStatusBadge tone={tone}>{percent}%</TendyyStatusBadge>
      </div>
      <p className="mt-2 text-[24px] font-semibold text-[var(--text)]">{value}</p>
      <div className="mt-2 h-1.5 rounded-full bg-[var(--border)]">
        <div className="h-1.5 rounded-full bg-[var(--primary)]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-[var(--radius-sm)] bg-[var(--surface-muted)] px-3 py-2">
      <dt className="text-[12px] text-[var(--muted)]">{label}</dt>
      <dd className="text-right text-[12px] font-semibold text-[var(--text)]">{value}</dd>
    </div>
  );
}

function buildCounts(items: KnowledgeItem[]) {
  return {
    total: items.length,
    active: items.filter((item) => item.status === "ACTIVE").length,
    draft: items.filter((item) => item.status === "DRAFT").length,
    archived: items.filter((item) => item.status === "ARCHIVED").length,
    stale: items.filter(isReviewDue).length,
  };
}

function isReviewDue(item: KnowledgeItem) {
  return item.status === "ACTIVE" && Boolean(item.lastVerified) && daysSince(item.lastVerified) > 180;
}

function isExpiringSoon(item: KnowledgeItem) {
  return Boolean(item.expiresAt) && daysUntil(item.expiresAt) <= 30;
}

function isSourceLike(item: KnowledgeItem) {
  const metadata = item.metadata as Record<string, unknown>;
  return /source|evidence|document|file/i.test(`${item.type} ${item.category} ${metadata.source ?? ""}`);
}

function issueReason(item: KnowledgeItem) {
  if (item.status === "DRAFT") return "Draft needs approval";
  if (isExpiringSoon(item)) return "Expires soon";
  if (isReviewDue(item)) return "Verification is stale";
  return "Needs review";
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

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}
