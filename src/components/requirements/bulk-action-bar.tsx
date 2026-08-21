import { Download, Flag, ShieldAlert, UserCog, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { people } from "@/lib/session";
import type { RequirementStatus, RiskLevel } from "@/types";

const STATUS_OPTIONS: { value: RequirementStatus; label: string }[] = [
  { value: "unanswered", label: "Unanswered" },
  { value: "drafted", label: "Drafted" },
  { value: "needs_review", label: "Needs review" },
  { value: "changes_requested", label: "Changes requested" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const RISK_OPTIONS: RiskLevel[] = ["low", "medium", "high", "critical"];

export function BulkActionBar({
  count,
  ownerTeams,
  onAssign,
  onChangeStatus,
  onSetRisk,
  onChangeOwner,
  onExport,
  onClear,
  pending,
}: {
  count: number;
  ownerTeams: string[];
  onAssign: (reviewerId: string) => void;
  onChangeStatus: (status: RequirementStatus) => void;
  onSetRisk: (risk: RiskLevel) => void;
  onChangeOwner: (ownerTeam: string) => void;
  onExport: () => void;
  onClear: () => void;
  pending: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-accent/40 px-4 py-2.5">
      <span className="text-sm font-medium text-foreground">{count} selected</span>
      <div className="flex flex-wrap items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" disabled={pending}>
              <Users className="h-3.5 w-3.5" /> Assign
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Assign reviewer</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {people.map((p) => (
              <DropdownMenuItem key={p.id} onSelect={() => onAssign(p.id)}>
                {p.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" disabled={pending}>
              <Flag className="h-3.5 w-3.5" /> Change Status
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {STATUS_OPTIONS.map((s) => (
              <DropdownMenuItem key={s.value} onSelect={() => onChangeStatus(s.value)}>
                {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" disabled={pending}>
              <ShieldAlert className="h-3.5 w-3.5" /> Set Risk
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {RISK_OPTIONS.map((r) => (
              <DropdownMenuItem key={r} className="capitalize" onSelect={() => onSetRisk(r)}>
                {r}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {ownerTeams.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" disabled={pending}>
                <UserCog className="h-3.5 w-3.5" /> Change Owner
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {ownerTeams.map((team) => (
                <DropdownMenuItem key={team} onSelect={() => onChangeOwner(team)}>
                  {team}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Button type="button" variant="outline" size="sm" onClick={onExport} disabled={pending}>
          <Download className="h-3.5 w-3.5" /> Export
        </Button>
      </div>
      <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={onClear}>
        <X className="h-3.5 w-3.5" /> Clear
      </Button>
    </div>
  );
}
