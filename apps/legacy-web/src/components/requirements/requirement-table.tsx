import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowUpDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/common/status-badge";
import { RiskBadge } from "@/components/common/risk-badge";
import { ConfidenceMeter } from "@/components/common/confidence-meter";
import { EmptyState } from "@/components/common/empty-state";
import { MultiSelect } from "@/components/common/multi-select";
import {
  bulkAssignReviewer,
  bulkSetOwnerTeam,
  bulkSetRisk,
  bulkSetStatus,
} from "@/lib/api/requirements";
import { CURRENT_USER_ID, personName } from "@/lib/session";
import { cn } from "@/lib/utils";
import { BulkActionBar } from "./bulk-action-bar";
import { SavedViewsSelect } from "./saved-views-select";
import {
  applyRequirementFilters,
  isFiltersEmpty,
  mergeFilters,
  SAVED_VIEWS,
} from "./requirement-filters";
import type { RequirementFilterSeed, RequirementFilters } from "./requirement-filters";
import type { Requirement, RequirementCategory, RequirementStatus, RiskLevel } from "@/types";

const CATEGORIES: RequirementCategory[] = [
  "Security",
  "Commercial",
  "Compliance",
  "Product",
  "Legal",
  "Architecture",
  "Support",
];
const RISKS: RiskLevel[] = ["low", "medium", "high", "critical"];
const STATUSES: RequirementStatus[] = [
  "unanswered",
  "drafted",
  "needs_review",
  "changes_requested",
  "approved",
  "rejected",
];

type SortKey = "code" | "risk" | "confidence" | "status";
const RISK_ORDER: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export type { RequirementFilterSeed };

function downloadCsv(requirements: Requirement[]) {
  const header = ["Code", "Title", "Category", "Risk", "Confidence", "Status", "Owner team"];
  const rows = requirements.map((r) => [
    r.code,
    r.title,
    r.category,
    r.risk,
    `${Math.round(r.confidence * 100)}%`,
    r.status.replace("_", " "),
    r.ownerTeam,
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "requirements-export.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function RequirementTable({
  rfpId,
  requirements,
  activeReqId,
  initialFilters,
}: {
  rfpId: string;
  requirements: Requirement[];
  activeReqId?: string | undefined;
  initialFilters?: RequirementFilterSeed | undefined;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [viewId, setViewId] = useState("all");
  const [filters, setFilters] = useState<RequirementFilters>(() => mergeFilters(initialFilters));
  const [sortKey, setSortKey] = useState<SortKey>("code");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const owners = useMemo(
    () => Array.from(new Set(requirements.map((r) => r.ownerTeam))),
    [requirements],
  );

  function updateFilters(patch: Partial<RequirementFilters>) {
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  function selectView(id: string) {
    setViewId(id);
    const view = SAVED_VIEWS.find((v) => v.id === id);
    setFilters(mergeFilters(view?.filters));
  }

  const filtered = useMemo(() => {
    let list = applyRequirementFilters(requirements, filters, CURRENT_USER_ID);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.code.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q) ||
          r.question.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "code") cmp = a.code.localeCompare(b.code);
      else if (sortKey === "risk") cmp = RISK_ORDER[a.risk] - RISK_ORDER[b.risk];
      else if (sortKey === "confidence") cmp = a.confidence - b.confidence;
      else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
      return cmp * sortDir;
    });
  }, [requirements, filters, search, sortKey, sortDir]);

  const filteredIds = useMemo(() => filtered.map((r) => r.id), [filtered]);
  const selectedInView = filteredIds.filter((id) => selectedIds.has(id));
  const allSelected = filteredIds.length > 0 && selectedInView.length === filteredIds.length;
  const someSelected = selectedInView.length > 0 && !allSelected;
  const selectedRequirements = filtered.filter((r) => selectedIds.has(r.id));

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(1);
    }
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of filteredIds) next.delete(id);
      } else {
        for (const id of filteredIds) next.add(id);
      }
      return next;
    });
  }

  function invalidateAfterMutation() {
    queryClient.invalidateQueries({ queryKey: ["requirements"] });
    queryClient.invalidateQueries({ queryKey: ["rfps", rfpId] });
    queryClient.invalidateQueries({ queryKey: ["reviews"] });
  }

  const bulkMutation = useMutation({
    mutationFn: async (action: () => Promise<unknown>) => action(),
    onSuccess: () => {
      invalidateAfterMutation();
      setSelectedIds(new Set());
    },
    onError: () => toast.error("That bulk action couldn't be completed. Try again."),
  });

  const selectedIdList = Array.from(selectedIds);

  function handleAssign(reviewerId: string) {
    bulkMutation.mutate(() => bulkAssignReviewer(selectedIdList, reviewerId, "You"));
    toast.success(`Assigned ${selectedIdList.length} requirement(s) to ${personName(reviewerId)}`);
  }

  function handleChangeStatus(status: RequirementStatus) {
    bulkMutation.mutate(() => bulkSetStatus(selectedIdList, status, "You"));
    toast.success(`Updated status for ${selectedIdList.length} requirement(s)`);
  }

  function handleSetRisk(risk: RiskLevel) {
    bulkMutation.mutate(() => bulkSetRisk(selectedIdList, risk, "You"));
    toast.success(`Set risk to ${risk} for ${selectedIdList.length} requirement(s)`);
  }

  function handleChangeOwner(ownerTeam: string) {
    bulkMutation.mutate(() => bulkSetOwnerTeam(selectedIdList, ownerTeam, "You"));
    toast.success(`Changed owner team for ${selectedIdList.length} requirement(s)`);
  }

  function handleExport() {
    downloadCsv(selectedRequirements);
    toast.success(`Exported ${selectedRequirements.length} requirement(s)`);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {/* flex-1 alone let the input shrink below its own placeholder once the
            filter row filled up — it collapsed to about 75px and read "Sear".
            Fixed basis, no shrink. */}
        <div className="relative w-full sm:w-[220px] sm:flex-none">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search requirements..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            aria-label="Search requirements"
          />
        </div>
        <SavedViewsSelect value={viewId} onChange={selectView} />
        <MultiSelect
          label="Category"
          placeholder="All categories"
          options={CATEGORIES.map((c) => ({ value: c, label: c }))}
          selected={filters.categories}
          onChange={(next) => updateFilters({ categories: next as RequirementCategory[] })}
        />
        <MultiSelect
          label="Risk"
          placeholder="All risk"
          options={RISKS.map((r) => ({ value: r, label: r.charAt(0).toUpperCase() + r.slice(1) }))}
          selected={filters.risks}
          onChange={(next) => updateFilters({ risks: next as RiskLevel[] })}
        />
        <MultiSelect
          label="Status"
          placeholder="All statuses"
          options={STATUSES.map((s) => ({ value: s, label: s.replace("_", " ") }))}
          selected={filters.statuses}
          onChange={(next) => updateFilters({ statuses: next as RequirementStatus[] })}
        />
        <Select
          value={filters.ownerTeams[0] ?? "all"}
          onValueChange={(v) => updateFilters({ ownerTeams: v === "all" ? [] : [v] })}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Owner team" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All owner teams</SelectItem>
            {owners.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!isFiltersEmpty(filters) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setViewId("all");
              setFilters(mergeFilters(undefined));
            }}
          >
            Reset filters
          </Button>
        )}
        <span className="text-xs text-muted-foreground sm:ml-auto">
          {filtered.length} of {requirements.length}
        </span>
      </div>

      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          ownerTeams={owners}
          onAssign={handleAssign}
          onChangeStatus={handleChangeStatus}
          onSetRisk={handleSetRisk}
          onChangeOwner={handleChangeOwner}
          onExport={handleExport}
          onClear={() => setSelectedIds(new Set())}
          pending={bulkMutation.isPending}
        />
      )}

      {filtered.length === 0 ? (
        <EmptyState
          title="No requirements match your filters"
          description="Try clearing filters or search terms."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full table-fixed text-sm">
            {/* Widths are sized to each column's widest real content: the
                "Changes requested" status badge and the "Critical" risk badge
                set their columns' floors. Title is the only elastic column and
                absorbs whatever is left. */}
            <colgroup>
              <col className="w-10" />
              <col className="w-[112px]" />
              <col />
              <col className="w-[96px]" />
              <col className="w-[112px]" />
              <col className="w-[124px]" />
              <col className="w-[170px]" />
              <col className="w-[132px]" />
            </colgroup>
            <thead className="border-b border-border bg-surface-sunken text-left text-label uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all requirements"
                  />
                </th>
                <SortableHead
                  label="ID"
                  active={sortKey === "code"}
                  dir={sortDir}
                  onClick={() => toggleSort("code")}
                />
                <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Title</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Category</th>
                <SortableHead
                  label="Risk"
                  active={sortKey === "risk"}
                  dir={sortDir}
                  onClick={() => toggleSort("risk")}
                />
                <SortableHead
                  label="Confidence"
                  active={sortKey === "confidence"}
                  dir={sortDir}
                  onClick={() => toggleSort("confidence")}
                />
                <SortableHead
                  label="Status"
                  active={sortKey === "status"}
                  dir={sortDir}
                  onClick={() => toggleSort("status")}
                />
                <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((req) => (
                <tr
                  key={req.id}
                  className={cn(
                    "hover:bg-muted/30",
                    activeReqId === req.id && "bg-accent/50",
                    selectedIds.has(req.id) && "bg-accent/30",
                  )}
                >
                  <td className="px-3 py-2.5">
                    <Checkbox
                      checked={selectedIds.has(req.id)}
                      onCheckedChange={() => toggleRow(req.id)}
                      aria-label={`Select ${req.code}`}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      to="/rfps/$rfpId/requirements/$reqId"
                      params={{ rfpId, reqId: req.id }}
                      className="num whitespace-nowrap font-medium text-foreground hover:underline"
                    >
                      {req.code}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      to="/rfps/$rfpId/requirements/$reqId"
                      params={{ rfpId, reqId: req.id }}
                      className="block truncate text-foreground hover:underline"
                    >
                      {req.title}
                    </Link>
                    {req.mandatory && (
                      <span className="text-[11px] font-medium text-muted-foreground">
                        Mandatory
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-meta text-fg-2">
                    {req.category}
                  </td>
                  <td className="px-3 py-2.5">
                    <RiskBadge risk={req.risk} />
                  </td>
                  <td className="px-3 py-2.5">
                    <ConfidenceMeter value={req.confidence} size="sm" />
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={req.status} />
                  </td>
                  {/* Owner is the one column allowed to lose characters: it is
                      the least load-bearing, and truncating it here is what
                      keeps every row single-line without a horizontal scroll. */}
                  <td className="px-3 py-2.5 text-meta text-fg-2">
                    <span className="block truncate" title={req.ownerTeam}>
                      {req.ownerTeam}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SortableHead({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: 1 | -1;
  onClick: () => void;
}) {
  return (
    <th className="whitespace-nowrap px-3 py-2.5 font-semibold">
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-auto gap-1 p-0 text-label uppercase",
          active ? "text-foreground" : "text-muted-foreground",
        )}
        onClick={onClick}
      >
        {label}
        <ArrowUpDown className={cn("h-3 w-3", active && dir === -1 && "rotate-180")} />
      </Button>
    </th>
  );
}
