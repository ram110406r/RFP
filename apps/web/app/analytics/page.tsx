"use client";

import { AppShell } from "../../components/app-shell";
import { RfpEmptyState, RfpMetricCard } from "../../components/rfp-foundation";
import type { DashboardOverview } from "../../lib/models";
import { useDashboardSummary } from "../../lib/queries";

export default function AnalyticsPage() {
  const dashboardQuery = useDashboardSummary(25);
  const dashboard = dashboardQuery.data ?? null;
  const tenders: DashboardOverview["tenders"] = dashboard?.activeTenders ?? dashboard?.tenders ?? [];
  const avgScore = dashboard?.metrics.averageReadiness ?? null;
  const blockers = dashboard?.metrics.highRiskItems ?? 0;
  const knowledgeCounts = dashboard?.knowledge.counts ?? { total: 0, draft: 0, active: 0, archived: 0, stale: 0 };

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Analytics" }]}>
      <div className="space-y-5">
        <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-700">Insights</p>
          <h1 className="mt-2 text-[29px] font-semibold tracking-tight text-slate-950">Analytics</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-600">
            A lightweight analytics view based on the current number of tenders, validation scores, and knowledge sources.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card title="Average readiness" value={avgScore === null ? "-" : `${avgScore}%`} detail="Across loaded tenders" />
          <Card title="Blocking issues" value={String(blockers)} detail="Validation blockers in scope" />
          <Card title="Tenders loaded" value={String(dashboard?.metrics.activeRfps ?? tenders.length)} detail="From the current summary endpoint" />
          <Card title="Knowledge sources" value={String(knowledgeCounts.total)} detail="All visible knowledge items" />
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <article className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
            <h2 className="text-[19px] font-semibold tracking-tight text-slate-950">Readiness spread</h2>
            <div className="mt-4 space-y-3.5">
              {tenders.length > 0 ? (
                tenders.map((row) => (
                  <div key={row.tender.id} className="flex items-center gap-4">
                    <span className="w-36 truncate text-sm text-slate-500" title={row.tender.title}>{row.tender.title}</span>
                    <div className="h-3 flex-1 rounded-full bg-slate-200">
                      <div className="h-3 rounded-full bg-sky-700" style={{ width: `${row.readiness ?? 0}%` }} />
                    </div>
                    <span className="w-12 text-right text-sm font-semibold text-slate-900">{row.readiness ?? "-"}%</span>
                  </div>
                ))
              ) : (
                <EmptyState />
              )}
            </div>
          </article>

          <aside className="space-y-4">
            <Card title="Knowledge health" value={String(knowledgeCounts.active)} detail="Active items available for answers" />
            <Card title="Draft knowledge" value={String(knowledgeCounts.draft)} detail="Pending approval in the lifecycle" />
            <Card title="Next step" value="Open dashboard" detail="Use the dashboard to jump into RFP detail pages." />
          </aside>
        </section>
      </div>
    </AppShell>
  );
}

function Card({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return <RfpMetricCard label={title} value={value} description={detail} />;
}

function EmptyState() {
  return <RfpEmptyState title="No readiness data available yet." description="Load tenders to populate the readiness spread." />;
}
