import Link from "next/link";

import { AppShell } from "../../components/app-shell";

export default function SettingsPage() {
  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Settings" }]}>
      <div className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-700">Settings</p>
        <h1 className="mt-2 text-[29px] font-semibold tracking-tight text-slate-950">Workspace settings</h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-600">
          This shell route exists so the sidebar stays complete while the underlying settings workflow is still being built.
        </p>
        <Link href="/" className="mt-4 inline-flex h-9 items-center justify-center rounded-[8px] bg-sky-700 px-4 text-[13px] font-semibold text-white">
          Back to dashboard
        </Link>
      </div>
    </AppShell>
  );
}
