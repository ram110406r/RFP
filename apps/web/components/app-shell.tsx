"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Brain,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  ClipboardList,
  FilePenLine,
  FileText,
  FolderOpen,
  GitBranch,
  LayoutGrid,
  Menu,
  MessageSquare,
  Search,
  Send,
  Settings,
  Star,
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

type NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
  matches?: string[];
  children?: NavigationItem[];
  badge?: string | number;
  permission?: string;
  parentActive?: boolean;
};

type NavigationGroup = {
  label: "WORK" | "KNOWLEDGE" | "ORGANIZATION";
  items: NavigationItem[];
};

type Viewport = "mobile" | "tablet" | "desktop";

const SIDEBAR_WIDTH_EXPANDED = 224;
const SIDEBAR_WIDTH_COLLAPSED = 64;

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

function matchesHref(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`) || pathname.startsWith(`${href}?`);
}

function isItemActive(pathname: string, item: NavigationItem): boolean {
  if (item.matches?.some((match) => matchesHref(pathname, match))) return true;
  if (matchesHref(pathname, item.href, item.exact)) return true;
  return item.children?.some((child) => child.parentActive !== false && isItemActive(pathname, child)) ?? false;
}

function isItemDirectlyActive(pathname: string, item: NavigationItem) {
  if (item.matches?.some((match) => matchesHref(pathname, match))) return true;
  return matchesHref(pathname, item.href, item.exact);
}

function isChildActive(pathname: string, item: NavigationItem) {
  return item.children?.some((child) => child.parentActive !== false && isItemActive(pathname, child)) ?? false;
}

function chevronClass(open: boolean) {
  return open ? "rotate-180" : "rotate-0";
}

const navigation: NavigationGroup[] = [
  {
    label: "WORK",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutGrid, exact: true },
      { href: "/tenders", label: "Tender Search", icon: Search, exact: true },
      {
        href: "/apply",
        label: "Apply",
        icon: FilePenLine,
        matches: ["/tenders/new", "/tenders/import", "/requirements", "/responses", "/reviews", "/submissions"],
        children: [
          { href: "/apply", label: "Overview", icon: FilePenLine, exact: true },
          { href: "/tenders", label: "Active Tenders", icon: FileText, parentActive: false },
          { href: "/requirements", label: "Requirements", icon: ClipboardList },
          { href: "/responses", label: "Responses", icon: MessageSquare },
          { href: "/reviews", label: "Reviews", icon: Star },
          { href: "/submissions", label: "Submissions", icon: Send },
        ],
      },
      { href: "/pipeline", label: "Pipeline", icon: GitBranch, exact: true },
    ],
  },
  {
    label: "KNOWLEDGE",
    items: [
      {
        href: "/knowledge",
        label: "Knowledge Brain",
        icon: Brain,
        children: [
          { href: "/knowledge", label: "Knowledge", icon: Brain, exact: true },
          { href: "/knowledge/sources", label: "Sources", icon: FolderOpen },
          { href: "/templates", label: "Templates", icon: ClipboardList },
          { href: "/knowledge/issues", label: "Knowledge Issues", icon: CircleAlert },
        ],
      },
    ],
  },
  {
    label: "ORGANIZATION",
    items: [
      { href: "/organization", label: "Organization", icon: Building2, exact: true },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

function SidebarSearch({ collapsed = false }: { collapsed?: boolean }) {
  if (collapsed) {
    return (
      <div className="group relative flex justify-center">
        <Link
          href="/tenders"
          className="tendyy-sidebar-control inline-flex h-9 w-9 items-center justify-center rounded-[var(--sidebar-radius)] border border-transparent bg-transparent transition-colors"
          aria-label="Search tenders"
        >
          <Search className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </Link>
        <SidebarTooltip label="Search" />
      </div>
    );
  }

  return (
    <Link
      href="/tenders"
      aria-label="Search tenders"
      className="tendyy-sidebar-control flex h-8 items-center gap-2 rounded-[var(--sidebar-radius)] border border-[var(--sidebar-border)] bg-[var(--sidebar-hover)] px-2.5 transition-colors hover:border-[var(--sidebar-accent)]"
    >
      <Search className="h-[15px] w-[15px] shrink-0" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate text-[12px]">Search</span>
      <span className="tendyy-sidebar-text-muted inline-flex items-center gap-1 rounded-[6px] border border-[var(--sidebar-border)] bg-[var(--sidebar-surface)] px-1.5 py-0.5 text-[10px] font-medium">
        Ctrl K
      </span>
    </Link>
  );
}

function SidebarTooltip({ label }: { label: string }) {
  return (
    <span
      role="tooltip"
      className="tendyy-sidebar-text-foreground pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-[7px] border border-[var(--sidebar-border)] bg-[var(--sidebar-surface)] px-2.5 py-1.5 text-[11px] font-medium opacity-0 shadow-[var(--shadow-elevated)] transition-opacity delay-150 group-hover:block group-hover:opacity-100 group-focus-within:block group-focus-within:opacity-100"
    >
      {label}
    </span>
  );
}

function SidebarBadge({ value }: { value: string | number }) {
  return (
    <span className="tendyy-sidebar-text-muted ml-auto inline-flex min-w-5 items-center justify-center rounded-[6px] border border-[var(--sidebar-border)] bg-[var(--sidebar-hover)] px-1.5 text-[10px] font-semibold">
      {value}
    </span>
  );
}

function SidebarSubItems({
  item,
  pathname,
  onNavigate,
  exposeTestAttributes = true,
}: {
  item: NavigationItem;
  pathname: string;
  onNavigate?: () => void;
  exposeTestAttributes?: boolean;
}) {
  return (
    <div className="ml-4 mt-1 space-y-0.5 border-l border-[var(--sidebar-border)] pl-2">
      {item.children?.map((child) => {
        const active = isItemActive(pathname, child);
        const Icon = child.icon;
        return (
          <Link
            key={child.href}
            href={child.href}
            aria-current={active ? "page" : undefined}
            data-sidebar-child={exposeTestAttributes ? child.label : undefined}
            onClick={onNavigate}
            className={[
              "flex h-8 items-center gap-2 rounded-[7px] px-2 text-[11px] transition-colors",
              active
                ? "tendyy-sidebar-item-active font-semibold"
                : "tendyy-sidebar-item",
            ].join(" ")}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            <span className="truncate">{child.label}</span>
            {child.badge ? <SidebarBadge value={child.badge} /> : null}
          </Link>
        );
      })}
    </div>
  );
}

function SidebarFlyout({
  item,
  pathname,
  onNavigate,
  onMouseEnter,
  onMouseLeave,
}: {
  item: NavigationItem;
  pathname: string;
  onNavigate?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  return (
    <div
      className="absolute left-full top-0 z-50 ml-2 w-[204px] rounded-[8px] border border-[var(--sidebar-border)] bg-[var(--sidebar-surface)] p-1.5 shadow-[var(--shadow-elevated)]"
      data-sidebar-flyout={item.label}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="tendyy-sidebar-text-foreground px-2 pb-1.5 pt-1 text-[11px] font-semibold">{item.label}</div>
      <div className="space-y-0.5">
        {item.children?.map((child) => {
          const active = isItemActive(pathname, child);
          const Icon = child.icon;
          return (
            <Link
              key={child.href}
              href={child.href}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={[
                "flex h-8 items-center gap-2.5 rounded-[8px] px-2.5 text-[11px] transition-colors",
                active
                  ? "tendyy-sidebar-item-active font-semibold"
                  : "tendyy-sidebar-item",
              ].join(" ")}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
              <span className="min-w-0 flex-1 truncate">{child.label}</span>
              {child.badge ? <SidebarBadge value={child.badge} /> : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function SidebarItem({
  item,
  collapsed,
  pathname,
  activeFlyout,
  openGroups,
  setActiveFlyout,
  onToggleGroup,
  onNavigate,
  exposeTestAttributes = true,
}: {
  item: NavigationItem;
  collapsed: boolean;
  pathname: string;
  activeFlyout: string | null;
  openGroups: Record<string, boolean>;
  setActiveFlyout: Dispatch<SetStateAction<string | null>>;
  onToggleGroup: (href: string) => void;
  onNavigate?: () => void;
  exposeTestAttributes?: boolean;
}) {
  const active = isItemActive(pathname, item);
  const directlyActive = isItemDirectlyActive(pathname, item);
  const childActive = isChildActive(pathname, item);
  const Icon = item.icon;
  const hasChildren = Boolean(item.children?.length);
  const expanded = hasChildren && (openGroups[item.href] || childActive);
  const flyoutOpen = collapsed && hasChildren && activeFlyout === item.href;
  const strongActive = collapsed ? active || flyoutOpen : directlyActive || flyoutOpen || (!hasChildren && active);
  const parentActive = hasChildren && childActive && !strongActive;
  const itemClass = [
    "relative grid h-[var(--sidebar-item-height)] w-full items-center rounded-[var(--sidebar-radius)] text-[12px] font-medium transition-colors",
    collapsed ? "grid-cols-1 justify-items-center px-0" : "grid-cols-[18px_minmax(0,1fr)_auto] gap-2.5 px-2.5",
    strongActive
      ? "tendyy-sidebar-item-active"
      : parentActive
        ? "tendyy-sidebar-item-parent-active"
        : "tendyy-sidebar-item",
  ].join(" ");
  const iconClass = [
    "flex h-[18px] w-[18px] shrink-0 items-center justify-center",
    strongActive ? "tendyy-sidebar-icon" : parentActive ? "tendyy-sidebar-icon-accent" : "tendyy-sidebar-icon",
  ].join(" ");
  const closeFlyoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeFlyoutTimerRef.current) clearTimeout(closeFlyoutTimerRef.current);
    };
  }, []);

  const openFlyout = () => {
    if (!hasChildren) return;
    if (closeFlyoutTimerRef.current) {
      clearTimeout(closeFlyoutTimerRef.current);
      closeFlyoutTimerRef.current = null;
    }
    setActiveFlyout(item.href);
  };

  const closeFlyoutSoon = () => {
    if (!hasChildren) return;
    if (closeFlyoutTimerRef.current) clearTimeout(closeFlyoutTimerRef.current);
    closeFlyoutTimerRef.current = setTimeout(() => {
      setActiveFlyout((current) => (current === item.href ? null : current));
      closeFlyoutTimerRef.current = null;
    }, 120);
  };

  if (collapsed) {
    return (
      <div
        className="group relative"
        onMouseEnter={hasChildren ? openFlyout : undefined}
        onMouseLeave={hasChildren ? closeFlyoutSoon : undefined}
        onFocusCapture={hasChildren ? openFlyout : undefined}
        onBlurCapture={
          hasChildren
            ? (event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) closeFlyoutSoon();
              }
            : undefined
        }
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={`${flyoutOpen ? "Close" : "Open"} ${item.label} menu`}
            aria-expanded={flyoutOpen}
            data-sidebar-parent={exposeTestAttributes ? item.label : undefined}
            onClick={() => setActiveFlyout(flyoutOpen ? null : item.href)}
            className={itemClass}
          >
            <span className={iconClass}>
              <Icon size={18} strokeWidth={1.75} />
            </span>
          </button>
        ) : (
          <Link
            href={item.href}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            data-sidebar-link={exposeTestAttributes ? item.label : undefined}
            onClick={onNavigate}
            className={itemClass}
          >
            <span className={iconClass}>
              <Icon size={18} strokeWidth={1.75} />
            </span>
          </Link>
        )}

        {!flyoutOpen ? <SidebarTooltip label={item.label} /> : null}
        {flyoutOpen ? (
          <SidebarFlyout
            item={item}
            pathname={pathname}
            onNavigate={onNavigate}
            onMouseEnter={openFlyout}
            onMouseLeave={closeFlyoutSoon}
          />
        ) : null}
      </div>
    );
  }

  if (hasChildren) {
    return (
      <div className="relative">
        <button
          type="button"
          aria-expanded={expanded}
          data-sidebar-parent={exposeTestAttributes ? item.label : undefined}
          onClick={() => onToggleGroup(item.href)}
          className={itemClass}
        >
          <span className={iconClass}>
            <Icon size={18} strokeWidth={1.75} />
          </span>
          <span className="min-w-0 truncate text-left">{item.label}</span>
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-150 ${chevronClass(expanded)}`}
            strokeWidth={1.75}
          />
        </button>
        <div
          className={[
            "grid transition-[grid-template-rows,opacity] duration-150 ease-out",
            expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          ].join(" ")}
        >
          <div className="overflow-hidden">
            <SidebarSubItems
              item={item}
              pathname={pathname}
              onNavigate={onNavigate}
              exposeTestAttributes={exposeTestAttributes}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      data-sidebar-link={exposeTestAttributes ? item.label : undefined}
      onClick={onNavigate}
      className={itemClass}
    >
      <span className={iconClass}>
        <Icon size={18} strokeWidth={1.75} />
      </span>
      <span className="min-w-0 truncate">{item.label}</span>
      {item.badge ? <SidebarBadge value={item.badge} /> : null}
    </Link>
  );
}

function SidebarSection({
  group,
  collapsed,
  pathname,
  activeFlyout,
  openGroups,
  setActiveFlyout,
  onToggleGroup,
  onNavigate,
  exposeTestAttributes = true,
}: {
  group: NavigationGroup;
  collapsed: boolean;
  pathname: string;
  activeFlyout: string | null;
  openGroups: Record<string, boolean>;
  setActiveFlyout: Dispatch<SetStateAction<string | null>>;
  onToggleGroup: (href: string) => void;
  onNavigate?: () => void;
  exposeTestAttributes?: boolean;
}) {
  return (
    <section className="space-y-1.5">
      {!collapsed ? (
        <p className="tendyy-sidebar-text-muted px-1 text-[9px] font-semibold uppercase tracking-[0.12em]">{group.label}</p>
      ) : null}
      <nav className="space-y-1" aria-label={group.label}>
        {group.items.map((item) => (
          <SidebarItem
            key={item.href}
            item={item}
            collapsed={collapsed}
            pathname={pathname}
            activeFlyout={activeFlyout}
            openGroups={openGroups}
            setActiveFlyout={setActiveFlyout}
            onToggleGroup={onToggleGroup}
            onNavigate={onNavigate}
            exposeTestAttributes={exposeTestAttributes}
          />
        ))}
      </nav>
    </section>
  );
}

function BrandMark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className={collapsed ? "flex min-w-0 items-center justify-center" : "flex min-w-0 items-center gap-2"}>
      <div className={`${collapsed ? "h-9 w-9 text-[14px]" : "h-6 w-6 text-[10px]"} flex shrink-0 items-center justify-center rounded-[var(--sidebar-radius)] bg-[var(--sidebar-accent)] font-semibold text-white`}>
        T
      </div>
      {!collapsed ? <span className="tendyy-sidebar-text-foreground text-[15px] font-semibold tracking-normal">TENDYY</span> : null}
    </div>
  );
}

function SidebarHeader({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  if (collapsed) {
    return (
      <div className="relative flex h-12 items-center justify-center">
        <BrandMark collapsed />
        <button
          type="button"
          onClick={onToggle}
          className="tendyy-sidebar-control absolute right-0 top-1/2 inline-flex h-6 w-6 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--sidebar-border)] bg-[var(--sidebar-surface)] shadow-[var(--shadow-subtle)] transition-colors"
          aria-label="Expand navigation"
        >
          <ChevronRight className="h-3 w-3" strokeWidth={1.75} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-10 items-center justify-between gap-2">
      <BrandMark />
      <button
        type="button"
        onClick={onToggle}
        className="tendyy-sidebar-control inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--sidebar-border)] bg-[var(--sidebar-surface)] transition-colors"
        aria-label="Collapse navigation"
      >
        <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
      </button>
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
        "group relative flex items-center rounded-[var(--sidebar-radius)] transition-colors hover:bg-[var(--sidebar-hover)]",
        collapsed ? "h-9 justify-center px-0" : "h-11 gap-2 px-1.5",
      ].join(" ")}
    >
      <div className="tendyy-sidebar-text-accent flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--sidebar-radius)] bg-[var(--sidebar-active-soft)] text-[10px] font-semibold">
        {initials}
      </div>
      {!collapsed ? (
        <>
          <div className="min-w-0 flex-1">
            <p className="tendyy-sidebar-text-foreground truncate text-[11px] font-semibold">{displayLabel}</p>
            <p className="tendyy-sidebar-text-muted truncate text-[10px]">{subtitle}</p>
          </div>
          <span className="tendyy-sidebar-text-muted">
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.75} />
          </span>
        </>
      ) : (
        <SidebarTooltip label="Profile" />
      )}
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
  const workspaces = useMemo(
    () => workspacesQuery.data?.items.filter((workspace) => workspace.status === "active") ?? [],
    [workspacesQuery.data?.items],
  );

  useEffect(() => {
    if (workspaces.length > 0 && !workspaces.some((workspace) => workspace.id === selectedWorkspaceId)) {
      selectWorkspace(workspaces[0]!.id);
    }
  }, [selectedWorkspaceId, workspaces]);

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-white">
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
                  {workspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <Link
              href="/profile"
              className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-slate-200 bg-white text-slate-700"
              aria-label="Profile"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#EFF5FF] text-[11px] font-semibold text-[#155EEF]">
                {initials}
              </div>
            </Link>
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
                <span>Ctrl</span>
                <span>K</span>
              </span>
            </label>

            {workspaces.length > 0 ? (
              <label className="hidden items-center gap-2 text-[11px] font-medium text-slate-600 lg:flex">
                <span className="sr-only">Selected workspace</span>
                <select
                  value={selectedWorkspaceId ?? workspaces[0]!.id}
                  onChange={(event) => selectWorkspace(event.target.value)}
                  className="h-9 max-w-[190px] rounded-[8px] border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-700 outline-none focus:border-[#155EEF]"
                >
                  {workspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <Link
              href="/notifications"
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" strokeWidth={1.75} />
              <span className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-[#155EEF]" aria-hidden="true" />
            </Link>

            <Link
              href="/settings"
              className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
              aria-label="Help and settings"
            >
              <CircleHelp className="h-4 w-4" strokeWidth={1.75} />
            </Link>

            <Link
              href="/profile"
              className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-slate-200 bg-white text-slate-700"
              aria-label="Profile"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#EFF5FF] text-[11px] font-semibold text-[#155EEF]">
                {initials}
              </div>
            </Link>
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
  openGroups,
  onToggleGroup,
  onClose,
}: {
  open: boolean;
  pathname: string;
  initials: string;
  displayLabel: string;
  subtitle: string;
  openGroups: Record<string, boolean>;
  onToggleGroup: (href: string) => void;
  onClose: () => void;
}) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [onClose, open]);

  return (
    <div
      className={`fixed inset-0 z-40 transition-opacity duration-200 ease-out md:hidden ${
        open ? "pointer-events-auto bg-slate-950/30 opacity-100" : "pointer-events-none bg-slate-950/0 opacity-0"
      }`}
      onClick={onClose}
      aria-hidden={!open}
    >
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Main navigation"
        className={`flex h-full w-[min(296px,calc(100vw-24px))] min-w-0 flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar-surface)] p-3 transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-12 items-center justify-between px-1">
          <BrandMark />
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[var(--sidebar-border)] bg-white text-slate-700"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="mt-3">
          <SidebarSearch />
        </div>

        <div className="scrollbar-hide mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden pr-1">
          {navigation.map((group) => (
            <SidebarSection
              key={group.label}
              group={group}
              collapsed={false}
              pathname={pathname}
              activeFlyout={null}
              openGroups={openGroups}
              setActiveFlyout={(_value) => undefined}
              onToggleGroup={onToggleGroup}
              onNavigate={onClose}
              exposeTestAttributes={false}
            />
          ))}
        </div>

        <div className="mt-3 border-t border-[var(--sidebar-border)] pt-3">
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
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const sidebarRef = useRef<HTMLElement>(null);

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
    if (viewport === "mobile") return;
    if (viewport !== "desktop") setSidebarCollapsed(true);
  }, [setSidebarCollapsed, viewport]);

  useEffect(() => {
    setActiveFlyout(null);
    setOpenGroups((current) => {
      const next = { ...current };
      for (const group of navigation) {
        for (const item of group.items) {
          if (item.children?.length && isChildActive(pathname, item)) next[item.href] = true;
        }
      }
      return next;
    });
  }, [pathname]);

  useEffect(() => {
    if (!activeFlyout) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!sidebarRef.current?.contains(event.target as Node)) setActiveFlyout(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setActiveFlyout(null);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [activeFlyout]);

  const accountEmail = session?.profile?.email ?? session?.user?.email ?? null;
  const displayLabel = maskEmail(accountEmail);
  const subtitle = "Account";
  const initials = initialsFromName(session?.profile?.displayName ?? session?.user?.displayName ?? accountEmail ?? "RA");
  const pageTitle = breadcrumbs[breadcrumbs.length - 1]?.label ?? "Dashboard";
  const isMobile = viewport === "mobile";
  const collapsed = !isMobile && sidebarCollapsed;
  const sidebarWidth = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;
  const contentStyle = isMobile ? undefined : { marginLeft: sidebarReady ? sidebarWidth : SIDEBAR_WIDTH_COLLAPSED };

  const toggleGroup = (href: string) => {
    setOpenGroups((current) => ({ ...current, [href]: !current[href] }));
  };

  const closeNavigationSurfaces = () => {
    setActiveFlyout(null);
    setMobileNavOpen(false);
  };

  return (
    <div className="min-h-screen min-w-0 max-w-full overflow-x-hidden bg-[var(--bg-deep)] text-slate-950">
      {!isMobile ? (
        <aside
          ref={sidebarRef}
          className={`fixed inset-y-0 left-0 z-30 hidden border-r border-[var(--sidebar-border)] bg-[var(--sidebar-surface)] transition-[width] duration-200 ease-out md:flex ${
            sidebarReady ? "visible" : "invisible"
          }`}
          data-sidebar-state={collapsed ? "collapsed" : "expanded"}
          style={{ width: sidebarWidth }}
        >
          <div className={`flex h-full w-full flex-col pb-2.5 pt-2.5 ${collapsed ? "px-1.5" : "px-3.5"}`}>
            <SidebarHeader
              collapsed={collapsed}
              onToggle={() => {
                setActiveFlyout(null);
                setSidebarCollapsed((current) => !current);
              }}
            />

            <div className="mt-2.5">
              <SidebarSearch collapsed={collapsed} />
            </div>

            <div className="mt-3.5 flex min-h-0 flex-1 flex-col overflow-visible">
              <div
                className={[
                  "min-h-0 flex-1 space-y-4 pr-0",
                  collapsed ? "overflow-visible" : "scrollbar-hide overflow-y-auto overflow-x-hidden",
                ].join(" ")}
              >
                {navigation.map((group) => (
                  <SidebarSection
                    key={group.label}
                    group={group}
                    collapsed={collapsed}
                    pathname={pathname}
                    activeFlyout={activeFlyout}
                    openGroups={openGroups}
                    setActiveFlyout={setActiveFlyout}
                    onToggleGroup={toggleGroup}
                    onNavigate={closeNavigationSurfaces}
                  />
                ))}
              </div>

              <div className="mt-2.5 border-t border-[var(--sidebar-border)] pt-2.5">
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
        openGroups={openGroups}
        onToggleGroup={toggleGroup}
        onClose={() => setMobileNavOpen(false)}
      />

      <div className="min-w-0 max-w-full" data-app-shell-content style={contentStyle}>
        {!hideDesktopHeader || isMobile ? (
          <ShellHeader
            breadcrumbs={breadcrumbs}
            pageTitle={pageTitle}
            initials={initials}
            isMobile={isMobile}
            onMobileMenuOpen={() => setMobileNavOpen(true)}
          />
        ) : null}

        <main className="min-w-0 max-w-full px-3 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
          <div className="mx-auto w-full min-w-0 max-w-[1480px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
