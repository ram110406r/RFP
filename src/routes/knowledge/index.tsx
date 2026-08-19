import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { knowledgeSourcesQueryOptions } from "@/lib/api/knowledge";
import { PageHeader } from "@/components/common/page-header";
import { PageSkeleton } from "@/components/common/page-skeleton";
import { FreshnessBadge } from "@/components/common/freshness-badge";
import { EmptyState } from "@/components/common/empty-state";
import { PersonAvatar } from "@/components/common/person-avatar";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getPerson } from "@/data/people";
import type { Authority, Freshness } from "@/types";

export const Route = createFileRoute("/knowledge/")({
  head: () => ({ meta: [{ title: "Knowledge · RFP OS" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(knowledgeSourcesQueryOptions()),
  pendingComponent: PageSkeleton,
  component: KnowledgeList,
});

const AUTHORITY_LABEL: Record<Authority, string> = { high: "High", medium: "Medium", low: "Low" };

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Knowledge"
        description={`${sources.length} sources powering AI-drafted answers`}
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
          title="No knowledge sources match"
          description="Try a different search or filter."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Source</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Version</th>
                <th className="px-4 py-2.5 font-medium">Authority</th>
                <th className="px-4 py-2.5 font-medium">Freshness</th>
                <th className="px-4 py-2.5 font-medium">Owner</th>
                <th className="px-4 py-2.5 font-medium">Last verified</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((source) => (
                <tr key={source.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link
                      to="/knowledge/$sourceId"
                      params={{ sourceId: source.id }}
                      className="font-medium text-foreground hover:underline"
                    >
                      {source.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{source.category}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{source.type}</td>
                  <td className="num px-4 py-3 text-xs text-muted-foreground">{source.version}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {AUTHORITY_LABEL[source.authority]}
                  </td>
                  <td className="px-4 py-3">
                    <FreshnessBadge freshness={source.freshness} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <PersonAvatar personId={source.ownerId} />
                      <span className="text-xs text-muted-foreground">
                        {getPerson(source.ownerId)?.name}
                      </span>
                    </div>
                  </td>
                  <td className="num px-4 py-3 text-xs text-muted-foreground">
                    {source.lastVerified}
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
