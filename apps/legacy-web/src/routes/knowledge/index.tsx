import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Search, SearchX } from "lucide-react";
import { knowledgeSourcesQueryOptions } from "@/lib/api/knowledge";
import { PageHeader } from "@/components/common/page-header";
import { PageSkeleton } from "@/components/common/page-skeleton";
import { FreshnessBadge } from "@/components/common/freshness-badge";
import { EmptyState } from "@/components/common/empty-state";
import { PersonAvatar } from "@/components/common/person-avatar";
import {
  DataRow,
  DataTable,
  RowCell,
  RowSub,
  RowTitle,
  Td,
  Th,
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
import { getPerson } from "@/lib/session";
import { cn } from "@/lib/utils";
import type { Authority, Freshness } from "@/types";

export const Route = createFileRoute("/knowledge/")({
  head: () => ({ meta: [{ title: "Knowledge · Tendyy" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(knowledgeSourcesQueryOptions()),
  pendingComponent: PageSkeleton,
  component: KnowledgeList,
});

const AUTHORITY_LABEL: Record<Authority, string> = { high: "High", medium: "Medium", low: "Low" };

/**
 * Authority is a ranking, so it renders as one — a filled/hollow pip meter
 * rather than the word alone. Scanning the column, "which of these sources
 * wins a disagreement" is answerable without reading.
 */
function AuthorityMeter({ authority }: { authority: Authority }) {
  const level = authority === "high" ? 3 : authority === "medium" ? 2 : 1;
  return (
    <span className="flex items-center gap-1.5" title={`${AUTHORITY_LABEL[authority]} authority`}>
      <span className="flex gap-0.5" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "h-3 w-1 rounded-[1px]",
              i <= level ? (authority === "high" ? "bg-primary" : "bg-fg-2") : "bg-progress-track",
            )}
          />
        ))}
      </span>
      <RowCell>{AUTHORITY_LABEL[authority]}</RowCell>
    </span>
  );
}

function KnowledgeList() {
  const { data: sources } = useSuspenseQuery(knowledgeSourcesQueryOptions());
  const [search, setSearch] = useState("");
  const [freshness, setFreshness] = useState<Freshness | "all">("all");
  const [authority, setAuthority] = useState<Authority | "all">("all");

  const filtered = useMemo(() => {
    let list = sources;
    if (freshness !== "all") list = list.filter((s) => s.freshness === freshness);
    if (authority !== "all") list = list.filter((s) => s.authority === authority);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (s) => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q),
      );
    }
    return list;
  }, [sources, search, freshness, authority]);

  const staleCount = sources.filter(
    (s) => s.freshness === "stale" || s.freshness === "conflicting",
  ).length;

  function clearFilters() {
    setSearch("");
    setFreshness("all");
    setAuthority("all");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Knowledge base"
        title="Knowledge"
        description={
          staleCount > 0
            ? `${sources.length} sources powering AI-drafted answers · ${staleCount} ${staleCount === 1 ? "needs" : "need"} attention`
            : `${sources.length} sources powering AI-drafted answers`
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search knowledge sources..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            aria-label="Search knowledge sources"
          />
        </div>
        <Select value={freshness} onValueChange={(v) => setFreshness(v as Freshness | "all")}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Freshness" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All freshness</SelectItem>
            <SelectItem value="fresh">Fresh</SelectItem>
            <SelectItem value="aging">Aging</SelectItem>
            <SelectItem value="stale">Stale</SelectItem>
            <SelectItem value="conflicting">Conflicting</SelectItem>
          </SelectContent>
        </Select>
        <Select value={authority} onValueChange={(v) => setAuthority(v as Authority | "all")}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Authority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All authority</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<SearchX className="h-5 w-5" />}
          title="No knowledge sources match"
          description="Try a different search term, or widen the freshness and authority filters."
          action={
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <DataTable
          head={
            <>
              <Th>Source</Th>
              <Th>Type</Th>
              <Th>Version</Th>
              <Th>Authority</Th>
              <Th>Freshness</Th>
              <Th>Owner</Th>
              <Th>Last verified</Th>
            </>
          }
        >
          {filtered.map((source) => (
            <DataRow
              key={source.id}
              /*
               * Stale and conflicting sources are the knowledge equivalent of
               * a high-risk requirement: an answer citing one is quietly
               * wrong. Same stripe vocabulary as the other tables.
               */
              emphasis={
                source.freshness === "conflicting"
                  ? "critical"
                  : source.freshness === "stale"
                    ? "high"
                    : null
              }
            >
              <Td>
                <Link
                  to="/knowledge/$sourceId"
                  params={{ sourceId: source.id }}
                  className="hover:underline"
                >
                  <RowTitle>{source.name}</RowTitle>
                </Link>
                <RowSub>{source.category}</RowSub>
              </Td>
              <Td>
                <RowCell>{source.type}</RowCell>
              </Td>
              <Td>
                <RowCell>{source.version}</RowCell>
              </Td>
              <Td>
                <AuthorityMeter authority={source.authority} />
              </Td>
              <Td>
                <FreshnessBadge freshness={source.freshness} />
              </Td>
              <Td>
                <span className="flex items-center gap-1.5">
                  <PersonAvatar personId={source.ownerId} />
                  <RowCell>{getPerson(source.ownerId)?.name}</RowCell>
                </span>
              </Td>
              <Td>
                <RowCell>{source.lastVerified}</RowCell>
              </Td>
            </DataRow>
          ))}
        </DataTable>
      )}
    </div>
  );
}
