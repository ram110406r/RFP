import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, ExternalLink, FilePlus2, Search, SearchX } from "lucide-react";
import { rfpsQueryOptions } from "@/lib/api/rfps";
import { PageHeader } from "@/components/common/page-header";
import { PageSkeleton } from "@/components/common/page-skeleton";
import { StatusBadge } from "@/components/common/status-badge";
import { RiskBadge } from "@/components/common/risk-badge";
import { ProgressBar } from "@/components/common/progress-bar";
import { PersonAvatar } from "@/components/common/person-avatar";
import { EmptyState } from "@/components/common/empty-state";
import { RowActionsMenu } from "@/components/common/row-actions-menu";
import {
  DataRow,
  DataTable,
  DeadlineCell,
  RowCell,
  RowSub,
  RowTitle,
  Td,
  Th,
  rowEmphasis,
} from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deadlineMeta } from "@/lib/dates";
import { getPerson } from "@/lib/session";
import type { RfpStatus } from "@/types";

export const Route = createFileRoute("/rfps/")({
  head: () => ({ meta: [{ title: "RFPs · Tendyy" }] }),
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
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<RfpStatus | "all">("all");
  const [sort, setSort] = useState<SortKey>("deadline");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  function copyRfpLink(rfpId: string) {
    void navigator.clipboard.writeText(`${window.location.origin}/rfps/${rfpId}`);
    toast.success("Link copied");
  }

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

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updateStatus(value: RfpStatus | "all") {
    setStatus(value);
    setPage(1);
  }

  function clearFilters() {
    setSearch("");
    setStatus("all");
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pipeline"
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
            onChange={(e) => updateSearch(e.target.value)}
            className="pl-8"
            aria-label="Search RFPs"
          />
        </div>
        <Select value={status} onValueChange={(v) => updateStatus(v as RfpStatus | "all")}>
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
          icon={<SearchX className="h-5 w-5" />}
          title="No RFPs match your filters"
          description="Try a different search term, or widen the status filter."
          action={
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          <DataTable
            head={
              <>
                <Th>RFP</Th>
                <Th>Owner</Th>
                <Th>Progress</Th>
                <Th>Requirements</Th>
                <Th>Risk</Th>
                <Th>Value</Th>
                <Th>Deadline</Th>
                <Th>Status</Th>
                <Th className="w-10" />
              </>
            }
          >
            {paged.map((rfp) => {
              const worstRisk =
                rfp.riskCount.critical > 0 ? "critical" : rfp.riskCount.high > 0 ? "high" : null;
              const deadline = deadlineMeta(rfp.deadline);
              return (
                <DataRow
                  key={rfp.id}
                  interactive
                  emphasis={rowEmphasis({
                    risk: worstRisk,
                    overdue: deadline.urgency === "overdue",
                    dueInDays: deadline.days,
                  })}
                  onClick={() => navigate({ to: "/rfps/$rfpId", params: { rfpId: rfp.id } })}
                >
                  <Td className="max-w-[220px]">
                    <Link
                      to="/rfps/$rfpId"
                      params={{ rfpId: rfp.id }}
                      title={rfp.title}
                      className="block truncate hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <RowTitle>{rfp.title}</RowTitle>
                    </Link>
                    <RowSub>{rfp.customer}</RowSub>
                  </Td>
                  <Td>
                    <span className="flex items-center gap-1.5">
                      <PersonAvatar personId={rfp.ownerId} />
                      <RowCell>{getPerson(rfp.ownerId)?.name}</RowCell>
                    </span>
                  </Td>
                  <Td>
                    <ProgressBar value={rfp.progress} size="default" />
                  </Td>
                  <Td>
                    <RowCell>
                      {rfp.requirementsComplete}/{rfp.requirementsTotal}
                    </RowCell>
                  </Td>
                  <Td>
                    {worstRisk ? (
                      <RiskBadge risk={worstRisk} />
                    ) : (
                      <RowCell className="text-muted-foreground">None</RowCell>
                    )}
                  </Td>
                  <Td>
                    <RowCell className="font-medium text-foreground">
                      ${(rfp.estimatedValue / 1000).toFixed(0)}k
                    </RowCell>
                  </Td>
                  <Td>
                    <DeadlineCell meta={deadline} />
                  </Td>
                  <Td>
                    <StatusBadge status={rfp.status} />
                  </Td>
                  <Td>
                    <RowActionsMenu
                      actions={[
                        {
                          label: "Open workspace",
                          icon: ExternalLink,
                          onSelect: () =>
                            navigate({ to: "/rfps/$rfpId", params: { rfpId: rfp.id } }),
                        },
                        { label: "Copy link", icon: Copy, onSelect: () => copyRfpLink(rfp.id) },
                      ]}
                    />
                  </Td>
                </DataRow>
              );
            })}
          </DataTable>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-supporting text-fg-2">
              <span className="num">
                Showing {(currentPage - 1) * pageSize + 1}–
                {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="num text-meta">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
