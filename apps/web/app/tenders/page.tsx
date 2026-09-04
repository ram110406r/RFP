"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  Download,
  Eye,
  FileText,
  Grid2X2,
  Landmark,
  List,
  MapPin,
  RefreshCw,
  Search,
  Share2,
  SlidersHorizontal,
  X,
  Zap,
} from "lucide-react";

import { AppShell } from "../../components/app-shell";
import { RfpEmptyState, RfpStatusBadge, statusTone } from "../../components/rfp-foundation";
import {
  TendyyCard,
  TendyyErrorState,
  TendyyMetricCard,
  TendyyPageHeader,
  TendyySectionHeader,
  TendyySkeletonRows,
  TendyyStatusBadge,
  TendyyTable,
  toneFromStatus,
} from "../../components/tendyy-ui";
import { useTender, useTenders } from "../../lib/queries";
import type { TenderSummary } from "../../lib/models";
import { Button } from "@rfp-os/ui";

type SortKey = "updated" | "deadline" | "title";
type TabKey = "all" | "saved" | "tracked" | "applied";

const statusOptions = ["DRAFT", "INTAKE", "PROCESSING", "READY", "IN_PROGRESS", "REVIEW", "APPROVED", "SUBMITTED", "CLOSED"];

export default function TendersPage() {
  return (
    <Suspense fallback={<SearchLoadingState />}>
      <TenderSearchPage />
    </Suspense>
  );
}

function TenderSearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(() => searchParams.get("q") ?? "");
  const [status, setStatus] = useState(() => searchParams.get("status") ?? "all");
  const [tenderType, setTenderType] = useState(() => searchParams.get("type") ?? "all");
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get("page") ?? 1)));
  const [sort, setSort] = useState<SortKey>("updated");
  const [tab, setTab] = useState<TabKey>("all");
  const [view, setView] = useState<"list" | "grid">("list");
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());
  const [trackedIds, setTrackedIds] = useState<Set<string>>(() => new Set());
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("tendyy:saved-tenders");
    if (saved) {
      try {
        setSavedIds(new Set(JSON.parse(saved) as string[]));
      } catch {
        window.localStorage.removeItem("tendyy:saved-tenders");
      }
    }
    const tracked = window.localStorage.getItem("tendyy:tracked-tenders");
    if (tracked) {
      try {
        setTrackedIds(new Set(JSON.parse(tracked) as string[]));
      } catch {
        window.localStorage.removeItem("tendyy:tracked-tenders");
      }
    }
  }, []);

  useEffect(() => {
    const updateViewport = () => setIsDesktop(window.innerWidth >= 1200);
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextSearch = search.trim();
      setDebouncedSearch(nextSearch);
      setPage(1);
      updateUrl(router, new URLSearchParams(window.location.search), { q: nextSearch || null, page: "1" });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [router, search]);

  const tendersQuery = useTenders({
    search: debouncedSearch || undefined,
    status: tab === "applied" ? "IN_PROGRESS" : status === "all" ? undefined : status,
    tenderType: tenderType === "all" ? undefined : tenderType,
    includeArchived: false,
    page,
    pageSize: 10,
  });

  const rows = useMemo(() => {
    const items = tendersQuery.data?.items ?? [];
    return [...items].sort((left, right) => {
      if (sort === "title") return left.title.localeCompare(right.title);
      if (sort === "deadline") return compareDates(left.dueAt, right.dueAt);
      return compareDates(right.updatedAt, left.updatedAt);
    });
  }, [sort, tendersQuery.data?.items]);

  const visibleRows = useMemo(() => {
    if (tab === "saved") return rows.filter((tender) => savedIds.has(tender.id));
    if (tab === "tracked") return rows.filter((tender) => trackedIds.has(tender.id));
    return rows;
  }, [rows, savedIds, tab, trackedIds]);

  const requestedTenderId = searchParams.get("tender");
  const selectedId = requestedTenderId ?? (isDesktop ? visibleRows[0]?.id ?? "" : "");
  const selectedFromList = rows.find((tender) => tender.id === selectedId) ?? null;
  const selectedQuery = useTender(selectedId, selectedFromList);
  const selectedTender = selectedQuery.data ?? selectedFromList;
  const total = tendersQuery.data?.total ?? 0;
  const pageSize = tendersQuery.data?.pageSize ?? 10;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const lastUpdated = rows[0]?.updatedAt;
  const dueSoonCount = rows.filter((tender) => {
    const days = daysUntil(tender.dueAt);
    return Number.isFinite(days) && days >= 0 && days <= 7;
  }).length;
  const missingDeadlineCount = rows.filter((tender) => !tender.dueAt).length;
  const activeStatusCount = rows.filter((tender) => !["CLOSED", "ARCHIVED", "SUBMITTED"].includes(tender.status)).length;

  function selectTender(tenderId: string) {
    updateUrl(router, searchParams, { tender: tenderId });
  }

  function closeDetail() {
    updateUrl(router, searchParams, { tender: null });
  }

  function toggleSaved(tenderId: string) {
    setSavedIds((current) => {
      const next = new Set(current);
      if (next.has(tenderId)) next.delete(tenderId);
      else next.add(tenderId);
      window.localStorage.setItem("tendyy:saved-tenders", JSON.stringify([...next]));
      return next;
    });
  }

  function toggleTracked(tenderId: string) {
    setTrackedIds((current) => {
      const next = new Set(current);
      if (next.has(tenderId)) next.delete(tenderId);
      else next.add(tenderId);
      window.localStorage.setItem("tendyy:tracked-tenders", JSON.stringify([...next]));
      return next;
    });
  }

  function updateFilter(key: "status" | "type", value: string) {
    if (key === "status") setStatus(value);
    else setTenderType(value);
    setPage(1);
    updateUrl(router, searchParams, { [key]: value === "all" ? null : value, page: "1" });
  }

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Tender Search" }]}>
      <div className="min-w-0 space-y-5 pb-6">
        <TendyyPageHeader
          eyebrow="RFP intake"
          title="Tender search"
          description="Find live tender records from the existing workspace API, inspect fit and deadlines, then open the canonical RFP workspace."
          actions={
            <>
              <Button asChild variant="secondary">
                <Link href="/tenders/import">
                  <UploadIcon />
                  Import
                </Link>
              </Button>
              <Button asChild>
                <Link href="/tenders/new">
                  New tender
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </>
          }
        />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Tender search metrics">
          <TendyyMetricCard label="Results" value={tendersQuery.isLoading ? "-" : total} detail="Records matching current query" icon={<Search className="h-5 w-5" />} loading={tendersQuery.isLoading} />
          <TendyyMetricCard label="Active work" value={activeStatusCount} detail="Visible records not closed or submitted" icon={<FileText className="h-5 w-5" />} loading={tendersQuery.isLoading} tone="primary" />
          <TendyyMetricCard label="Due soon" value={dueSoonCount} detail="Visible deadlines within seven days" icon={<ClockIcon />} loading={tendersQuery.isLoading} tone={dueSoonCount > 0 ? "warning" : "neutral"} />
          <TendyyMetricCard label="No deadline" value={missingDeadlineCount} detail="Records missing due dates" icon={<AlertIcon />} loading={tendersQuery.isLoading} tone={missingDeadlineCount > 0 ? "warning" : "neutral"} />
        </section>

        <TendyyCard aria-label="Tender search controls">
          <div className="flex flex-col gap-3 xl:flex-row">
            <label className="flex h-11 min-w-0 flex-1 items-center gap-3 rounded-[9px] border border-[var(--border)] bg-white px-3 text-[var(--muted)] focus-within:border-[var(--primary)] focus-within:ring-2 focus-within:ring-[rgba(21,94,239,0.1)]">
              <Search className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tenders by title, authority, reference, or keyword" className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted-subtle)]" />
              {search ? <button type="button" onClick={() => setSearch("")} className="text-[#98A2B3] hover:text-[#101828]" aria-label="Clear search"><X className="h-4 w-4" /></button> : null}
            </label>
            <Button type="button" size="lg" onClick={() => void tendersQuery.refetch()}>
              <Search className="h-4 w-4" strokeWidth={1.8} /> Search
            </Button>
            <Button type="button" variant="secondary" size="lg" disabled title="Saved search persistence is not available in the current API">
              Saved searches <ChevronDown className="h-4 w-4" strokeWidth={1.8} />
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#F2F4F7] pt-4">
            <FilterSelect label="Status" value={status} options={["all", ...statusOptions]} onChange={(value) => updateFilter("status", value)} />
            <FilterSelect label="Tender type" value={tenderType} options={["all", "DOCUMENT", "ONLINE"]} onChange={(value) => updateFilter("type", value)} />
            <details className="relative">
              <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-[8px] border border-[#E4E7EC] px-3 text-xs font-semibold text-[#344054]">More filters <SlidersHorizontal className="h-3.5 w-3.5 text-[#667085]" /></summary>
              <div className="absolute left-0 top-11 z-20 w-72 border border-[#E4E7EC] bg-white p-4 text-xs text-[#667085] shadow-[0_12px_32px_rgba(16,24,40,0.12)]">
                The current API supports status, tender type, keyword search, and server-side pagination. Authority, location, value, and source filters will appear when supported by the data service.
              </div>
            </details>
            {(status !== "all" || tenderType !== "all" || search) ? <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => { setSearch(""); updateFilter("status", "all"); updateFilter("type", "all"); }}>Clear all</Button> : null}
          </div>
        </TendyyCard>

        <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-white px-4 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5 overflow-x-auto">
            {(["all", "saved", "tracked", "applied"] as TabKey[]).map((item) => (
              <button key={item} type="button" onClick={() => { setTab(item); setPage(1); }} aria-pressed={tab === item} className={`relative whitespace-nowrap pb-3 text-sm font-semibold capitalize ${tab === item ? "text-[#155EEF] after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-[#155EEF]" : "text-[#667085] hover:text-[#344054]"}`}>{item === "all" ? "All tenders" : item}</button>
            ))}
          </div>
          <div className="flex items-center gap-3 pb-3 text-xs text-[#667085]">
            <span className="font-medium">{tendersQuery.isLoading ? "Loading tenders..." : `${tab === "all" || tab === "applied" ? total : visibleRows.length} tender${(tab === "all" || tab === "applied" ? total : visibleRows.length) === 1 ? "" : "s"} found`}</span>
            <span className="inline-flex items-center gap-1.5 text-[#344054]"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> LIVE</span>
            <span className="hidden md:inline">{lastUpdated ? `Updated ${relativeTime(lastUpdated)}` : "Waiting for refresh"}</span>
            <Button type="button" variant="icon" size="icon" onClick={() => void tendersQuery.refetch()} aria-label="Refresh tenders"><RefreshCw className="h-3.5 w-3.5" strokeWidth={1.8} /></Button>
            <label className="hidden items-center gap-2 md:flex">Sort:
              <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} className="bg-transparent font-semibold text-[#344054] outline-none"><option value="updated">Last updated</option><option value="deadline">Deadline</option><option value="title">Title</option></select>
            </label>
            <button type="button" onClick={() => setView("list")} className={view === "list" ? "text-[#155EEF]" : "text-[#98A2B3]"} aria-label="List view"><List className="h-4 w-4" /></button>
            <button type="button" onClick={() => setView("grid")} className={view === "grid" ? "text-[#155EEF]" : "text-[#98A2B3]"} aria-label="Grid view"><Grid2X2 className="h-4 w-4" /></button>
          </div>
        </div>

        {tendersQuery.isError ? <TendyyErrorState message="Unable to load tenders from the current API." onRetry={() => void tendersQuery.refetch()} /> : null}

        <div className={`grid min-w-0 gap-5 ${view === "grid" ? "md:grid-cols-2" : ""} xl:grid-cols-[minmax(0,1fr)_380px]`}>
          <TendyyCard className="min-w-0" aria-label="Tender results">
            <TendyySectionHeader
              eyebrow="Search results"
              title={`${visibleRows.length} visible tender${visibleRows.length === 1 ? "" : "s"}`}
              description="Rows are backed by the active tender list endpoint and update with the current search, status, type, and pagination filters."
            />
            <div className="mt-4">
            {tendersQuery.isLoading ? <TenderSkeleton /> : visibleRows.length > 0 ? view === "list" ? <TenderTable rows={visibleRows} selectedId={selectedId} savedIds={savedIds} onSelect={selectTender} onToggleSaved={toggleSaved} /> : <TenderGrid rows={visibleRows} selectedId={selectedId} savedIds={savedIds} onSelect={selectTender} onToggleSaved={toggleSaved} /> : <RfpEmptyState title="No tenders found" description={tab === "all" ? "Try adjusting your search or filters." : `No tenders are currently ${tab}.`} actionLabel="Show all tenders" onAction={() => setTab("all")} />}
            </div>
            <Pagination page={page} totalPages={tab === "saved" || tab === "tracked" ? 1 : totalPages} total={tab === "saved" || tab === "tracked" ? visibleRows.length : total} pageSize={pageSize} onPageChange={(nextPage) => { setPage(nextPage); updateUrl(router, searchParams, { page: String(nextPage) }); }} />
          </TendyyCard>

          {selectedTender ? <TenderDetailPanel tender={selectedTender} loading={selectedQuery.isLoading} saved={savedIds.has(selectedTender.id)} tracked={trackedIds.has(selectedTender.id)} onClose={closeDetail} onToggleSaved={() => toggleSaved(selectedTender.id)} onToggleTracked={() => toggleTracked(selectedTender.id)} mobile={!isDesktop} /> : null}
        </div>
      </div>
    </AppShell>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[#E4E7EC] px-3 text-xs text-[#667085]">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="max-w-[125px] bg-transparent font-semibold text-[#344054] outline-none"><option value="all">All</option>{options.filter((option) => option !== "all").map((option) => <option key={option} value={option}>{formatStatus(option)}</option>)}</select></label>;
}

function TenderTable({ rows, selectedId, savedIds, onSelect, onToggleSaved }: { rows: TenderSummary[]; selectedId: string; savedIds: Set<string>; onSelect: (id: string) => void; onToggleSaved: (id: string) => void }) {
  return <TendyyTable minWidth={860}><thead className="tendyy-table-head"><tr><th className="px-4 py-3">Tender</th><th className="px-3 py-3">Authority</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Value</th><th className="px-3 py-3">Deadline</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Updated</th><th className="px-3 py-3" /></tr></thead><tbody>{rows.map((tender) => <TenderTableRow key={tender.id} tender={tender} selected={tender.id === selectedId} saved={savedIds.has(tender.id)} onSelect={onSelect} onToggleSaved={onToggleSaved} />)}</tbody></TendyyTable>;
}

function TenderTableRow({ tender, selected, saved, onSelect, onToggleSaved }: { tender: TenderSummary; selected: boolean; saved: boolean; onSelect: (id: string) => void; onToggleSaved: (id: string) => void }) {
  return <tr className={`tendyy-table-row align-top text-xs text-[#344054] ${selected ? "bg-[#EFF5FF]/60" : ""}`}><td className="max-w-[280px] px-4 py-3"><button type="button" onClick={() => onSelect(tender.id)} className="flex w-full items-start gap-3 text-left"><TenderIcon tender={tender} /><span className="min-w-0"><span className="block font-semibold leading-5 text-[#101828]">{tender.title}</span><span className="mt-1 block truncate text-[11px] text-[#667085]">ID: {tender.referenceNumber ?? tender.id}</span><span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#98A2B3]">{isRecentlyUpdated(tender.updatedAt) ? "Live update" : "Workspace record"}</span></span></button></td><td className="max-w-[150px] px-3 py-4 text-xs leading-5">{tender.name}</td><td className="px-3 py-4 text-xs">{formatStatus(tender.tenderType)}</td><td className="whitespace-nowrap px-3 py-4 font-medium text-[#101828]">{getTenderValue(tender.metadata)}</td><td className="whitespace-nowrap px-3 py-4">{formatDate(tender.dueAt)}<span className={`mt-1 block text-[10px] ${daysUntil(tender.dueAt) <= 7 ? "text-amber-700" : "text-[#98A2B3]"}`}>{tender.dueAt ? deadlineLabel(tender.dueAt) : "No due date"}</span></td><td className="px-3 py-4"><RfpStatusBadge tone={statusTone(tender.status)}>{formatStatus(tender.status)}</RfpStatusBadge></td><td className="whitespace-nowrap px-3 py-4 text-[#667085]">{relativeTime(tender.updatedAt)}</td><td className="px-3 py-4"><div className="flex items-center gap-1"><button type="button" onClick={() => onToggleSaved(tender.id)} className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[#667085] hover:bg-[#EFF5FF] hover:text-[#155EEF]" aria-label={saved ? "Remove saved tender" : "Save tender"}>{saved ? <BookmarkCheck className="h-4 w-4 text-[#155EEF]" /> : <Bookmark className="h-4 w-4" />}</button><button type="button" onClick={() => onSelect(tender.id)} className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[#667085] hover:bg-[#EFF5FF] hover:text-[#155EEF]" aria-label="Preview tender"><Eye className="h-4 w-4" /></button></div></td></tr>;
}

function TenderGrid({ rows, selectedId, savedIds, onSelect, onToggleSaved }: { rows: TenderSummary[]; selectedId: string; savedIds: Set<string>; onSelect: (id: string) => void; onToggleSaved: (id: string) => void }) {
  return <div className="grid gap-3">{rows.map((tender) => <button type="button" key={tender.id} onClick={() => onSelect(tender.id)} className={`rounded-[var(--radius-md)] border p-4 text-left transition hover:bg-[#F8FAFC] ${selectedId === tender.id ? "border-[#155EEF] bg-[#EFF5FF]/60" : "border-[#E4E7EC] bg-white"}`}><div className="flex items-start gap-3"><TenderIcon tender={tender} /><div className="min-w-0 flex-1"><p className="font-semibold text-[#101828]">{tender.title}</p><p className="mt-1 text-xs text-[#667085]">{tender.name}</p></div><span onClick={(event) => { event.stopPropagation(); onToggleSaved(tender.id); }} className="text-[#667085]">{savedIds.has(tender.id) ? <BookmarkCheck className="h-4 w-4 text-[#155EEF]" /> : <Bookmark className="h-4 w-4" />}</span></div><div className="mt-4 grid grid-cols-3 gap-2 border-t border-[#F2F4F7] pt-3 text-xs"><span><b className="block text-[#98A2B3]">Deadline</b>{formatDate(tender.dueAt)}</span><span><b className="block text-[#98A2B3]">Value</b>{getTenderValue(tender.metadata)}</span><span><b className="block text-[#98A2B3]">Status</b>{formatStatus(tender.status)}</span></div></button>)}</div>;
}

function TenderDetailPanel({ tender, loading, saved, tracked, onClose, onToggleSaved, onToggleTracked, mobile }: { tender: TenderSummary; loading: boolean; saved: boolean; tracked: boolean; onClose: () => void; onToggleSaved: () => void; onToggleTracked: () => void; mobile: boolean }) {
  const [activeTab, setActiveTab] = useState<"overview" | "documents" | "updates" | "timeline">("overview");
  const sourceUrl = tender.sourceUrl;
  const panel = <aside className={`tendyy-surface min-w-0 overflow-hidden ${mobile ? "fixed inset-y-0 right-0 z-40 w-[min(390px,100vw)] overflow-y-auto rounded-none shadow-[-12px_0_32px_rgba(16,24,40,0.12)]" : "xl:sticky xl:top-6 xl:self-start"}`} aria-label="Tender details"><div className="flex items-center justify-between border-b border-[#F2F4F7] px-5 py-4"><TendyyStatusBadge tone={isRecentlyUpdated(tender.updatedAt) ? "success" : "neutral"}>{isRecentlyUpdated(tender.updatedAt) ? "Live" : "Workspace record"}</TendyyStatusBadge><button type="button" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[#667085] hover:bg-[#F8FAFC]" aria-label="Close tender details"><X className="h-4 w-4" /></button></div><div className="border-b border-[#F2F4F7] px-5 py-5"><div className="flex items-start gap-3"><TenderIcon tender={tender} /><div className="min-w-0"><h2 className="text-lg font-semibold leading-6 text-[#101828]">{tender.title}</h2><p className="mt-2 text-sm text-[#667085]">{tender.name}</p><p className="mt-2 text-xs text-[#98A2B3]">ID: {tender.referenceNumber ?? tender.id}</p></div></div><div className="mt-4 flex flex-wrap items-center gap-2"><TendyyStatusBadge tone={toneFromStatus(tender.status)}>{formatStatus(tender.status)}</TendyyStatusBadge><span className="text-xs text-[#667085]">Updated {relativeTime(tender.updatedAt)}</span></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={onToggleSaved} className="inline-flex h-8 items-center gap-2 rounded-[8px] border border-[#E4E7EC] px-3 text-xs font-semibold text-[#344054] hover:border-[#155EEF] hover:text-[#155EEF]"><Bookmark className="h-3.5 w-3.5" />{saved ? "Saved" : "Save"}</button><button type="button" onClick={onToggleTracked} className="inline-flex h-8 items-center gap-2 rounded-[8px] border border-[#E4E7EC] px-3 text-xs font-semibold text-[#344054] hover:border-[#155EEF] hover:text-[#155EEF]"><ClockIcon small />{tracked ? "Tracked" : "Track"}</button><button type="button" onClick={() => void navigator.clipboard?.writeText(window.location.href)} className="inline-flex h-8 items-center gap-2 rounded-[8px] border border-[#E4E7EC] px-3 text-xs font-semibold text-[#344054] hover:border-[#155EEF] hover:text-[#155EEF]"><Share2 className="h-3.5 w-3.5" />Share</button>{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-2 rounded-[8px] border border-[#E4E7EC] px-3 text-xs font-semibold text-[#344054] hover:border-[#155EEF] hover:text-[#155EEF]"><Download className="h-3.5 w-3.5" />Source</a> : null}</div></div><div className="flex gap-4 overflow-x-auto border-b border-[#F2F4F7] px-5 pt-3">{(["overview", "documents", "updates", "timeline"] as const).map((tab) => <button type="button" key={tab} onClick={() => setActiveTab(tab)} className={`whitespace-nowrap pb-3 text-xs font-semibold capitalize ${activeTab === tab ? "border-b-2 border-[#155EEF] text-[#155EEF]" : "text-[#667085]"}`}>{tab}</button>)}</div>{loading ? <div className="p-5"><TendyySkeletonRows count={3} /></div> : activeTab === "overview" ? <DetailOverview tender={tender} /> : <div className="p-5 text-sm leading-6 text-[#667085]">This workspace tab is ready for its corresponding persisted data. Open the full tender workspace to inspect {activeTab}.</div>}<div className="border-t border-[#F2F4F7] p-5"><Link href={`/tenders/${tender.id}`} className="flex h-10 w-full items-center justify-center gap-2 rounded-[9px] bg-[#155EEF] text-sm font-semibold text-white hover:bg-[#0F4BD6]">Open tender workspace <ArrowRight className="h-4 w-4" /></Link></div></aside>;
  return mobile ? <div className="fixed inset-0 z-30 bg-[#101828]/25" onClick={onClose}><div onClick={(event) => event.stopPropagation()}>{panel}</div></div> : panel;
}

function DetailOverview({ tender }: { tender: TenderSummary }) {
  const metadata = tender.metadata;
  return <div className="p-5"><dl className="divide-y divide-[#F2F4F7] border-y border-[#F2F4F7]">{[["Estimated value", getTenderValue(metadata)], ["Deadline", tender.dueAt ? `${formatDate(tender.dueAt)}, ${formatTime(tender.dueAt, tender.timezone)}` : "Not set"], ["Published date", formatDate(tender.receivedAt ?? tender.createdAt)], ["Authority", tender.name], ["Category", formatStatus(tender.tenderType)], ["Location", metadataText(metadata, "location")], ["Submission mode", metadataText(metadata, "submissionMode")], ["Source", formatStatus(tender.sourceType)]].map(([label, value]) => <div key={label} className="grid grid-cols-[112px_1fr] gap-4 py-3 text-xs"><dt className="text-[#667085]">{label}</dt><dd className="font-medium text-[#101828]">{value}</dd></div>)}</dl><div className="mt-5"><h3 className="text-sm font-semibold text-[#101828]">Description</h3><p className="mt-2 line-clamp-6 text-sm leading-6 text-[#667085]">{tender.description || "No description has been provided for this tender."}</p></div></div>;
}

function TenderIcon({ tender }: { tender: TenderSummary }) {
  const text = `${tender.title} ${tender.name}`.toLowerCase();
  const Icon = text.includes("elect") ? Zap : text.includes("water") ? MapPin : text.includes("government") ? Landmark : FileText;
  return <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-[#EFF5FF] text-[#155EEF]"><Icon className="h-[18px] w-[18px]" strokeWidth={1.8} /></span>;
}

function Pagination({ page, totalPages, total, pageSize, onPageChange }: { page: number; totalPages: number; total: number; pageSize: number; onPageChange: (page: number) => void }) {
  if (total === 0) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return <div className="flex flex-col gap-3 py-4 text-xs text-[#667085] sm:flex-row sm:items-center sm:justify-between"><span>Showing {start} to {end} of {total} tenders</span><div className="flex items-center gap-1"><button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="inline-flex h-8 w-8 items-center justify-center rounded-[7px] border border-[#E4E7EC] disabled:opacity-40" aria-label="Previous page"><ArrowLeft className="h-3.5 w-3.5" /></button>{paginationPages(page, totalPages).map((item, index) => item === "..." ? <span key={`ellipsis-${index}`} className="px-2">...</span> : <button type="button" key={item} onClick={() => onPageChange(item)} className={`inline-flex h-8 min-w-8 items-center justify-center rounded-[7px] border px-2 ${item === page ? "border-[#155EEF] bg-[#EFF5FF] font-semibold text-[#155EEF]" : "border-[#E4E7EC] text-[#344054]"}`}>{item}</button>)}<button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="inline-flex h-8 w-8 items-center justify-center rounded-[7px] border border-[#E4E7EC] disabled:opacity-40" aria-label="Next page"><ArrowRight className="h-3.5 w-3.5" /></button></div></div>;
}

function TenderSkeleton() {
  return <TendyySkeletonRows count={5} />;
}

function SearchLoadingState() { return <AppShell breadcrumbs={[{ label: "Tender Search" }]}><TenderSkeleton /></AppShell>; }

function updateUrl(router: ReturnType<typeof useRouter>, current: URLSearchParams, changes: Record<string, string | null>) {
  const next = new URLSearchParams(current.toString());
  Object.entries(changes).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
  const query = next.toString();
  router.replace(query ? `/tenders?${query}` : "/tenders", { scroll: false });
}

function compareDates(left: string | null, right: string | null) {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return new Date(left).getTime() - new Date(right).getTime();
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not set" : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatTime(value: string, timezone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: timezone || undefined }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" }).format(date);
  }
}

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function isRecentlyUpdated(value: string) {
  const age = Date.now() - new Date(value).getTime();
  return Number.isFinite(age) && age >= 0 && age < 15 * 60 * 1000;
}

function getTenderValue(metadata: Record<string, unknown>) {
  const value = metadata.estimatedValue ?? metadata.estimatedContractValue ?? metadata.value;
  if (typeof value === "number" && Number.isFinite(value)) return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
  if (typeof value === "string" && value.trim()) return value;
  return "-";
}

function metadataText(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value : "Not provided";
}

function formatStatus(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function daysUntil(value: string | null | undefined) {
  if (!value) return Number.POSITIVE_INFINITY;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}

function deadlineLabel(value: string | null | undefined) {
  const days = daysUntil(value);
  if (!Number.isFinite(days)) return "No due date";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  return `${days}d left`;
}

function paginationPages(page: number, totalPages: number): Array<number | "..."> {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (page <= 3) return [1, 2, 3, "...", totalPages];
  if (page >= totalPages - 2) return [1, "...", totalPages - 2, totalPages - 1, totalPages];
  return [1, "...", page, "...", totalPages];
}

function UploadIcon() {
  return <FileText className="h-4 w-4" />;
}

function ClockIcon({ small = false }: { small?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={small ? "h-3.5 w-3.5" : "h-5 w-5"} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  );
}
