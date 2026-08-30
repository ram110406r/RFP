"use client";

import Link from "next/link";

import { AppShell } from "../../components/app-shell";
import { useFirebaseSession } from "../../components/firebase-auth-gate";

export default function ProfilePage() {
  const session = useFirebaseSession();
  const profile = session?.profile ?? null;
  const name = profile?.displayName ?? session?.user?.displayName ?? "Account profile";
  const email = profile?.email ?? session?.user?.email ?? "No email";
  const role = profile?.role ?? "Member";
  const organizationName = profile?.organizationName ?? "TENDYY organization";

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Profile" }]}>
      <div className="space-y-6">
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Profile</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">{name}</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
            Your account profile, access role, and organization details are shown here.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoCard title="Email" value={email} />
          <InfoCard title="Role" value={role} />
          <InfoCard title="Organization" value={organizationName} />
          <InfoCard title="Status" value={profile ? "Connected" : "Guest"} />
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">Account actions</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            This page is a home for profile-level settings, sign-out, and identity controls.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/settings" className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm">
              Open settings
            </Link>
            <button
              type="button"
              onClick={() => void session?.signOut()}
              className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm"
            >
              Sign out
            </button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{title}</p>
      <p className="mt-3 break-words text-lg font-semibold tracking-tight text-slate-950">{value}</p>
    </article>
  );
}
