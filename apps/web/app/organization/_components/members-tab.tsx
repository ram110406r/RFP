"use client";

import type { OrgRole } from "@rfp-os/types";

import { RfpStatusBadge } from "../../../components/rfp-foundation";
import type { OrganizationInvitationSummary, OrganizationMemberSummary } from "../../../lib/models";
import { formatCount, formatDate, formatRole, formatStatus, relativeTime, roleTone } from "./format";
import { Avatar, EmptyNotice, SectionHeader, TabPanel, Td, Th, type ConfirmRequest } from "./ui";

export interface MemberActions {
  /** The caller's own user id: their row is read-only (the API refuses self-changes). */
  selfUserId: string | null;
  callerRole: OrgRole | null;
  assignableRoles: OrgRole[];
  canUpdate: boolean;
  canRemove: boolean;
  canInvite: boolean;
  confirm: (request: ConfirmRequest) => void;
  changeRole: (member: OrganizationMemberSummary, role: OrgRole) => void;
  setStatus: (member: OrganizationMemberSummary, status: "active" | "suspended") => void;
  remove: (member: OrganizationMemberSummary) => void;
  resendInvitation: (invitation: OrganizationInvitationSummary) => void;
  revokeInvitation: (invitation: OrganizationInvitationSummary) => void;
}

/** Whether the caller may change this member at all, mirroring the API's rules. */
function canManage(member: OrganizationMemberSummary, actions: MemberActions) {
  if (member.userId === actions.selfUserId) return false;
  if (member.role === "OWNER" && actions.callerRole !== "OWNER") return false;
  if (member.role === "ADMIN" && actions.callerRole !== "OWNER" && actions.callerRole !== "ADMIN") return false;
  return true;
}

function MemberControls({ member, actions, compact }: { member: OrganizationMemberSummary; actions: MemberActions; compact: boolean }) {
  const manageable = canManage(member, actions);
  const roleOptions = actions.assignableRoles.includes(member.role as OrgRole)
    ? actions.assignableRoles
    : [member.role as OrgRole, ...actions.assignableRoles];
  const buttonSize = compact ? "h-9 px-3 text-xs" : "px-2 py-1 text-[11px]";
  const isSelf = member.userId === actions.selfUserId;

  return (
    <>
      <select
        value={member.role}
        aria-label={`Change ${member.name}'s role`}
        disabled={!actions.canUpdate || !manageable}
        title={isSelf ? "You cannot change your own role." : undefined}
        onChange={(event) => {
          const role = event.target.value as OrgRole;
          actions.confirm({
            title: `Change ${member.name}'s role?`,
            message: `${member.name} will change from ${formatRole(member.role)} to ${formatRole(role)}. Their access updates on their next request.`,
            confirmLabel: "Change role",
            onConfirm: () => actions.changeRole(member, role),
          });
        }}
        className={compact ? "h-9 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700" : "rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700"}
      >
        {roleOptions.map((role) => <option key={role} value={role}>{formatRole(role)}</option>)}
      </select>
      {actions.canUpdate && manageable ? (
        <button
          type="button"
          onClick={() => {
            const suspending = member.status !== "suspended";
            actions.confirm({
              title: suspending ? `Suspend ${member.name}?` : `Reactivate ${member.name}?`,
              message: suspending
                ? `${member.name} loses access to this organization immediately. Their work and history are kept, and you can reactivate them later.`
                : `${member.name} regains their previous access. This uses a seat.`,
              confirmLabel: suspending ? "Suspend" : "Reactivate",
              destructive: suspending,
              onConfirm: () => actions.setStatus(member, suspending ? "suspended" : "active"),
            });
          }}
          className={`rounded-md border border-slate-200 font-semibold text-slate-700 hover:bg-slate-50 ${buttonSize}`}
        >
          {member.status === "suspended" ? "Reactivate" : "Suspend"}
        </button>
      ) : null}
      {actions.canRemove && manageable ? (
        <button
          type="button"
          onClick={() =>
            actions.confirm({
              title: `Remove ${member.name}?`,
              message: `${member.email} loses access to this organization, its workspaces and teams. Their history is kept. To bring them back you will need to invite them again.`,
              confirmLabel: "Remove member",
              destructive: true,
              onConfirm: () => actions.remove(member),
            })
          }
          className={`rounded-md border border-rose-200 font-semibold text-rose-700 hover:bg-rose-50 ${buttonSize}`}
        >
          Remove
        </button>
      ) : null}
    </>
  );
}

export function MembersTab({
  active,
  members,
  loadError,
  invitations,
  roleDistribution,
  actions,
}: {
  active: boolean;
  members: OrganizationMemberSummary[];
  loadError: boolean;
  invitations: OrganizationInvitationSummary[];
  roleDistribution: Record<string, number>;
  actions: MemberActions;
}) {
  return (
    <TabPanel id="members" active={active}>
      <SectionHeader eyebrow="Members" title="Organization members" description="Active membership rows, roles, and team affiliations from the org service." />

      {loadError ? (
        <EmptyNotice title="Member roster unavailable" description="You do not have permission to list organization members, or the service is temporarily unavailable." />
      ) : members.length > 0 ? (
        <div className="mt-4 overflow-hidden rounded-[10px] border border-slate-200">
          <div className="hidden xl:block">
            <table className="w-full table-fixed border-separate border-spacing-0 text-left">
              <colgroup>
                <col className="w-[27%]" />
                <col className="w-[19%]" />
                <col className="w-[13%]" />
                <col className="w-[16%]" />
                <col className="w-[11%]" />
                <col className="w-[14%]" />
              </colgroup>
              <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <Th>Member</Th>
                  <Th>Access</Th>
                  <Th>Role</Th>
                  <Th>Team</Th>
                  <Th>Status</Th>
                  <Th>Joined</Th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.userId} className="bg-white align-top">
                    <Td>
                      <div className="flex items-center gap-3 py-3">
                        <Avatar name={member.name} />
                        <div className="min-w-0">
                          <p className="tendyy-wrap-anywhere text-[13px] font-semibold text-slate-950">{member.name}{member.userId === actions.selfUserId ? <span className="ml-1 font-normal text-slate-400">(you)</span> : null}</p>
                          <p className="tendyy-wrap-anywhere text-[12px] text-slate-500">{member.email}</p>
                        </div>
                      </div>
                    </Td>
                    <Td><div className="flex flex-wrap gap-1.5 py-3"><MemberControls member={member} actions={actions} compact={false} /></div></Td>
                    <Td><div className="py-3"><RfpStatusBadge tone={roleTone(member.role)}>{formatRole(member.role)}</RfpStatusBadge></div></Td>
                    <Td>
                      <div className="py-3">
                        <p className="text-[13px] font-medium text-slate-950">{member.team || "Unassigned"}</p>
                        <p className="text-[12px] text-slate-500">{member.jobTitle || "Member"}</p>
                      </div>
                    </Td>
                    <Td><div className="py-3"><RfpStatusBadge tone={member.status === "active" ? "success" : "warning"}>{formatStatus(member.status)}</RfpStatusBadge></div></Td>
                    <Td>
                      <div className="py-3 text-[13px] text-slate-600">
                        {relativeTime(member.joinedAt)}
                        <span className="mt-1 block text-[11px] text-slate-400">{formatDate(member.joinedAt)}</span>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-2 p-3 xl:hidden">
            {members.map((member) => (
              <article key={member.userId} className="min-w-0 border border-slate-200 bg-white p-3">
                <div className="flex min-w-0 items-start gap-3">
                  <Avatar name={member.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="tendyy-wrap-anywhere font-semibold text-slate-950">{member.name}{member.userId === actions.selfUserId ? <span className="ml-1 font-normal text-slate-400">(you)</span> : null}</p>
                        <p className="tendyy-wrap-anywhere text-xs text-slate-500">{member.email}</p>
                      </div>
                      <RfpStatusBadge tone={member.status === "active" ? "success" : "warning"}>{formatStatus(member.status)}</RfpStatusBadge>
                    </div>
                    <p className="mt-2 text-xs text-slate-600">{member.team || "Unassigned"} · {member.jobTitle || "Member"}</p>
                    <p className="mt-1 text-xs text-slate-500">Joined {relativeTime(member.joinedAt)}</p>
                  </div>
                </div>
                <div className="mt-3 flex min-w-0 flex-wrap gap-2"><MemberControls member={member} actions={actions} compact /></div>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <EmptyNotice title="No members yet" description="This organization does not have any active membership rows." />
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
          <p className="text-[13px] font-semibold text-slate-900">Role distribution</p>
          <div className="mt-3 space-y-3">
            {Object.keys(roleDistribution).length > 0 ? (
              Object.entries(roleDistribution)
                .sort((a, b) => b[1] - a[1])
                .map(([role, count]) => (
                  <div key={role} className="flex items-center justify-between gap-3">
                    <span className="text-[13px] text-slate-700">{formatRole(role)}</span>
                    <span className="text-[13px] font-semibold text-slate-950">{formatCount(count)}</span>
                  </div>
                ))
            ) : (
              <p className="text-[13px] text-slate-500">Role counts will appear once member data is available.</p>
            )}
          </div>
        </section>

        <section id="invitations" className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
          <p className="text-[13px] font-semibold text-slate-900">Invitation queue</p>
          <div className="mt-3 space-y-2">
            {invitations.length > 0 ? (
              invitations.map((invitation) => (
                <div key={invitation.id} className="rounded-[8px] border border-slate-200 bg-white px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-slate-950">{invitation.email}</p>
                      <p className="text-[12px] text-slate-500">
                        {formatRole(invitation.role)}
                        {invitation.proposedDepartment ? ` · ${invitation.proposedDepartment}` : ""}
                        {invitation.status === "pending" ? ` · expires ${formatDate(invitation.expiresAt)}` : ""}
                      </p>
                    </div>
                    <RfpStatusBadge tone={invitation.status === "pending" ? "warning" : "neutral"}>{formatStatus(invitation.status)}</RfpStatusBadge>
                  </div>
                  {invitation.status === "pending" && actions.canInvite ? (
                    <div className="mt-2 flex gap-4">
                      <button type="button" onClick={() => actions.resendInvitation(invitation)} className="text-[11px] font-semibold text-[#155EEF] hover:text-[#0b4bb3]">Resend</button>
                      <button
                        type="button"
                        onClick={() =>
                          actions.confirm({
                            title: `Revoke the invitation to ${invitation.email}?`,
                            message: "The link stops working immediately and the seat it reserved is freed.",
                            confirmLabel: "Revoke invitation",
                            destructive: true,
                            onConfirm: () => actions.revokeInvitation(invitation),
                          })
                        }
                        className="text-[11px] font-semibold text-rose-700 hover:text-rose-800"
                      >
                        Revoke
                      </button>
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-[13px] text-slate-500">No pending invitations are currently open.</p>
            )}
          </div>
        </section>
      </div>
    </TabPanel>
  );
}
