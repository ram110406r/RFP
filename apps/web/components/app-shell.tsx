"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useFirebaseSession } from "./firebase-auth-gate";

type Breadcrumb = {
  label: string;
  href?: string;
};

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

function maskEmail(email: string | null) {
  if (!email) return "signed in";
  const [local = "", domain] = email.split("@");
  if (!domain || local.length < 3) return email;
  return `${local.slice(0, 2)}***@${domain}`;
}

function initialsFromName(value: string) {
  const parts = value.split(/\s+/).filter(Boolean);
  const [first = "RA", second = ""] = parts;
  if (parts.length === 0) return "RA";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
}

const navItems: NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="3" width="7" height="7" rx="1.6" />
        <rect x="14" y="3" width="7" height="7" rx="1.6" />
        <rect x="3" y="14" width="7" height="7" rx="1.6" />
        <rect x="14" y="14" width="7" height="7" rx="1.6" />
      </svg>
    ),
  },
  {
    href: "/tenders",
    label: "RFPs",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M6 4h8l4 4v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
        <path d="M14 4v4h4" />
        <path d="M8 13h8M8 17h8" />
      </svg>
    ),
  },
  {
    href: "/reviews",
    label: "Reviews",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M7 4h10a2 2 0 0 1 2 2v13l-4-2-4 2-4-2-4 2V6a2 2 0 0 1 2-2Z" />
        <path d="M9 10h6M9 14h4" />
      </svg>
    ),
  },
  {
    href: "/submissions",
    label: "Submissions",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="m4 12 16-8-5 16-3-6-8-2Z" />
        <path d="m11 14 5 4" />
      </svg>
    ),
  },
  {
    href: "/knowledge",
    label: "Knowledge",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H20v15a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 0 4 22V6.5Z" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </svg>
    ),
  },
  {
    href: "/analytics",
    label: "Analytics",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M5 19V5" />
        <path d="M5 19h14" />
        <path d="M9 15v-4" />
        <path d="M13 15V8" />
        <path d="M17 15v-6" />
      </svg>
    ),
  },
];

export function AppShell({
  breadcrumbs = [{ label: "Dashboard" }],
  children,
}: {
  breadcrumbs?: Breadcrumb[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const session = useFirebaseSession();

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const accountEmail = session?.profile?.email ?? session?.user?.email ?? null;
  const displayLabel = maskEmail(accountEmail);
  const subtitle = session?.profile?.role ?? "Signed in";
  const workspaceName = session?.profile?.organizationName ?? "Workspace";
  const initials = initialsFromName(session?.profile?.displayName ?? session?.user?.displayName ?? accountEmail ?? "RA");

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_46%,#eef2f7_100%)] text-slate-900">
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-screen border-r border-slate-200 bg-white/95 backdrop-blur-xl lg:flex lg:flex-col">
          <div className="flex items-center gap-3 px-5 py-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#60a5fa,#2563eb)] text-lg font-semibold text-white shadow-sm">
              T
            </div>
            <div>
              <p className="text-lg font-semibold tracking-tight text-slate-950">TENDYY</p>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">RFP operating system</p>
            </div>
          </div>

          <div className="px-3 pb-3">
            <div className="flex items-center justify-between rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-sm font-semibold text-white">
                  AC
                </div>
                <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">{workspaceName}</p>
                  <p className="truncate text-xs text-slate-500">Current workspace</p>
                </div>
              </div>
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-slate-500" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
          </div>

          <nav className="flex-1 space-y-1 px-3">
            {navItems.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "flex items-center gap-3 rounded-2xl px-4 py-3 text-[15px] font-medium transition",
                    active
                      ? "border border-blue-200 bg-blue-50 text-blue-700 shadow-sm"
                      : "text-slate-700 hover:bg-slate-50 hover:text-slate-950",
                  ].join(" ")}
                >
                  <span className={active ? "text-blue-600" : "text-slate-500"}>{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-slate-200 px-4 py-4">
            <Link
              href="/settings"
              className="flex items-center gap-3 rounded-2xl px-4 py-3 text-[15px] font-medium text-slate-700 hover:bg-slate-50"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M10.2 4.5a2 2 0 0 1 3.6 0l.3.8a2 2 0 0 0 1.9 1.3h.8a2 2 0 0 1 1.4 3.4l-.5.5a2 2 0 0 0 0 2.8l.5.5a2 2 0 0 1-1.4 3.4H16a2 2 0 0 0-1.9 1.3l-.3.8a2 2 0 0 1-3.6 0l-.3-.8A2 2 0 0 0 8 19.6h-.8a2 2 0 0 1-1.4-3.4l.5-.5a2 2 0 0 0 0-2.8l-.5-.5a2 2 0 0 1 1.4-3.4H8a2 2 0 0 0 1.9-1.3l.3-.8Z" />
                <circle cx="12" cy="12" r="2.5" />
              </svg>
              Settings
            </Link>
            <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{displayLabel}</p>
                  <p className="text-xs text-slate-500">{subtitle}</p>
                </div>
              </div>
              <button
                type="button"
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                onClick={() => void session?.signOut()}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M10 17H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4" />
                  <path d="M13 7l4 5-4 5" />
                  <path d="M17 12H8" />
                </svg>
                Sign out
              </button>
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <div className="border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur-xl lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(true)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm"
                  aria-label="Open navigation"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                </button>
                <div>
                  <p className="text-base font-semibold tracking-tight text-slate-950">Tendyy</p>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">RFP operating system</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="relative flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm"
                  aria-label="Notifications"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
                    <path d="M9.5 19a2.5 2.5 0 0 0 5 0" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {mobileNavOpen ? (
            <div className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" onClick={() => setMobileNavOpen(false)}>
              <div
                className="absolute inset-y-0 left-0 w-[82%] max-w-[320px] overflow-y-auto border-r border-slate-200 bg-white p-4 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#60a5fa,#2563eb)] text-lg font-semibold text-white">
                      T
                    </div>
                    <div>
                      <p className="text-lg font-semibold tracking-tight text-slate-950">Tendyy</p>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">RFP operating system</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileNavOpen(false)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700"
                    aria-label="Close navigation"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                  </button>
                </div>

                <nav className="mt-6 space-y-1">
                  {navItems.map((item) => {
                    const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileNavOpen(false)}
                        className={[
                          "flex items-center gap-3 rounded-2xl px-4 py-3 text-[15px] font-medium transition",
                          active
                            ? "border border-blue-200 bg-blue-50 text-blue-700 shadow-sm"
                            : "text-slate-700 hover:bg-slate-50 hover:text-slate-950",
                        ].join(" ")}
                      >
                        <span className={active ? "text-blue-600" : "text-slate-500"}>{item.icon}</span>
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>

                <div className="mt-6 border-t border-slate-200 pt-4">
                  <Link
                    href="/settings"
                    onClick={() => setMobileNavOpen(false)}
                    className="flex items-center gap-3 rounded-2xl px-4 py-3 text-[15px] font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M10.2 4.5a2 2 0 0 1 3.6 0l.3.8a2 2 0 0 0 1.9 1.3h.8a2 2 0 0 1 1.4 3.4l-.5.5a2 2 0 0 0 0 2.8l.5.5a2 2 0 0 1-1.4 3.4H16a2 2 0 0 0-1.9 1.3l-.3.8a2 2 0 0 1-3.6 0l-.3-.8A2 2 0 0 0 8 19.6h-.8a2 2 0 0 1-1.4-3.4l.5-.5a2 2 0 0 0 0-2.8l-.5-.5a2 2 0 0 1 1.4-3.4H8a2 2 0 0 0 1.9-1.3l.3-.8Z" />
                      <circle cx="12" cy="12" r="2.5" />
                    </svg>
                    Settings
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileNavOpen(false);
                      void session?.signOut();
                    }}
                    className="mt-2 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-[15px] font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M10 17H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4" />
                      <path d="M13 7l4 5-4 5" />
                      <path d="M17 12H8" />
                    </svg>
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <header className="sticky top-0 z-20 hidden border-b border-slate-200 bg-white/90 backdrop-blur-xl lg:block">
            <div className="mx-auto flex min-h-[72px] w-full max-w-[1440px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
              <div className="flex min-w-0 flex-1 items-center gap-2 text-sm text-slate-500">
                {breadcrumbs.map((crumb, index) => (
                  <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-2">
                    {crumb.href ? (
                      <Link href={crumb.href} className="truncate transition hover:text-slate-900">
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className={index === breadcrumbs.length - 1 ? "truncate font-medium text-slate-900" : "truncate"}>{crumb.label}</span>
                    )}
                    {index < breadcrumbs.length - 1 ? <span className="text-slate-300">&gt;</span> : null}
                  </span>
                ))}
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <label className="hidden w-[min(34vw,360px)] items-center gap-2 rounded-2xl border border-[rgba(15,23,42,0.09)] bg-white/90 px-4 py-2 text-slate-500 shadow-sm lg:flex">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                  <span className="text-sm">Search workspace</span>
                  <kbd className="rounded-md border border-[rgba(15,23,42,0.09)] bg-slate-50 px-2 py-0.5 text-xs text-slate-500">Ctrl+K</kbd>
                </label>
                <div className="hidden items-center gap-2 xl:flex">
                  <Link
                    href="/tenders/new"
                    className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                  >
                    Add Tender
                  </Link>
                  <Link
                    href="/tenders/import"
                    className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
                  >
                    Import Tender
                  </Link>
                </div>
                <button
                  type="button"
                  className="relative flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
                    <path d="M9.5 19a2.5 2.5 0 0 0 5 0" />
                  </svg>
                </button>
              </div>
            </div>
          </header>

          <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-[1440px] min-w-0">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
