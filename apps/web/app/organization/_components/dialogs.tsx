"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@rfp-os/ui";
import type { OrgRole } from "@rfp-os/types";

import { fetchTeamMembers, fetchWorkspaceMembers } from "../../../lib/api";
import type { OrganizationMemberSummary, TeamSummary, WorkspaceSummary } from "../../../lib/models";
import { formatCount, formatRole } from "./format";

const dialogShell = "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4";
const dialogPanel = "max-h-[calc(100dvh-2rem)] w-full min-w-0 overflow-y-auto overflow-x-hidden rounded-[12px] border border-slate-200 bg-white p-4 shadow-2xl sm:p-5";

/** Members of one workspace, fetched only while a dialog needs them. */
function useWorkspaceMembers(workspaceId: string | null | undefined) {
  return useQuery({
    queryKey: ["organization", "workspace-members", workspaceId] as const,
    queryFn: () => fetchWorkspaceMembers(workspaceId!),
    enabled: Boolean(workspaceId),
    retry: false,
  });
}

function useTeamMembers(teamId: string | null | undefined) {
  return useQuery({
    queryKey: ["organization", "team-members", teamId] as const,
    queryFn: () => fetchTeamMembers(teamId!),
    enabled: Boolean(teamId),
    retry: false,
  });
}

function PersonRow({ name, detail, action, actionLabel, tone, disabled }: { name: string; detail: string; action: () => void; actionLabel: string; tone: "add" | "remove"; disabled: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900">{name}</p>
        <p className="truncate text-xs text-slate-500">{detail}</p>
      </div>
      <button type="button" disabled={disabled} onClick={action} className={`text-xs font-semibold disabled:opacity-60 ${tone === "add" ? "text-[#155EEF]" : "text-rose-700"}`}>
        {actionLabel}
      </button>
    </div>
  );
}

export function WorkspacePeopleDialog({
  workspace,
  organizationMembers,
  adding,
  removing,
  onClose,
  onInvite,
  onAdd,
  onRemove,
}: {
  workspace: WorkspaceSummary | null;
  organizationMembers: OrganizationMemberSummary[];
  adding: boolean;
  removing: boolean;
  onClose: () => void;
  onInvite: (() => void) | null;
  onAdd: (workspaceId: string, organizationMemberId: string) => void;
  onRemove: (workspaceId: string, organizationMemberId: string) => void;
}) {
  const membersQuery = useWorkspaceMembers(workspace?.id);
  if (!workspace) return null;
  const workspaceMembers = membersQuery.data?.items ?? [];
  const activeCompanyMembers = organizationMembers.filter((member) => member.status === "active");
  const assignedMemberIds = new Set(workspaceMembers.map((member) => member.organizationMemberId));
  const candidates = activeCompanyMembers.filter((member) => !assignedMemberIds.has(member.organizationMemberId));
  return (
    <div className={dialogShell} role="dialog" aria-modal="true" aria-labelledby="workspace-people-title">
      <section className={`${dialogPanel} max-w-2xl`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#155EEF]">Workspace access</p>
            <h2 id="workspace-people-title" className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{workspace.name} people</h2>
            <p className="mt-2 text-sm text-slate-600">Adding access does not change company membership. Removing someone also removes them from this workspace&apos;s teams.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100">Close</button>
        </div>
        {membersQuery.isError ? <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">Workspace members could not be loaded.</p> : null}
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-slate-900">Current access</p>
            <div className="mt-2 space-y-2">
              {membersQuery.isLoading ? <p className="text-sm text-slate-500">Loading...</p> : null}
              {workspaceMembers.map((member) => (
                <PersonRow key={member.organizationMemberId} name={member.name} detail={member.email} actionLabel="Remove" tone="remove" disabled={removing} action={() => onRemove(workspace.id, member.organizationMemberId)} />
              ))}
              {!membersQuery.isLoading && workspaceMembers.length === 0 ? <p className="text-sm text-slate-500">No active workspace members.</p> : null}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Add company member</p>
            <div className="mt-2 space-y-2">
              {candidates.map((member) => (
                <PersonRow key={member.organizationMemberId} name={member.name} detail={`${formatRole(member.role)} - ${member.email}`} actionLabel="Add" tone="add" disabled={adding || membersQuery.isLoading} action={() => onAdd(workspace.id, member.organizationMemberId)} />
              ))}
              {!membersQuery.isLoading && candidates.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
                  <p className="text-sm text-slate-600">Every active company member already has access.</p>
                  {onInvite ? <button type="button" onClick={onInvite} className="mt-2 text-sm font-semibold text-[#155EEF] hover:text-[#0b4bb3]">Invite a company member</button> : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export function TeamPeopleDialog({
  team,
  adding,
  removing,
  onClose,
  onAdd,
  onRemove,
}: {
  team: TeamSummary | null;
  adding: boolean;
  removing: boolean;
  onClose: () => void;
  onAdd: (teamId: string, organizationMemberId: string) => void;
  onRemove: (teamId: string, organizationMemberId: string) => void;
}) {
  const teamMembersQuery = useTeamMembers(team?.id);
  const workspaceMembersQuery = useWorkspaceMembers(team?.workspaceId);
  if (!team) return null;
  const teamMembers = teamMembersQuery.data?.items ?? [];
  const assignedMemberIds = new Set(teamMembers.map((member) => member.organizationMemberId));
  const eligibleMembers = (workspaceMembersQuery.data?.items ?? []).filter((member) => !assignedMemberIds.has(member.organizationMemberId));
  const loading = teamMembersQuery.isLoading || workspaceMembersQuery.isLoading;
  const archived = team.status !== "active";
  return (
    <div className={dialogShell} role="dialog" aria-modal="true" aria-labelledby="team-people-title">
      <section className={`${dialogPanel} max-w-2xl`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#155EEF]">Team membership</p>
            <h2 id="team-people-title" className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{team.name} members</h2>
            <p className="mt-2 text-sm text-slate-600">
              {archived ? "This team is archived, so its membership can no longer change." : "Only people with active access to this team's workspace can be added."}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100">Close</button>
        </div>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-slate-900">Current team</p>
            <div className="mt-2 space-y-2">
              {loading ? <p className="text-sm text-slate-500">Loading...</p> : null}
              {teamMembers.map((member) => (
                <PersonRow key={member.organizationMemberId} name={member.name} detail={member.email} actionLabel="Remove" tone="remove" disabled={removing} action={() => onRemove(team.id, member.organizationMemberId)} />
              ))}
              {!loading && teamMembers.length === 0 ? <p className="text-sm text-slate-500">No team members yet.</p> : null}
            </div>
          </div>
          {!archived ? (
            <div>
              <p className="text-sm font-semibold text-slate-900">Eligible workspace members</p>
              <div className="mt-2 space-y-2">
                {eligibleMembers.map((member) => (
                  <PersonRow key={member.organizationMemberId} name={member.name} detail={member.email} actionLabel="Add" tone="add" disabled={adding} action={() => onAdd(team.id, member.organizationMemberId)} />
                ))}
                {!loading && eligibleMembers.length === 0 ? <p className="text-sm text-slate-500">No additional eligible members.</p> : null}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function WorkspaceDialog({
  open,
  pending,
  error,
  onClose,
  onCreate,
}: {
  open: boolean;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (input: { name: string; slug: string; description?: string }) => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  if (!open) return null;
  return (
    <div className={dialogShell} role="dialog" aria-modal="true">
      <form className={`${dialogPanel} max-w-lg`} onSubmit={(event) => { event.preventDefault(); onCreate({ name, slug, description: description || undefined }); }}>
        <h2 className="text-xl font-semibold tracking-tight text-slate-950">Create workspace</h2>
        <p className="mt-2 text-sm text-slate-600">The creator is added automatically. Invite or add other company members after creation.</p>
        <label className="mt-4 block text-sm font-medium text-slate-700">Name<input required value={name} onChange={(event) => { setName(event.target.value); if (!slug) setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); }} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5" /></label>
        <label className="mt-3 block text-sm font-medium text-slate-700">Slug<input required pattern="[a-z0-9-]+" value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase())} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5" /></label>
        <label className="mt-3 block text-sm font-medium text-slate-700">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1.5 min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2.5" /></label>
        {error ? <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p> : null}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={pending}>{pending ? "Creating..." : "Create workspace"}</Button></div>
      </form>
    </div>
  );
}

export function TeamDialog({
  open,
  workspaces,
  pending,
  error,
  onClose,
  onCreate,
}: {
  open: boolean;
  /** Only the workspaces the caller may create teams in. */
  workspaces: WorkspaceSummary[];
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (input: { name: string; workspaceId: string; description?: string }) => void;
}) {
  const [name, setName] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [description, setDescription] = useState("");
  if (!open) return null;
  return (
    <div className={dialogShell} role="dialog" aria-modal="true">
      <form className={`${dialogPanel} max-w-lg`} onSubmit={(event) => { event.preventDefault(); onCreate({ name, workspaceId, description: description || undefined }); }}>
        <h2 className="text-xl font-semibold tracking-tight text-slate-950">Create workspace team</h2>
        <p className="mt-2 text-sm text-slate-600">Teams always belong to one workspace. Only its active members can be added.</p>
        <label className="mt-4 block text-sm font-medium text-slate-700">Name<input required value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5" /></label>
        <label className="mt-3 block text-sm font-medium text-slate-700">Workspace<select required value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5"><option value="">Select workspace</option>{workspaces.filter((workspace) => workspace.status === "active").map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label>
        <label className="mt-3 block text-sm font-medium text-slate-700">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1.5 min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2.5" /></label>
        {error ? <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p> : null}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={pending}>{pending ? "Creating..." : "Create team"}</Button></div>
      </form>
    </div>
  );
}

export function InvitationLink({ link, note }: { link: string; note: string }) {
  return (
    <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 p-4">
      <p className="text-sm font-semibold text-emerald-900">Invitation sent</p>
      <p className="mt-1 text-sm text-emerald-800">{note}</p>
      <div className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row">
        <input readOnly aria-label="Invitation link" value={link} className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700" />
        <Button type="button" variant="primary" onClick={() => void navigator.clipboard?.writeText(link)}>Copy link</Button>
      </div>
    </div>
  );
}

export function InviteMemberDialog({
  open,
  workspaces,
  teams,
  roles,
  seats,
  pending,
  error,
  invitationLink,
  onClose,
  onInvite,
}: {
  open: boolean;
  workspaces: WorkspaceSummary[];
  teams: TeamSummary[];
  /** Roles the caller is allowed to grant. */
  roles: OrgRole[];
  /** Seats in use (active members + pending invitations) out of the limit. */
  seats: { used: number; limit: number } | null;
  pending: boolean;
  error: string | null;
  invitationLink: string | null;
  onClose: () => void;
  onInvite: (input: { email: string; role: OrgRole; workspaceId: string; proposedDepartment?: string; proposedTeamId?: string }) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("CONTRIBUTOR");
  const [workspaceId, setWorkspaceId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [department, setDepartment] = useState("");
  const workspaceTeams = teams.filter((team) => team.workspaceId === workspaceId && team.status === "active");
  const full = seats !== null && seats.used >= seats.limit;

  if (!open) return null;

  return (
    <div className={dialogShell} role="dialog" aria-modal="true" aria-labelledby="invite-member-title">
      <section className={`${dialogPanel} max-w-lg`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#155EEF]">Workspace access</p>
            <h2 id="invite-member-title" className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Invite an employee</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">We email them a secure link. They sign up or sign in with this exact address to accept.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900">Close</button>
        </div>

        {invitationLink ? (
          <div className="mt-5">
            <InvitationLink link={invitationLink} note={`We emailed ${email || "them"} this link. You can also share it directly — only the invited address can use it.`} />
          </div>
        ) : (
          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              onInvite({ email, role, workspaceId, proposedDepartment: department || undefined, proposedTeamId: teamId || undefined });
            }}
          >
            {seats ? (
              <p className={`rounded-lg border px-3 py-2 text-sm ${full ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                {full
                  ? `All ${formatCount(seats.limit)} seats are in use, counting pending invitations. Revoke an invitation or remove a member first.`
                  : `${formatCount(seats.used)} of ${formatCount(seats.limit)} seats in use, counting pending invitations.`}
              </p>
            ) : null}
            <label className="block text-sm font-medium text-slate-700">Employee email
              <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-slate-950 outline-none focus:border-[#155EEF]" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">Role
                <select value={role} onChange={(event) => setRole(event.target.value as OrgRole)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-slate-950 outline-none focus:border-[#155EEF]">
                  {roles.map((value) => <option key={value} value={value}>{formatRole(value)}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">Workspace
                <select required value={workspaceId} onChange={(event) => { setWorkspaceId(event.target.value); setTeamId(""); }} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-slate-950 outline-none focus:border-[#155EEF]">
                  <option value="">Select workspace</option>
                  {workspaces.filter((workspace) => workspace.status === "active").map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
                </select>
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">Team <span className="font-normal text-slate-400">optional</span>
                <select value={teamId} onChange={(event) => setTeamId(event.target.value)} disabled={!workspaceId} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-slate-950 outline-none focus:border-[#155EEF] disabled:bg-slate-50">
                  <option value="">No team assignment</option>
                  {workspaceTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">Department <span className="font-normal text-slate-400">optional</span>
                <input value={department} onChange={(event) => setDepartment(event.target.value)} placeholder="Security" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-slate-950 outline-none focus:border-[#155EEF]" />
              </label>
            </div>
            {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p> : null}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={pending || !workspaceId || full}>{pending ? "Sending..." : "Send invitation"}</Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
