"use client";

import Link from "next/link";

import { AppShell } from "../../components/app-shell";
import { TendyyResponsiveDataView } from "../../components/tendyy-ui";
import type { DashboardOverview } from "../../lib/models";
import { useDashboardSummary } from "../../lib/queries";

export default function SubmissionsPage() {
  const dashboardQuery = useDashboardSummary(10);
  const rows: DashboardOverview["tenders"] = dashboardQuery.data?.activeTenders ?? dashboardQuery.data?.tenders ?? [];

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Submissions" }]}>
      <div className="space-y-5">
        <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-700">Delivery</p>
          <h1 className="mt-2 text-[29px] font-semibold tracking-tight text-slate-950">Submissions</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-600">
            Track submission readiness from the current workspace validation.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Visible tenders" value={String(rows.length)} detail="Loaded from the dashboard summary endpoint." />
          <StatCard title="Ready to submit" value={String(rows.filter((row) => row.ready).length)} detail="Workspace validation already marks these ready." />
          <StatCard title="Needs attention" value={String(rows.filter((row) => !row.ready).length)} detail="Still missing readiness checks or validation." />
          <StatCard title="Open blockers" value={String(rows.reduce((sum, row) => sum + row.blockingIssueCount, 0))} detail="Blocking validation issues across visible tenders." />
        </section>

        <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
          <div className="min-w-0 overflow-hidden rounded-[10px] border border-slate-200">
            <TendyyResponsiveDataView desktop={
              <table className="w-full table-fixed border-separate border-spacing-0">
                <thead className="bg-slate-100/80 text-left text-[13px] uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <Th>RFP</Th>
                    <Th>Readiness</Th>
                    <Th>Status</Th>
                    <Th>Issues</Th>
                    <Th>Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length > 0 ? (
                    rows.map((row) => (
                      <tr key={row.tender.id} className="bg-white align-top">
                        <Td>
                          <Link href={`/apply/${row.tender.id}`} className="block py-4 pr-4">
                            <p className="font-semibold text-slate-950">{row.tender.title}</p>
                            <p className="mt-1 text-sm text-slate-600">{row.tender.name}</p>
                          </Link>
                        </Td>
                        <Td>
                          <div className="flex items-center gap-3 py-4">
                            <div className="h-2.5 w-28 rounded-full bg-slate-200">
                              <div className="h-2.5 rounded-full bg-sky-700" style={{ width: `${Math.max(8, row.readiness ?? 0)}%` }} />
                            </div>
                            <span className="text-sm font-medium text-slate-900">{row.readiness ?? "-"}%</span>
                          </div>
                        </Td>
                        <Td>
                          <div className="py-4">
                            <Badge tone={row.ready ? "success" : "warning"}>{row.ready ? "Ready" : "In progress"}</Badge>
                          </div>
                        </Td>
                        <Td><span className="text-sm text-slate-600">{row.issueCount} issue(s)</span></Td>
                        <Td><div className="py-4"><Link href={`/apply/${row.tender.id}`} className="inline-flex rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100">{row.ready ? "Review submission" : "Resolve blockers"}</Link></div></Td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-10 text-sm text-slate-500">
                        No submissions are available yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            } mobile={<div className="space-y-3 p-3">{rows.length ? rows.map((row) => <article key={row.tender.id} className="min-w-0 border border-slate-200 bg-white p-4"><div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1"><p className="tendyy-wrap-anywhere font-semibold text-slate-950">{row.tender.title}</p><p className="tendyy-wrap-anywhere mt-1 text-xs text-slate-600">{row.tender.name}</p></div><Badge tone={row.ready ? "success" : "warning"}>{row.ready ? "Ready" : "In progress"}</Badge></div><div className="mt-4 flex items-center gap-3"><div className="h-2.5 min-w-0 flex-1 rounded-full bg-slate-200"><div className="h-2.5 rounded-full bg-sky-700" style={{ width: `${Math.max(8, row.readiness ?? 0)}%` }} /></div><span className="text-sm font-medium text-slate-900">{row.readiness ?? "-"}%</span></div><p className="mt-3 text-xs text-slate-600">{row.issueCount} issue(s), {row.blockingIssueCount} blocking</p><Link href={`/apply/${row.tender.id}`} className="mt-4 inline-flex h-9 items-center rounded-lg border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-800">{row.ready ? "Review submission" : "Resolve blockers"}</Link></article>) : <p className="p-5 text-sm text-slate-500">No submissions are available yet.</p>}</div>} />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function StatCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">{title}</p>
      <p className="mt-2 text-[24px] font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-[13px] leading-6 text-slate-600">{detail}</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-semibold">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="border-t border-slate-200 px-4 align-top">{children}</td>;
}

function Badge({ tone, children }: { tone: "success" | "warning" | "danger" | "neutral"; children: React.ReactNode }) {
  const palette =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "danger"
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-slate-200 bg-slate-100 text-slate-700";
  return <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${palette}`}>{children}</span>;
}
