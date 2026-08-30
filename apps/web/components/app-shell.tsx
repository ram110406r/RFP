"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Brain,
  Building2,
  ChevronsLeft,
  ChevronsRight,
  FilePenLine,
  GitBranch,
  LayoutGrid,
  Menu,
  PanelsTopLeft,
  Search,
  Settings,
  User,
  X,
} from "lucide-react";

import { useFirebaseSession } from "./firebase-auth-gate";

type Breadcrumb = {
  label: string;
  href?: string;
};

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  section: "main" | "system";
  exact?: boolean;
  matches?: string[];
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

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "MAIN",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutGrid, section: "main", exact: true },
      { href: "/tenders", label: "Tender Search", icon: Search, section: "main", exact: true },
      {
        href: "/tenders/new",
        label: "Apply",
        icon: FilePenLine,
        section: "main",
        matches: ["/tenders/new", "/tenders/import"],
      },
      { href: "/submissions", label: "Pipeline", icon: GitBranch, section: "main", exact: true },
      { href: "/knowledge", label: "Knowledge Brain", icon: Brain, section: "main", exact: true },
      { href: "/organization", label: "Organization", icon: Building2, section: "main", exact: true },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { href: "/settings", label: "Settings", icon: Settings, section: "system", exact: true },
      { href: "/profile", label: "Profile", icon: User, section: "system", exact: true },
      { href: "/workspace", label: "Workspace", icon: PanelsTopLeft, section: "system", exact: true },
    ],
  },
];

function SidebarSearch({ shortcut = "⌘ S" }: { shortcut?: string }) {
  return (
    <label className="flex h-11 items-center gap-3 rounded-[10px] border border-[#E5E7EB] bg-white px-3 text-slate-500">
      <Search className="h-[18px] w-[18px] shrink-0 text-slate-400" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate text-sm text-slate-500">Search</span>
      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500">
        {shortcut}
      </span>
    </label>
  );
}

function NavLink({
  item,
  collapsed,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  const active = isPathActive(pathname, item);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      title={collapsed ? item.label : undefined}
      onClick={onNavigate}
      className={[
        "grid h-11 items-center rounded-[10px] px-3 text-[15px] font-medium transition",
        collapsed ? "grid-cols-[20px] justify-items-center px-0" : "grid-cols-[20px_minmax(0,1fr)] gap-3",
        active ? "bg-[#EFF5FF] text-[#0F172A]" : "text-slate-700 hover:bg-slate-50 hover:text-slate-950",
      ].join(" ")}
    >
      <span className={["flex h-5 w-5 items-center justify-center", active ? "text-[#155EEF]" : "text-slate-500"].join(" ")}>
        <Icon size={18} strokeWidth={1.75} />
      </span>
      {!collapsed ? <span className="truncate">{item.label}</span> : null}
    </Link>
  );
}

function SidebarSection({
  label,
  items,
  collapsed,
  pathname,
  onNavigate,
}: {
  label: string;
  items: NavItem[];
  collapsed: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <section className="space-y-2">
      {!collapsed ? <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p> : null}
      <nav className="space-y-1">
        {items.map((item) => (
          <NavLink key={item.href} item={item} collapsed={collapsed} pathname={pathname} onNavigate={onNavigate} />
        ))}
      </nav>
    </section>
  );
}

function BrandMark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#155EEF] text-[13px] font-semibold text-white">
        T
      </div>
      {!collapsed ? <span className="text-[18px] font-semibold tracking-[-0.02em] text-slate-950">TENDYY</span> : null}
    </div>
  );
}

function SidebarFooter({
  collapsed,
  displayLabel,
  subtitle,
  initials,
}: {
  collapsed: boolean;
  displayLabel: string;
  subtitle: string;
  initials: string;
}) {
  return (
    <Link
      href="/profile"
      aria-label="Open profile"
      className={[
        "flex items-center rounded-[12px] border border-slate-200 bg-white transition hover:bg-slate-50",
        collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-3",
      ].join(" ")}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#EFF5FF] text-xs font-semibold text-[#155EEF]">
        {initials}
      </div>
      {!collapsed ? (
        <>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-950">{displayLabel}</p>
            <p className="truncate text-xs text-slate-500">{subtitle}</p>
          </div>
          <span className="text-slate-400">
            <ChevronsRight className="h-4 w-4" strokeWidth={1.75} />
          </span>
        </>
      ) : null}
    </Link>
  );
}

function ShellHeader({
  breadcrumbs,
  pageTitle,
  initials,
  isMobile,
  onMobileMenuOpen,
}: {
  breadcrumbs: Breadcrumb[];
  pageTitle: string;
  initials: string;
  isMobile: boolean;
  onMobileMenuOpen: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-[#E8ECF2] bg-white">
      <div className="flex h-[72px] items-center gap-4 px-4 sm:px-6 lg:px-8">
        {isMobile ? (
          <>
            <button
              type="button"
              onClick={onMobileMenuOpen}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-slate-200 bg-white text-slate-700"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" strokeWidth={1.75} />
            </button>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-950">{pageTitle}</p>
              <p className="truncate text-xs text-slate-500">Application shell</p>
            </div>

            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-slate-200 bg-white text-slate-700"
              aria-label="Profile"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#EFF5FF] text-xs font-semibold text-[#155EEF]">
                {initials}
              </div>
            </button>
          </>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-slate-500">
                {breadcrumbs.map((crumb, index) => (
                  <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-2">
                    {crumb.href ? (
                      <Link href={crumb.href} className="truncate transition hover:text-slate-950">
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className={index === breadcrumbs.length - 1 ? "truncate font-medium text-slate-950" : "truncate"}>{crumb.label}</span>
                    )}
                    {index < breadcrumbs.length - 1 ? <span className="text-slate-300">/</span> : null}
                  </span>
                ))}
              </div>
            </div>

            <label className="hidden h-11 w-[min(34vw,360px)] items-center gap-3 rounded-[10px] border border-[#E5E7EB] bg-white px-4 text-slate-500 md:flex">
              <Search className="h-[18px] w-[18px] shrink-0 text-slate-400" strokeWidth={1.75} />
              <span className="text-sm text-slate-500">Search</span>
              <span className="ml-auto inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                <span>⌘</span>
                <span>K</span>
              </span>
            </label>

            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-slate-200 bg-white text-slate-700"
              aria-label="Profile"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#EFF5FF] text-xs font-semibold text-[#155EEF]">
                {initials}
              </div>
            </button>
          </>
        )}
      </div>
    </header>
  );
}

function MobileDrawer({
  open,
  pathname,
  initials,
  displayLabel,
  subtitle,
  collapsed,
  onClose,
}: {
  open: boolean;
  pathname: string;
  initials: string;
  displayLabel: string;
  subtitle: string;
  collapsed: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/30 md:hidden" onClick={onClose}>
      <aside
        className="flex h-full w-[280px] flex-col border-r border-slate-200 bg-white p-3"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-[72px] items-center justify-between px-1">
          <BrandMark />
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-slate-200 bg-white text-slate-700"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>

        <div className="mt-5">
          <SidebarSearch shortcut="⌘ S" />
        </div>

        <div className="mt-6 flex-1 space-y-6 overflow-y-auto pr-1">
          {navGroups.map((group) => (
            <SidebarSection key={group.label} label={group.label} items={group.items} collapsed={collapsed} pathname={pathname} onNavigate={onClose} />
          ))}
        </div>

        <div className="mt-4">
          <SidebarFooter collapsed={false} displayLabel={displayLabel} subtitle={subtitle} initials={initials} />
        </div>
      </aside>
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

    setSidebarCollapsed(viewport !== "desktop");
    setMobileNavOpen(false);
  }, [viewport]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const accountEmail = session?.profile?.email ?? session?.user?.email ?? null;
  const displayLabel = maskEmail(accountEmail);
  const subtitle = session?.profile?.role ?? "Account";
  const initials = initialsFromName(session?.profile?.displayName ?? session?.user?.displayName ?? accountEmail ?? "RA");
  const pageTitle = breadcrumbs[breadcrumbs.length - 1]?.label ?? "Dashboard";
  const isMobile = viewport === "mobile";
  const collapsed = !isMobile && sidebarCollapsed;
  const sidebarWidth = collapsed ? 72 : 248;
  const contentStyle = isMobile ? undefined : { marginLeft: sidebarWidth };

  return (
    <div className="min-h-screen bg-white text-slate-950">
      {!isMobile ? (
        <aside
          className="fixed inset-y-0 left-0 z-30 hidden border-r border-slate-200 bg-white md:flex"
          style={{ width: sidebarWidth }}
        >
          <div className="relative flex h-full w-full flex-col px-3 pb-3 pt-4">
            <button
              type="button"
              onClick={() => setSidebarCollapsed((current) => !current)}
              className="absolute -right-3 top-[22px] inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:text-slate-950"
              aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            >
              {collapsed ? <ChevronsRight className="h-4 w-4" strokeWidth={1.75} /> : <ChevronsLeft className="h-4 w-4" strokeWidth={1.75} />}
            </button>

            <div className="flex h-[72px] items-center px-1">
              <BrandMark collapsed={collapsed} />
            </div>

            {!collapsed ? (
              <div className="mt-5">
                <SidebarSearch shortcut="⌘ S" />
              </div>
            ) : null}

            <div className="mt-6 flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
              <div className="space-y-6">
                {navGroups.map((group, index) => (
                  <section key={group.label}>
                    {index > 0 && !collapsed ? <div className="mb-6 border-t border-slate-200 pt-6" /> : null}
                    <SidebarSection label={group.label} items={group.items} collapsed={collapsed} pathname={pathname} />
                  </section>
                ))}
              </div>

              <div className="mt-auto pt-6">
                <SidebarFooter collapsed={collapsed} displayLabel={displayLabel} subtitle={subtitle} initials={initials} />
              </div>
            </div>
          </div>
        </aside>
      ) : null}

      <MobileDrawer
        open={mobileNavOpen}
        pathname={pathname}
        initials={initials}
        displayLabel={displayLabel}
        subtitle={subtitle}
        collapsed={false}
        onClose={() => setMobileNavOpen(false)}
      />

      <div className="min-w-0" style={contentStyle}>
        <ShellHeader
          breadcrumbs={breadcrumbs}
          pageTitle={pageTitle}
          initials={initials}
          isMobile={isMobile}
          onMobileMenuOpen={() => setMobileNavOpen(true)}
        />

        <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">
          <div className="w-full min-w-0">{children}</div>
        </main>
      </div>
    </div>
  );
}
