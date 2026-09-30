"use client";

import { Button } from "@rfp-os/ui";

import { RfpStatusBadge } from "../../../components/rfp-foundation";
import type { WorkspaceSummary } from "../../../lib/models";
import { formatCount, formatStatus } from "./format";
import { EmptyNotice, SectionHeader, TabPanel, Td, Th, type ConfirmRequest } from "./ui";

export function WorkspacesTab({
  active,
  workspaces,
  loadError,
  statusFilter,
  onStatusFilter,
  canCreate,
  canArchive,
  canManageMembers,
  onCreate,
  onManageMembers,
  onArchive,
  onRestore,
  confirm,
}: {
  active: boolean;
  workspaces: WorkspaceSummary[];
  loadError: boolean;
  statusFilter: "active" | "archived";
  onStatusFilter: (status: "active" | "archived") => void;
  canCreate: boolean;
  canArchive: boolean;
  canManageMembers: (workspace: WorkspaceSummary) => boolean;
  onCreate: () => void;
  onManageMembers: (workspace: WorkspaceSummary) => void;
  onArchive: (workspace: WorkspaceSummary) => void;
  onRestore: (workspace: WorkspaceSummary) => void;
  confirm: (request: ConfirmRequest) => void;
}) {
  const archive = (workspace: WorkspaceSummary) =>
    confirm({
      title: `Archive ${workspace.name}?`,
      message: "Members lose access to it, its teams are archived and its pending invitations are revoked. Memberships are kept, so restoring it gives people their access back.",
      confirmLabel: "Archive workspace",
      destructive: true,
      onConfirm: () => onArchive(workspace),
    });

  const actionsFor = (workspace: WorkspaceSummary, size: "sm" | "xs") => {
    const text = size === "sm" ? "text-[11px]" : "text-xs";
    return (
      <>
        {workspace.status === "active" && canManageMembers(workspace) ? (
          <button type="button" onClick={() => onManageMembers(workspace)} className={`${text} font-semibold text-[#155EEF] hover:text-[#0b4bb3]`}>Manage members</button>
        ) : null}
        {canArchive && workspace.status === "active" ? (
          <button type="button" onClick={() => archive(workspace)} className={`${text} font-semibold text-rose-700 hover:text-rose-800`}>Archive</button>
        ) : null}
        {canArchive && workspace.status === "archived" ? (
          <button type="button" onClick={() => onRestore(workspace)} className={`${text} font-semibold text-[#155EEF] hover:text-[#0b4bb3]`}>Restore</button>
        ) : null}
      </>
    );
  };

  return (
    <TabPanel id="workspaces" active={active}>
      <SectionHeader eyebrow="Workspaces" title="Workspace inventory" description="Archive hides a workspace and removes access to it while preserving membership history." />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {canArchive ? (
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={statusFilter === "active" ? "primary" : "secondary"} onClick={() => onStatusFilter("active")}>Active</Button>
            <Button type="button" size="sm" variant={statusFilter === "archived" ? "primary" : "secondary"} onClick={() => onStatusFilter("archived")}>Archived</Button>
          </div>
        ) : <span />}
        {canCreate ? <Button type="button" variant="secondary" onClick={onCreate}>Create workspace</Button> : null}
      </div>

      {loadError ? (
        <EmptyNotice title="Workspace data unavailable" description="You do not have permission to list workspaces, or the service is temporarily unavailable." />
      ) : workspaces.length > 0 ? (
        <div className="mt-4 overflow-hidden rounded-[10px] border border-slate-200">
          <div className="hidden xl:block">
            <table className="w-full table-fixed border-separate border-spacing-0 text-left">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <Th>Workspace</Th>
                  <Th>Slug</Th>
                  <Th>Members</Th>
                  <Th>Status</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {workspaces.map((workspace) => (
                  <tr key={workspace.id} className="bg-white align-top">
                    <Td>
                      <div className="py-3">
                        <p className="text-[13px] font-semibold text-slate-950">{workspace.name}</p>
                        <p className="mt-1 text-[12px] text-slate-500">{workspace.description || "No description"}</p>
                      </div>
                    </Td>
                    <Td><div className="py-3 text-[13px] text-slate-700">{workspace.slug}</div></Td>
                    <Td>
                      <div className="py-3">
                        <p className="text-[13px] font-semibold text-slate-950">{formatCount(workspace.memberCount ?? 0)}</p>
                        <p className="text-[12px] text-slate-500">Workspace members</p>
                      </div>
                    </Td>
                    <Td><div className="py-3"><RfpStatusBadge tone={workspace.status === "active" ? "success" : "neutral"}>{formatStatus(workspace.status)}</RfpStatusBadge></div></Td>
                    <Td><div className="flex flex-wrap gap-3 py-3">{actionsFor(workspace, "sm")}</div></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-2 p-3 xl:hidden">
            {workspaces.map((workspace) => (
              <article key={workspace.id} className="min-w-0 border border-slate-200 bg-white p-3">
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="tendyy-wrap-anywhere font-semibold text-slate-950">{workspace.name}</p>
                    <p className="tendyy-wrap-anywhere mt-1 text-xs text-slate-500">{workspace.description || "No description"}</p>
                  </div>
                  <RfpStatusBadge tone={workspace.status === "active" ? "success" : "neutral"}>{formatStatus(workspace.status)}</RfpStatusBadge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <span><b className="block text-[10px] uppercase text-slate-400">Slug</b><span className="tendyy-wrap-anywhere">{workspace.slug}</span></span>
                  <span><b className="block text-[10px] uppercase text-slate-400">Members</b>{formatCount(workspace.memberCount ?? 0)}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-3">{actionsFor(workspace, "xs")}</div>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <EmptyNotice title={statusFilter === "archived" ? "No archived workspaces" : "No workspaces yet"} description={statusFilter === "archived" ? "Archived workspaces will appear here." : "Workspaces will appear here once they are created in the organization."} />
      )}
    </TabPanel>
  );
}
