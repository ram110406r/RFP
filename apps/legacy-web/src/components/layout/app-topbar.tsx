import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Breadcrumbs } from "./breadcrumbs";
import { NotificationCenter } from "./notification-center";
import { SidebarNav } from "./sidebar-nav";
import { getPerson, CURRENT_USER_ID } from "@/lib/session";

export function AppTopbar({ onOpenCommandPalette }: { onOpenCommandPalette: () => void }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const me = getPerson(CURRENT_USER_ID);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6">
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open navigation"
          onClick={() => setMobileNavOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <SheetContent side="left" className="w-64 bg-sidebar p-0 text-sidebar-foreground">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarNav />
        </SheetContent>
      </Sheet>

      <div className="min-w-0 flex-1">
        <Breadcrumbs />
      </div>

      <button
        onClick={onOpenCommandPalette}
        className="hidden items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted sm:flex"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Search…</span>
        <kbd className="ml-4 rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          ⌘K
        </kbd>
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="sm:hidden"
        aria-label="Search"
        onClick={onOpenCommandPalette}
      >
        <Search className="h-4.5 w-4.5" />
      </Button>

      <NotificationCenter />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="rounded-full" aria-label="Account menu">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="bg-accent text-[11px] font-semibold text-accent-foreground">
                {me?.initials}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div>{me?.name}</div>
            <div className="text-xs font-normal text-muted-foreground">{me?.role}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/settings">Profile & settings</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/settings">Organization</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
