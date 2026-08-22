import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  FilePlus2,
  Inbox,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { rfpsQueryOptions } from "@/lib/api/rfps";
import { allRequirementsQueryOptions } from "@/lib/api/requirements";
import { reviewsQueryOptions } from "@/lib/api/reviews";
import { activityFeedQueryOptions } from "@/lib/api/activity";
import { PageHeader } from "@/components/common/page-header";
import { MetricTile } from "@/components/common/metric-tile";
import { StatusBadge } from "@/components/common/status-badge";
import { RiskBadge } from "@/components/common/risk-badge";
import { ProgressBar } from "@/components/common/progress-bar";
import { PersonAvatar } from "@/components/common/person-avatar";
import { ActivityTimeline } from "@/components/common/activity-timeline";
import { EmptyState } from "@/components/common/empty-state";
import { PageSkeleton } from "@/components/common/page-skeleton";
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
import { cn } from "@/lib/utils";
import { daysUntil, deadlineMeta } from "@/lib/dates";
import { getPerson, CURRENT_USER_ID } from "@/lib/session";
import type { Rfp, RiskLevel } from "@/types";

const ACTIVE_STATUSES = ["analyzing", "in_progress", "review", "needs_attention"] as const;

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard · Tendyy" }] }),
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

/** The highest risk level present on an RFP, or null when nothing is elevated. */
function worstRiskOf(rfp: Rfp): RiskLevel | null {
  if (rfp.riskCount.critical > 0) return "critical";
  if (rfp.riskCount.high > 0) return "high";
  return null;
}

function Dashboard() {
  const { data: rfps } = useSuspenseQuery(rfpsQueryOptions());
  const { data: requirements } = useSuspenseQuery(allRequirementsQueryOptions());
  const { data: reviews } = useSuspenseQuery(reviewsQueryOptions());
  const { data: activity } = useSuspenseQuery(activityFeedQueryOptions());
  const me = getPerson(CURRENT_USER_ID);
  const navigate = useNavigate();

  function copyRfpLink(rfpId: string) {
    void navigator.clipboard.writeText(`${window.location.origin}/rfps/${rfpId}`);
    toast.success("Link copied");
  }

  const activeRfps = rfps.filter((r) => (ACTIVE_STATUSES as readonly string[]).includes(r.status));
  const dueThisWeek = activeRfps.filter(
    (r) => daysUntil(r.deadline) >= 0 && daysUntil(r.deadline) <= 7,
  );
  const awaitingReview = reviews.filter((r) => r.status === "pending" || r.status === "in_review");
  const overdueCount = reviews.filter((r) => r.overdue).length;
  const highRiskReqs = requirements.filter((r) => r.risk === "high" || r.risk === "critical");
  const avgReadiness = activeRfps.length
    ? Math.round(activeRfps.reduce((sum, r) => sum + r.readiness, 0) / activeRfps.length)
    : 0;
  const highRiskShare = requirements.length
    ? Math.round((highRiskReqs.length / requirements.length) * 100)
    : 0;

  const myTasks = reviews
    .filter((r) => r.mine && (r.status === "pending" || r.status === "in_review"))
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 5);

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
        eyebrow="Operating console"
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricTile
          label="Active RFPs"
          value={activeRfps.length}
          hint={`${rfps.length} total in pipeline`}
        />
        <MetricTile
          label="Due this week"
          value={dueThisWeek.length}
          hint={dueThisWeek.length > 0 ? "Needs prioritization" : "None upcoming"}
          tone={dueThisWeek.length > 0 ? "warning" : "neutral"}
        />
        <MetricTile
          label="Awaiting review"
          value={awaitingReview.length}
          hint={overdueCount > 0 ? `${overdueCount} overdue` : "None overdue"}
          tone={overdueCount > 0 ? "danger" : awaitingReview.length > 5 ? "warning" : "neutral"}
        />
        <MetricTile
          label="High-risk requirements"
          value={highRiskReqs.length}
          hint={`${highRiskShare}% of all requirements`}
          tone={highRiskReqs.length > 0 ? "danger" : "neutral"}
        />
        <MetricTile
          label="Avg. readiness"
          value={avgReadiness}
          unit="%"
          hint="Across active RFPs"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-2.5 xl:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-title text-foreground">Active RFPs</h2>
            <Link
              to="/rfps"
              className="text-meta font-medium text-fg-2 transition-colors hover:text-foreground"
            >
              View all
            </Link>
          </div>
          <DataTable
            head={
              <>
                <Th>RFP</Th>
                <Th>Owner</Th>
                <Th>Progress</Th>
                <Th>Risk</Th>
                <Th>Deadline</Th>
                <Th>Status</Th>
                <Th className="w-10" />
              </>
            }
          >
            {rfps.slice(0, 8).map((rfp) => {
              const worstRisk = worstRiskOf(rfp);
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
                  <Td title={getPerson(rfp.ownerId)?.name}>
                    <PersonAvatar personId={rfp.ownerId} />
                  </Td>
                  <Td>
                    <ProgressBar value={rfp.progress} size="sm" />
                  </Td>
                  <Td>
                    {worstRisk ? (
                      <RiskBadge risk={worstRisk} />
                    ) : (
                      <RowCell className="text-muted-foreground">None</RowCell>
                    )}
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
        </div>

        <div className="space-y-6">
          <div className="space-y-2.5">
            <h2 className="text-title text-foreground">My tasks</h2>
            <div className="surface-panel divide-y divide-line-soft p-0">
              {myTasks.length === 0 ? (
                <EmptyState
                  size="inline"
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  title="No open reviews"
                  description="You're all caught up."
                />
              ) : (
                myTasks.map((task) => {
                  const due = deadlineMeta(task.due);
                  return (
                    <Link
                      key={task.id}
                      to="/reviews/$reviewId"
                      params={{ reviewId: task.id }}
                      className={cn(
                        "flex items-start justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-surface-sunken",
                        task.overdue && "shadow-[inset_3px_0_0_var(--risk-high-fg)]",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-supporting font-medium text-foreground">
                          {task.requirementCode} · {task.requirementTitle}
                        </span>
                        <span className="block truncate text-meta text-muted-foreground">
                          {task.rfpTitle}
                        </span>
                      </span>
                      <DeadlineCell meta={due} className="shrink-0" />
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-2.5">
            <h2 className="text-title text-foreground">Attention required</h2>
            <div className="surface-panel divide-y divide-line-soft p-0">
              {attention.length === 0 ? (
                <EmptyState
                  size="inline"
                  icon={<Sparkles className="h-4 w-4" />}
                  title="Nothing urgent"
                  description="No critical risks or overdue reviews right now."
                />
              ) : (
                attention.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.id}
                      to={item.to}
                      className={cn(
                        "flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-surface-sunken",
                        item.tone === "danger"
                          ? "shadow-[inset_3px_0_0_var(--risk-high-fg)]"
                          : "shadow-[inset_3px_0_0_var(--risk-medium-line)]",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                          item.tone === "danger"
                            ? "bg-risk-high-bg text-risk-high-fg"
                            : "bg-risk-medium-bg text-risk-medium-fg",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-supporting font-medium text-foreground">
                          {item.title}
                        </span>
                        <span className="block truncate text-meta text-muted-foreground">
                          {item.detail}
                        </span>
                      </span>
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-2.5">
            <h2 className="text-title text-foreground">Recent activity</h2>
            <div className="surface-panel p-4">
              {activity.length === 0 ? (
                <EmptyState
                  size="inline"
                  icon={<Inbox className="h-4 w-4" />}
                  title="No activity yet"
                  description="Actions across your RFPs will appear here."
                />
              ) : (
                <ActivityTimeline entries={activity.slice(0, 8)} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
