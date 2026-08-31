"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileCheck2,
  FilePlus2,
  FileText,
  Filter,
  History,
  Layers3,
  MoreHorizontal,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

import { AppShell } from "./app-shell";
import { ApiError } from "../lib/api";
import { useActivities, useDashboardSummary, useKnowledgeItem, useKnowledgeList, useKnowledgeSummary, useApproveKnowledge, useArchiveKnowledge } from "../lib/queries";
import type { ActivityItem, DashboardOverview, KnowledgeItem } from "../lib/models";
import { useFirebaseSession } from "./firebase-auth-gate";
import { RfpEmptyState, RfpErrorState } from "./rfp-foundation";

type KnowledgeTab =
  | "all"
  | "evidence"
  | "answers"
  | "templates"
  | "policies"
  | "certifications"
  | "case-studies"
  | "past-responses"
  | "insights";

type KnowledgeStatusFilter = "all" | "DRAFT" | "ACTIVE" | "ARCHIVED";
type KnowledgeVerificationFilter = "all" | "verified" | "review_due" | "expiring_soon" | "draft";

const KNOWLEDGE_TABS: Array<{ key: KnowledgeTab; label: string }> = [
  { key: "all", label: "All" },
  { key: "evidence", label: "Evidence" },
  { key: "answers", label: "Answers" },
  { key: "templates", label: "Templates" },
  { key: "policies", label: "Policies" },
  { key: "certifications", label: "Certifications" },
  { key: "case-studies", label: "Case Studies" },
  { key: "past-responses", label: "Past Responses" },
  { key: "insights", label: "Insights" },
];

const STATUS_OPTIONS: Array<{ key: KnowledgeStatusFilter; label: string }> = [
  { key: "all", label: "All statuses" },
  { key: "ACTIVE", label: "Verified" },
  { key: "DRAFT", label: "Draft" },
  { key: "ARCHIVED", label: "Archived" },
];

const VERIFICATION_OPTIONS: Array<{ key: KnowledgeVerificationFilter; label: string }> = [
  { key: "all", label: "All verification" },
  { key: "verified", label: "Verified" },
  { key: "review_due", label: "Review due" },
  { key: "expiring_soon", label: "Expiring soon" },
  { key: "draft", label: "Draft" },
];

const ADD_KNOWLEDGE_ITEMS = [
  { label: "Upload Evidence", href: "/tenders/import", detail: "Add documents", icon: Upload },
  { label: "Add Answer", href: "/apply", detail: "Build reusable answers", icon: FileText },
  { label: "Create Template", href: "/tenders/new", detail: "Create reusable templates", icon: ClipboardList },
  { label: "Add Certification", href: "/workspace", detail: "Upload certificates", icon: BadgeCheck },
];

const QUICK_ACTIONS = [
  { label: "Upload Evidence", href: "/tenders/import", detail: "Add documents", icon: Upload },
  { label: "Add Answer", href: "/apply", detail: "Build reusable answers", icon: FileText },
  { label: "Create Template", href: "/tenders/new", detail: "Create templates", icon: ClipboardList },
  { label: "Add Certification", href: "/workspace", detail: "Upload certificates", icon: BadgeCheck },
  { label: "Ask Brain", href: "/knowledge?ask=1", detail: "Get AI-powered answers", icon: Sparkles },
];

const PAGE_SIZE = 10;
const AGGREGATE_PAGE_SIZE = 100;

type UsageRow = {
  id?: string;
  title: string;
  type: string;
  usedIn: string;
  lastUsed: string;
  impact: "High" | "Medium" | "Low";
};

export function KnowledgeWorkspaceClient() {
  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Knowledge Brain" }]}>
      <KnowledgeBrowser />
    </AppShell>
  );
}

export function KnowledgeDetailClient({
  knowledgeId,
  initialItem,
}: {
  knowledgeId: string;
  initialItem?: KnowledgeItem | null;
}) {
  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Knowledge Brain", href: "/knowledge" }, { label: "Knowledge Detail" }]}>
      <KnowledgeDetailPanel knowledgeId={knowledgeId} initialItem={initialItem ?? null} />
    </AppShell>
  );
}

function KnowledgeBrowser() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useFirebaseSession();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const askInputRef = useRef<HTMLInputElement>(null);
  const [searchText, setSearchText] = useState(searchParams.get("q") ?? "");
  const deferredSearch = useDeferredValue(searchText.trim());
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<KnowledgeTab>(parseTab(searchParams.get("tab")));
  const [statusFilter, setStatusFilter] = useState<KnowledgeStatusFilter>("all");
  const [verificationFilter, setVerificationFilter] = useState<KnowledgeVerificationFilter>("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [askBrainOpen, setAskBrainOpen] = useState(searchParams.get("ask") === "1");
  const [askQuestion, setAskQuestion] = useState("What knowledge do we have for active applications?");
  const [openActionRow, setOpenActionRow] = useState<string | null>(null);

  const summaryQuery = useKnowledgeSummary();
  const allKnowledgeQuery = useKnowledgeList({ page: 1, pageSize: AGGREGATE_PAGE_SIZE });
  const listQuery = useKnowledgeList({
    search: deferredSearch || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
    page,
    pageSize: PAGE_SIZE,
  });
  const dashboardQuery = useDashboardSummary(6);
  const activityQuery = useActivities({ entityType: "knowledge_source", q: "knowledge" });

  const knowledgeSummary = summaryQuery.data ?? null;
  const aggregateItems = allKnowledgeQuery.data?.items ?? knowledgeSummary?.items ?? [];
  const paginatedItems = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? knowledgeSummary?.counts.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filteredItems = useMemo(
    () =>
      paginatedItems.filter((item) => {
        if (activeTab !== "all" && normalizeKnowledgeType(item.type) !== activeTab) return false;
        if (ownerFilter !== "all" && item.ownerId !== ownerFilter) return false;
        if (verificationFilter !== "all" && getVerificationBucket(item) !== verificationFilter) return false;
        return true;
      }),
    [activeTab, ownerFilter, paginatedItems, verificationFilter],
  );

  const visibleCount = filteredItems.length;
  const activeTenders = dashboardQuery.data?.activeTenders ?? [];
  const recommendations = useMemo(
    () => buildRecommendations(aggregateItems, activeTenders, dashboardQuery.data ?? null),
    [aggregateItems, activeTenders, dashboardQuery.data],
  );
  const categoryCounts = useMemo(() => buildCategoryCounts(aggregateItems), [aggregateItems]);
  const health = useMemo(() => buildKnowledgeHealth(knowledgeSummary, aggregateItems), [aggregateItems, knowledgeSummary]);
  const activityFeed = useMemo(
    () => buildKnowledgeActivityFeed(activityQuery.data?.items ?? [], dashboardQuery.data ?? null),
    [activityQuery.data?.items, dashboardQuery.data],
  );
  const usageRows = useMemo(() => buildUsageRows(aggregateItems), [aggregateItems]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, statusFilter, verificationFilter, ownerFilter, deferredSearch]);

  useEffect(() => {
    setSearchText(searchParams.get("q") ?? "");
    setActiveTab(parseTab(searchParams.get("tab")));
    setAskBrainOpen(searchParams.get("ask") === "1");
  }, [searchParams]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isModK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (!isModK) return;
      event.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const updateUrl = (next: Record<string, string | null>) => {
    const current = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value && value.length > 0) current.set(key, value);
      else current.delete(key);
    }
    router.replace(`${pathname}${current.toString() ? `?${current.toString()}` : ""}`, { scroll: false });
  };

  const onTabSelect = (tab: KnowledgeTab) => {
    setActiveTab(tab);
    updateUrl({ tab, ask: null });
  };

  const onAskBrain = () => {
    const next = !askBrainOpen;
    setAskBrainOpen(next);
    updateUrl({ ask: next ? "1" : null });
    if (next) queueMicrotask(() => askInputRef.current?.focus());
  };

  const visibleKnowledge = filteredItems;
  const emptyState = listQuery.isError ? null : visibleKnowledge.length === 0 ? (
    <div className="rounded-[10px] border border-dashed border-[#D0D5DD] bg-white p-6">
      <RfpEmptyState
        title={deferredSearch ? "No matching knowledge." : "No knowledge in this category."}
        description={deferredSearch ? "Try a broader search or clear the filters." : "Upload your first document or create reusable knowledge for responses."}
        actionLabel="+ Add Knowledge"
        actionHref="/tenders/import"
      />
    </div>
  ) : null;

  return (
    <div className="min-w-0 space-y-5 pb-8">
      <section className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <button
            type="button"
            onClick={() => setAddMenuOpen((current) => !current)}
            className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-slate-950 px-4 text-[13px] font-semibold text-white transition hover:bg-slate-800"
          >
            <FilePlus2 className="h-4 w-4" />
            Add Knowledge
            <ChevronDown className="h-4 w-4" strokeWidth={1.75} />
          </button>

          {addMenuOpen ? (
            <div className="absolute left-0 top-12 z-30 w-64 rounded-[10px] border border-slate-200 bg-white p-2 shadow-[0_16px_40px_rgba(16,24,40,0.12)]">
              {ADD_KNOWLEDGE_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setAddMenuOpen(false)}
                    className="flex items-center gap-3 rounded-[8px] px-3 py-2.5 transition hover:bg-slate-50"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#EFF5FF] text-[#155EEF]">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[#101828]">{item.label}</span>
                      <span className="block text-[11px] text-[#667085]">{item.detail}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>

        <button type="button" onClick={onAskBrain} className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-800 transition hover:border-[#155EEF] hover:text-[#155EEF]">
          <Sparkles className="h-4 w-4" />
          Ask Brain
        </button>

        <button
          type="button"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-slate-200 bg-white text-slate-700"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-[#155EEF]" />
        </button>

        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EFF5FF] text-xs font-semibold text-[#155EEF]">
            {initials(session?.profile?.displayName ?? session?.user?.displayName ?? "User")}
          </div>
          <div className="hidden sm:block">
            <p className="text-[13px] font-semibold text-slate-950">{session?.profile?.displayName ?? session?.user?.displayName ?? "Workspace Admin"}</p>
            <p className="text-[11px] text-slate-500">{session?.profile?.role ?? "Workspace Admin"}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-400" />
        </div>
      </section>

      <section className="grid gap-3 rounded-[10px] border border-slate-200 bg-white p-3 shadow-[0_12px_28px_rgba(16,24,40,0.04)] lg:grid-cols-[minmax(0,1fr)_160px]">
        <label className="flex h-12 items-center gap-3 rounded-[8px] border border-[#D0D5DD] px-4 text-[#667085] focus-within:border-[#155EEF]">
          <Search className="h-4 w-4 shrink-0" />
          <input
            ref={searchInputRef}
            value={searchText}
            onChange={(event) => {
              setSearchText(event.target.value);
              updateUrl({ q: event.target.value || null });
            }}
            placeholder="Search knowledge, evidence, answers, templates..."
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#98A2B3]"
          />
          <span className="inline-flex items-center gap-1 rounded-md border border-[#D0D5DD] bg-[#FCFCFD] px-2 py-1 text-[11px] font-semibold text-[#667085]">
            <span>⌘</span>
            <span>K</span>
          </span>
        </label>

        <div className="flex items-center gap-3">
          <SelectChip
            label="Type"
            value={activeTab}
            options={KNOWLEDGE_TABS}
            onChange={(value) => onTabSelect(value as KnowledgeTab)}
          />
          <SelectChip label="Status" value={statusFilter} options={STATUS_OPTIONS} onChange={(value) => setStatusFilter(value as KnowledgeStatusFilter)} />
          <SelectChip
            label="Owner"
            value={ownerFilter}
            options={[
              { key: "all", label: "All owners" },
              ...buildOwnerOptions(aggregateItems, session?.profile?.displayName ?? session?.user?.displayName ?? null, session?.user?.uid ?? session?.profile?.uid ?? null),
            ]}
            onChange={(value) => setOwnerFilter(value)}
          />
          <SelectChip
            label="Verification"
            value={verificationFilter}
            options={VERIFICATION_OPTIONS}
            onChange={(value) => setVerificationFilter(value as KnowledgeVerificationFilter)}
          />
          <button type="button" className="inline-flex h-10 items-center gap-2 rounded-[9px] border border-[#E4E7EC] px-3 text-xs font-semibold text-[#344054]">
            <Filter className="h-3.5 w-3.5 text-[#667085]" />
            Filters
          </button>
        </div>
      </section>

      {listQuery.isError ? (
        <RfpErrorState
          title="Unable to load Knowledge Brain."
          message={listQuery.error instanceof ApiError ? listQuery.error.message : "We couldn't retrieve your knowledge repository."}
          onRetry={() => void listQuery.refetch()}
        />
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KnowledgeMetric
          label="Total Knowledge"
          value={knowledgeSummary?.counts.total ?? total}
          detail={`+${countRecentlyAdds(aggregateItems)} this month`}
          icon={<BookOpen className="h-5 w-5" />}
        />
        <KnowledgeMetric
          label="Verified Sources"
          value={knowledgeSummary?.counts.active ?? countVerified(aggregateItems)}
          detail={formatPercent(knowledgeSummary?.counts.active, knowledgeSummary?.counts.total)}
          icon={<ShieldCheck className="h-5 w-5" />}
        />
        <KnowledgeMetric
          label="Frequently Used"
          value={countFrequentlyUsed(aggregateItems)}
          detail={`Used in ${countApplicationLinks(aggregateItems)} applications`}
          icon={<Layers3 className="h-5 w-5" />}
        />
        <KnowledgeMetric
          label="High Impact"
          value={countHighImpact(aggregateItems)}
          detail="Strongly improves win rate"
          icon={<ArrowRight className="h-5 w-5" />}
        />
      </section>

      <section className="overflow-x-auto border-b border-[#E4E7EC]">
        <div className="flex min-w-max items-center gap-5">
          {KNOWLEDGE_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabSelect(tab.key)}
              className={[
                "relative whitespace-nowrap pb-3 text-sm font-semibold transition",
                activeTab === tab.key
                  ? "text-[#155EEF] after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-[#155EEF]"
                  : "text-[#667085] hover:text-[#344054]",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.75fr)_minmax(300px,0.82fr)]">
        <main className="min-w-0 space-y-5">
          <Panel title="RECENT KNOWLEDGE" actionHref="/knowledge" actionLabel="View All Knowledge">
            <div className="hidden lg:block">
              <KnowledgeTable
                items={visibleKnowledge}
                loading={listQuery.isLoading}
                total={visibleCount}
                onActionToggle={setOpenActionRow}
                openActionRow={openActionRow}
              />
            </div>

            <div className="grid gap-3 lg:hidden">
              {listQuery.isLoading ? <KnowledgeMobileSkeleton /> : null}
              {!listQuery.isLoading && visibleKnowledge.length > 0 ? (
                visibleKnowledge.map((item) => <KnowledgeMobileCard key={item.id} item={item} />)
              ) : null}
              {emptyState}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#F2F4F7] pt-4 text-sm text-[#667085]">
              <p>
                Showing {visibleCount} of {total} knowledge sources
              </p>
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </Panel>

          <Panel title="QUICK ACCESS">
            <div className="grid items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {QUICK_ACTIONS.map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  className="flex min-h-[168px] flex-col rounded-[10px] border border-[#E4E7EC] bg-white p-4 text-center transition hover:border-[#155EEF] hover:bg-[#FCFCFD]"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-[#EFF5FF] text-[#155EEF]">
                    <action.icon className="h-4 w-4" />
                  </span>
                  <span className="mt-4 flex flex-1 min-w-0 flex-col items-center justify-start">
                    <span className="block max-w-[11ch] text-[15px] font-semibold leading-5 text-[#101828]">{action.label}</span>
                    <span className="mt-2 block min-h-[40px] text-[13px] leading-5 text-[#667085]">{action.detail}</span>
                  </span>
                </Link>
              ))}
            </div>
          </Panel>

          <Panel title="RECENTLY USED IN APPLICATIONS" actionHref="/apply" actionLabel="View All">
            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full border-collapse text-left">
                <thead className="border-b border-[#F2F4F7] bg-[#FCFCFD] text-[10px] font-semibold uppercase tracking-[0.08em] text-[#667085]">
                  <tr>
                    <th className="px-4 py-3">Knowledge</th>
                    <th className="px-3 py-3">Type</th>
                    <th className="px-3 py-3">Used In</th>
                    <th className="px-3 py-3">Last Used</th>
                    <th className="px-4 py-3">Impact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F2F4F7]">
                  {usageRows.length > 0 ? (
                    usageRows.map((row) => (
                      <tr key={row.title} className="align-top text-[13px] text-[#344054]">
                        <td className="px-4 py-4">
                          <Link href={`/knowledge/${row.id ?? row.title}`} className="font-semibold text-[#101828] hover:text-[#155EEF]">
                            {row.title}
                          </Link>
                        </td>
                        <td className="px-3 py-4">
                          <Pill tone="neutral">{row.type}</Pill>
                        </td>
                        <td className="px-3 py-4 text-xs text-[#344054]">{row.usedIn}</td>
                        <td className="whitespace-nowrap px-3 py-4 text-xs text-[#344054]">{row.lastUsed}</td>
                        <td className="px-4 py-4">
                          <Pill tone={row.impact === "High" ? "success" : row.impact === "Medium" ? "warning" : "neutral"}>{row.impact}</Pill>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-sm text-[#667085]">
                        No usage data available yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </main>

        <aside className="space-y-5">
          <Panel title="SMART RECOMMENDATIONS" actionHref="/knowledge" actionLabel="View All">
            <p className="-mt-2 mb-4 text-sm text-[#667085]">AI-recommended for active applications</p>
            <div className="space-y-2">
              {recommendations.length > 0 ? (
                recommendations.map((item) => (
                  <Link
                    key={`${item.title}-${item.context}`}
                    href="/knowledge"
                    className="flex items-center gap-3 rounded-[10px] border border-[#E4E7EC] bg-white px-3 py-3 transition hover:border-[#155EEF] hover:bg-[#FCFCFD]"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-[#EFF5FF] text-[#155EEF]">
                      <FileText className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[#101828]">{item.title}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-[#667085]">{item.context}</span>
                    </span>
                    <span className="text-right text-xs font-semibold text-[#155EEF]">{item.match}%</span>
                  </Link>
                ))
              ) : (
                <p className="rounded-[10px] border border-dashed border-[#D0D5DD] px-3 py-4 text-sm text-[#667085]">
                  No recommendations yet.
                </p>
              )}
            </div>
            <Link href="/knowledge" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#155EEF]">
              Explore More Recommendations
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Panel>

          <Panel title="POPULAR CATEGORIES" actionHref="/knowledge" actionLabel="View All">
            <div className="space-y-1">
              {categoryCounts.length > 0 ? (
                categoryCounts.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      setActiveTab("all");
                      setOwnerFilter("all");
                      setVerificationFilter("all");
                      setStatusFilter("all");
                      setSearchText(item.label);
                      updateUrl({ q: item.label, tab: null });
                      searchInputRef.current?.focus();
                    }}
                    className="flex w-full items-center justify-between rounded-[8px] px-2 py-2 text-left transition hover:bg-[#F8FAFC]"
                  >
                    <span className="text-sm font-medium text-[#101828]">{item.label}</span>
                    <span className="text-sm text-[#667085]">{item.count}</span>
                  </button>
                ))
              ) : (
                <p className="rounded-[8px] border border-dashed border-[#D0D5DD] px-3 py-4 text-sm text-[#667085]">
                  No categories available yet.
                </p>
              )}
            </div>
          </Panel>

          <Panel title="KNOWLEDGE HEALTH">
            <div className="flex items-center gap-5">
              <HealthRing value={health.score} />
              <div className="space-y-3">
                <HealthLegend tone="green" label="Verified" value={`${health.verified} (${formatPercentValue(health.verified, health.total)})`} />
                <HealthLegend tone="amber" label="Review Due" value={`${health.reviewDue} (${formatPercentValue(health.reviewDue, health.total)})`} />
                <HealthLegend tone="red" label="Expiring Soon" value={`${health.expiringSoon} (${formatPercentValue(health.expiringSoon, health.total)})`} />
                <HealthLegend tone="slate" label="Draft" value={`${health.draft} (${formatPercentValue(health.draft, health.total)})`} />
              </div>
            </div>
          </Panel>

          <Panel title="ACTIVITY FEED" actionHref="/knowledge" actionLabel="View All">
            <div className="space-y-2">
              {activityFeed.length > 0 ? (
                activityFeed.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={`${item.title}-${item.time}-${item.detail}`} className="flex items-start gap-3 rounded-[10px] border border-[#F2F4F7] bg-white p-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#EFF5FF] text-[#155EEF]">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[#101828]">{item.title}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-[#667085]">{item.detail}</span>
                      </span>
                      {item.time ? <span className="whitespace-nowrap text-[11px] text-[#98A2B3]">{item.time}</span> : null}
                    </div>
                  );
                })
              ) : (
                <p className="rounded-[10px] border border-dashed border-[#D0D5DD] px-3 py-4 text-sm text-[#667085]">
                  No recent knowledge activity.
                </p>
              )}
            </div>
          </Panel>
        </aside>
      </div>

      {askBrainOpen ? (
        <section className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-3xl rounded-[12px] border border-[#E4E7EC] bg-white p-4 shadow-[0_20px_60px_rgba(16,24,40,0.18)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#98A2B3]">Ask Brain</p>
              <p className="mt-1 text-sm font-semibold text-[#101828]">Ask a question about company knowledge</p>
            </div>
            <button type="button" onClick={() => setAskBrainOpen(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#E4E7EC] text-[#667085]">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <label className="flex h-11 flex-1 items-center gap-3 rounded-[8px] border border-[#D0D5DD] px-3 text-[#667085] focus-within:border-[#155EEF]">
              <Search className="h-4 w-4" />
              <input
                ref={askInputRef}
                value={askQuestion}
                onChange={(event) => setAskQuestion(event.target.value)}
                placeholder="What security certifications do we currently have?"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#98A2B3]"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setSearchText(askQuestion);
                updateUrl({ q: askQuestion, ask: "1" });
              }}
              className="inline-flex h-11 items-center justify-center rounded-[8px] bg-[#155EEF] px-4 text-sm font-semibold text-white"
            >
              Search knowledge
            </button>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {recommendations.slice(0, 4).map((item) => (
              <Link key={`${item.title}-${item.context}`} href={`/knowledge`} className="rounded-[8px] border border-[#E4E7EC] p-3 transition hover:border-[#155EEF]">
                <p className="text-sm font-semibold text-[#101828]">{item.title}</p>
                <p className="mt-1 text-xs text-[#667085]">{item.context}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function KnowledgeDetailPanel({
  knowledgeId,
  initialItem,
}: {
  knowledgeId: string;
  initialItem: KnowledgeItem | null;
}) {
  const itemQuery = useKnowledgeItem(knowledgeId, initialItem ?? undefined);
  const summaryQuery = useKnowledgeSummary();
  const activityQuery = useActivities({ entityType: "knowledge_source", q: knowledgeId });
  const approveKnowledge = useApproveKnowledge();
  const archiveKnowledge = useArchiveKnowledge();

  const item = itemQuery.data ?? initialItem ?? null;
  const related = useMemo(() => {
    const candidates = [...(summaryQuery.data?.items ?? []), ...(summaryQuery.data?.attention ?? [])].filter((candidate) => candidate.id !== knowledgeId);
    return candidates
      .filter((candidate) => normalizeKnowledgeType(candidate.type) === normalizeKnowledgeType(item?.type ?? candidate.type) || candidate.category === item?.category)
      .slice(0, 4);
  }, [item?.category, item?.type, knowledgeId, summaryQuery.data?.attention, summaryQuery.data?.items]);

  const usedIn = useMemo(() => buildUsedInReferences(item, activityQuery.data?.items ?? []), [activityQuery.data?.items, item]);

  if (itemQuery.isError && !item) {
    return (
      <RfpErrorState
        title="Unable to load knowledge detail."
        message={itemQuery.error instanceof ApiError ? itemQuery.error.message : "We couldn't retrieve this knowledge item."}
        onRetry={() => void itemQuery.refetch()}
      />
    );
  }

  if (!item) {
    return <KnowledgeDetailSkeleton />;
  }

  return (
    <div className="space-y-5 pb-8">
      <header className="flex flex-col gap-4 border-b border-[#E4E7EC] pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#98A2B3]">Knowledge source</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#101828] sm:text-[32px]">{item.name}</h1>
            <Pill tone={statusTone(item.status)}>{formatKnowledgeStatus(item.status)}</Pill>
          </div>
          <p className="mt-2 text-sm text-[#667085]">{item.summary || "No summary provided."}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Pill tone="neutral">{item.type}</Pill>
            <Pill tone="neutral">{item.category}</Pill>
            <Pill tone="neutral">v{item.version}</Pill>
            <Pill tone="neutral">Owner {shortOwnerLabel(item.ownerId, null, null)}</Pill>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/knowledge" className="inline-flex h-10 items-center gap-2 rounded-[9px] border border-[#E4E7EC] px-4 text-sm font-semibold text-[#344054]">
            Back to Knowledge
          </Link>
          <button
            type="button"
            onClick={() => approveKnowledge.mutate(item.id)}
            className="inline-flex h-10 items-center gap-2 rounded-[9px] bg-[#155EEF] px-4 text-sm font-semibold text-white"
          >
            <BadgeCheck className="h-4 w-4" />
            Approve
          </button>
          <button
            type="button"
            onClick={() => archiveKnowledge.mutate(item.id)}
            className="inline-flex h-10 items-center gap-2 rounded-[9px] border border-[#E4E7EC] px-4 text-sm font-semibold text-[#344054]"
          >
            Archive
          </button>
        </div>
      </header>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.85fr)]">
        <main className="space-y-5">
          <Panel title="DETAILS">
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoRow label="Type" value={item.type} />
              <InfoRow label="Category" value={item.category} />
              <InfoRow label="Status" value={formatKnowledgeStatus(item.status)} />
              <InfoRow label="Verification" value={getVerificationBucketLabel(getVerificationBucket(item))} />
              <InfoRow label="Version" value={item.version} />
              <InfoRow label="Authority" value={item.authority} />
              <InfoRow label="Last verified" value={formatDate(item.lastVerified)} />
              <InfoRow label="Last updated" value={formatDate(item.lastUpdated)} />
            </div>
          </Panel>

          <Panel title="SOURCE / EVIDENCE TRACEABILITY">
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-[10px] border border-[#E4E7EC] bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#98A2B3]">Used in</p>
                <div className="mt-3 space-y-2">
                  {usedIn.length > 0 ? (
                    usedIn.map((entry) => (
                      <div key={`${entry.application}-${entry.question}`} className="rounded-[8px] border border-[#F2F4F7] px-3 py-2">
                        <p className="text-sm font-semibold text-[#101828]">{entry.application}</p>
                        <p className="mt-1 text-xs text-[#667085]">{entry.question}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[#667085]">No application usage recorded yet.</p>
                  )}
                </div>
              </div>
              <div className="rounded-[10px] border border-[#E4E7EC] bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#98A2B3]">Related knowledge</p>
                <div className="mt-3 space-y-2">
                  {related.length > 0 ? (
                    related.map((entry) => (
                      <Link key={entry.id} href={`/knowledge/${entry.id}`} className="block rounded-[8px] border border-[#F2F4F7] px-3 py-2 transition hover:border-[#155EEF]">
                        <p className="text-sm font-semibold text-[#101828]">{entry.name}</p>
                        <p className="mt-1 text-xs text-[#667085]">{entry.category} · {entry.type}</p>
                      </Link>
                    ))
                  ) : (
                    <p className="text-sm text-[#667085]">No related knowledge identified yet.</p>
                  )}
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="CLAIMS">
            <div className="grid gap-3">
              {(item.claims ?? []).length > 0 ? (
                item.claims?.map((claim) => (
                  <div key={`${claim.label}-${claim.value}`} className="rounded-[10px] border border-[#E4E7EC] bg-white p-4">
                    <p className="text-sm font-semibold text-[#101828]">{claim.label}</p>
                    <p className="mt-1 text-sm text-[#667085]">{claim.value}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#667085]">No extracted claims yet.</p>
              )}
            </div>
          </Panel>

          <Panel title="VERSION HISTORY">
            <div className="space-y-2">
              {(item.versions ?? []).length > 0 ? (
                item.versions?.map((version) => (
                  <div key={version.id} className="flex items-start justify-between gap-3 rounded-[10px] border border-[#E4E7EC] bg-white p-4">
                    <div>
                      <p className="text-sm font-semibold text-[#101828]">v{version.version}</p>
                      <p className="mt-1 text-sm text-[#667085]">{version.note}</p>
                    </div>
                    <span className="whitespace-nowrap text-xs text-[#98A2B3]">{formatDate(version.date)}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#667085]">No version history yet.</p>
              )}
            </div>
          </Panel>
        </main>

        <aside className="space-y-5">
          <Panel title="KNOWLEDGE HEALTH">
            <div className="flex items-center gap-4">
              <HealthRing value={item.status === "ACTIVE" ? 88 : item.status === "DRAFT" ? 54 : 40} />
              <div className="space-y-2">
                <InfoRow label="Source" value="Repository item" />
                <InfoRow label="Expiration" value={formatDate(item.expiresAt)} />
                <InfoRow label="Owner" value={shortOwnerLabel(item.ownerId, null, null)} />
              </div>
            </div>
          </Panel>

          <Panel title="ACTIVITY">
            <div className="space-y-2">
              {(activityQuery.data?.items ?? []).slice(0, 5).map((entry) => (
                <div key={entry.id} className="rounded-[10px] border border-[#F2F4F7] bg-white p-3">
                  <p className="text-sm font-semibold text-[#101828]">{entry.label}</p>
                  <p className="mt-1 text-xs text-[#667085]">{entry.summary}</p>
                </div>
              ))}
              {(activityQuery.data?.items ?? []).length === 0 ? <p className="text-sm text-[#667085]">No activity recorded for this item yet.</p> : null}
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function Panel({
  title,
  actionLabel,
  actionHref,
  children,
}: {
  title: string;
  actionLabel?: string;
  actionHref?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[10px] border border-[#E4E7EC] bg-white p-4 shadow-[0_12px_28px_rgba(16,24,40,0.04)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.04em] text-[#101828]">{title}</h2>
        {actionLabel && actionHref ? (
          <Link href={actionHref} className="inline-flex items-center gap-1 text-xs font-semibold text-[#155EEF]">
            {actionLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function KnowledgeMetric({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: number | string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <article className="rounded-[10px] border border-[#E4E7EC] bg-white p-4 shadow-[0_12px_28px_rgba(16,24,40,0.04)]">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-[#EFF5FF] text-[#155EEF]">{icon}</span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#667085]">{label}</p>
          <p className="mt-1 text-[24px] font-semibold tracking-[-0.03em] text-[#101828]">{value}</p>
          <p className="mt-1 text-xs text-[#667085]">{detail}</p>
        </div>
      </div>
    </article>
  );
}

function KnowledgeTable({
  items,
  loading,
  total,
  onActionToggle,
  openActionRow,
}: {
  items: KnowledgeItem[];
  loading: boolean;
  total: number;
  onActionToggle: (id: string | null) => void;
  openActionRow: string | null;
}) {
  if (loading) return <KnowledgeTableSkeleton />;
  if (items.length === 0) return <RfpEmptyState title="No knowledge in this category." description="Upload your first document or create reusable knowledge for your RFP responses." actionLabel="+ Add Knowledge" actionHref="/tenders/import" />;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[980px] w-full border-collapse text-left">
        <thead className="border-b border-[#F2F4F7] bg-[#FCFCFD] text-[10px] font-semibold uppercase tracking-[0.08em] text-[#667085]">
          <tr>
            <th className="px-4 py-3">Knowledge</th>
            <th className="px-3 py-3">Type</th>
            <th className="px-3 py-3">Categories</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3">Used In</th>
            <th className="px-3 py-3">Last Updated</th>
            <th className="px-3 py-3">Owner</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[#F2F4F7]">
          {items.slice(0, total).map((item) => (
            <tr key={item.id} className="align-top text-[13px] text-[#344054]">
              <td className="px-4 py-4">
                <Link href={`/knowledge/${item.id}`} className="flex items-start gap-3 group">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-[#EFF5FF] text-[#155EEF]">
                    <FileText className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold leading-5 text-[#101828] group-hover:text-[#155EEF]">{item.name}</span>
                    <span className="mt-1 block text-[11px] text-[#667085]">{artifactSummary(item)}</span>
                  </span>
                </Link>
              </td>
              <td className="px-3 py-4">
                <Pill tone="neutral">{item.type}</Pill>
              </td>
              <td className="px-3 py-4">
                <div className="flex flex-wrap gap-1.5">
                  {(item.category ? [item.category] : ["Uncategorized"]).map((category) => (
                    <Pill key={category} tone="neutral">
                      {category}
                    </Pill>
                  ))}
                </div>
              </td>
              <td className="px-3 py-4">
                <Pill tone={statusTone(item.status)}>{formatKnowledgeStatus(item.status)}</Pill>
              </td>
              <td className="px-3 py-4 text-xs text-[#344054]">{usageCount(item)} applications</td>
              <td className="whitespace-nowrap px-3 py-4 text-xs text-[#344054]">{formatDate(item.lastUpdated)}</td>
              <td className="px-3 py-4">
                <OwnerBadge item={item} />
              </td>
              <td className="px-4 py-4">
                <div className="relative flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => onActionToggle(openActionRow === item.id ? null : item.id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[#667085] hover:bg-[#F8FAFC]"
                    aria-label="More actions"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                  {openActionRow === item.id ? (
                    <div className="absolute right-0 top-10 z-20 w-52 rounded-[10px] border border-[#E4E7EC] bg-white p-2 shadow-[0_16px_40px_rgba(16,24,40,0.12)]">
                      <Link href={`/knowledge/${item.id}`} className="block rounded-[8px] px-3 py-2 text-sm text-[#344054] hover:bg-[#F8FAFC]">
                        View detail
                      </Link>
                      <Link href="/apply" className="block rounded-[8px] px-3 py-2 text-sm text-[#344054] hover:bg-[#F8FAFC]">
                        Open in Apply
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard?.writeText(item.id);
                          onActionToggle(null);
                        }}
                        className="block w-full rounded-[8px] px-3 py-2 text-left text-sm text-[#344054] hover:bg-[#F8FAFC]"
                      >
                        Copy ID
                      </button>
                    </div>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KnowledgeMobileCard({ item }: { item: KnowledgeItem }) {
  return (
    <Link href={`/knowledge/${item.id}`} className="rounded-[10px] border border-[#E4E7EC] bg-white p-4 shadow-[0_10px_24px_rgba(16,24,40,0.04)]">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] bg-[#EFF5FF] text-[#155EEF]">
          <FileText className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#101828]">{item.name}</p>
              <p className="mt-1 text-xs text-[#667085]">{artifactSummary(item)}</p>
            </div>
            <Pill tone={statusTone(item.status)}>{formatKnowledgeStatus(item.status)}</Pill>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Pill tone="neutral">{item.type}</Pill>
            <Pill tone="neutral">{item.category}</Pill>
            <Pill tone="neutral">{formatDate(item.lastUpdated)}</Pill>
          </div>
        </div>
      </div>
    </Link>
  );
}

function KnowledgeTableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex animate-pulse items-center gap-3 border-b border-[#F2F4F7] px-2 py-4">
          <div className="h-9 w-9 rounded-[9px] bg-slate-100" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-3/5 rounded-full bg-slate-100" />
            <div className="h-2.5 w-2/5 rounded-full bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function KnowledgeMobileSkeleton() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex animate-pulse gap-3 rounded-[10px] border border-[#E4E7EC] bg-white p-4">
          <div className="h-10 w-10 rounded-[9px] bg-slate-100" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-2/3 rounded-full bg-slate-100" />
            <div className="h-2.5 w-1/2 rounded-full bg-slate-100" />
            <div className="h-7 w-full rounded-full bg-slate-100" />
          </div>
        </div>
      ))}
    </>
  );
}

function KnowledgeDetailSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-28 animate-pulse rounded-[10px] border border-[#E4E7EC] bg-white" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.85fr)]">
        <div className="space-y-5">
          <div className="h-48 animate-pulse rounded-[10px] border border-[#E4E7EC] bg-white" />
          <div className="h-48 animate-pulse rounded-[10px] border border-[#E4E7EC] bg-white" />
          <div className="h-48 animate-pulse rounded-[10px] border border-[#E4E7EC] bg-white" />
        </div>
        <div className="space-y-5">
          <div className="h-40 animate-pulse rounded-[10px] border border-[#E4E7EC] bg-white" />
          <div className="h-40 animate-pulse rounded-[10px] border border-[#E4E7EC] bg-white" />
        </div>
      </div>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-xs font-semibold text-[#344054] disabled:cursor-not-allowed disabled:opacity-40"
      >
        Prev
      </button>
      <span className="rounded-[8px] border border-[#E4E7EC] bg-[#FCFCFD] px-3 py-2 text-xs font-semibold text-[#344054]">
        {page} / {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-xs font-semibold text-[#344054] disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next
      </button>
    </div>
  );
}

function Pill({ tone, children }: { tone: "neutral" | "success" | "warning" | "danger"; children: ReactNode }) {
  const toneClass =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : tone === "danger"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-[#E4E7EC] bg-[#F8FAFC] text-[#344054]";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClass}`}>{children}</span>;
}

function SelectChip({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ key: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="inline-flex h-10 items-center gap-2 rounded-[9px] border border-[#E4E7EC] bg-white px-3 text-xs text-[#667085]">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="max-w-[140px] bg-transparent font-semibold text-[#344054] outline-none"
      >
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function HealthRing({ value }: { value: number }) {
  return (
    <div
      className="relative flex h-32 w-32 items-center justify-center rounded-full"
      style={{
        background: `conic-gradient(#16a34a 0 ${value}%, #f2f4f7 ${value}% 100%)`,
      }}
    >
      <div className="flex h-[86px] w-[86px] flex-col items-center justify-center rounded-full bg-white text-center shadow-[0_4px_16px_rgba(16,24,40,0.08)]">
        <p className="text-2xl font-semibold tracking-[-0.03em] text-[#101828]">{value}%</p>
        <p className="text-xs text-[#667085]">Healthy</p>
      </div>
    </div>
  );
}

function HealthLegend({
  tone,
  label,
  value,
}: {
  tone: "green" | "amber" | "red" | "slate";
  label: string;
  value: string;
}) {
  const toneClass =
    tone === "green"
      ? "bg-emerald-500"
      : tone === "amber"
        ? "bg-amber-500"
        : tone === "red"
          ? "bg-rose-500"
          : "bg-slate-400";
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-2 text-sm font-medium text-[#344054]">
        <span className={`h-2.5 w-2.5 rounded-full ${toneClass}`} />
        {label}
      </span>
      <span className="text-sm text-[#667085]">{value}</span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[8px] bg-[#F8FAFC] px-3 py-2">
      <span className="text-sm text-[#667085]">{label}</span>
      <span className="text-sm font-medium text-[#101828]">{value}</span>
    </div>
  );
}

function OwnerBadge({ item }: { item: KnowledgeItem }) {
  return (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#EFF5FF] text-[10px] font-semibold text-[#155EEF]">
      {shortOwnerLabel(item.ownerId, null, null)}
    </span>
  );
}

function statusTone(status: string) {
  if (status === "ACTIVE") return "success";
  if (status === "DRAFT") return "warning";
  if (status === "ARCHIVED") return "neutral";
  return "neutral";
}

function normalizeKnowledgeType(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("evidence")) return "evidence";
  if (normalized.includes("answer")) return "answers";
  if (normalized.includes("template")) return "templates";
  if (normalized.includes("policy")) return "policies";
  if (normalized.includes("certif")) return "certifications";
  if (normalized.includes("case")) return "case-studies";
  if (normalized.includes("past")) return "past-responses";
  if (normalized.includes("insight")) return "insights";
  return "all";
}

function parseTab(value: string | null): KnowledgeTab {
  if (!value) return "all";
  const match = KNOWLEDGE_TABS.find((tab) => tab.key === value);
  return match ? match.key : "all";
}

function getVerificationBucket(item: KnowledgeItem): KnowledgeVerificationFilter {
  if (item.status === "DRAFT") return "draft";
  if (item.expiresAt && daysUntil(item.expiresAt) <= 30) return "expiring_soon";
  if (item.lastVerified && daysSince(item.lastVerified) > 180) return "review_due";
  return "verified";
}

function getVerificationBucketLabel(bucket: KnowledgeVerificationFilter) {
  if (bucket === "draft") return "Draft";
  if (bucket === "review_due") return "Review due";
  if (bucket === "expiring_soon") return "Expiring soon";
  if (bucket === "verified") return "Verified";
  return "All verification";
}

function artifactSummary(item: KnowledgeItem) {
  const metadata = item.metadata as Record<string, unknown>;
  const source = typeof metadata.source === "string" ? metadata.source : "Knowledge source";
  const version = item.version ? `v${item.version}` : "Unversioned";
  return `${source} - ${version}`;
}

function buildCategoryCounts(items: KnowledgeItem[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);
}

function buildRecommendations(items: KnowledgeItem[], activeTenders: DashboardOverview["activeTenders"], dashboard: DashboardOverview | null) {
  const topItems = [...items]
    .sort((left, right) => scoreKnowledge(right) - scoreKnowledge(left))
    .slice(0, 4);
  const contexts = [
    ...(dashboard?.attention.filter((entry) => entry.kind === "knowledge").map((entry) => entry.detail) ?? []),
    ...activeTenders.map((row) => row.tender.title),
  ];

  return topItems.map((item, index) => ({
    title: item.name,
    context: contexts[index] ?? item.category,
    match: Math.min(99, 80 + Math.round(scoreKnowledge(item))),
  }));
}

function scoreKnowledge(item: KnowledgeItem) {
  const verifiedBoost = item.status === "ACTIVE" ? 12 : item.status === "DRAFT" ? 2 : 0;
  const authorityBoost = item.authority === "high" ? 10 : item.authority === "medium" ? 6 : 2;
  const freshnessBoost = item.lastVerified && daysSince(item.lastVerified) < 45 ? 10 : item.lastVerified && daysSince(item.lastVerified) < 180 ? 4 : 0;
  const usageBoost = usageCount(item) * 2;
  return verifiedBoost + authorityBoost + freshnessBoost + usageBoost;
}

function buildKnowledgeHealth(
  summary: { counts: { total: number; draft: number; active: number; archived: number; stale: number } } | null,
  items: KnowledgeItem[],
) {
  const total = summary?.counts.total ?? items.length;
  const verified = summary?.counts.active ?? countVerified(items);
  const draft = summary?.counts.draft ?? countDraft(items);
  const expiringSoon = items.filter((item) => item.expiresAt && daysUntil(item.expiresAt) <= 30).length;
  const reviewDue = Math.max(summary?.counts.stale ?? 0, items.filter((item) => item.status === "ACTIVE" && item.lastVerified && daysSince(item.lastVerified) > 180).length);
  const attentionLoad = reviewDue + expiringSoon + draft;
  const score = total === 0 ? 0 : Math.max(0, Math.min(100, Math.round(100 - (attentionLoad / total) * 100)));
  return { total, verified, draft, reviewDue, expiringSoon, score };
}

function buildKnowledgeActivityFeed(items: ActivityItem[], dashboard: DashboardOverview | null | undefined) {
  const knowledgeActivity = items
    .filter((item) => /knowledge|source/i.test(item.entityType) || /knowledge|verified|template|policy|certificate/i.test(item.label))
    .slice(0, 5)
    .map((item) => ({
      title: item.label,
      detail: item.summary,
      time: relativeTime(item.createdAt),
      icon: activityIconFromLabel(item.label),
    }));

  const fromDashboard = (dashboard?.attention ?? [])
    .filter((entry) => entry.kind === "knowledge")
    .slice(0, 2)
    .map((entry) => ({
      title: entry.title,
      detail: entry.detail,
      time: "recent",
      icon: FileText,
    }));

  return [...knowledgeActivity, ...fromDashboard].slice(0, 5);
}

function buildUsageRows(items: KnowledgeItem[]): UsageRow[] {
  return [...items]
    .filter((item) => usageCount(item) > 0)
    .sort((left, right) => usageCount(right) - usageCount(left))
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      title: item.name,
      type: item.type,
      usedIn: `${usageCount(item)} applications`,
      lastUsed: formatRelativeShort(item.updatedAt),
      impact: usageCount(item) >= 10 || item.authority === "high" ? "High" : usageCount(item) >= 4 ? "Medium" : "Low",
    }));
}

function buildUsedInReferences(item: KnowledgeItem | null, activities: ActivityItem[]) {
  if (!item) return [];
  const references = activities
    .filter((activity) => activity.summary.toLowerCase().includes(item.name.toLowerCase()) || activity.label.toLowerCase().includes(item.name.toLowerCase()))
    .slice(0, 3)
    .map((activity) => ({
      application: activity.summary,
      question: activity.label,
    }));

  if (references.length > 0) return references;

  const stored = (item.metadata as Record<string, unknown>).usedIn;
  if (Array.isArray(stored)) {
    return stored.slice(0, 3).map((entry) => ({
      application: typeof entry === "string" ? entry : "Application",
      question: "Referenced in response workflow",
    }));
  }

  return [];
}

function countVerified(items: KnowledgeItem[]) {
  return items.filter((item) => item.status === "ACTIVE").length;
}

function countDraft(items: KnowledgeItem[]) {
  return items.filter((item) => item.status === "DRAFT").length;
}

function countRecentlyAdds(items: KnowledgeItem[]) {
  return items.filter((item) => daysSince(item.createdAt) <= 30).length;
}

function countFrequentlyUsed(items: KnowledgeItem[]) {
  return items.filter((item) => usageCount(item) > 0 || item.authority === "high").length;
}

function countHighImpact(items: KnowledgeItem[]) {
  return items.filter((item) => usageCount(item) >= 4 || (item.authority === "high" && item.status === "ACTIVE")).length;
}

function countApplicationLinks(items: KnowledgeItem[]) {
  return items.reduce((sum, item) => sum + usageCount(item), 0);
}

function usageCount(item: KnowledgeItem) {
  const metadata = item.metadata as Record<string, unknown>;
  const candidates = [metadata.usedInCount, metadata.applicationCount, metadata.usageCount, metadata.apps];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === "string" && Number.isFinite(Number(candidate))) return Number(candidate);
    if (Array.isArray(candidate)) return candidate.length;
  }
  return 0;
}

function formatPercent(value?: number | null, total?: number | null) {
  if (typeof value !== "number" || typeof total !== "number" || total === 0) return "0% of total";
  return `${((value / total) * 100).toFixed(1)}% of total`;
}

function formatPercentValue(value: number, total: number) {
  if (!total) return "0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

function daysSince(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

function daysUntil(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatRelativeShort(value: string) {
  const days = daysSince(value);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function activityIconFromLabel(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("certificate")) return BadgeCheck;
  if (normalized.includes("template")) return FilePlus2;
  if (normalized.includes("report") || normalized.includes("guide") || normalized.includes("overview")) return FileText;
  return History;
}

function formatKnowledgeStatus(status: string) {
  if (status === "ACTIVE") return "Verified";
  if (status === "DRAFT") return "Draft";
  if (status === "ARCHIVED") return "Archived";
  return status;
}

function shortOwnerLabel(ownerId: string | null | undefined, displayName: string | null, currentUserId: string | null) {
  if (!ownerId) return "NA";
  if (currentUserId && ownerId === currentUserId && displayName) return initials(displayName);
  return ownerId.slice(0, 2).toUpperCase();
}

function buildOwnerOptions(items: KnowledgeItem[], displayName: string | null, currentUserId: string | null) {
  const seen = new Set<string>();
  const options: Array<{ key: string; label: string }> = [];
  for (const item of items) {
    if (!item.ownerId || seen.has(item.ownerId)) continue;
    seen.add(item.ownerId);
    options.push({ key: item.ownerId, label: shortOwnerLabel(item.ownerId, displayName, currentUserId) });
  }
  return options.slice(0, 8);
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "KB";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase();
}
