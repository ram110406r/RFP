"use client";

import Link from "next/link";

import { AppShell } from "../../components/app-shell";
import { useFirebaseSession } from "../../components/firebase-auth-gate";

export default function OrganizationPage() {
  const session = useFirebaseSession();
  const organizationName = session?.profile?.organizationName ?? "TENDYY organization";
  const role = session?.profile?.role ?? "Member";
  const email = session?.profile?.email ?? session?.user?.email ?? "No account email";

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Organization" }]}>
      <div className="space-y-6">
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Organization</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">{organizationName}</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
            Organization-level access, ownership, and workspace identity live here.
          </p>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <InfoCard title="Account" value={email} detail="Current signed-in account linked to this organization." />
          <InfoCard title="Role" value={role} detail="Role-based access controls are still enforced by the backend." />
          <InfoCard title="Workspace" value="Active" detail="This workspace is available across dashboard, tenders, reviews, and submissions." />
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">Organization actions</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Use this area to connect company settings, invite teammates, and align workspace defaults.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/settings" className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm">
              Open settings
            </Link>
            <Link href="/profile" className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm">
              View profile
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function InfoCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{title}</p>
      <p className="mt-3 break-words text-lg font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-3 text-sm leading-6 text-slate-600">{detail}</p>
    </article>
  );
}
