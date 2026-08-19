import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FilePlus2,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import { rfpsQueryOptions } from "@/lib/api/rfps";
import { allRequirementsQueryOptions } from "@/lib/api/requirements";
import { reviewsQueryOptions } from "@/lib/api/reviews";
import { activityFeedQueryOptions } from "@/lib/api/activity";
import { PageHeader } from "@/components/common/page-header";
import { MetricTile } from "@/components/common/metric-tile";
import { StatusBadge } from "@/components/common/status-badge";
import { PersonAvatar } from "@/components/common/person-avatar";
import { ActivityTimeline } from "@/components/common/activity-timeline";
import { EmptyState } from "@/components/common/empty-state";
import { PageSkeleton } from "@/components/common/page-skeleton";
import { Button } from "@/components/ui/button";
import { getPerson, CURRENT_USER_ID } from "@/data/people";

const ACTIVE_STATUSES = ["analyzing", "in_progress", "review", "needs_attention"] as const;

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard · RFP OS" }] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(rfpsQueryOptions()),
      context.queryClient.ensureQueryData(allRequirementsQueryOptions()),
      context.queryClient.ensureQueryData(reviewsQueryOptions()),
      context.queryClient.ensureQueryData(activityFeedQueryOptions()),
    ]);
  },
  pendingComponent: PageSkeleton,
  component: Dashboard,
});

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function daysUntil(dateStr: string) {
  const ms = new Date(dateStr).getTime() - new Date("2026-08-20").getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function Dashboard() {
  const { data: rfps } = useSuspenseQuery(rfpsQueryOptions());
  const { data: requirements } = useSuspenseQuery(allRequirementsQueryOptions());
  const { data: reviews } = useSuspenseQuery(reviewsQueryOptions());
  const { data: activity } = useSuspenseQuery(activityFeedQueryOptions());
  const me = getPerson(CURRENT_USER_ID);

  const activeRfps = rfps.filter((r) => (ACTIVE_STATUSES as readonly string[]).includes(r.status));
  const dueThisWeek = activeRfps.filter(
    (r) => daysUntil(r.deadline) >= 0 && daysUntil(r.deadline) <= 7,
  );
  const awaitingReview = reviews.filter((r) => r.status === "pending" || r.status === "in_review");
  const highRiskReqs = requirements.filter((r) => r.risk === "high" || r.risk === "critical");
  const avgReadiness = activeRfps.length
    ? Math.round(activeRfps.reduce((sum, r) => sum + r.readiness, 0) / activeRfps.length)
    : 0;

  const attention = [
    ...requirements
      .filter((r) => r.risk === "critical" && r.status !== "approved")
      .map((r) => ({
        id: `risk-${r.id}`,
        icon: ShieldAlert,
        tone: "danger" as const,
        title: `${r.code} flagged critical risk`,
        detail: r.riskRationale,
        to: `/rfps/${r.rfpId}/requirements/${r.id}`,
      })),
    ...activeRfps
      .filter((r) => daysUntil(r.deadline) >= 0 && daysUntil(r.deadline) <= 5 && r.readiness < 90)
      .map((r) => ({
        id: `deadline-${r.id}`,
        icon: Clock,
        tone: "warning" as const,
        title: `${r.customer} due in ${daysUntil(r.deadline)}d`,
        detail: `${r.title} is ${r.readiness}% ready for submission.`,
        to: `/rfps/${r.id}`,
      })),
    ...reviews
      .filter((r) => r.overdue)
      .slice(0, 4)
      .map((r) => ({
        id: `overdue-${r.id}`,
        icon: AlertTriangle,
        tone: "danger" as const,
        title: `${r.requirementCode} review overdue`,
        detail: `${r.rfpTitle} — due ${r.due}`,
        to: `/reviews/${r.id}`,
      })),
  ].slice(0, 6);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting()}, ${me?.name.split(" ")[0]}`}
        description="Here's what needs your attention across the pipeline today."
        actions={
          <Button asChild>
            <Link to="/rfps/new">
              <FilePlus2 className="h-4 w-4" /> New RFP
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <MetricTile
          label="Active RFPs"
          value={activeRfps.length}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <MetricTile
          label="Due this week"
          value={dueThisWeek.length}
          tone={dueThisWeek.length > 0 ? "warning" : "neutral"}
          icon={<Clock className="h-4 w-4" />}
        />
        <MetricTile
          label="Awaiting review"
          value={awaitingReview.length}
          tone={awaitingReview.length > 5 ? "warning" : "neutral"}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <MetricTile
          label="High-risk requirements"
          value={highRiskReqs.length}
          tone="danger"
          icon={<ShieldAlert className="h-4 w-4" />}
        />
        <MetricTile
          label="Avg. submission readiness"
          value={`${avgReadiness}%`}
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          <h2 className="text-sm font-semibold text-foreground">Pipeline</h2>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">RFP</th>
                  <th className="px-4 py-2.5 font-medium">Owner</th>
                  <th className="px-4 py-2.5 font-medium">Progress</th>
                  <th className="px-4 py-2.5 font-medium">Risk</th>
                  <th className="px-4 py-2.5 font-medium">Deadline</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rfps.slice(0, 8).map((rfp) => (
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
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {rfp.riskCount.critical + rfp.riskCount.high > 0 ? (
                        <span className="font-medium text-danger">
                          {rfp.riskCount.critical + rfp.riskCount.high} high+
                        </span>
                      ) : (
                        <span>None</span>
                      )}
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
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Attention required</h2>
            <div className="surface-panel divide-y p-0">
              {attention.length === 0 ? (
                <EmptyState
                  title="Nothing urgent"
                  description="You're on top of things."
                  className="border-none py-8"
                />
              ) : (
                attention.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.id}
                      to={item.to}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30"
                    >
                      <span
                        className={
                          item.tone === "danger"
                            ? "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger"
                            : "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning"
                        }
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground">
                          {item.title}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {item.detail}
                        </span>
                      </span>
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Recent activity</h2>
            <div className="surface-panel p-4">
              <ActivityTimeline entries={activity.slice(0, 8)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
