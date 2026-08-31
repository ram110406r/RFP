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
      <div className="space-y-5">
        <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Profile</p>
          <h1 className="mt-2 text-[29px] font-semibold tracking-tight text-slate-950">{name}</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-600">
            Your account profile, access role, and organization details are shown here.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoCard title="Email" value={email} />
          <InfoCard title="Role" value={role} />
          <InfoCard title="Organization" value={organizationName} />
          <InfoCard title="Status" value={profile ? "Connected" : "Guest"} />
        </section>

        <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
          <h2 className="text-[19px] font-semibold tracking-tight text-slate-950">Account actions</h2>
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-600">
            This page is a home for profile-level settings, sign-out, and identity controls.
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Link href="/settings" className="inline-flex h-9 items-center justify-center rounded-[8px] bg-slate-950 px-4 text-[13px] font-semibold text-white shadow-sm">
              Open settings
            </Link>
            <button
              type="button"
              onClick={() => void session?.signOut()}
              className="inline-flex h-9 items-center justify-center rounded-[8px] border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-800 shadow-sm"
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
    <article className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">{title}</p>
      <p className="mt-2 break-words text-[17px] font-semibold tracking-tight text-slate-950">{value}</p>
    </article>
  );
}
