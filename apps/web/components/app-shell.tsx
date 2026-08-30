"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { useFirebaseSession } from "./firebase-auth-gate";

type Breadcrumb = {
  label: string;
  href?: string;
};

type NavSubItem = {
  label: string;
  href: string;
};

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  section: "main" | "system";
  exact?: boolean;
  matches?: string[];
  submenu?: NavSubItem[];
};

type Viewport = "mobile" | "tablet" | "desktop";

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

function isPathActive(pathname: string, item: NavItem) {
  if (item.matches?.some((match) => pathname === match || pathname.startsWith(`${match}/`) || pathname.startsWith(`${match}?`))) {
    return true;
  }

  if (item.exact) {
    return pathname === item.href;
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`) || pathname.startsWith(`${item.href}?`);
}

function BrandMark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#5b21b6_0%,#7c3aed_54%,#4f46e5_100%)] text-[18px] font-semibold text-white shadow-[0_10px_24px_rgba(91,33,182,0.24)]">
        T
      </div>
      {!collapsed ? <span className="text-[22px] font-semibold tracking-tight text-slate-950">TENDYY</span> : null}
    </div>
  );
}

function DashboardIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 4h6v6H4z" />
      <path d="M14 4h6v8h-6z" />
      <path d="M4 14h6v6H4z" />
      <path d="M14 16h6v4h-6z" />
    </svg>
  );
}

function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function ClipboardIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 4h6a2 2 0 0 1 2 2v1H7V6a2 2 0 0 1 2-2Z" />
      <path d="M7 7h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
      <path d="M9 12h6M9 16h6" />
    </svg>
  );
}

function PipelineIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 6h6" />
      <path d="M5 12h14" />
      <path d="M5 18h9" />
      <circle cx="16.5" cy="6" r="1.5" />
      <circle cx="12.5" cy="12" r="1.5" />
      <circle cx="18.5" cy="18" r="1.5" />
    </svg>
  );
}

function BrainIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M8.5 5a3.5 3.5 0 0 1 3.4 2.7 3.5 3.5 0 0 1 6.1 2.3 3.5 3.5 0 0 1-1.5 2.8A3.5 3.5 0 0 1 15 20h-3" />
      <path d="M8 20H7a3 3 0 0 1-2-5.2A3.5 3.5 0 0 1 8.5 7H9" />
      <path d="M12 5v14" />
      <path d="M10 9h4M10 13h4" />
    </svg>
  );
}

function BuildingIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 20h16" />
      <path d="M6 20V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v14" />
      <path d="M9 8h2M13 8h2M9 12h2M13 12h2M9 16h2M13 16h2" />
    </svg>
  );
}

function SettingsIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M10.2 4.5a2 2 0 0 1 3.6 0l.3.8a2 2 0 0 0 1.9 1.3h.8a2 2 0 0 1 1.4 3.4l-.5.5a2 2 0 0 0 0 2.8l.5.5a2 2 0 0 1-1.4 3.4H16a2 2 0 0 0-1.9 1.3l-.3.8a2 2 0 0 1-3.6 0l-.3-.8A2 2 0 0 0 8 19.6h-.8a2 2 0 0 1-1.4-3.4l.5-.5a2 2 0 0 0 0-2.8l-.5-.5a2 2 0 0 1 1.4-3.4H8a2 2 0 0 0 1.9-1.3l.3-.8Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function UserIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="8" r="4" />
    </svg>
  );
}

function WorkspaceIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7a2 2 0 0 1 2-2h4v6H4z" />
      <path d="M14 5h4a2 2 0 0 1 2 2v4h-6z" />
      <path d="M4 17v-4h6v6H6a2 2 0 0 1-2-2Z" />
      <path d="M14 13h6v4a2 2 0 0 1-2 2h-4z" />
    </svg>
  );
}

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "MAIN",
    items: [
      { href: "/", label: "Dashboard", icon: <DashboardIcon className="h-5 w-5" />, section: "main", exact: true },
      { href: "/tenders", label: "Tender Search", icon: <SearchIcon className="h-5 w-5" />, section: "main", exact: true },
      {
        href: "/tenders/new",
        label: "Apply",
        icon: <ClipboardIcon className="h-5 w-5" />,
        section: "main",
        matches: ["/tenders/new", "/tenders/import"],
        submenu: [
          { label: "Overview", href: "/tenders/new" },
          { label: "Active Tenders", href: "/tenders" },
          { label: "Requirements", href: "/tenders?view=requirements" },
          { label: "Responses", href: "/reviews" },
          { label: "Reviews", href: "/reviews" },
          { label: "Submissions", href: "/submissions" },
        ],
      },
      { href: "/submissions", label: "Pipeline", icon: <PipelineIcon className="h-5 w-5" />, section: "main", exact: true },
      { href: "/knowledge", label: "Knowledge Brain", icon: <BrainIcon className="h-5 w-5" />, section: "main", exact: true },
      { href: "/organization", label: "Organization", icon: <BuildingIcon className="h-5 w-5" />, section: "main", exact: true },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { href: "/settings", label: "Settings", icon: <SettingsIcon className="h-5 w-5" />, section: "system", exact: true },
      { href: "/profile", label: "Profile", icon: <UserIcon className="h-5 w-5" />, section: "system", exact: true },
      { href: "/workspace", label: "Workspace", icon: <WorkspaceIcon className="h-5 w-5" />, section: "system", exact: true },
    ],
  },
];

function NavLink({
  item,
  collapsed,
  pathname,
  onNavigate,
  onHoverSubmenu,
  activeSubmenu,
}: {
  item: NavItem;
  collapsed: boolean;
  pathname: string;
  onNavigate?: () => void;
  onHoverSubmenu?: (key: string | null) => void;
  activeSubmenu: string | null;
}) {
  const active = isPathActive(pathname, item);
  const hasSubmenu = collapsed && item.submenu && item.submenu.length > 0;
  const open = hasSubmenu && activeSubmenu === item.href;

  const baseItemClass = collapsed
    ? "group relative flex h-11 w-11 items-center justify-center rounded-2xl transition"
    : "group relative flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-[15px] font-medium transition";

  const activeClass = collapsed
    ? "bg-[rgba(124,58,237,0.12)] text-[#5b21b6] shadow-[inset_0_0_0_1px_rgba(124,58,237,0.14)]"
    : "bg-[rgba(124,58,237,0.10)] text-[#5b21b6] shadow-[inset_0_0_0_1px_rgba(124,58,237,0.14)]";

  const idleClass = collapsed
    ? "text-slate-500 hover:bg-slate-50 hover:text-slate-950"
    : "text-slate-700 hover:bg-slate-50 hover:text-slate-950";

  const content = (
    <>
      <span className={["shrink-0 transition", active ? "text-[#5b21b6]" : "text-slate-500 group-hover:text-slate-950"].join(" ")}>{item.icon}</span>
      {!collapsed ? <span className="truncate">{item.label}</span> : null}
      {!collapsed && hasSubmenu ? (
        <span className="ml-auto text-slate-400 transition group-hover:text-slate-600">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </span>
      ) : null}
    </>
  );

  return (
    <div
      className="relative"
      onMouseEnter={() => {
        if (hasSubmenu) onHoverSubmenu?.(item.href);
      }}
      onMouseLeave={() => {
        if (hasSubmenu) onHoverSubmenu?.(null);
      }}
    >
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        aria-label={collapsed ? item.label : undefined}
        title={collapsed ? item.label : undefined}
        onClick={onNavigate}
        className={[baseItemClass, active ? activeClass : idleClass].join(" ")}
      >
        {content}
      </Link>

      {open ? (
        <div className="absolute left-full top-1/2 z-30 ml-3 w-60 -translate-y-1/2">
          <div className="rounded-[18px] border border-slate-200 bg-white p-2 shadow-[0_18px_50px_rgba(15,23,42,0.12)]">
            {item.submenu?.map((subItem) => {
              const subActive = pathname === subItem.href || pathname.startsWith(`${subItem.href}/`);
              return (
                <Link
                  key={subItem.href}
                  href={subItem.href}
                  onClick={onNavigate}
                  className={[
                    "flex items-center justify-between rounded-[12px] px-3 py-2.5 text-sm transition",
                    subActive ? "bg-[rgba(124,58,237,0.10)] text-[#5b21b6]" : "text-slate-700 hover:bg-slate-50 hover:text-slate-950",
                  ].join(" ")}
                >
                  <span>{subItem.label}</span>
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell({
  breadcrumbs = [{ label: "Dashboard" }],
  children,
}: {
  breadcrumbs?: Breadcrumb[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const session = useFirebaseSession();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);

  useEffect(() => {
    const updateViewport = () => {
      const width = window.innerWidth;
      if (width < 768) {
        setViewport("mobile");
      } else if (width < 1280) {
        setViewport("tablet");
      } else {
        setViewport("desktop");
      }
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    if (viewport === "mobile") {
      setMobileNavOpen(false);
      return;
    }

    setSidebarCollapsed(viewport === "tablet");
    setMobileNavOpen(false);
  }, [viewport]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const accountEmail = session?.profile?.email ?? session?.user?.email ?? null;
  const displayLabel = maskEmail(accountEmail);
  const subtitle = session?.profile?.role ?? "Account";
  const workspaceName = session?.profile?.organizationName ?? "TENDYY";
  const initials = initialsFromName(session?.profile?.displayName ?? session?.user?.displayName ?? accountEmail ?? "RA");
  const isMobile = viewport === "mobile";
  const collapsed = isMobile ? false : sidebarCollapsed;

  const sidebarWidth = collapsed ? 72 : 256;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_42%,#eef2ff_100%)] text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-[2560px] gap-4 p-0 md:p-4 lg:p-6">
        {!isMobile ? (
          <aside
            className="sticky top-4 hidden h-[calc(100vh-2rem)] shrink-0 overflow-visible rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)] md:flex"
            style={{ width: sidebarWidth }}
          >
            <div className="relative flex h-full w-full flex-col px-3 py-4">
              <button
                type="button"
                onClick={() => setSidebarCollapsed((current) => !current)}
                className="absolute -right-3 top-6 inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-[0_10px_24px_rgba(15,23,42,0.10)] transition hover:text-slate-950"
                aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d={collapsed ? "m9 6 6 6-6 6" : "m15 6-6 6 6 6"} />
                </svg>
              </button>

              <div className="px-1 pb-4">
                <BrandMark collapsed={collapsed} />
              </div>

              <div className="px-1 pb-4">
                {collapsed ? (
                  <button
                    type="button"
                    className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm"
                    aria-label="Search workspace"
                  >
                    <SearchIcon className="h-5 w-5" />
                  </button>
                ) : (
                  <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-500 shadow-sm">
                    <SearchIcon className="h-5 w-5 shrink-0" />
                    <span className="min-w-0 flex-1 text-sm text-slate-500">Search</span>
                    <span className="flex items-center gap-2 text-[11px] text-slate-400">
                      <kbd className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5">⌘</kbd>
                      <kbd className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5">S</kbd>
                    </span>
                  </label>
                )}
              </div>

              <div className="flex-1 space-y-5">
                {navGroups.map((group) => (
                  <section key={group.label} className="space-y-3">
                    {!collapsed ? <p className="px-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{group.label}</p> : null}
                    <nav className={collapsed ? "space-y-1" : "space-y-1"}>
                      {group.items.map((item) => (
                        <NavLink
                          key={item.href}
                          item={item}
                          collapsed={collapsed}
                          pathname={pathname}
                          onHoverSubmenu={setActiveSubmenu}
                          activeSubmenu={activeSubmenu}
                        />
                      ))}
                    </nav>
                    {!collapsed && group.label === "MAIN" ? <div className="mx-1 border-t border-slate-200" /> : null}
                  </section>
                ))}
              </div>

              <div className="px-1 pt-4">
                <Link
                  href="/profile"
                  className={[
                    "flex items-center rounded-[18px] border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:bg-slate-50",
                    collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-3",
                  ].join(" ")}
                  aria-label="Open profile"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#dbeafe_0%,#c4b5fd_50%,#7c3aed_100%)] text-sm font-semibold text-slate-950">
                    {collapsed ? initials : initials}
                  </div>
                  {!collapsed ? (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-950">{displayLabel}</p>
                        <p className="truncate text-xs text-slate-500">{subtitle}</p>
                      </div>
                      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="m9 6 6 6-6 6" />
                      </svg>
                    </>
                  ) : null}
                </Link>
              </div>
            </div>
          </aside>
        ) : null}

        <div className="min-w-0 flex-1">
          {isMobile ? (
            <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
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
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold tracking-tight text-slate-950">{workspaceName}</p>
                    <p className="truncate text-xs text-slate-500">Navigation</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm"
                  aria-label="Profile"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[linear-gradient(135deg,#dbeafe_0%,#c4b5fd_50%,#7c3aed_100%)] text-xs font-semibold text-slate-950">
                    {initials}
                  </div>
                </button>
              </div>
            </header>
          ) : null}

          {mobileNavOpen && isMobile ? (
            <div className="fixed inset-0 z-40 bg-slate-950/35 md:hidden" onClick={() => setMobileNavOpen(false)}>
              <div
                className="absolute inset-y-0 left-0 flex w-[86vw] max-w-[340px] flex-col border-r border-slate-200 bg-white p-4 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <BrandMark />
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

                <label className="mt-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-500">
                  <SearchIcon className="h-5 w-5 shrink-0" />
                  <span className="text-sm text-slate-500">Search</span>
                </label>

                <nav className="mt-6 flex-1 space-y-1">
                  {navGroups.flatMap((group) => group.items).map((item) => {
                    const active = isPathActive(pathname, item);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileNavOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={[
                          "flex items-center gap-3 rounded-[14px] px-3 py-3 text-[15px] font-medium transition",
                          active
                            ? "bg-[rgba(124,58,237,0.10)] text-[#5b21b6]"
                            : "text-slate-700 hover:bg-slate-50 hover:text-slate-950",
                        ].join(" ")}
                      >
                        <span className={active ? "text-[#5b21b6]" : "text-slate-500"}>{item.icon}</span>
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </nav>

                <div className="mt-4 rounded-[18px] border border-slate-200 bg-white p-3 shadow-sm">
                  <Link href="/profile" onClick={() => setMobileNavOpen(false)} className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[linear-gradient(135deg,#dbeafe_0%,#c4b5fd_50%,#7c3aed_100%)] text-sm font-semibold text-slate-950">
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-950">{displayLabel}</p>
                      <p className="truncate text-xs text-slate-500">{subtitle}</p>
                    </div>
                    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </Link>
                </div>
              </div>
            </div>
          ) : null}

          <header className="sticky top-0 z-20 hidden border-b border-slate-200 bg-white/85 backdrop-blur-xl lg:block">
            <div className="mx-auto flex min-h-[72px] w-full max-w-[1600px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
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
                    {index < breadcrumbs.length - 1 ? <span className="text-slate-300">/</span> : null}
                  </span>
                ))}
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <label className="hidden w-[min(34vw,360px)] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-slate-500 shadow-sm lg:flex">
                  <SearchIcon className="h-5 w-5 shrink-0" />
                  <span className="text-sm">Search</span>
                  <span className="ml-auto flex items-center gap-2 text-[11px] text-slate-400">
                    <kbd className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5">⌘</kbd>
                    <kbd className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5">K</kbd>
                  </span>
                </label>

                <button
                  type="button"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm"
                  aria-label="Profile"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[linear-gradient(135deg,#dbeafe_0%,#c4b5fd_50%,#7c3aed_100%)] text-xs font-semibold text-slate-950">
                    {initials}
                  </div>
                </button>
              </div>
            </div>
          </header>

          <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-[1600px] min-w-0">{children}</div>
          </main>
        </div>
      </div>

    </div>
  );
}
