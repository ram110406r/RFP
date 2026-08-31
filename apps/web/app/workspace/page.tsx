"use client";

import Link from "next/link";

import { AppShell } from "../../components/app-shell";
import { useFirebaseSession } from "../../components/firebase-auth-gate";

export default function WorkspacePage() {
  const session = useFirebaseSession();
  const workspaceName = session?.profile?.organizationName ?? "TENDYY workspace";

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Workspace" }]}>
      <div className="space-y-5">
        <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Workspace</p>
          <h1 className="mt-2 text-[29px] font-semibold tracking-tight text-slate-950">{workspaceName}</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-600">
            Quick access to the core areas of the app from one workspace overview.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <QuickLink title="Dashboard" href="/" detail="Open the operational summary." />
          <QuickLink title="Tender Search" href="/tenders" detail="Browse active tenders and pipeline filters." />
          <QuickLink title="Knowledge Brain" href="/knowledge" detail="Review the knowledge lifecycle." />
          <QuickLink title="Pipeline" href="/pipeline" detail="Track opportunities by stage and risk." />
        </section>

        <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
          <h2 className="text-[19px] font-semibold tracking-tight text-slate-950">Workspace notes</h2>
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-600">
            This page keeps the sidebar route set complete while the deeper workspace administration flows continue to evolve.
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Link href="/organization" className="inline-flex h-9 items-center justify-center rounded-[8px] border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-800 shadow-sm">
              Organization
            </Link>
            <Link href="/settings" className="inline-flex h-9 items-center justify-center rounded-[8px] bg-slate-950 px-4 text-[13px] font-semibold text-white shadow-sm">
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
    <Link href={href} className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_20px_55px_rgba(15,23,42,0.08)]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">{title}</p>
      <p className="mt-2 text-[13px] leading-6 text-slate-600">{detail}</p>
    </Link>
  );
}
