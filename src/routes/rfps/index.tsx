import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { FilePlus2, Search } from "lucide-react";
import { rfpsQueryOptions } from "@/lib/api/rfps";
import { PageHeader } from "@/components/common/page-header";
import { PageSkeleton } from "@/components/common/page-skeleton";
import { StatusBadge } from "@/components/common/status-badge";
import { PersonAvatar } from "@/components/common/person-avatar";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getPerson } from "@/data/people";
import type { RfpStatus } from "@/types";

export const Route = createFileRoute("/rfps/")({
  head: () => ({ meta: [{ title: "RFPs · RFP OS" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(rfpsQueryOptions()),
  pendingComponent: PageSkeleton,
  component: RfpsList,
});

const STATUS_OPTIONS: { value: RfpStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "analyzing", label: "Analyzing" },
  { value: "in_progress", label: "In progress" },
  { value: "review", label: "In review" },
  { value: "needs_attention", label: "Needs attention" },
  { value: "submitted", label: "Submitted" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

type SortKey = "deadline" | "progress" | "value" | "title";

function RfpsList() {
  const { data: rfps } = useSuspenseQuery(rfpsQueryOptions());
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<RfpStatus | "all">("all");
  const [sort, setSort] = useState<SortKey>("deadline");

  const filtered = useMemo(() => {
    let list = rfps;
    if (status !== "all") list = list.filter((r) => r.status === status);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) => r.title.toLowerCase().includes(q) || r.customer.toLowerCase().includes(q),
      );
    }
    const sorted = [...list].sort((a, b) => {
      if (sort === "deadline") return a.deadline.localeCompare(b.deadline);
      if (sort === "progress") return b.progress - a.progress;
      if (sort === "value") return b.estimatedValue - a.estimatedValue;
      return a.title.localeCompare(b.title);
    });
    return sorted;
  }, [rfps, search, status, sort]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="RFPs"
        description={`${rfps.length} total proposals in the pipeline`}
        actions={
          <Button asChild>
            <Link to="/rfps/new">
              <FilePlus2 className="h-4 w-4" /> New RFP
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search RFPs or customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            aria-label="Search RFPs"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as RfpStatus | "all")}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="deadline">Sort: Deadline</SelectItem>
            <SelectItem value="progress">Sort: Progress</SelectItem>
            <SelectItem value="value">Sort: Value</SelectItem>
            <SelectItem value="title">Sort: Title</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No RFPs match your filters"
          description="Try adjusting your search or status filter."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">RFP</th>
                <th className="px-4 py-2.5 font-medium">Owner</th>
                <th className="px-4 py-2.5 font-medium">Progress</th>
                <th className="px-4 py-2.5 font-medium">Value</th>
                <th className="px-4 py-2.5 font-medium">Deadline</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((rfp) => (
                <tr key={rfp.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link
                      to="/rfps/$rfpId"
                      params={{ rfpId: rfp.id }}
                      className="font-medium text-foreground hover:underline"
                    >
                      {rfp.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">{rfp.customer}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <PersonAvatar personId={rfp.ownerId} />
                      <span className="text-xs text-muted-foreground">
                        {getPerson(rfp.ownerId)?.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${rfp.progress}%` }}
                        />
                      </div>
                      <span className="num text-xs text-muted-foreground">{rfp.progress}%</span>
                    </div>
                  </td>
                  <td className="num px-4 py-3 text-xs text-muted-foreground">
                    ${(rfp.estimatedValue / 1000).toFixed(0)}k
                  </td>
                  <td className="num px-4 py-3 text-xs text-muted-foreground">{rfp.deadline}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={rfp.status} />
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
