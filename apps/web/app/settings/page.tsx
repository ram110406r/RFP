import Link from "next/link";

import { AppShell } from "../../components/app-shell";

export default function SettingsPage() {
  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Settings" }]}>
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Settings</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">Workspace settings</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
          This shell route exists so the sidebar stays complete while the underlying settings workflow is still being built.
        </p>
        <Link href="/" className="mt-6 inline-flex items-center justify-center rounded-2xl bg-sky-700 px-5 py-3 text-sm font-semibold text-white">
          Back to dashboard
        </Link>
      </div>
    </AppShell>
  );
}
