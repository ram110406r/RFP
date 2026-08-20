import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
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
import { StatusBadge } from "@/components/common/status-badge";
import { RiskBadge } from "@/components/common/risk-badge";
import { ConfidenceMeter } from "@/components/common/confidence-meter";
import { EmptyState } from "@/components/common/empty-state";
import { cn } from "@/lib/utils";
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

export interface RequirementFilterSeed {
  category?: RequirementCategory | undefined;
  risk?: RiskLevel | undefined;
  status?: RequirementStatus | undefined;
  mandatoryOnly?: boolean | undefined;
  hasEvidence?: boolean | undefined;
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
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<RequirementCategory | "all">(
    initialFilters?.category ?? "all",
  );
  const [risk, setRisk] = useState<RiskLevel | "all">(initialFilters?.risk ?? "all");
  const [status, setStatus] = useState<RequirementStatus | "all">(initialFilters?.status ?? "all");
  const [sortKey, setSortKey] = useState<SortKey>("code");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const owners = useMemo(
    () => Array.from(new Set(requirements.map((r) => r.ownerTeam))),
    [requirements],
  );
  const [owner, setOwner] = useState<string>("all");

  const filtered = useMemo(() => {
    let list = requirements;
    if (initialFilters?.mandatoryOnly) list = list.filter((r) => r.mandatory);
    if (initialFilters?.hasEvidence === false) {
      list = list.filter((r) => r.evidenceIds.length === 0);
    }
    if (category !== "all") list = list.filter((r) => r.category === category);
    if (risk !== "all") list = list.filter((r) => r.risk === risk);
    if (status !== "all") list = list.filter((r) => r.status === status);
    if (owner !== "all") list = list.filter((r) => r.ownerTeam === owner);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.code.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q) ||
          r.question.toLowerCase().includes(q),
      );
    }
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "code") cmp = a.code.localeCompare(b.code);
      else if (sortKey === "risk") cmp = RISK_ORDER[a.risk] - RISK_ORDER[b.risk];
      else if (sortKey === "confidence") cmp = a.confidence - b.confidence;
      else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
      return cmp * sortDir;
    });
    return sorted;
  }, [
    requirements,
    search,
    category,
    risk,
    status,
    owner,
    sortKey,
    sortDir,
    initialFilters?.mandatoryOnly,
    initialFilters?.hasEvidence,
  ]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(1);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 sm:max-w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search requirements..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            aria-label="Search requirements"
          />
        </div>
        <Select
          value={category}
          onValueChange={(v) => setCategory(v as RequirementCategory | "all")}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={risk} onValueChange={(v) => setRisk(v as RiskLevel | "all")}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Risk" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All risk</SelectItem>
            {RISKS.map((r) => (
              <SelectItem key={r} value={r} className="capitalize">
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as RequirementStatus | "all")}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">
                {s.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={owner} onValueChange={setOwner}>
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
        <span className="text-xs text-muted-foreground sm:ml-auto">
          {filtered.length} of {requirements.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No requirements match your filters"
          description="Try clearing filters or search terms."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <SortableHead
                  label="ID"
                  sortKey="code"
                  active={sortKey === "code"}
                  dir={sortDir}
                  onClick={() => toggleSort("code")}
                />
                <th className="px-3 py-2.5 font-medium">Title</th>
                <th className="px-3 py-2.5 font-medium">Category</th>
                <SortableHead
                  label="Risk"
                  sortKey="risk"
                  active={sortKey === "risk"}
                  dir={sortDir}
                  onClick={() => toggleSort("risk")}
                />
                <SortableHead
                  label="Confidence"
                  sortKey="confidence"
                  active={sortKey === "confidence"}
                  dir={sortDir}
                  onClick={() => toggleSort("confidence")}
                />
                <SortableHead
                  label="Status"
                  sortKey="status"
                  active={sortKey === "status"}
                  dir={sortDir}
                  onClick={() => toggleSort("status")}
                />
                <th className="px-3 py-2.5 font-medium">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((req) => (
                <tr
                  key={req.id}
                  className={cn("hover:bg-muted/30", activeReqId === req.id && "bg-accent/50")}
                >
                  <td className="px-3 py-2.5">
                    <Link
                      to="/rfps/$rfpId/requirements/$reqId"
                      params={{ rfpId, reqId: req.id }}
                      className="num font-medium text-foreground hover:underline"
                    >
                      {req.code}
                    </Link>
                  </td>
                  <td className="max-w-xs px-3 py-2.5">
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
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{req.category}</td>
                  <td className="px-3 py-2.5">
                    <RiskBadge risk={req.risk} />
                  </td>
                  <td className="px-3 py-2.5">
                    <ConfidenceMeter value={req.confidence} size="sm" />
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={req.status} />
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{req.ownerTeam}</td>
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
  sortKey: SortKey;
  active: boolean;
  dir: 1 | -1;
  onClick: () => void;
}) {
  return (
    <th className="px-3 py-2.5 font-medium">
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-auto gap-1 p-0 text-xs font-medium uppercase tracking-wide",
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
