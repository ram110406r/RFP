"use client";

import Link from "next/link";

import { AppShell } from "../../components/app-shell";
import { useFirebaseSession } from "../../components/firebase-auth-gate";

export default function WorkspacePage() {
  const session = useFirebaseSession();
  const workspaceName = session?.profile?.organizationName ?? "TENDYY workspace";

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Workspace" }]}>
      <div className="space-y-6">
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Workspace</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">{workspaceName}</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
            Quick access to the core areas of the app from one workspace overview.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <QuickLink title="Dashboard" href="/" detail="Open the operational summary." />
          <QuickLink title="Tender Search" href="/tenders" detail="Browse active tenders and pipeline filters." />
          <QuickLink title="Knowledge Brain" href="/knowledge" detail="Review the knowledge lifecycle." />
          <QuickLink title="Pipeline" href="/submissions" detail="Track submissions and readiness." />
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">Workspace notes</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            This page keeps the sidebar route set complete while the deeper workspace administration flows continue to evolve.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/organization" className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm">
              Organization
            </Link>
            <Link href="/settings" className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm">
              Settings
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function QuickLink({ title, href, detail }: { title: string; href: string; detail: string }) {
  return (
    <Link href={href} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-[0_24px_70px_rgba(15,23,42,0.09)]">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{title}</p>
      <p className="mt-3 text-sm leading-6 text-slate-600">{detail}</p>
    </Link>
  );
}
