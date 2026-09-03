"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Brain,
  Building2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FilePenLine,
  FileText,
  GitBranch,
  Home,
  LayoutGrid,
  Menu,
  MessageSquare,
  PanelsTopLeft,
  Search,
  Send,
  Settings,
  Star,
  User,
  X,
} from "lucide-react";

import { useAppShellState } from "./app-shell-state-provider";
import { useFirebaseSession } from "./firebase-auth-gate";
import { useWorkspaces } from "../lib/queries";
import { selectWorkspace, useSelectedWorkspaceId } from "../lib/workspace-selection";

type Breadcrumb = {
  label: string;
  href?: string;
};

type NavSubItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  section: "main" | "system";
  exact?: boolean;
  matches?: string[];
  submenu?: NavSubItem[];
};

type Viewport = "mobile" | "tablet" | "desktop";

const SIDEBAR_WIDTH_EXPANDED = 216;
const SIDEBAR_WIDTH_COLLAPSED = 68;

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
  if (
    item.matches?.some(
      (match) => pathname === match || pathname.startsWith(`${match}/`) || pathname.startsWith(`${match}?`),
    )
  ) {
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
        href: "/apply",
        label: "Apply",
        icon: FilePenLine,
        section: "main",
        matches: ["/tenders/new", "/tenders/import"],
        submenu: [
          { href: "/apply", label: "Overview", icon: Home },
          { href: "/tenders", label: "Active Tenders", icon: FileText },
          { href: "/tenders/new?view=requirements", label: "Requirements", icon: ClipboardList },
          { href: "/reviews", label: "Responses", icon: MessageSquare },
          { href: "/reviews", label: "Reviews", icon: Star },
          { href: "/submissions", label: "Submissions", icon: Send },
        ],
      },
      { href: "/pipeline", label: "Pipeline", icon: GitBranch, section: "main", exact: true },
      { href: "/knowledge", label: "Knowledge Brain", icon: Brain, section: "main" },
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
    <label className="flex h-8 items-center gap-1.5 rounded-[8px] border border-[#E5E7EB] bg-white px-2.5 text-slate-500">
      <Search className="h-[15px] w-[15px] shrink-0 text-slate-400" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500">Search</span>
      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-medium text-slate-500">
        {shortcut}
      </span>
    </label>
  );
}

function NavLink({
  item,
  collapsed,
  pathname,
  activeFlyout,
  setActiveFlyout,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  pathname: string;
  activeFlyout: string | null;
  setActiveFlyout: (value: string | null) => void;
  onNavigate?: () => void;
}) {
  const active = isPathActive(pathname, item);
  const Icon = item.icon;
  const hasSubmenu = Boolean(item.submenu?.length);
  const flyoutOpen = collapsed && hasSubmenu && (activeFlyout === item.href || active);

  return (
    <div
      className="relative"
      onMouseEnter={() => {
        if (hasSubmenu && collapsed) setActiveFlyout(item.href);
      }}
      onMouseLeave={() => {
        if (hasSubmenu && collapsed && !active) setActiveFlyout(null);
      }}
    >
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        aria-label={collapsed ? item.label : undefined}
        title={collapsed ? item.label : undefined}
        onClick={onNavigate}
        className={[
          "grid h-8 items-center rounded-[8px] px-2 text-[11px] font-medium transition",
          collapsed ? "grid-cols-[18px] justify-items-center px-0" : "grid-cols-[18px_minmax(0,1fr)] gap-2.5",
          active || flyoutOpen ? "bg-[#EFF5FF] text-[#0F172A]" : "text-slate-700 hover:bg-slate-50 hover:text-slate-950",
        ].join(" ")}
      >
        <span
          className={[
            "flex h-[16px] w-[16px] shrink-0 items-center justify-center",
            active || flyoutOpen ? "text-[#155EEF]" : "text-slate-500",
          ].join(" ")}
        >
          <Icon size={15} strokeWidth={1.75} />
        </span>
        {!collapsed ? <span className="truncate">{item.label}</span> : null}
      </Link>

      {flyoutOpen ? (
        <div className="absolute left-full top-1/2 z-40 ml-3 w-64 -translate-y-1/2">
          <div className="rounded-[10px] border border-slate-200 bg-white p-2 shadow-[0_12px_32px_rgba(15,23,42,0.08)]">
            {item.submenu?.map((subItem) => {
              const subActive =
                pathname === subItem.href ||
                pathname.startsWith(`${subItem.href}/`) ||
                pathname.startsWith(`${subItem.href}?`);
              const SubIcon = subItem.icon;

              return (
                <Link
                  key={subItem.href}
                  href={subItem.href}
                  onClick={onNavigate}
                  className={[
                    "flex h-8 items-center gap-2.5 rounded-[8px] px-3 text-[11px] transition",
                    subActive ? "bg-[#EFF5FF] text-[#155EEF]" : "text-slate-700 hover:bg-slate-50 hover:text-slate-950",
                  ].join(" ")}
                >
                  <span className={subActive ? "text-[#155EEF]" : "text-slate-400"}>
                    <SubIcon className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  <span className="flex-1">{subItem.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SidebarSection({
  label,
  items,
  collapsed,
  pathname,
  activeFlyout,
  setActiveFlyout,
  onNavigate,
}: {
  label: string;
  items: NavItem[];
  collapsed: boolean;
  pathname: string;
  activeFlyout: string | null;
  setActiveFlyout: (value: string | null) => void;
  onNavigate?: () => void;
}) {
  return (
    <section className="space-y-1">
      {!collapsed ? <p className="px-1 text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p> : null}
      <nav className="space-y-0.5">
        {items.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            collapsed={collapsed}
            pathname={pathname}
            activeFlyout={activeFlyout}
            setActiveFlyout={setActiveFlyout}
            onNavigate={onNavigate}
          />
        ))}
      </nav>
    </section>
  );
}

function BrandMark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px] bg-[#155EEF] text-[10px] font-semibold text-white">
        T
      </div>
      {!collapsed ? <span className="text-[15px] font-semibold tracking-[-0.02em] text-slate-950">TENDYY</span> : null}
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
        "flex items-center rounded-[10px] border border-slate-200 bg-white transition hover:bg-slate-50",
        collapsed ? "justify-center px-0 py-1.5" : "gap-2.5 px-2.5 py-1.5",
      ].join(" ")}
    >
      <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px] bg-[#EFF5FF] text-[10px] font-semibold text-[#155EEF]">
        {initials}
      </div>
      {!collapsed ? (
        <>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-medium text-slate-950">{displayLabel}</p>
            <p className="truncate text-[9px] text-slate-500">{subtitle}</p>
          </div>
          <span className="text-slate-400">
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.75} />
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
  const workspacesQuery = useWorkspaces();
  const selectedWorkspaceId = useSelectedWorkspaceId();
  const workspaces = workspacesQuery.data?.items.filter((workspace) => workspace.status === "active") ?? [];

  useEffect(() => {
    if (workspaces.length > 0 && !workspaces.some((workspace) => workspace.id === selectedWorkspaceId)) {
      selectWorkspace(workspaces[0]!.id);
    }
  }, [selectedWorkspaceId, workspaces]);

  return (
    <header className="sticky top-0 z-20 border-b border-[#E8ECF2] bg-white">
      <div className="flex h-[60px] items-center gap-4 px-4 sm:px-5 lg:px-6">
        {isMobile ? (
          <>
            <button
              type="button"
              onClick={onMobileMenuOpen}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-slate-200 bg-white text-slate-700"
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" strokeWidth={1.75} />
            </button>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-slate-950">{pageTitle}</p>
              <p className="truncate text-[11px] text-slate-500">Application shell</p>
            </div>

            {workspaces.length > 0 ? (
              <label className="hidden items-center gap-2 text-[11px] font-medium text-slate-600 lg:flex">
                <span className="sr-only">Selected workspace</span>
                <select
                  value={selectedWorkspaceId ?? workspaces[0]!.id}
                  onChange={(event) => selectWorkspace(event.target.value)}
                  className="h-9 max-w-[190px] rounded-[8px] border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-700 outline-none focus:border-[#155EEF]"
                >
                  {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
                </select>
              </label>
            ) : null}

            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-slate-200 bg-white text-slate-700"
              aria-label="Profile"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#EFF5FF] text-[11px] font-semibold text-[#155EEF]">
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
                      <span className={index === breadcrumbs.length - 1 ? "truncate font-medium text-slate-950" : "truncate"}>
                        {crumb.label}
                      </span>
                    )}
                    {index < breadcrumbs.length - 1 ? <span className="text-slate-300">/</span> : null}
                  </span>
                ))}
              </div>
            </div>

            <label className="hidden h-[38px] w-[min(34vw,340px)] items-center gap-3 rounded-[8px] border border-[#E5E7EB] bg-white px-3.5 text-slate-500 md:flex xl:hidden">
              <Search className="h-[18px] w-[18px] shrink-0 text-slate-400" strokeWidth={1.75} />
              <span className="text-[13px] text-slate-500">Search</span>
              <span className="ml-auto inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                <span>⌘</span>
                <span>K</span>
              </span>
            </label>

            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-slate-200 bg-white text-slate-700"
              aria-label="Profile"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#EFF5FF] text-[11px] font-semibold text-[#155EEF]">
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
  onClose,
}: {
  open: boolean;
  pathname: string;
  initials: string;
  displayLabel: string;
  subtitle: string;
  onClose: () => void;
}) {
  return (
    <div
      className={`fixed inset-0 z-40 transition-opacity duration-300 ease-out md:hidden ${
        open ? "pointer-events-auto bg-slate-950/30 opacity-100" : "pointer-events-none bg-slate-950/0 opacity-0"
      }`}
      onClick={onClose}
      aria-hidden={!open}
    >
      <aside
        className={`flex h-full w-[280px] flex-col border-r border-slate-200 bg-white p-3 transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-12 items-center justify-between px-1">
          <BrandMark />
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-slate-200 bg-white text-slate-700"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="mt-3">
          <SidebarSearch />
        </div>

        <div className="mt-3 flex-1 space-y-3 overflow-hidden pr-1">
          {navGroups.map((group) => (
            <SidebarSection
              key={group.label}
              label={group.label}
              items={group.items}
              collapsed={false}
              pathname={pathname}
              activeFlyout={null}
              setActiveFlyout={() => undefined}
            />
          ))}
        </div>

        <div className="mt-3">
          <SidebarFooter collapsed={false} displayLabel={displayLabel} subtitle={subtitle} initials={initials} />
        </div>
      </aside>
    </div>
  );
}

export function AppShell({
  breadcrumbs = [{ label: "Dashboard" }],
  hideDesktopHeader = false,
  children,
}: {
  breadcrumbs?: Breadcrumb[];
  hideDesktopHeader?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const session = useFirebaseSession();
  const { mobileNavOpen, setMobileNavOpen, sidebarCollapsed, sidebarReady, setSidebarCollapsed } = useAppShellState();
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [activeFlyout, setActiveFlyout] = useState<string | null>(null);

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
      return;
    }

    if (viewport !== "desktop") {
      setSidebarCollapsed(true);
    }
  }, [viewport]);

  useEffect(() => {
    setActiveFlyout(null);
  }, [pathname]);

  const accountEmail = session?.profile?.email ?? session?.user?.email ?? null;
  const displayLabel = maskEmail(accountEmail);
  const subtitle = "Account";
  const initials = initialsFromName(session?.profile?.displayName ?? session?.user?.displayName ?? accountEmail ?? "RA");
  const pageTitle = breadcrumbs[breadcrumbs.length - 1]?.label ?? "Dashboard";
  const isMobile = viewport === "mobile";
  const collapsed = !isMobile && sidebarCollapsed;
  const sidebarWidth = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;
  const contentStyle = isMobile
    ? undefined
    : { marginLeft: sidebarReady ? sidebarWidth : SIDEBAR_WIDTH_COLLAPSED };

  return (
    <div className="min-h-screen bg-white text-slate-950">
      {!isMobile ? (
        <aside
          className={`fixed inset-y-0 left-0 z-30 hidden border-r border-slate-200 bg-white transition-[width] duration-300 ease-out md:flex ${
            sidebarReady ? "visible" : "invisible"
          }`}
          style={{ width: sidebarWidth }}
        >
          <div className="relative flex h-full w-full flex-col px-2 pb-2 pt-2.5">
            <button
              type="button"
              onClick={() => setSidebarCollapsed((current) => !current)}
              className="absolute -right-3 top-[18px] inline-flex h-[26px] w-[26px] items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:text-slate-950"
              aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            >
              {collapsed ? (
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.75} />
              ) : (
                <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
              )}
            </button>

            <div className="flex h-11 items-center px-1">
              <BrandMark collapsed={collapsed} />
            </div>

            {!collapsed ? (
              <div className="mt-2.5">
                <SidebarSearch />
              </div>
            ) : (
              <div className="mt-2.5 flex justify-center">
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-950"
                  aria-label="Search"
                >
                  <Search className="h-[15px] w-[15px]" strokeWidth={1.75} />
                </button>
              </div>
            )}

            <div className="mt-2.5 flex min-h-0 flex-1 flex-col overflow-hidden pr-1">
              <div className="space-y-2.5">
                {navGroups.map((group, index) => (
                  <section key={group.label}>
                    {index > 0 && !collapsed ? <div className="mb-2.5 border-t border-slate-200 pt-2.5" /> : null}
                    <SidebarSection
                      label={group.label}
                      items={group.items}
                      collapsed={collapsed}
                      pathname={pathname}
                      activeFlyout={activeFlyout}
                      setActiveFlyout={setActiveFlyout}
                    />
                  </section>
                ))}
              </div>

              <div className="mt-auto pt-2.5">
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
        onClose={() => setMobileNavOpen(false)}
      />

      <div className="min-w-0 transition-[margin] duration-300 ease-out" style={contentStyle}>
        {!hideDesktopHeader || isMobile ? (
          <ShellHeader
            breadcrumbs={breadcrumbs}
            pageTitle={pageTitle}
            initials={initials}
            isMobile={isMobile}
            onMobileMenuOpen={() => setMobileNavOpen(true)}
          />
        ) : null}

        <main className="min-w-0 px-4 py-5 sm:px-5 sm:py-6 lg:px-6 lg:py-6">
          <div className="min-w-0 w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
