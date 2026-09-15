"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft, ArrowRight, Bookmark, BookmarkCheck, Building2, CalendarClock, ChevronDown,
  ExternalLink, FileText, Grid2X2, IndianRupee, List, MapPin, RefreshCw, Search,
  SlidersHorizontal, X, Download, BellPlus, GitCompareArrows, CheckSquare,
} from "lucide-react";

import { Button } from "@rfp-os/ui";
import { AppShell } from "../../components/app-shell";
import { TendyyActionBar, TendyyEmptyState, TendyyErrorState, TendyyResponsiveNav, TendyySheet, TendyySkeletonRows, TendyyStatusBadge, toneFromStatus } from "../../components/tendyy-ui";
import { useBulkSaveTenderNotices, useBulkStartTenderApplications, useCreateTenderSavedSearch, useDeleteTenderSavedSearch, useSaveTenderNotice, useStartTenderApplication, useTenderComparison, useTenderDiscovery, useTenderNotice, useTenderSavedSearches, useUnsaveTenderNotice } from "../../lib/queries";
import type { TenderNoticeDetail, TenderNoticeSummary } from "../../lib/models";
import { tenderExportUrl } from "../../lib/api";
import { useSelectedWorkspaceId } from "../../lib/workspace-selection";

type Tab = "all" | "saved" | "applied";
type ResultView = "list" | "grid";
type FilterKey = "portal" | "state" | "category" | "status" | "buyer" | "authorityType" | "location" | "procurementType" | "minValue" | "maxValue" | "publishedFrom" | "publishedTo" | "deadlineFrom" | "deadlineTo" | "freshness";

export default function TendersPage() {
  return <Suspense fallback={<PageSkeleton />}><TenderDiscoveryPage /></Suspense>;
}

function TenderDiscoveryPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [resultView, setResultView] = useState<ResultView>(params.get("display") === "grid" ? "grid" : "list");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [savedSearchOpen, setSavedSearchOpen] = useState(false);
  const [savedSearchName, setSavedSearchName] = useState("");
  const [savedSearchCadence, setSavedSearchCadence] = useState<"IMMEDIATE" | "DAILY">("DAILY");
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([]);
  const workspaceId = useSelectedWorkspaceId();
  const tab = parseTab(params.get("view"));
  const page = positiveInt(params.get("page"));
  const sort = params.get("sort") ?? "relevance";
  const selectedId = params.get("notice");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if ((params.get("q") ?? "") !== search.trim()) {
        setCursorHistory([]);
        replaceParams(router, params, { q: search.trim() || null, page: null, cursor: null, notice: null });
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [params, router, search]);

  const discoveryParams = {
    q: params.get("q") ?? undefined,
    portal: params.get("portal") ?? undefined,
    authorityType: params.get("authorityType") ?? undefined,
    buyer: params.get("buyer") ?? undefined,
    state: params.get("state") ?? undefined,
    location: params.get("location") ?? undefined,
    category: params.get("category") ?? undefined,
    procurementType: params.get("procurementType") ?? undefined,
    status: params.get("status") ?? undefined,
    minValue: optionalNumber(params.get("minValue")),
    maxValue: optionalNumber(params.get("maxValue")),
    publishedFrom: dateStart(params.get("publishedFrom")),
    publishedTo: dateEnd(params.get("publishedTo")),
    deadlineFrom: dateStart(params.get("deadlineFrom")),
    deadlineTo: dateEnd(params.get("deadlineTo")),
    saved: tab === "saved" ? true : undefined,
    applied: tab === "applied" ? true : undefined,
    freshness: parseFreshness(params.get("freshness")),
    sort,
    page,
    pageSize: 20,
    cursor: params.get("cursor") ?? undefined,
  };
  const query = useTenderDiscovery(discoveryParams);
  const items = query.data?.items ?? [];
  const detailQuery = useTenderNotice(selectedId);
  const selected = detailQuery.data ?? items.find((item) => item.id === selectedId) ?? null;
  const save = useSaveTenderNotice();
  const unsave = useUnsaveTenderNotice();
  const startApplication = useStartTenderApplication();
  const bulkSave = useBulkSaveTenderNotices();
  const bulkStart = useBulkStartTenderApplications();
  const comparison = useTenderComparison(selectedIds.slice(0, 4), compareOpen);
  const savedSearches = useTenderSavedSearches();
  const createSavedSearch = useCreateTenderSavedSearch();
  const deleteSavedSearch = useDeleteTenderSavedSearch();
  const activeFilters = useMemo(() => filterChips(params), [params]);
  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / (query.data?.pageSize ?? 20)));
  const coverage = query.data?.coverage;
  const selectedPortal = query.data?.facets.portals.find((portal) => portal.key === params.get("portal"));
  const selectedPortalUnavailable = Boolean(selectedPortal && (!selectedPortal.enabled || selectedPortal.count === 0));

  function setFilter(key: FilterKey, value: string | null) {
    setCursorHistory([]);
    replaceParams(router, params, { [key]: value || null, page: null, cursor: null, notice: null });
  }
  function clearAll() {
    setSearch("");
    setCursorHistory([]);
    setSelectedIds([]);
    router.replace("/tenders", { scroll: false });
  }
  function toggleSave(item: TenderNoticeSummary) {
    if (item.saved) unsave.mutate(item.id);
    else save.mutate(item.id);
  }
  function setView(next: ResultView) {
    setResultView(next);
    replaceParams(router, params, { display: next === "list" ? null : next });
  }
  function toggleSelected(id: string) { setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : current.length < 100 ? [...current, id] : current); }
  const exportHref = tenderExportUrl({ ...discoveryParams, workspaceId: workspaceId ?? undefined, page: 1, cursor: undefined });
  const { page: _page, pageSize: _pageSize, cursor: _cursor, ...currentSearchDefinition } = discoveryParams;

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Tender Search" }]}>
      <main className="min-w-0 space-y-4 pb-6">
        <header className="flex flex-col gap-4 px-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">India opportunity discovery</p>
            <h1 className="mt-1 text-[28px] font-semibold tracking-normal text-[var(--text)]">Tender Search</h1>
            <p className="mt-1 text-[13px] text-[var(--muted)]">Search official procurement notices, save opportunities, and start response work.</p>
          </div>
          <TendyyActionBar className="sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setSavedSearchOpen((value) => !value)}><BellPlus className="h-4 w-4" /> Save search</Button>
            <Button asChild variant="secondary"><a href={exportHref}><Download className="h-4 w-4" /> Export CSV</a></Button>
            <Button asChild variant="secondary"><Link href="/tenders/import">Import tender</Link></Button>
            <Button asChild><Link href="/tenders/new">New tender <ArrowRight className="h-4 w-4" /></Link></Button>
          </TendyyActionBar>
        </header>

        {savedSearchOpen ? <section className="tendyy-surface grid gap-3 p-4 md:grid-cols-[1fr_170px_auto]" aria-label="Saved searches"><label className="text-xs font-semibold text-[var(--text-soft)]">Search name<input value={savedSearchName} onChange={(event) => setSavedSearchName(event.target.value)} className="filter-input" placeholder="e.g. Karnataka IT tenders" /></label><label className="text-xs font-semibold text-[var(--text-soft)]">Digest<select value={savedSearchCadence} onChange={(event) => setSavedSearchCadence(event.target.value as "IMMEDIATE" | "DAILY")} className="filter-input"><option value="DAILY">Daily at 08:00</option><option value="IMMEDIATE">Immediate</option></select></label><div className="flex items-end"><Button type="button" disabled={!savedSearchName.trim() || createSavedSearch.isPending} onClick={() => createSavedSearch.mutate({ name: savedSearchName.trim(), query: currentSearchDefinition, cadence: savedSearchCadence }, { onSuccess: () => setSavedSearchName("") })}>Save</Button></div>{savedSearches.data?.items.length ? <div className="md:col-span-3 flex flex-wrap gap-2 border-t border-[var(--border-subtle)] pt-3">{savedSearches.data.items.map((item) => <span key={item.id} className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-muted)] px-3 py-1.5 text-xs"><button type="button" onClick={() => { const next = new URLSearchParams(); for (const [key, value] of Object.entries(item.query)) if (value !== undefined && value !== null && value !== "") next.set(key, String(value)); router.replace(`/tenders?${next}`); }}>{item.name} · {item.cadence.toLowerCase()}</button><button type="button" onClick={() => deleteSavedSearch.mutate(item.id)} aria-label={`Delete ${item.name}`}><X className="h-3 w-3" /></button></span>)}</div> : null}</section> : null}

        <section className="tendyy-surface p-3 sm:p-4" aria-label="Tender search controls">
          <div className="grid gap-2 lg:grid-cols-[minmax(280px,1fr)_220px_auto]">
            <label className="flex h-11 min-w-0 items-center gap-3 rounded-[8px] border border-[var(--border)] bg-white px-3 focus-within:border-[var(--primary)] focus-within:ring-2 focus-within:ring-blue-100">
              <Search className="h-[18px] w-[18px] shrink-0 text-[var(--primary)]" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted-subtle)]" placeholder="Tender title, buyer, reference or keyword" />
              {search ? <button type="button" onClick={() => setSearch("")} aria-label="Clear keyword search"><X className="h-4 w-4 text-[var(--muted)]" /></button> : null}
            </label>
            <SelectControl icon={<MapPin className="h-4 w-4" />} value={params.get("state") ?? ""} onChange={(value) => setFilter("state", value)} ariaLabel="Filter by state" disabled={query.isSuccess && !(query.data?.facets.availability.state ?? 0)}>
              <option value="">{query.isSuccess && !(query.data?.facets.availability.state ?? 0) ? "State data unavailable" : "All India"}</option>
              {(query.data?.facets.states ?? []).map((state) => state.value ? <option key={state.value} value={state.value}>{state.value} ({state.count})</option> : null)}
            </SelectControl>
            <Button type="button" variant="secondary" size="lg" onClick={() => setFiltersOpen((value) => !value)} aria-expanded={filtersOpen}>
              <SlidersHorizontal className="h-4 w-4" /> Filters
              {activeFilters.length ? <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--primary)] px-1.5 text-[10px] text-white">{activeFilters.length}</span> : null}
            </Button>
          </div>
          {filtersOpen ? <div className="hidden md:block"><AdvancedFilters params={params} facets={query.data?.facets} onSet={setFilter} onClose={() => setFiltersOpen(false)} /></div> : null}
          <TendyySheet open={filtersOpen} title="Tender filters" onClose={() => setFiltersOpen(false)} className="md:hidden">
            <AdvancedFilters params={params} facets={query.data?.facets} onSet={setFilter} onClose={() => setFiltersOpen(false)} compact />
          </TendyySheet>
          {activeFilters.length ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
              {activeFilters.map((filter) => <button type="button" key={filter.key} onClick={() => setFilter(filter.key, null)} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 text-[11px] font-semibold text-blue-700">{filter.label}<X className="h-3 w-3" /></button>)}
              <button type="button" onClick={clearAll} className="ml-1 text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--text)]">Clear all</button>
            </div>
          ) : null}
        </section>

        <section className="tendyy-surface overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-[var(--border)] px-4 pt-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1"><TendyyResponsiveNav label="Tender collection" value={tab} items={[{ value: "all", label: "All tenders" }, { value: "saved", label: "Saved" }, { value: "applied", label: "Applied" }]} onChange={(item) => { setCursorHistory([]); replaceParams(router, params, { view: item === "all" ? null : item, page: null, cursor: null, notice: null }); }} /></div>
            <div className="flex flex-wrap items-center gap-3 pb-3 text-[11px] text-[var(--muted)]">
              <span className="font-semibold text-[var(--text-soft)]">{query.isLoading ? "Searching..." : `${formatNumber(query.data?.total ?? 0)} found`}</span>
              <CoverageStatus coverage={coverage} />
              {query.data?.catalog ? <span>{formatNumber(query.data.catalog.active)} active | {formatNumber(query.data.catalog.expired)} expired{query.data.catalog.stale ? ` | ${formatNumber(query.data.catalog.stale)} stale` : ""}</span> : null}
              <button type="button" onClick={() => void query.refetch()} className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] hover:bg-[var(--surface-muted)]" aria-label="Refresh results"><RefreshCw className="h-3.5 w-3.5" /></button>
              <label className="inline-flex items-center gap-1">Sort
                <select value={sort} onChange={(event) => { setCursorHistory([]); replaceParams(router, params, { sort: event.target.value === "relevance" ? null : event.target.value, page: null, cursor: null }); }} className="bg-transparent font-semibold text-[var(--text-soft)] outline-none">
                  <option value="relevance">Relevance</option><option value="companyFit">Company fit</option><option value="newest">Newest</option><option value="deadline">Deadline</option><option value="value">Value</option><option value="updated">Recently updated</option>
                </select>
              </label>
              <div className="flex h-7 rounded-[7px] border border-[var(--border)] p-0.5">
                <button type="button" onClick={() => setView("list")} className={`flex w-7 items-center justify-center rounded-[5px] ${resultView === "list" ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "text-[var(--muted)]"}`} aria-label="List view"><List className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => setView("grid")} className={`flex w-7 items-center justify-center rounded-[5px] ${resultView === "grid" ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "text-[var(--muted)]"}`} aria-label="Grid view"><Grid2X2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          </div>
          {coverage && coverage.degradedSources > 0 ? <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">{coverage.degradedSources} enabled source{coverage.degradedSources === 1 ? " is" : "s are"} temporarily degraded. Existing notices remain searchable.</div> : null}
          {selectedPortalUnavailable ? <div className="flex items-center justify-between gap-4 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900"><span>{selectedPortal?.name} is registered but does not have a connected notice feed yet.</span><button type="button" onClick={() => setFilter("portal", null)} className="shrink-0 font-semibold text-amber-950 underline underline-offset-2">Search reporting portals</button></div> : null}
          {query.isError ? <div className="p-4"><TendyyErrorState message="Tender discovery could not be loaded. Check the API and selected workspace, then retry." onRetry={() => void query.refetch()} /></div> : null}
          {selectedIds.length ? <div className="flex flex-wrap items-center gap-2 border-b border-blue-200 bg-blue-50 px-4 py-2.5 text-xs text-blue-950"><CheckSquare className="h-4 w-4" /><b>{selectedIds.length} selected</b><Button size="sm" variant="secondary" onClick={() => bulkSave.mutate({ noticeIds: selectedIds, saved: true })}>Save selected</Button><Button size="sm" variant="secondary" onClick={() => bulkStart.mutate(selectedIds)}>Create drafts</Button><Button size="sm" variant="secondary" disabled={selectedIds.length < 2 || selectedIds.length > 4} onClick={() => setCompareOpen(true)}><GitCompareArrows className="h-4 w-4" /> Compare</Button><button type="button" className="ml-auto font-semibold" onClick={() => setSelectedIds([])}>Clear</button></div> : null}
          {compareOpen ? <ComparisonPanel loading={comparison.isLoading} items={comparison.data?.items ?? []} onClose={() => setCompareOpen(false)} /> : null}

          <div className={`grid min-w-0 ${selected ? "xl:grid-cols-[minmax(0,1fr)_390px]" : ""}`}>
            <div className="min-w-0 p-3 sm:p-4">
              {query.isLoading ? <TendyySkeletonRows count={7} /> : items.length ? (
                <div className={resultView === "grid" ? "grid gap-3 md:grid-cols-2" : "space-y-2"}>
                  {items.map((item) => <TenderResult key={item.id} item={item} selected={item.id === selectedId} checked={selectedIds.includes(item.id)} grid={resultView === "grid"} saving={(save.variables ?? unsave.variables) === item.id} onCheck={() => toggleSelected(item.id)} onSelect={() => replaceParams(router, params, { notice: item.id })} onSave={() => toggleSave(item)} />)}
                </div>
              ) : <TendyyEmptyState title={selectedPortalUnavailable ? "This portal is not connected yet" : coverage?.enabledSources ? "No matching tenders" : "Tender sources are not connected yet"} description={selectedPortalUnavailable ? "Choose a reporting portal to search persisted official notices." : coverage?.enabledSources ? "No indexed notice matches every active filter. Remove a filter or broaden your search." : `${coverage?.registeredSources ?? 0} official portals are registered. Enable a verified connector to begin receiving live notices.`} actionLabel={activeFilters.length ? "Clear filters" : undefined} onAction={clearAll} />}
              <Pagination page={page} totalPages={totalPages} total={query.data?.total ?? 0} hasMore={query.data?.hasMore ?? false} canPrevious={page > 1} onPrevious={() => { const history = [...cursorHistory]; const prior = history.pop() ?? null; setCursorHistory(history); replaceParams(router, params, { page: page <= 2 ? null : String(page - 1), cursor: prior, notice: null }); }} onNext={() => { if (!query.data?.nextCursor) return; setCursorHistory((current) => [...current, params.get("cursor")]); replaceParams(router, params, { page: String(page + 1), cursor: query.data.nextCursor, notice: null }); }} />
            </div>
            {selected ? <DetailRail notice={selected} loading={detailQuery.isLoading} busy={(save.variables ?? unsave.variables ?? startApplication.variables) === selected.id} error={mutationError(save.error ?? unsave.error ?? startApplication.error)} onClose={() => replaceParams(router, params, { notice: null })} onSave={() => toggleSave(selected)} onStart={() => startApplication.mutate(selected.id, { onSuccess: (result) => router.push(`/tenders/${result.tenderId}`) })} /> : null}
          </div>
        </section>
      </main>
    </AppShell>
  );
}

function TenderResult({ item, selected, checked, grid, saving, onCheck, onSelect, onSave }: { item: TenderNoticeSummary; selected: boolean; checked: boolean; grid: boolean; saving: boolean; onCheck: () => void; onSelect: () => void; onSave: () => void }) {
  return (
    <article className={`group relative min-w-0 rounded-[8px] border bg-white transition ${selected ? "border-[var(--primary)] shadow-[0_0_0_1px_var(--primary),0_8px_20px_rgba(21,94,239,0.08)]" : "border-[var(--border)] hover:border-blue-200 hover:shadow-[var(--shadow-subtle)]"}`}>
      <input type="checkbox" checked={checked} onChange={onCheck} onClick={(event) => event.stopPropagation()} className="absolute left-2 top-2 z-10 h-4 w-4" aria-label={`Select ${item.title}`} />
      <button type="button" onClick={onSelect} className={`grid w-full min-w-0 gap-3 p-3 pl-8 pr-12 text-left ${grid ? "grid-cols-[40px_minmax(0,1fr)]" : "sm:grid-cols-[42px_minmax(0,1fr)_150px_140px] sm:items-center"}`}>
        <PortalMark name={item.portalName ?? "Official portal"} />
        <span className="min-w-0">
          <span className="flex min-w-0 flex-wrap items-center gap-2"><span className="truncate text-[13px] font-semibold text-[var(--text)]"><Highlight text={item.title} terms={item.matchedTerms ?? []} /></span>{item.applicationTenderId ? <TendyyStatusBadge tone="success">Applied</TendyyStatusBadge> : null}</span>
          <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--muted)]"><span className="truncate">{item.buyerName ?? "Buyer not published"}</span><span className="text-[var(--border)]">|</span><span>{item.state ?? item.location ?? "India"}</span></span>
          <span className="mt-2 flex flex-wrap gap-1.5">{item.portalName ? <MetaTag>{item.portalName}</MetaTag> : null}{item.category ? <MetaTag>{item.category}</MetaTag> : null}{item.procurementType ? <MetaTag>{item.procurementType}</MetaTag> : null}<MetaTag>{item.matchScore}% fit</MetaTag><MetaTag>{item.quality.score}% complete</MetaTag></span>
        </span>
        <span className={`${grid ? "col-span-2 pl-[52px]" : ""} text-[11px] text-[var(--muted)] sm:text-right`}><b className="block text-[13px] font-semibold text-[var(--text-soft)]">{formatCurrency(item.estimatedValue, item.currency)}</b>{item.referenceNumber ?? "No reference"}</span>
        <span className={`${grid ? "col-span-2 pl-[52px] text-left" : ""} text-[11px] sm:text-right`}><b className={`block text-[13px] font-semibold ${deadlineTone(item.deadlineAt)}`}>{formatDate(item.deadlineAt)}</b>{deadlineLabel(item.deadlineAt)}</span>
      </button>
      <button type="button" onClick={(event) => { event.stopPropagation(); onSave(); }} disabled={saving} className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-[7px] text-[var(--muted)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)] disabled:opacity-50" aria-label={item.saved ? "Remove saved tender" : "Save tender"}>{item.saved ? <BookmarkCheck className="h-4 w-4 text-[var(--primary)]" /> : <Bookmark className="h-4 w-4" />}</button>
    </article>
  );
}

function DetailRail({ notice, loading, busy, error, onClose, onSave, onStart }: { notice: TenderNoticeSummary | TenderNoticeDetail; loading: boolean; busy: boolean; error: string | null; onClose: () => void; onSave: () => void; onStart: () => void }) {
  const detail = "sources" in notice ? notice : null;
  const railRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!window.matchMedia("(max-width: 1279px)").matches) return;
    const trigger = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab" || !railRef.current) return;
      const elements = Array.from(railRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); document.body.style.overflow = previousOverflow; trigger?.focus(); };
  }, []);
  return <><button type="button" onClick={onClose} className="fixed inset-0 z-30 bg-slate-950/20 xl:hidden" aria-label="Close tender detail" /><aside ref={railRef} role="dialog" aria-modal="true" className="fixed inset-y-0 right-0 z-40 flex w-full min-w-0 max-w-[min(390px,100vw)] flex-col overflow-hidden border-l border-[var(--border)] bg-white shadow-[-12px_0_32px_rgba(16,24,40,0.1)] xl:static xl:z-auto xl:max-w-none xl:border-y-0 xl:border-r-0 xl:shadow-none" aria-label="Tender details">
    <div className="flex min-w-0 items-start justify-between gap-4 border-b border-[var(--border)] p-4"><div className="min-w-0"><TendyyStatusBadge tone={toneFromStatus(notice.status)}>{notice.status}</TendyyStatusBadge><h2 className="tendyy-wrap-anywhere mt-3 text-[17px] font-semibold leading-6 text-[var(--text)]">{notice.title}</h2><p className="tendyy-wrap-anywhere mt-1.5 text-xs leading-5 text-[var(--muted)]">{notice.buyerName ?? "Buyer not published"}</p></div><button ref={closeRef} type="button" onClick={onClose} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] hover:bg-[var(--surface-muted)]" aria-label="Close details"><X className="h-4 w-4" /></button></div>
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
      <div className="grid grid-cols-2 gap-x-4 gap-y-4 border-b border-[var(--border-subtle)] pb-4"><Detail icon={<IndianRupee />} label="Estimated value" value={formatCurrency(notice.estimatedValue, notice.currency)} /><Detail icon={<CalendarClock />} label="Deadline" value={formatDate(notice.deadlineAt)} /><Detail icon={<MapPin />} label="Location" value={notice.location ?? notice.state ?? "Not published"} /><Detail icon={<Building2 />} label="Authority" value={notice.authorityType ?? "Not classified"} /></div>
      <section className="mt-4 rounded-[8px] bg-blue-50 p-3"><div className="flex items-center justify-between"><h3 className="text-xs font-semibold text-blue-950">Company fit</h3><b className="text-sm text-blue-700">{notice.matchScore}%</b></div><ul className="mt-2 space-y-1 text-[11px] text-blue-900">{notice.matchReasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul>{notice.quality.missing.length ? <p className="mt-2 text-[10px] text-amber-800">Missing: {notice.quality.missing.join(", ")}</p> : null}</section>
      <dl className="divide-y divide-[var(--border-subtle)] py-2">{[["Reference", notice.referenceNumber], ["Published", formatDate(notice.publishedAt)], ["Category", notice.category], ["Procurement", notice.procurementType], ["Portal", notice.portalName]].map(([label, value]) => <div key={label} className="grid min-w-0 grid-cols-[88px_minmax(0,1fr)] gap-3 py-2.5 text-xs"><dt className="text-[var(--muted)]">{label}</dt><dd className="tendyy-wrap-anywhere min-w-0 font-medium text-[var(--text-soft)]">{value || "Not published"}</dd></div>)}</dl>
      <section className="border-t border-[var(--border-subtle)] pt-4"><h3 className="text-xs font-semibold text-[var(--text)]">Overview</h3><p className="tendyy-wrap-anywhere mt-2 whitespace-pre-line text-xs leading-5 text-[var(--muted)]">{notice.description || "The source has not published a description."}</p></section>
      <section className="mt-5 border-t border-[var(--border-subtle)] pt-4"><div className="flex items-center justify-between"><h3 className="text-xs font-semibold text-[var(--text)]">Documents</h3><span className="text-[10px] text-[var(--muted)]">{detail?.documents.length ?? 0} linked</span></div>{loading ? <div className="mt-3"><TendyySkeletonRows count={2} /></div> : detail?.documents.length ? <div className="mt-2 divide-y divide-[var(--border-subtle)]">{detail.documents.map((document) => <a key={document.id} href={document.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 py-2.5 text-xs font-medium text-[var(--text-soft)] hover:text-[var(--primary)]"><FileText className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{document.name}<small className="block font-normal text-[var(--muted)]">{document.access === "DIRECT" ? document.importStatus.toLowerCase().replace("_", " ") : `${document.access.toLowerCase()} · open portal`}</small></span><ExternalLink className="h-3.5 w-3.5" /></a>)}</div> : <p className="mt-2 text-xs leading-5 text-[var(--muted)]">No public document links were returned by this source.</p>}</section>
      <a href={notice.sourceUrl} target="_blank" rel="noreferrer" className="tendyy-wrap-anywhere mt-5 inline-flex max-w-full items-center gap-2 text-xs font-semibold text-[var(--primary)]">Open official notice <ExternalLink className="h-3.5 w-3.5 shrink-0" /></a>
      {error ? <p className="tendyy-wrap-anywhere mt-4 border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800" role="alert">{error}</p> : null}
    </div>
    <div className="grid min-w-0 grid-cols-1 gap-2 border-t border-[var(--border)] p-4 min-[360px]:grid-cols-2"><Button type="button" variant="secondary" onClick={onSave} disabled={busy}>{notice.saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}{notice.saved ? "Saved" : "Save"}</Button>{notice.applicationTenderId ? <Button asChild><Link href={`/tenders/${notice.applicationTenderId}`}>Open workspace</Link></Button> : <Button type="button" onClick={onStart} disabled={busy}>Start application</Button>}</div>
  </aside></>;
}

function ComparisonPanel({ items, loading, onClose }: { items: TenderNoticeDetail[]; loading: boolean; onClose: () => void }) {
  return <section className="border-b border-[var(--border)] bg-white p-4" aria-label="Tender comparison"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Compare tenders</h2><button type="button" onClick={onClose} aria-label="Close comparison"><X className="h-4 w-4" /></button></div>{loading ? <TendyySkeletonRows count={3} /> : <div className="overflow-x-auto"><table className="min-w-[720px] w-full border-collapse text-xs"><thead><tr><th className="border p-2 text-left">Field</th>{items.map((item) => <th key={item.id} className="max-w-56 border p-2 text-left">{item.title}</th>)}</tr></thead><tbody>{[
    ["Buyer", (item: TenderNoticeDetail) => item.buyerName ?? "Not published"], ["Value", (item: TenderNoticeDetail) => formatCurrency(item.estimatedValue, item.currency)], ["EMD", (item: TenderNoticeDetail) => formatCurrency(item.emdAmount, item.currency)], ["Deadline", (item: TenderNoticeDetail) => formatDate(item.deadlineAt)], ["Location", (item: TenderNoticeDetail) => item.state ?? item.location ?? "Not published"], ["Source", (item: TenderNoticeDetail) => item.portalName ?? "Not published"], ["Company fit", (item: TenderNoticeDetail) => `${item.matchScore}%`], ["Documents", (item: TenderNoticeDetail) => String(item.documents.length)], ["Missing data", (item: TenderNoticeDetail) => item.quality.missing.join(", ") || "None"],
  ].map(([label, render]) => <tr key={label as string}><th className="border p-2 text-left font-semibold">{label as string}</th>{items.map((item) => <td key={item.id} className="border p-2 align-top">{(render as (item: TenderNoticeDetail) => string)(item)}</td>)}</tr>)}</tbody></table></div>}</section>;
}

function AdvancedFilters({ params, facets, onSet, onClose, compact = false }: { params: URLSearchParams; facets?: import("../../lib/models").TenderDiscoveryPayload["facets"]; onSet: (key: FilterKey, value: string | null) => void; onClose: () => void; compact?: boolean }) {
  const portals = facets?.portals ?? [];
  const categories = facets?.categories ?? [];
  const availability = facets?.availability;
  const reportingPortals = portals.filter((portal) => portal.enabled && portal.count > 0);
  const pendingPortals = portals.filter((portal) => !portal.enabled || portal.count === 0);
  return <div className={compact ? "grid min-w-0 grid-cols-1 gap-3" : "mt-3 grid min-w-0 gap-3 border-t border-[var(--border-subtle)] pt-3 sm:grid-cols-2 lg:grid-cols-4"}>
    <FilterField label="Portal"><select value={params.get("portal") ?? ""} onChange={(e) => onSet("portal", e.target.value)} className="filter-input"><option value="">All reporting portals</option><optgroup label="Connected">{reportingPortals.map((portal) => <option key={portal.key} value={portal.key}>{portal.name} ({formatNumber(portal.count)})</option>)}</optgroup>{pendingPortals.length ? <optgroup label="Not connected yet">{pendingPortals.map((portal) => <option key={portal.key} value={portal.key} disabled>{portal.name} - unavailable</option>)}</optgroup> : null}</select></FilterField>
    <FilterField label="Category"><select value={params.get("category") ?? ""} onChange={(e) => onSet("category", e.target.value)} className="filter-input"><option value="">All categories</option>{categories.map((category) => category.value ? <option key={category.value} value={category.value}>{category.value} ({category.count})</option> : null)}</select></FilterField>
    <FilterField label="Status"><select value={params.get("status") ?? ""} onChange={(e) => onSet("status", e.target.value)} className="filter-input"><option value="">All statuses</option>{(facets?.statuses ?? []).map((status) => <option key={status.value} value={status.value}>{status.value} ({formatNumber(status.count)})</option>)}</select></FilterField>
    <FilterField label="Freshness"><select value={params.get("freshness") ?? "current"} onChange={(e) => onSet("freshness", e.target.value === "current" ? null : e.target.value)} className="filter-input"><option value="current">Current notices</option><option value="stale">Stale notices</option><option value="all">All indexed notices</option></select></FilterField>
    <FilterField label="Buyer"><input key={params.get("buyer")} defaultValue={params.get("buyer") ?? ""} onBlur={(e) => onSet("buyer", e.target.value.trim())} className="filter-input" placeholder="Ministry, PSU or authority" /></FilterField>
    <FilterField label="Authority type"><select value={params.get("authorityType") ?? ""} onChange={(e) => onSet("authorityType", e.target.value)} className="filter-input"><option value="">All authorities</option>{(facets?.authorityTypes ?? []).map((item) => item.value ? <option key={item.value} value={item.value}>{item.value} ({formatNumber(item.count)})</option> : null)}</select></FilterField>
    <FilterField label="Location"><input key={params.get("location")} defaultValue={params.get("location") ?? ""} onBlur={(e) => onSet("location", e.target.value.trim())} disabled={Boolean(availability && !availability.location)} className="filter-input disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)]" placeholder={availability && !availability.location ? "Unavailable from current sources" : "City or district"} /></FilterField>
    <FilterField label="Procurement type"><select value={params.get("procurementType") ?? ""} onChange={(e) => onSet("procurementType", e.target.value)} className="filter-input"><option value="">All procurement types</option>{(facets?.procurementTypes ?? []).map((item) => item.value ? <option key={item.value} value={item.value}>{item.value} ({formatNumber(item.count)})</option> : null)}</select></FilterField>
    <FilterField label="Published from"><input type="date" value={params.get("publishedFrom") ?? ""} onChange={(e) => onSet("publishedFrom", e.target.value)} className="filter-input" /></FilterField>
    <FilterField label="Published to"><input type="date" value={params.get("publishedTo") ?? ""} onChange={(e) => onSet("publishedTo", e.target.value)} className="filter-input" /></FilterField>
    <FilterField label="Deadline from"><input type="date" value={params.get("deadlineFrom") ?? ""} onChange={(e) => onSet("deadlineFrom", e.target.value)} className="filter-input" /></FilterField>
    <FilterField label="Deadline to"><input type="date" value={params.get("deadlineTo") ?? ""} onChange={(e) => onSet("deadlineTo", e.target.value)} className="filter-input" /></FilterField>
    <FilterField label="Minimum value"><input type="number" min="0" value={params.get("minValue") ?? ""} onChange={(e) => onSet("minValue", e.target.value)} disabled={Boolean(availability && !availability.estimatedValue)} className="filter-input disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)]" placeholder={availability && !availability.estimatedValue ? "Unavailable" : "0"} /></FilterField>
    <FilterField label="Maximum value"><input type="number" min="0" value={params.get("maxValue") ?? ""} onChange={(e) => onSet("maxValue", e.target.value)} disabled={Boolean(availability && !availability.estimatedValue)} className="filter-input disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)]" placeholder={availability && !availability.estimatedValue ? "Unavailable" : "No limit"} /></FilterField>
    <div className="flex items-end justify-end"><Button type="button" variant="secondary" onClick={onClose}>Done <ChevronDown className="h-4 w-4" /></Button></div>
  </div>;
}

function SelectControl({ icon, value, onChange, children, ariaLabel, disabled = false }: { icon: ReactNode; value: string; onChange: (value: string) => void; children: ReactNode; ariaLabel: string; disabled?: boolean }) { return <label className={`flex h-11 items-center gap-2 rounded-[8px] border border-[var(--border)] px-3 text-[var(--muted)] ${disabled ? "bg-[var(--surface-muted)]" : "bg-white"}`}>{icon}<select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[var(--text-soft)] outline-none disabled:cursor-not-allowed" aria-label={ariaLabel}>{children}</select></label>; }
function FilterField({ label, children }: { label: string; children: ReactNode }) { return <label className="text-[11px] font-semibold text-[var(--text-soft)]">{label}{children}</label>; }
function MetaTag({ children }: { children: ReactNode }) { return <span className="inline-flex h-5 items-center rounded-[5px] bg-[var(--surface-muted)] px-2 text-[10px] font-medium text-[var(--muted)]">{children}</span>; }
function Highlight({ text, terms }: { text: string; terms: string[] }) { if (!terms.length) return text; const pattern = new RegExp(`(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi"); return <>{text.split(pattern).map((part, index) => terms.some((term) => part.toLocaleLowerCase("en-IN") === term.toLocaleLowerCase("en-IN")) ? <mark key={`${part}-${index}`} className="bg-amber-100 text-inherit">{part}</mark> : part)}</>; }
function PortalMark({ name }: { name: string }) { const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase(); return <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-[var(--primary-soft)] text-[11px] font-bold text-[var(--primary)]">{initials || "IN"}</span>; }
function Detail({ icon, label, value }: { icon: ReactNode; label: string; value: string }) { return <div className="min-w-0"><span className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--muted)]"><span className="[&>svg]:h-3 [&>svg]:w-3">{icon}</span>{label}</span><span className="mt-1 block truncate text-xs font-semibold text-[var(--text-soft)]">{value}</span></div>; }
function CoverageStatus({ coverage }: { coverage?: { registeredSources: number; enabledSources: number; healthySources: number; degradedSources: number; lastRefreshedAt: string | null } }) { if (!coverage) return null; const tone = coverage.degradedSources ? "bg-amber-500" : coverage.healthySources ? "bg-emerald-500" : "bg-slate-300"; return <span className="inline-flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${tone}`} />{coverage.healthySources}/{coverage.registeredSources} sources reporting{coverage.lastRefreshedAt ? ` | ${relativeTime(coverage.lastRefreshedAt)}` : ""}</span>; }
function Pagination({ page, totalPages, total, hasMore, canPrevious, onPrevious, onNext }: { page: number; totalPages: number; total: number; hasMore: boolean; canPrevious: boolean; onPrevious: () => void; onNext: () => void }) { if (totalPages <= 1) return total ? <p className="mt-4 text-[11px] text-[var(--muted)]">Showing all {formatNumber(total)} results</p> : null; return <div className="mt-4 flex items-center justify-between border-t border-[var(--border-subtle)] pt-4 text-[11px] text-[var(--muted)]"><span>Page {page} of {totalPages}</span><div className="flex gap-1"><button type="button" disabled={!canPrevious} onClick={onPrevious} className="page-button" aria-label="Previous page"><ArrowLeft className="h-3.5 w-3.5" /></button><button type="button" disabled={!hasMore} onClick={onNext} className="page-button" aria-label="Next page"><ArrowRight className="h-3.5 w-3.5" /></button></div></div>; }
function PageSkeleton() { return <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Tender Search" }]}><div className="p-4"><TendyySkeletonRows count={8} /></div></AppShell>; }

function filterChips(params: URLSearchParams): Array<{ key: FilterKey; label: string }> { const labels: Record<FilterKey, string> = { portal: "Portal", state: "State", category: "Category", status: "Status", buyer: "Buyer", authorityType: "Authority", location: "Location", procurementType: "Procurement", minValue: "Min value", maxValue: "Max value", publishedFrom: "Published from", publishedTo: "Published to", deadlineFrom: "Deadline from", deadlineTo: "Deadline to", freshness: "Freshness" }; return (Object.keys(labels) as FilterKey[]).flatMap((key) => { const value = params.get(key); return value ? [{ key, label: `${labels[key]}: ${value}` }] : []; }); }
function replaceParams(router: ReturnType<typeof useRouter>, current: URLSearchParams, updates: Record<string, string | null>) { const next = new URLSearchParams(current.toString()); for (const [key, value] of Object.entries(updates)) { if (value) next.set(key, value); else next.delete(key); } router.replace(next.size ? `/tenders?${next}` : "/tenders", { scroll: false }); }
function parseTab(value: string | null): Tab { return value === "saved" || value === "applied" ? value : "all"; }
function positiveInt(value: string | null) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : 1; }
function optionalNumber(value: string | null) { if (!value) return undefined; const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : undefined; }
function parseFreshness(value: string | null): "current" | "stale" | "all" { return value === "stale" || value === "all" ? value : "current"; }
function dateStart(value: string | null) { return value ? new Date(`${value}T00:00:00+05:30`).toISOString() : undefined; }
function dateEnd(value: string | null) { return value ? new Date(`${value}T23:59:59+05:30`).toISOString() : undefined; }
function formatNumber(value: number) { return new Intl.NumberFormat("en-IN").format(value); }
function formatCurrency(value: number | null, currency: string) { if (value === null) return "Value not published"; return new Intl.NumberFormat("en-IN", { style: "currency", currency: currency || "INR", maximumFractionDigits: 0 }).format(value); }
function formatDate(value: string | null) { if (!value) return "Not published"; return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)); }
function deadlineLabel(value: string | null) { if (!value) return "Deadline unavailable"; const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000); if (days < 0) return "Expired"; if (days === 0) return "Closes today"; return `${days} day${days === 1 ? "" : "s"} left`; }
function deadlineTone(value: string | null) { if (!value) return "text-[var(--muted)]"; const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000); return days < 0 ? "text-[var(--muted)]" : days <= 3 ? "text-[var(--danger)]" : days <= 10 ? "text-[var(--warning)]" : "text-[var(--text-soft)]"; }
function relativeTime(value: string) { const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000)); if (minutes < 2) return "just now"; if (minutes < 60) return `${minutes}m ago`; const hours = Math.round(minutes / 60); if (hours < 24) return `${hours}h ago`; return `${Math.round(hours / 24)}d ago`; }
function mutationError(error: Error | null) { return error?.message ?? null; }
