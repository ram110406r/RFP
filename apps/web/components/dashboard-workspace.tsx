"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo } from "react";

import { AppShell } from "./app-shell";
import { RfpCard, RfpEmptyState, RfpMetricCard, RfpPageHeader, RfpSectionHeader, RfpStatusBadge } from "./rfp-foundation";
import type { DashboardOverview, KnowledgeItem } from "../lib/models";
import { useDashboardSummary } from "../lib/queries";

type DashboardMetric = {
  label: string;
  value: string;
  helper: string;
  tone?: "neutral" | "warning" | "danger" | "success";
  icon?: ReactNode;
  loading?: boolean;
};

const severityRank: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  INFO: 0,
};

export function DashboardWorkspace() {
  const dashboardQuery = useDashboardSummary(6);
  const dashboard = dashboardQuery.data ?? null;

  const rows = useMemo<DashboardOverview["tenders"]>(
    () => dashboard?.activeTenders ?? dashboard?.tenders ?? [],
    [dashboard],
  );

  const activeCount = dashboard?.metrics.activeRfps ?? 0;
  const dueThisWeek = dashboard?.metrics.dueThisWeek ?? 0;
  const averageReadiness = dashboard?.metrics.averageReadiness ?? null;
  const awaitingReviewCount = dashboard?.metrics.awaitingReview ?? 0;
  const submissionReadyCount = dashboard?.metrics.submissionReady ?? rows.filter((row) => row.ready).length;
  const blockedFromSubmission = dashboard?.metrics.blockedFromSubmission ?? rows.reduce((sum, row) => sum + row.blockingIssueCount, 0);
  const knowledgeCounts = dashboard?.knowledge.counts ?? { total: 0, draft: 0, active: 0, archived: 0, stale: 0 };
  const recentKnowledge: DashboardOverview["knowledge"]["items"] = dashboard?.knowledge.items ?? [];
  const attentionKnowledge: DashboardOverview["knowledge"]["attention"] = dashboard?.knowledge.attention ?? [];

  const topIssues = rows
    .flatMap((row) => (row.highestIssue ? [{ tender: row.tender, issue: row.highestIssue }] : []))
    .sort((a, b) => rankSeverity(b.issue.severity) - rankSeverity(a.issue.severity))
    .slice(0, 4);

  const metrics: DashboardMetric[] = [
    {
      label: "Active tenders",
      value: String(activeCount),
      helper: "Across the current workspace scope",
      icon: <FolderIcon />,
      loading: dashboardQuery.isLoading || dashboardQuery.isError,
    },
    {
      label: "Due soon",
      value: String(dueThisWeek),
      helper: dueThisWeek > 0 ? "Needs deadline attention" : "No near-term deadlines",
      tone: dueThisWeek > 0 ? "warning" : "success",
      icon: <CalendarIcon />,
      loading: dashboardQuery.isLoading || dashboardQuery.isError,
    },
    {
      label: "Awaiting review",
      value: String(awaitingReviewCount),
      helper: "Pending or changes requested",
      tone: awaitingReviewCount > 0 ? "warning" : "success",
      icon: <UsersIcon />,
      loading: dashboardQuery.isLoading || dashboardQuery.isError,
    },
    {
      label: "Blocked",
      value: String(blockedFromSubmission),
      helper: "Validation blockers preventing submission",
      tone: blockedFromSubmission > 0 ? "danger" : "success",
      icon: <ShieldIcon />,
      loading: dashboardQuery.isLoading || dashboardQuery.isError,
    },
    {
      label: "Submission ready",
      value: String(submissionReadyCount),
      helper: "Ready based on validation and blocking rules",
      tone: submissionReadyCount > 0 ? "success" : "warning",
      icon: <CheckBadgeIcon />,
      loading: dashboardQuery.isLoading || dashboardQuery.isError,
    },
  ];

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard" }]}>
      <div className="min-w-0 space-y-6">
        {dashboardQuery.isError ? (
          <section className="rounded-[24px] border border-rose-200 bg-rose-50/90 p-4 text-sm text-rose-800">
            Unable to load the dashboard summary right now.
          </section>
        ) : null}
        <RfpPageHeader
          eyebrow="RFP operations"
          title="Good afternoon"
          description="Monitor active tenders, review pressure, evidence health, and the next operational move."
          primaryAction={{ label: "New Tender", href: "/tenders/new" }}
          secondaryActions={[{ label: "Import RFP", href: "/tenders/import", variant: "secondary" }]}
        />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metrics.slice(0, 4).map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </section>

        <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <article className="space-y-6">
            <RfpCard>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">Active tenders</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Active tenders</h2>
                </div>
                <Link href="/tenders" className="text-sm font-medium text-blue-700 hover:text-blue-800">
                  View all
                </Link>
              </div>

              <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white">
                <div className="overflow-x-auto">
                  <table className="min-w-[920px] w-full border-separate border-spacing-0">
                    <thead className="bg-slate-50 text-left text-[13px] uppercase tracking-[0.14em] text-slate-500">
                      <tr>
                        <Th>RFP</Th>
                        <Th>Owner</Th>
                        <Th>Progress</Th>
                        <Th>Issues</Th>
                        <Th>Risk</Th>
                        <Th>Deadline</Th>
                        <Th>Status</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length > 0 ? (
                        rows.map((row) => {
                          const risk = highestIssueTone(row.highestIssue?.severity ?? null);
                          const deadline = formatRelativeDeadline(row.tender.dueAt);
                          return (
                            <tr key={row.tender.id} className="border-t border-slate-200 bg-white align-top">
                              <Td>
                                <Link href={`/tenders/${row.tender.id}`} className="group block py-4 pr-4">
                                  <p className="text-[15px] font-semibold text-slate-950 group-hover:text-blue-800">{row.tender.title}</p>
                                  <p className="mt-1 text-sm text-slate-600">{row.tender.name}</p>
                                  <p className="mt-1 text-xs text-slate-400">{row.tender.referenceNumber ?? row.tender.id.slice(0, 8)}</p>
                                </Link>
                              </Td>
                              <Td>
                                <div className="py-4">
                                  <OwnerBadge ownerId={row.tender.ownerId} />
                                </div>
                              </Td>
                              <Td>
                                <div className="py-4">
                                  <ProgressCell value={row.readiness} />
                                </div>
                              </Td>
                              <Td>
                                <div className="py-4">
                                  <div className="flex flex-wrap gap-2">
                                    <StatusPill tone={row.blockingIssueCount > 0 ? "danger" : row.issueCount > 0 ? "warning" : "success"}>
                                      {row.issueCount} total
                                    </StatusPill>
                                    {row.blockingIssueCount > 0 ? <StatusPill tone="danger">{row.blockingIssueCount} blocking</StatusPill> : null}
                                  </div>
                                </div>
                              </Td>
                              <Td>
                                <div className="py-4">
                                  <div className="space-y-1">
                                    <StatusPill tone={risk}>{row.highestIssue?.severity ?? "None"}</StatusPill>
                                    {row.highestIssue ? (
                                      <p className="max-w-[220px] text-xs leading-5 text-slate-500">{row.highestIssue.title}</p>
                                    ) : (
                                      <p className="text-xs leading-5 text-slate-400">No major blockers</p>
                                    )}
                                  </div>
                                </div>
                              </Td>
                              <Td>
                                <div className="py-4 text-sm text-slate-700">{deadline}</div>
                              </Td>
                              <Td>
                                <div className="py-4">
                                  <StatusPill tone={statusTone(row.tender.status)}>{row.tender.status}</StatusPill>
                                </div>
                              </Td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={7} className="px-6 py-10">
                            <EmptyState
                              title="No tenders found"
                              description="Create or import an RFP to see the pipeline overview here."
                              actionHref="/knowledge"
                              actionLabel="Open knowledge"
                            />
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </RfpCard>

            <div className="grid gap-6 lg:grid-cols-2">
              <RfpCard>
                <RfpSectionHeader eyebrow="Response health" title="Grounded progress" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <StatRow label="Awaiting review" value={String(awaitingReviewCount)} />
                  <StatRow label="Submission ready" value={String(submissionReadyCount)} />
                  <StatRow label="Blocked items" value={String(blockedFromSubmission)} />
                  <StatRow label="Avg. readiness" value={averageReadiness === null ? "-" : `${averageReadiness}%`} />
                </div>
              </RfpCard>

              <RfpCard>
                <RfpSectionHeader eyebrow="AI activity" title="Work in motion" />
                <div className="space-y-3 text-sm">
                  <StatRow label="Drafts generated" value={String(dashboard?.aiActivity?.aiGenerated ?? 0)} />
                  <StatRow label="Answers approved" value={String(dashboard?.aiActivity?.approved ?? 0)} />
                  <StatRow label="Evidence-backed" value={String(dashboard?.evidenceHealth?.answersWithEvidence ?? 0)} />
                  <StatRow label="Stale knowledge" value={String(knowledgeCounts.stale)} />
                </div>
              </RfpCard>
            </div>
          </article>

          <aside className="space-y-6">
            <RfpCard>
              <RfpSectionHeader eyebrow="Quick actions" title="What to do next" />
              <div className="grid gap-3">
                <ActionCard title="New Tender" description="Start a fresh intake workspace for a customer RFP." href="/tenders/new" />
                <ActionCard title="Import RFP" description="Bring in an uploaded brief and begin parsing." href="/tenders/import" />
                <ActionCard title="Generate Responses" description="Draft answers from evidence-backed requirements." href="/tenders" />
                <ActionCard title="Review Queue" description="Open items waiting on approval or changes." href="/reviews" />
              </div>
            </RfpCard>

            <RfpCard>
              <RfpSectionHeader eyebrow="Attention required" title="Highest-priority issues" count={String(topIssues.length)} />
              <div className="space-y-3">
                {topIssues.length > 0 ? (
                  topIssues.map(({ tender, issue }) => (
                    <div key={`${tender.id}-${issue.id}`} className="rounded-2xl border border-[rgba(15,23,42,0.09)] bg-white/90 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-950">{issue.title}</p>
                          <p className="mt-1 text-sm text-slate-600">{tender.title}</p>
                        </div>
                        <StatusPill tone={highestIssueTone(issue.severity)}>{issue.severity}</StatusPill>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-600">{issue.recommendation}</p>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    title="No blocker issues"
                    description="Validation is currently clear across the loaded tenders."
                    actionHref="/tenders"
                    actionLabel="Review RFPs"
                  />
                )}
              </div>
            </RfpCard>

            <RfpCard>
              <RfpSectionHeader eyebrow="Knowledge" title="Source health" count={String(knowledgeCounts.total)} />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <StatRow label="Active sources" value={String(knowledgeCounts.active)} />
                <StatRow label="Draft sources" value={String(knowledgeCounts.draft)} />
                <StatRow label="Approval queue" value={String(attentionKnowledge.filter((item) => item.status === "DRAFT").length)} />
                <StatRow label="Stale checks" value={String(knowledgeCounts.stale)} />
              </div>
              <div className="mt-4 space-y-2">
                {recentKnowledge.slice(0, 3).map((item) => (
                  <KnowledgeRow key={item.id} item={item} />
                ))}
                {recentKnowledge.length === 0 ? (
                  <EmptyState title="No knowledge sources" description="Add or approve knowledge to power grounded answers." actionHref="/knowledge" actionLabel="Open knowledge" />
                ) : null}
              </div>
            </RfpCard>
          </aside>
        </section>
      </div>
    </AppShell>
  );
}

function MetricCard({ label, value, helper, tone = "neutral", icon, loading = false }: DashboardMetric) {
  const trendLabel =
    tone === "danger" ? "Critical" : tone === "warning" ? "Attention" : tone === "success" ? "Healthy" : "Stable";
  return <RfpMetricCard label={label} value={value} description={helper} icon={icon} loading={loading} trend={{ label: trendLabel, tone }} />;
}

function OwnerBadge({ ownerId }: { ownerId: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
        {ownerId.slice(0, 2).toUpperCase()}
      </div>
      <div>
        <p className="text-sm font-medium text-slate-900">{shortId(ownerId)}</p>
        <p className="text-xs text-slate-500">Owner</p>
      </div>
    </div>
  );
}

function ProgressCell({ value }: { value: number | null }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-2.5 w-28 rounded-full bg-slate-200">
        <div className="h-2.5 rounded-full bg-blue-600" style={{ width: `${Math.max(8, value ?? 0)}%` }} />
      </div>
      <span className="text-sm font-medium text-slate-900">{value === null ? "-" : `${value}%`}</span>
    </div>
  );
}

function ActionCard({ title, description, href }: { title: string; description: string; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-[22px] border border-[rgba(15,23,42,0.08)] bg-white p-4 transition hover:border-[rgba(37,99,235,0.22)] hover:shadow-sm"
    >
      <p className="text-sm font-semibold text-slate-950">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
    </Link>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="font-semibold text-slate-950">{value}</span>
    </div>
  );
}

function KnowledgeRow({ item }: { item: KnowledgeItem }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-slate-950">{item.name}</p>
          <p className="mt-1 text-sm text-slate-600">
            {item.type} - {item.category}
          </p>
        </div>
        <StatusPill tone={item.status === "ACTIVE" ? "success" : item.status === "DRAFT" ? "warning" : "neutral"}>{item.status}</StatusPill>
      </div>
      <p className="mt-3 text-sm text-slate-600">{item.summary}</p>
    </div>
  );
}

function EmptyState({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string;
  description: string;
  actionHref: string;
  actionLabel: string;
}) {
  return <RfpEmptyState title={title} description={description} actionHref={actionHref} actionLabel={actionLabel} />;
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-4 font-semibold">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="border-t border-slate-200 px-4 align-top">{children}</td>;
}

function StatusPill({ tone, children }: { tone: "success" | "warning" | "danger" | "neutral"; children: React.ReactNode }) {
  return <RfpStatusBadge tone={tone}>{children}</RfpStatusBadge>;
}

function highestIssueTone(severity: string | null): "success" | "warning" | "danger" | "neutral" {
  if (severity === "CRITICAL") return "danger";
  if (severity === "HIGH") return "warning";
  if (severity === "MEDIUM") return "neutral";
  return "success";
}

function formatRelativeDeadline(value: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  const diffDays = Math.round((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays > 1) return `in ${diffDays} days`;
  if (diffDays === -1) return "1 day overdue";
  return `${Math.abs(diffDays)} days overdue`;
}

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  const normalized = status.toUpperCase();
  if (normalized.includes("APPROVED") || normalized.includes("ACTIVE") || normalized.includes("SUBMITTED")) return "success";
  if (normalized.includes("DRAFT") || normalized.includes("PENDING") || normalized.includes("REVIEW")) return "warning";
  if (normalized.includes("REJECT") || normalized.includes("ARCHIVED")) return "danger";
  return "neutral";
}

function shortId(value: string) {
  return value.length > 8 ? `${value.slice(0, 4)}...${value.slice(-4)}` : value;
}

function rankSeverity(severity: string | null | undefined) {
  return severityRank[severity ?? "INFO"] ?? 0;
}

function FolderIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M3.5 7.75A2.25 2.25 0 0 1 5.75 5.5h4.1c.6 0 1.17.24 1.59.66l1.32 1.34c.42.42.99.66 1.59.66h3.9A2.25 2.25 0 0 1 20.5 10.4v6.85A2.25 2.25 0 0 1 18.25 19.5H5.75A2.25 2.25 0 0 1 3.5 17.25V7.75Z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M7.5 4.5v3M16.5 4.5v3M4.5 9.75h15" />
      <rect x="4.5" y="6" width="15" height="13.5" rx="2.25" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M8.25 11.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z" />
      <path d="M15.75 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      <path d="M3.75 18.25a4.5 4.5 0 0 1 9 0" />
      <path d="M13.25 18.25a4 4 0 0 1 7.5 0" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3.75 19 6.5v5.18c0 4.28-2.8 7.93-7 9.57-4.2-1.64-7-5.29-7-9.57V6.5l7-2.75Z" />
      <path d="m9.5 12 1.8 1.8 3.75-4.1" />
    </svg>
  );
}

function CheckBadgeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3.75 14.2 6.2l3.3.5-1.1 3.15.63 3.28-3.13.88L12 16.25l-1.9-2.24-3.13-.88.63-3.28-1.1-3.15 3.3-.5L12 3.75Z" />
      <path d="m9.7 11.95 1.45 1.45 3.15-3.15" />
    </svg>
  );
}
