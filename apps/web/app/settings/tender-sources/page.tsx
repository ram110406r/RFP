"use client";

import { AlertTriangle, CheckCircle2, ExternalLink, Play, Power, PowerOff, RefreshCw } from "lucide-react";

import { Button } from "@rfp-os/ui";
import { AppShell } from "../../../components/app-shell";
import { TendyyEmptyState, TendyyErrorState, TendyySkeletonRows, TendyyStatusBadge, toneFromStatus } from "../../../components/tendyy-ui";
import { useResolveTenderIngestionAlert, useSetTenderPortalEnabled, useSyncTenderPortal, useTenderIngestionAlerts, useTenderSourceHealth } from "../../../lib/queries";

export default function TenderSourcesPage() {
  const sources = useTenderSourceHealth();
  const items = sources.data?.items ?? [];
  const isPlatformAdmin = items.some((item) => item.isPlatformAdmin);
  const alerts = useTenderIngestionAlerts(isPlatformAdmin);
  const setEnabled = useSetTenderPortalEnabled();
  const sync = useSyncTenderPortal();
  const resolveAlert = useResolveTenderIngestionAlert();

  return <AppShell breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Tender Sources" }]}>
    <main className="min-w-0 space-y-4 pb-8">
      <header className="flex flex-col gap-3 px-1 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-[10px] font-semibold uppercase text-[var(--primary)]">Catalog operations</p><h1 className="mt-1 text-[26px] font-semibold text-[var(--text)]">Tender Sources</h1><p className="mt-1 text-[13px] text-[var(--muted)]">Official portal coverage, freshness, and synchronization health.</p></div>
        <Button type="button" variant="secondary" onClick={() => void sources.refetch()} disabled={sources.isFetching}><RefreshCw className="h-4 w-4" /> Refresh</Button>
      </header>

      {sources.isLoading ? <div className="tendyy-surface p-4"><TendyySkeletonRows count={8} /></div> : null}
      {sources.isError ? <TendyyErrorState message="Tender source health is available to organization administrators." onRetry={() => void sources.refetch()} /> : null}
      {isPlatformAdmin && (alerts.data?.items.filter((row) => row.alert.status === "OPEN").length ?? 0) > 0 ? <section className="border border-amber-200 bg-amber-50 p-4"><div className="flex items-center gap-2 text-sm font-semibold text-amber-950"><AlertTriangle className="h-4 w-4" /> Open ingestion alerts</div><div className="mt-3 space-y-2">{alerts.data?.items.filter((row) => row.alert.status === "OPEN").map((row) => <div key={row.alert.id} className="flex items-center justify-between gap-3 text-xs text-amber-900"><span><b>{row.portalName}</b>: {row.alert.message}</span><Button size="sm" variant="secondary" disabled={resolveAlert.isPending} onClick={() => resolveAlert.mutate(row.alert.id)}>Resolve</Button></div>)}</div></section> : null}

      {items.length ? <section className="tendyy-surface overflow-hidden">
        <div className="hidden grid-cols-[minmax(190px,1.4fr)_110px_100px_100px_140px_auto] gap-3 border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2 text-[10px] font-semibold uppercase text-[var(--muted)] xl:grid"><span>Source</span><span>Health</span><span>Notices</span><span>Coverage</span><span>Last success</span><span className="text-right">Actions</span></div>
        <div className="divide-y divide-[var(--border-subtle)]">{items.map((source) => {
          const coverageMode = String(source.metadata.coverageMode ?? "NOT_VERIFIED").replaceAll("_", " ").toLowerCase();
          const busy = (setEnabled.variables?.portalKey ?? sync.variables?.portalKey) === source.key;
          return <article key={source.id} className="grid min-w-0 gap-3 px-4 py-3 sm:grid-cols-2 xl:grid-cols-[minmax(190px,1.4fr)_110px_100px_100px_140px_auto] xl:items-center">
            <div className="min-w-0"><div className="flex items-center gap-2"><span className="truncate text-[13px] font-semibold text-[var(--text)]">{source.name}</span><a href={source.officialUrl} target="_blank" rel="noreferrer" aria-label={`Open ${source.name}`}><ExternalLink className="h-3.5 w-3.5 text-[var(--muted)]" /></a></div><p className="mt-1 text-[11px] text-[var(--muted)]">{source.state ?? source.category} | every {source.scheduleMinutes} min</p>{source.readinessReason ? <p className="mt-1 text-[11px] text-amber-700">{source.readinessReason}</p> : null}{source.lastRunDiscovered !== null ? <p className="mt-1 text-[10px] text-[var(--muted)]">Last run: {source.lastRunDiscovered} discovered · {source.lastRunInserted} inserted · {source.lastRunUpdated} updated · {source.lastRunDuplicates} duplicates · {source.lastRunRejected} rejected · {source.lastRunStale} stale</p> : null}{source.lastError ? <p className="mt-1 line-clamp-2 text-[11px] text-[var(--danger)]">{source.lastError}</p> : null}</div>
            <div><TendyyStatusBadge tone={toneFromStatus(source.health)}>{source.health}</TendyyStatusBadge>{source.openAlerts ? <span className="ml-1 text-[10px] text-amber-700">{source.openAlerts} alert{source.openAlerts === 1 ? "" : "s"}</span> : null}</div>
            <div className="text-xs"><b className="block text-[var(--text)]">{formatNumber(source.currentCount)}</b><span className="text-[var(--muted)]">{formatNumber(source.noticeCount)} indexed</span></div>
            <span className="text-[11px] capitalize text-[var(--muted)]">{coverageMode}</span>
            <span className="text-[11px] text-[var(--muted)]">{source.lastSuccessAt ? relativeTime(source.lastSuccessAt) : "Never"}</span>
            <div className="flex justify-start gap-1 xl:justify-end">{isPlatformAdmin ? <><Button type="button" variant="secondary" size="sm" disabled={busy || (!source.enabled && source.metadata.connectorVerified !== true)} onClick={() => sync.mutate({ portalKey: source.key, mode: "HEAD" })} title={source.enabled ? "Synchronize source" : "Run pre-activation smoke sync"}><Play className="h-3.5 w-3.5" /></Button>{source.key === "gem" ? <Button type="button" variant="secondary" size="sm" disabled={busy || !source.enabled} onClick={() => sync.mutate({ portalKey: source.key, mode: "BACKFILL" })} title="Resume bounded backfill">Backfill</Button> : null}<Button type="button" variant="secondary" size="sm" disabled={busy || (!source.enabled && (source.metadata.connectorVerified !== true || !source.lastSuccessAt))} onClick={() => setEnabled.mutate({ portalKey: source.key, enabled: !source.enabled })} title={source.enabled ? "Disable source" : source.metadata.connectorVerified !== true ? "Awaiting connector verification" : !source.lastSuccessAt ? "Run a successful smoke sync first" : "Enable verified source"}>{source.enabled ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}</Button></> : source.enabled ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : null}</div>
          </article>;
        })}</div>
      </section> : !sources.isLoading && !sources.isError ? <TendyyEmptyState title="No tender sources registered" description="Apply the tender discovery migrations to register official sources." /> : null}
    </main>
  </AppShell>;
}

function formatNumber(value: number) { return new Intl.NumberFormat("en-IN").format(value); }
function relativeTime(value: string) { const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000)); if (minutes < 60) return `${Math.max(1, minutes)}m ago`; const hours = Math.round(minutes / 60); return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`; }
