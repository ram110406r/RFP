"use client";

import { Button } from "@rfp-os/ui";

import { RfpStatusBadge } from "../../../components/rfp-foundation";
import type { TeamSummary, WorkspaceSummary } from "../../../lib/models";
import { formatCount, formatDate, formatStatus, relativeTime, workspaceLabel } from "./format";
import { EmptyNotice, SectionHeader, TabPanel, Td, Th, type ConfirmRequest } from "./ui";

export function TeamsTab({
  active,
  teams,
  workspaces,
  loadError,
  canCreate,
  canManageMembers,
  canArchive,
  onCreate,
  onManageMembers,
  onArchive,
  confirm,
}: {
  active: boolean;
  teams: TeamSummary[];
  workspaces: WorkspaceSummary[];
  loadError: boolean;
  canCreate: boolean;
  /** Per team: team membership is managed per workspace. */
  canManageMembers: (team: TeamSummary) => boolean;
  canArchive: (team: TeamSummary) => boolean;
  onCreate: () => void;
  onManageMembers: (team: TeamSummary) => void;
  onArchive: (team: TeamSummary) => void;
  confirm: (request: ConfirmRequest) => void;
}) {
  const archive = (team: TeamSummary) =>
    confirm({
      title: `Archive ${team.name}?`,
      message: "The team stops appearing in pickers and can no longer take new members. Its history and assignments are kept.",
      confirmLabel: "Archive team",
      destructive: true,
      onConfirm: () => onArchive(team),
    });

  const actionsFor = (team: TeamSummary, size: "sm" | "xs") => (
    <>
      {canManageMembers(team) ? (
        <button type="button" onClick={() => onManageMembers(team)} className={`${size === "sm" ? "text-[11px]" : "text-xs"} font-semibold text-[#155EEF] hover:text-[#0b4bb3]`}>
          {team.status === "active" ? "Manage members" : "View members"}
        </button>
      ) : null}
      {canArchive(team) && team.status === "active" ? (
        <button type="button" onClick={() => archive(team)} className={`${size === "sm" ? "text-[11px]" : "text-xs"} font-semibold text-rose-700 hover:text-rose-800`}>
          Archive
        </button>
      ) : null}
    </>
  );

  return (
    <TabPanel id="teams" active={active}>
      <SectionHeader eyebrow="Teams" title="Team overview" description="Teams are workspace-scoped; only members with active workspace access are eligible." />
      {canCreate ? <div className="mt-3 flex justify-end"><Button type="button" variant="secondary" onClick={onCreate}>Create team</Button></div> : null}

      {loadError ? (
        <EmptyNotice title="Team data unavailable" description="You do not have permission to list teams, or the service is temporarily unavailable." />
      ) : teams.length > 0 ? (
        <div className="mt-4 overflow-hidden rounded-[10px] border border-slate-200">
          <div className="hidden xl:block">
            <table className="w-full table-fixed border-separate border-spacing-0 text-left">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <Th>Team</Th>
                  <Th>Access</Th>
                  <Th>Workspace</Th>
                  <Th>Members</Th>
                  <Th>Status</Th>
                  <Th>Updated</Th>
                </tr>
              </thead>
              <tbody>
                {teams.map((team) => (
                  <tr key={team.id} className="bg-white align-top">
                    <Td>
                      <div className="py-3">
                        <p className="text-[13px] font-semibold text-slate-950">{team.name}</p>
                        <p className="mt-1 text-[12px] text-slate-500">{team.description || "No description"}</p>
                      </div>
                    </Td>
                    <Td><div className="flex flex-wrap gap-2 py-3">{actionsFor(team, "sm")}</div></Td>
                    <Td><div className="py-3 text-[13px] text-slate-700">{workspaceLabel(team.workspaceId, workspaces)}</div></Td>
                    <Td>
                      <div className="py-3">
                        <p className="text-[13px] font-semibold text-slate-950">{formatCount(team.memberCount ?? 0)}</p>
                        <p className="text-[12px] text-slate-500">Team members</p>
                      </div>
                    </Td>
                    <Td><div className="py-3"><RfpStatusBadge tone={team.status === "active" ? "success" : "neutral"}>{formatStatus(team.status)}</RfpStatusBadge></div></Td>
                    <Td>
                      <div className="py-3 text-[13px] text-slate-600">
                        {relativeTime(team.updatedAt)}
                        <span className="mt-1 block text-[11px] text-slate-400">{formatDate(team.updatedAt)}</span>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-2 p-3 xl:hidden">
            {teams.map((team) => (
              <article key={team.id} className="min-w-0 border border-slate-200 bg-white p-3">
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="tendyy-wrap-anywhere font-semibold text-slate-950">{team.name}</p>
                    <p className="tendyy-wrap-anywhere mt-1 text-xs text-slate-500">{team.description || "No description"}</p>
                  </div>
                  <RfpStatusBadge tone={team.status === "active" ? "success" : "neutral"}>{formatStatus(team.status)}</RfpStatusBadge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <span><b className="block text-[10px] uppercase text-slate-400">Workspace</b>{workspaceLabel(team.workspaceId, workspaces)}</span>
                  <span><b className="block text-[10px] uppercase text-slate-400">Members</b>{formatCount(team.memberCount ?? 0)}</span>
                  <span><b className="block text-[10px] uppercase text-slate-400">Updated</b>{relativeTime(team.updatedAt)}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-3">{actionsFor(team, "xs")}</div>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <EmptyNotice title="No teams found" description="Teams will appear here once they are created in the organization." />
      )}
    </TabPanel>
  );
}
