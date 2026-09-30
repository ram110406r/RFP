"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";

import { AppShell } from "../../components/app-shell";
import { RfpEmptyState } from "../../components/rfp-foundation";
import { TendyyErrorState, TendyyResponsiveDataView, TendyySkeletonRows } from "../../components/tendyy-ui";
import type { SubmissionQueueActionState, SubmissionsQueueRow } from "../../lib/models";
import { useSubmissionsQueue } from "../../lib/queries";

type SubmissionRow = SubmissionsQueueRow;
type FilterKey = "all" | "ready" | "approved" | "needs-rebuild" | "submitted" | "blocked";

export default function SubmissionsPage() {
  const [filter, setFilter] = useState<FilterKey>("all");
  const queueQuery = useSubmissionsQueue({ pageSize: 100, includeArchived: false });
  const rows = queueQuery.data?.items ?? [];
  const counts = queueQuery.data?.counts ?? { tenders: 0, noPackage: 0, generating: 0, ready: 0, approved: 0, needsRebuild: 0, submitted: 0, blocked: 0 };
  const filteredRows = rows.filter((row) =>
    filter === "all"
    || (filter === "ready" && row.latestPackage?.status === "READY")
    || (filter === "approved" && row.latestPackage?.status === "APPROVED")
    || (filter === "needs-rebuild" && (row.latestPackage?.status === "STALE" || row.latestPackage?.status === "FAILED"))
    || (filter === "submitted" && Boolean(row.latestSubmission))
    || (filter === "blocked" && (row.blockingIssueCount > 0 || row.actionState === "RESOLVE_BLOCKERS")),
  );
  const filters: Array<[FilterKey, string]> = [
    ["all", `All (${counts.tenders})`],
    ["ready", `Ready (${counts.ready})`],
    ["approved", `Approved (${counts.approved})`],
    ["needs-rebuild", `Needs rebuild (${counts.needsRebuild})`],
    ["submitted", `Submitted (${counts.submitted})`],
    ["blocked", `Blocked (${counts.blocked})`],
  ];
  const filterHidesRows = filter !== "all" && filteredRows.length < rows.length;

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Submissions" }]}>
      <div className="space-y-5">
        <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-700">Delivery</p>
          <h1 className="mt-2 text-[29px] font-semibold tracking-tight text-slate-950">Submissions</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-600">
            Track package status, blockers, approval availability, and manual submission receipts from the Apply workflow.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Visible tenders" value={String(counts.tenders)} detail="Loaded from the submissions queue." />
          <StatCard title="Approved packages" value={String(counts.approved)} detail="Eligible for manual receipt capture." />
          <StatCard title="Needs rebuild" value={String(counts.needsRebuild)} detail="Package is stale or failed." />
          <StatCard title="Submitted" value={String(counts.submitted)} detail="Manual receipts recorded." />
        </section>

        <QueueFilters items={filters} value={filter} onChange={setFilter} />
        {filterHidesRows ? <p className="text-xs font-medium text-slate-500">Showing {filteredRows.length} of {rows.length} tenders for this filter.</p> : null}

        <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
          {queueQuery.isLoading ? (
            <TendyySkeletonRows count={7} />
          ) : queueQuery.isError ? (
            <TendyyErrorState title="Unable to load submissions" message="Submissions could not be loaded. Check the API and selected workspace, then retry." onRetry={() => void queueQuery.refetch()} />
          ) : filteredRows.length ? (
          <div className="min-w-0 overflow-hidden rounded-[10px] border border-slate-200">
            <TendyyResponsiveDataView
              desktop={
                <table className="w-full table-fixed border-separate border-spacing-0">
                  <thead className="bg-slate-100/80 text-left text-[13px] uppercase tracking-[0.14em] text-slate-500">
                    <tr>
                      <Th>RFP</Th>
                      <Th>Package</Th>
                      <Th>Readiness</Th>
                      <Th>Blockers</Th>
                      <Th>Receipt</Th>
                      <Th>Action</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => (
                        <tr key={row.tender.id} className="bg-white align-top">
                          <Td>
                            <Link href={`/apply/${row.tender.id}`} className="block py-4 pr-4">
                              <p className="font-semibold text-slate-950">{row.tender.title}</p>
                              <p className="mt-1 text-sm text-slate-600">{row.tender.name}</p>
                            </Link>
                          </Td>
                          <Td><div className="py-4"><PackageBadge pkg={row.latestPackage} /></div></Td>
                          <Td>
                            <div className="flex items-center gap-3 py-4">
                              <div className="h-2.5 w-28 rounded-full bg-slate-200">
                                <div className="h-2.5 rounded-full bg-sky-700" style={{ width: `${Math.max(8, row.readiness ?? 0)}%` }} />
                              </div>
                              <span className="text-sm font-medium text-slate-900">{row.readiness ?? "-"}%</span>
                            </div>
                          </Td>
                          <Td><span className="text-sm text-slate-600">{row.blockingIssueCount} blocking</span></Td>
                          <Td><ReceiptCell submission={row.latestSubmission} /></Td>
                          <Td><div className="py-4"><Link href={`/apply/${row.tender.id}#packages`} className="inline-flex rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100">{actionLabel(row)}</Link></div></Td>
                        </tr>
                    ))}
                  </tbody>
                </table>
              }
              mobile={
                <div className="space-y-3 p-3">
                  {filteredRows.map((row) => (
                    <article key={row.tender.id} className="min-w-0 border border-slate-200 bg-white p-4">
                      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="tendyy-wrap-anywhere font-semibold text-slate-950">{row.tender.title}</p>
                          <p className="tendyy-wrap-anywhere mt-1 text-xs text-slate-600">{row.tender.name}</p>
                        </div>
                        <PackageBadge pkg={row.latestPackage} />
                      </div>
                      <div className="mt-4 flex items-center gap-3">
                        <div className="h-2.5 min-w-0 flex-1 rounded-full bg-slate-200">
                          <div className="h-2.5 rounded-full bg-sky-700" style={{ width: `${Math.max(8, row.readiness ?? 0)}%` }} />
                        </div>
                        <span className="text-sm font-medium text-slate-900">{row.readiness ?? "-"}%</span>
                      </div>
                      <p className="mt-3 text-xs text-slate-600">{row.issueCount} issue(s), {row.blockingIssueCount} blocking</p>
                      <ReceiptCell submission={row.latestSubmission} />
                      <Link href={`/apply/${row.tender.id}#packages`} className="mt-4 inline-flex h-9 items-center rounded-lg border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-800">{actionLabel(row)}</Link>
                    </article>
                  ))}
                </div>
              }
            />
          </div>
          ) : (
            <RfpEmptyState title="No matching submissions" description={rows.length ? "Try another queue filter to widen the results." : "Active tenders will appear here after they are imported into the workspace."} actionHref="/tenders/import" actionLabel="Import RFP" />
          )}
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

function PackageBadge({ pkg }: { pkg: SubmissionRow["latestPackage"] }) {
  if (!pkg) return <Badge tone="neutral">No package</Badge>;
  return <Badge tone={packageTone(pkg.status)}>{pkg.status}</Badge>;
}

function ReceiptCell({ submission }: { submission: SubmissionRow["latestSubmission"] }) {
  if (!submission) return <span className="block py-4 text-sm text-slate-500">No receipt</span>;
  return (
    <span className="block py-4 text-sm text-slate-700">
      {submission.portalReference || "Reference saved"}
      <span className="block text-xs text-slate-500">{new Date(submission.submittedAt).toLocaleDateString()}</span>
    </span>
  );
}

function actionLabel(row: SubmissionRow) {
  return actionLabelByState(row.actionState);
}

function actionLabelByState(state: SubmissionQueueActionState) {
  if (state === "VIEW_RECEIPT") return "View receipt";
  if (state === "RECORD_RECEIPT") return "Record receipt";
  if (state === "APPROVE_PACKAGE") return "Approve package";
  if (state === "REBUILD_PACKAGE") return "Rebuild package";
  if (state === "BUILD_PACKAGE") return "Build package";
  return "Resolve blockers";
}

function packageTone(status: NonNullable<SubmissionRow["latestPackage"]>["status"]): "success" | "warning" | "danger" | "neutral" {
  if (status === "APPROVED" || status === "READY") return "success";
  if (status === "FAILED") return "danger";
  if (status === "STALE" || status === "GENERATING") return "warning";
  return "neutral";
}

function Th({ children }: { children: ReactNode }) {
  return <th className="px-4 py-3 font-semibold">{children}</th>;
}

function Td({ children }: { children: ReactNode }) {
  return <td className="border-t border-slate-200 px-4 align-top">{children}</td>;
}

function QueueFilters({ items, value, onChange }: { items: Array<[FilterKey, string]>; value: FilterKey; onChange: (value: FilterKey) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(([key, label]) => (
        <button key={key} type="button" onClick={() => onChange(key)} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${value === key ? "border-sky-700 bg-sky-50 text-sky-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Badge({ tone, children }: { tone: "success" | "warning" | "danger" | "neutral"; children: ReactNode }) {
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
