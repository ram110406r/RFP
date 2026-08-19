import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { rfpsQueryOptions } from "@/lib/api/rfps";
import { PageHeader } from "@/components/common/page-header";
import { PageSkeleton } from "@/components/common/page-skeleton";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState } from "@/components/common/empty-state";
import { Send } from "lucide-react";

export const Route = createFileRoute("/submissions")({
  head: () => ({ meta: [{ title: "Submissions · RFP OS" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(rfpsQueryOptions()),
  pendingComponent: PageSkeleton,
  component: Submissions,
});

const RELEVANT_STATUSES = [
  "submitted",
  "won",
  "lost",
  "review",
  "needs_attention",
  "in_progress",
] as const;

function Submissions() {
  const { data: rfps } = useSuspenseQuery(rfpsQueryOptions());
  const list = rfps.filter((r) => (RELEVANT_STATUSES as readonly string[]).includes(r.status));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Submissions"
        description="Track submission readiness and history across every RFP."
      />

      {list.length === 0 ? (
        <EmptyState
          icon={<Send className="h-5 w-5" />}
          title="No submissions yet"
          description="Submission packages will appear here once an RFP is ready."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">RFP</th>
                <th className="px-4 py-2.5 font-medium">Readiness</th>
                <th className="px-4 py-2.5 font-medium">Deadline</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {list.map((rfp) => (
                <tr key={rfp.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link
                      to="/rfps/$rfpId/submission"
                      params={{ rfpId: rfp.id }}
                      className="font-medium text-foreground hover:underline"
                    >
                      {rfp.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">{rfp.customer}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${rfp.readiness}%` }}
                        />
                      </div>
                      <span className="num text-xs text-muted-foreground">{rfp.readiness}%</span>
                    </div>
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
