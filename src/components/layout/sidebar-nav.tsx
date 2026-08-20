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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";
import { CURRENT_USER_ID } from "@/data/people";
import { getPerson } from "@/data/people";
import { orgProfile } from "@/data/settings";

export function SidebarNav({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const me = getPerson(CURRENT_USER_ID);

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-14 items-center gap-2 px-4", collapsed && "justify-center px-0")}>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
          R
        </span>
        {!collapsed && (
          <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
            RFP OS
          </span>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2" aria-label="Primary">
        {NAV_ITEMS.map((item) => {
          const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                collapsed && "justify-center px-0",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
              aria-current={active ? "page" : undefined}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-sidebar-border p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-sidebar-accent/60",
                collapsed && "justify-center",
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
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuLabel>{orgProfile.name}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              {orgProfile.plan} plan · {orgProfile.seatsUsed}/{orgProfile.seats} seats
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-sidebar-accent/60",
                collapsed && "justify-center",
              )}
            >
              <Avatar className="h-6 w-6 shrink-0">
                <AvatarFallback className="bg-accent text-[10px] font-semibold text-accent-foreground">
                  {me?.initials}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <span className="min-w-0 flex-1 truncate text-sidebar-foreground">{me?.name}</span>
              )}
            </button>
          </DropdownMenuTrigger>
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
              <HelpCircle className="mr-1 h-4 w-4" /> Help & support
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
