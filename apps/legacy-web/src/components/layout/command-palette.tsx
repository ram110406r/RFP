import { useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  BookOpen,
  ClipboardCheck,
  FilePlus2,
  FileStack,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandInput,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { rfpsQueryOptions } from "@/lib/api/rfps";
import { allRequirementsQueryOptions } from "@/lib/api/requirements";
import { knowledgeSourcesQueryOptions } from "@/lib/api/knowledge";
import { peopleQueryOptions } from "@/lib/api/people";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { data: rfps = [] } = useQuery({ ...rfpsQueryOptions(), enabled: open });
  const { data: requirements = [] } = useQuery({ ...allRequirementsQueryOptions(), enabled: open });
  const { data: knowledge = [] } = useQuery({ ...knowledgeSourcesQueryOptions(), enabled: open });
  const { data: people = [] } = useQuery({ ...peopleQueryOptions(), enabled: open });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  const customers = useMemo(() => Array.from(new Set(rfps.map((r) => r.customer))), [rfps]);

  function go(to: string, params?: Record<string, string>) {
    onOpenChange(false);
    navigate({ to, params } as never);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search RFPs, requirements, customers, knowledge, people..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Quick actions">
          <CommandItem onSelect={() => go("/rfps/new")}>
            <FilePlus2 /> New RFP
          </CommandItem>
          <CommandItem onSelect={() => go("/")}>
            <LayoutDashboard /> Go to Dashboard
          </CommandItem>
          <CommandItem onSelect={() => go("/reviews")}>
            <ClipboardCheck /> Go to Reviews
          </CommandItem>
          <CommandItem onSelect={() => go("/analytics")}>
            <BarChart3 /> Go to Analytics
          </CommandItem>
          <CommandItem onSelect={() => go("/settings")}>
            <Settings /> Go to Settings
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="RFPs">
          {rfps.slice(0, 8).map((rfp) => (
            <CommandItem
              key={rfp.id}
              value={`rfp ${rfp.title} ${rfp.customer}`}
              onSelect={() => go("/rfps/$rfpId", { rfpId: rfp.id })}
            >
              <FileStack className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{rfp.title}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{rfp.customer}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Customers">
          {customers.slice(0, 6).map((customer) => {
            const rfp = rfps.find((r) => r.customer === customer);
            if (!rfp) return null;
            return (
              <CommandItem
                key={customer}
                value={`customer ${customer}`}
                onSelect={() => go("/rfps/$rfpId", { rfpId: rfp.id })}
              >
                <Users className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">{customer}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandGroup heading="Requirements">
          {requirements.slice(0, 8).map((req) => (
            <CommandItem
              key={req.id}
              value={`requirement ${req.code} ${req.title}`}
              onSelect={() =>
                go("/rfps/$rfpId/requirements/$reqId", { rfpId: req.rfpId, reqId: req.id })
              }
            >
              <ClipboardCheck className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                {req.code} — {req.title}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Knowledge">
          {knowledge.slice(0, 6).map((source) => (
            <CommandItem
              key={source.id}
              value={`knowledge ${source.name}`}
              onSelect={() => go("/knowledge/$sourceId", { sourceId: source.id })}
            >
              <BookOpen className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{source.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="People">
          {people.slice(0, 6).map((person) => (
            <CommandItem key={person.id} value={`person ${person.name} ${person.role}`} disabled>
              <Users className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{person.name}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{person.role}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
