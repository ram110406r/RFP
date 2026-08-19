import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { knowledgeSourceQueryOptions } from "@/lib/api/knowledge";
import { PageHeader } from "@/components/common/page-header";
import { PageSkeleton } from "@/components/common/page-skeleton";
import { RouteErrorState } from "@/components/common/route-error-state";
import { FreshnessBadge } from "@/components/common/freshness-badge";
import { PersonAvatar } from "@/components/common/person-avatar";
import { EmptyState } from "@/components/common/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getPerson } from "@/data/people";

export const Route = createFileRoute("/knowledge/$sourceId")({
  loader: async ({ context, params }) => {
    const source = await context.queryClient.ensureQueryData(
      knowledgeSourceQueryOptions(params.sourceId),
    );
    return { crumb: source.name };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.crumb} · RFP OS` : "Knowledge · RFP OS" }],
  }),
  pendingComponent: PageSkeleton,
  errorComponent: RouteErrorState,
  component: KnowledgeDetail,
});

function KnowledgeDetail() {
  const { sourceId } = Route.useParams();
  const { data: source } = useSuspenseQuery(knowledgeSourceQueryOptions(sourceId));

  return (
    <div className="space-y-6">
      <PageHeader
        title={source.name}
        description={`${source.type} · ${source.category} · v${source.version}`}
        actions={<FreshnessBadge freshness={source.freshness} />}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Used by answers" value={source.usedByAnswers} />
        <Stat
          label="At-risk answers"
          value={source.staleRiskAnswers}
          tone={source.staleRiskAnswers > 0 ? "danger" : undefined}
        />
        <Stat label="Last verified" value={source.lastVerified} />
        <Stat label="Owner" value={getPerson(source.ownerId)?.name ?? "—"} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="claims">Claims ({source.claims.length})</TabsTrigger>
          <TabsTrigger value="versions">Versions ({source.versions.length})</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="conflicts">Conflicts ({source.conflicts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-3">
          <p className="max-w-3xl text-sm leading-relaxed text-foreground">{source.summary}</p>
        </TabsContent>

        <TabsContent value="claims">
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Claim</th>
                  <th className="px-4 py-2.5 font-medium">Value</th>
                  <th className="px-4 py-2.5 font-medium">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {source.claims.map((claim) => (
                  <tr key={claim.id}>
                    <td className="px-4 py-3 text-foreground">{claim.label}</td>
                    <td className="px-4 py-3 text-muted-foreground">{claim.value}</td>
                    <td className="num px-4 py-3 text-muted-foreground">
                      {Math.round(claim.confidence * 100)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="versions">
          <ol className="space-y-3">
            {source.versions.map((v) => (
              <li
                key={v.version}
                className="flex items-start gap-3 rounded-lg border bg-card p-3.5"
              >
                <span className="num shrink-0 rounded-md bg-accent px-2 py-1 text-xs font-semibold text-accent-foreground">
                  v{v.version}
                </span>
                <div>
                  <p className="text-sm text-foreground">{v.note}</p>
                  <p className="num text-xs text-muted-foreground">{v.date}</p>
                </div>
              </li>
            ))}
          </ol>
        </TabsContent>

        <TabsContent value="usage" className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="surface-panel p-4">
              <p className="num text-2xl font-semibold text-foreground">{source.usedByAnswers}</p>
              <p className="text-sm text-muted-foreground">Answers currently citing this source</p>
            </div>
            <div className="surface-panel p-4">
              <p
                className={`num text-2xl font-semibold ${source.staleRiskAnswers > 0 ? "text-danger" : "text-foreground"}`}
              >
                {source.staleRiskAnswers}
              </p>
              <p className="text-sm text-muted-foreground">
                Answers at risk if this source goes stale
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="conflicts">
          {source.conflicts.length === 0 ? (
            <EmptyState
              title="No conflicting claims"
              description="This source doesn't conflict with any other knowledge source."
            />
          ) : (
            <div className="space-y-3">
              {source.conflicts.map((conflict) => (
                <div
                  key={conflict.id}
                  className="space-y-2.5 rounded-lg border border-danger/25 bg-danger-soft/30 p-4"
                >
                  <div className="flex items-center gap-2 text-danger">
                    <AlertTriangle className="h-4 w-4" />
                    <p className="text-sm font-medium">{conflict.topic}</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {conflict.variants.map((variant) => (
                      <div key={variant.label} className="rounded-md border bg-card p-2.5">
                        <p className="text-xs font-medium text-muted-foreground">{variant.label}</p>
                        <p className="text-sm text-foreground">{variant.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-foreground">
                    <ArrowRight className="h-3.5 w-3.5 text-success" />
                    <span className="font-medium">Recommended:</span> {conflict.recommended}
                  </div>
                  <p className="text-xs text-muted-foreground">{conflict.action}</p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "danger" | undefined;
}) {
  return (
    <div className="surface-panel p-3.5">
      <p
        className={`num text-lg font-semibold ${tone === "danger" ? "text-danger" : "text-foreground"}`}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
