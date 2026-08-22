import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { HelpCircle, ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { NAV_FOOTER_ITEMS, NAV_GROUPS, type NavItem } from "./nav-items";
import { CURRENT_USER_ID, getPerson, orgProfile } from "@/lib/session";

/**
 * Wraps a trigger in a tooltip only when the sidebar is collapsed. Expanded,
 * the label is already visible and a tooltip repeating it is noise.
 */
function CollapsedTip({
  collapsed,
  label,
  children,
}: {
  collapsed: boolean;
  label: string;
  children: ReactNode;
}) {
  if (!collapsed) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function NavLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: (() => void) | undefined;
}) {
  const Icon = item.icon;
  return (
    <CollapsedTip collapsed={collapsed} label={item.label}>
      <Link
        to={item.to}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex items-center gap-2.5 rounded-lg py-2 text-sm transition-colors",
          collapsed ? "justify-center px-0" : "px-2.5",
          /*
           * The active state carries three signals at once — filled pill,
           * accent rail, and a weight change on both icon and label. Any one
           * alone is easy to miss in peripheral vision; together they make
           * "where am I" a non-question. The rail is inset rather than a
           * border so the item's box never changes size.
           */
          active
            ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground shadow-[inset_2px_0_0_var(--sidebar-primary)]"
            : "font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
        )}
      >
        <Icon
          className={cn("h-4 w-4 shrink-0", active ? "stroke-[2.4]" : "stroke-2")}
          aria-hidden="true"
        />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    </CollapsedTip>
  );
}

export function SidebarNav({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const me = getPerson(CURRENT_USER_ID);
  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.to : pathname.startsWith(item.to);

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-14 items-center gap-2 px-4", collapsed && "justify-center px-0")}>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
          T
        </span>
        {!collapsed && (
          <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
            Tendyy
          </span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-2" aria-label="Primary">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div
            key={group.label ?? "primary"}
            className={cn(
              "space-y-0.5",
              groupIndex > 0 && "mt-4",
              /* Collapsed, the group label disappears — a hairline divider
                 has to carry the grouping instead, or the rail becomes an
                 undifferentiated stack of icons. */
              groupIndex > 0 && collapsed && "border-t border-sidebar-border pt-4",
            )}
          >
            {group.label && !collapsed && (
              <p className="px-2.5 pb-1 text-label uppercase text-sidebar-foreground/45">
                {group.label}
              </p>
            )}
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                item={item}
                active={isActive(item)}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t border-sidebar-border p-2">
        {NAV_FOOTER_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            item={item}
            active={isActive(item)}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}

        <DropdownMenu>
          <CollapsedTip collapsed={collapsed} label={orgProfile.name}>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent/50",
                  collapsed && "justify-center px-0",
                )}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/15 text-[11px] font-bold text-primary">
                  {orgProfile.logoInitials}
                </span>
                {!collapsed && (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sidebar-foreground">
                      {orgProfile.name}
                    </span>
                    <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/50" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
          </CollapsedTip>
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuLabel>{orgProfile.name}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              {orgProfile.plan} plan · {orgProfile.seatsUsed}/{orgProfile.seats} seats
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <CollapsedTip collapsed={collapsed} label={me?.name ?? "Account"}>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent/50",
                  collapsed && "justify-center px-0",
                )}
              >
                <Avatar className="h-6 w-6 shrink-0">
                  <AvatarFallback className="bg-accent text-[10px] font-semibold text-accent-foreground">
                    {me?.initials}
                  </AvatarFallback>
                </Avatar>
                {!collapsed && (
                  <span className="min-w-0 flex-1 truncate text-sidebar-foreground">
                    {me?.name}
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
          </CollapsedTip>
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuLabel>
              <div>{me?.name}</div>
              <div className="text-xs font-normal text-muted-foreground">{me?.role}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/settings">Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <HelpCircle className="mr-1 h-4 w-4" /> Help &amp; support
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
