"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Building2, ChevronRight, FileText, LayoutGrid, ShieldCheck, Users } from "lucide-react";
import { Button } from "@rfp-os/ui";
import type { OrgRole } from "@rfp-os/types";

import { AppShell } from "../../components/app-shell";
import { TendyyResponsiveNav } from "../../components/tendyy-ui";
import { useAuthSession } from "../../components/auth-gate";
import { RfpStatusBadge } from "../../components/rfp-foundation";
import { assignableRoles, useAccess } from "../../lib/permissions";
import {
  useActivities,
  useAddTeamMember,
  useAddWorkspaceMember,
  useArchiveTeam,
  useArchiveWorkspace,
  useAudits,
  useAuthMe,
  useCreateTeam,
  useCreateWorkspace,
  useDashboardSummary,
  useInviteOrganizationMember,
  useOrganizationCurrent,
  useOrganizationInvitations,
  useOrganizationMembers,
  useRemoveOrganizationMember,
  useRemoveTeamMember,
  useRemoveWorkspaceMember,
  useResendOrganizationInvitation,
  useRevokeOrganizationInvitation,
  useRoles,
  useTeams,
  useUnarchiveWorkspace,
  useUpdateOrganizationMember,
  useWorkspaces,
} from "../../lib/queries";
import type { OrganizationInvitationCreated, TeamSummary, WorkspaceSummary } from "../../lib/models";
import { InvitationLink, InviteMemberDialog, TeamDialog, TeamPeopleDialog, WorkspaceDialog, WorkspacePeopleDialog } from "./_components/dialogs";
import { formatCount, formatDate, formatStatus, statusTone } from "./_components/format";
import { MembersTab, type MemberActions } from "./_components/members-tab";
import { AuditsTab, OrganizationSidebar, OverviewTab, RolesTab, SettingsTab, type SeatUsage } from "./_components/summary-tabs";
import { TeamsTab } from "./_components/teams-tab";
import { ConfirmDialog, DetailTile, InfoRow, MiniMetric, type ConfirmRequest } from "./_components/ui";
import { WorkspacesTab } from "./_components/workspaces-tab";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "members", label: "Members" },
  { id: "teams", label: "Teams" },
  { id: "roles", label: "Roles & Permissions" },
  { id: "workspaces", label: "Workspaces" },
  { id: "settings", label: "Settings" },
  { id: "audits", label: "Audit Logs" },
] as const;

type TabId = (typeof tabs)[number]["id"];

function errorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

export default function OrganizationPage() {
  const session = useAuthSession();
  const me = useAuthMe();
  const access = useAccess();
  const currentQuery = useOrganizationCurrent();

  // Controls are gated on the caller's effective permissions (GET /auth/me),
  // split the same way the API enforces them: organization-wide, or per workspace.
  const canInviteMembers = access.can("member:invite");
  const canUpdateMembers = access.can("member:update");
  const canRemoveMembers = access.can("member:remove");
  const canCreateWorkspace = access.can("workspace:create");
  const canArchiveWorkspace = access.can("workspace:archive");
  const canUpdateOrganization = access.can("org:update");

  const [workspaceStatus, setWorkspaceStatus] = useState<"active" | "archived">("active");
  const membersQuery = useOrganizationMembers();
  const invitationsQuery = useOrganizationInvitations();
  const rolesQuery = useRoles();
  const teamsQuery = useTeams();
  const workspacesQuery = useWorkspaces({ status: canArchiveWorkspace ? workspaceStatus : "active" });
  const activeWorkspacesQuery = useWorkspaces({ status: "active" });
  const dashboardQuery = useDashboardSummary(6);
  const activitiesQuery = useActivities();
  const auditsQuery = useAudits();

  const inviteMutation = useInviteOrganizationMember();
  const updateMemberMutation = useUpdateOrganizationMember();
  const removeMemberMutation = useRemoveOrganizationMember();
  const resendInvitationMutation = useResendOrganizationInvitation();
  const revokeInvitationMutation = useRevokeOrganizationInvitation();
  const createWorkspaceMutation = useCreateWorkspace();
  const archiveWorkspaceMutation = useArchiveWorkspace();
  const unarchiveWorkspaceMutation = useUnarchiveWorkspace();
  const addWorkspaceMemberMutation = useAddWorkspaceMember();
  const removeWorkspaceMemberMutation = useRemoveWorkspaceMember();
  const createTeamMutation = useCreateTeam();
  const archiveTeamMutation = useArchiveTeam();
  const addTeamMemberMutation = useAddTeamMember();
  const removeTeamMemberMutation = useRemoveTeamMember();

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitationLink, setInvitationLink] = useState<string | null>(null);
  const [resentLink, setResentLink] = useState<{ email: string; link: string } | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [workspacePeopleId, setWorkspacePeopleId] = useState<string | null>(null);
  const [teamPeopleId, setTeamPeopleId] = useState<string | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);

  const organization = currentQuery.data ?? null;
  const members = membersQuery.data?.members ?? [];
  const invitations = invitationsQuery.data?.invitations ?? [];
  const roles = (rolesQuery.data?.items ?? []).filter((role) => role.isSystem);
  const teams = teamsQuery.data?.items ?? [];
  const workspaces = workspacesQuery.data?.items ?? [];
  const activeWorkspaces = activeWorkspacesQuery.data?.items ?? [];
  const dashboard = dashboardQuery.data ?? null;

  const orgName = organization?.name ?? session?.profile?.organizationName ?? "TENDYY organization";
  const orgDomain = organization?.domain ?? session?.profile?.email?.split("@")[1] ?? "unknown";
  const orgStatus = organization?.status ?? "active";
  const activeMembers = members.filter((member) => member.status === "active");
  const pendingInvitations = invitations.filter((invitation) => invitation.status === "pending" && new Date(invitation.expiresAt).getTime() > Date.now());
  const inactiveCount = members.filter((member) => member.status !== "active").length;
  const ownerCount = activeMembers.filter((member) => member.role === "OWNER").length;
  const adminCount = activeMembers.filter((member) => member.role === "ADMIN").length;
  // Mirrors the API: active members and pending invitations both hold a seat.
  const seats: SeatUsage = { activeMembers: activeMembers.length, pendingInvitations: pendingInvitations.length, limit: organization?.seats ?? null };
  const roleDistribution = useMemo(
    () =>
      activeMembers.reduce<Record<string, number>>((accumulator, member) => {
        accumulator[member.role] = (accumulator[member.role] ?? 0) + 1;
        return accumulator;
      }, {}),
    [activeMembers],
  );

  const teamWorkspaces = activeWorkspaces.filter((workspace) => access.canInWorkspace("team:create", workspace.id));
  const actionError =
    errorMessage(updateMemberMutation.error) ??
    errorMessage(removeMemberMutation.error) ??
    errorMessage(resendInvitationMutation.error) ??
    errorMessage(revokeInvitationMutation.error) ??
    errorMessage(archiveWorkspaceMutation.error) ??
    errorMessage(unarchiveWorkspaceMutation.error) ??
    errorMessage(archiveTeamMutation.error) ??
    errorMessage(addWorkspaceMemberMutation.error) ??
    errorMessage(removeWorkspaceMemberMutation.error) ??
    errorMessage(addTeamMemberMutation.error) ??
    errorMessage(removeTeamMemberMutation.error);

  const memberActions: MemberActions = {
    selfUserId: me.data?.userId ?? null,
    callerRole: access.role,
    assignableRoles: assignableRoles(access.role),
    canUpdate: canUpdateMembers,
    canRemove: canRemoveMembers,
    canInvite: canInviteMembers,
    confirm: setConfirmRequest,
    changeRole: (member, role: OrgRole) => updateMemberMutation.mutate({ userId: member.userId, body: { role } }),
    setStatus: (member, status) => updateMemberMutation.mutate({ userId: member.userId, body: { status } }),
    remove: (member) => removeMemberMutation.mutate(member.userId),
    resendInvitation: (invitation) =>
      resendInvitationMutation.mutate(invitation.id, {
        onSuccess: (result) => setResentLink({ email: invitation.email, link: (result as OrganizationInvitationCreated).acceptUrl }),
      }),
    revokeInvitation: (invitation) => revokeInvitationMutation.mutate(invitation.id),
  };

  function openWorkspaceManagement() {
    setActiveTab("workspaces");
    // The workspace panel is hidden until the state update renders. Wait two
    // frames so the button takes the user to the controls it just revealed.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById("workspaces")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  const topDetails = [
    { label: "Workspace ID", value: organization?.slug ?? organization?.id ?? "n/a" },
    { label: "Subscription", value: organization?.plan ?? "Starter" },
    { label: "Industry", value: organization?.industry ?? "Not set" },
    { label: "Headquarters", value: [organization?.country, organization?.operatingRegion].filter(Boolean).join(", ") || "Not set" },
    { label: "Workspace admins", value: `${formatCount(ownerCount + adminCount)}` },
    { label: "Email domain", value: `@${orgDomain}` },
  ];

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Organization" }]}>
      <div className="space-y-5">
        <header className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Organization</p>
              <div className="mt-2 flex flex-wrap items-start gap-3">
                <h1 className="max-w-[12ch] text-[clamp(2.15rem,3.9vw,2.9rem)] font-semibold leading-[0.98] tracking-[-0.04em] text-slate-950">{orgName}</h1>
                <span className="mt-1.5 inline-flex"><RfpStatusBadge tone={statusTone(orgStatus)}>{formatStatus(orgStatus)}</RfpStatusBadge></span>
              </div>
              <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-600">Manage your workspace, people, roles, and access from one organization control plane.</p>
            </div>

            <div className="flex flex-wrap items-start gap-2.5 xl:pt-1">
              {canCreateWorkspace ? <Button type="button" variant="secondary" onClick={openWorkspaceManagement}>Manage Workspaces<Building2 className="h-4 w-4" /></Button> : null}
              {canUpdateOrganization ? <Button asChild variant="secondary"><Link href="/settings">Edit Organization<ChevronRight className="h-4 w-4" /></Link></Button> : null}
              {canInviteMembers ? <Button type="button" onClick={() => setInviteOpen(true)} variant="primary">Invite Members<Users className="h-4 w-4" /></Button> : null}
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {topDetails.map((item) => <DetailTile key={item.label} label={item.label} value={item.value} />)}
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Building2 className="h-4 w-4 text-[#155EEF]" />
                <p className="text-[13px] font-semibold text-slate-900">Organization profile</p>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <InfoRow label="Legal name" value={organization?.legalName || orgName} />
                <InfoRow label="Seats" value={seats.limit ? `${formatCount(seats.activeMembers + seats.pendingInvitations)} of ${formatCount(seats.limit)} used` : "n/a"} />
                <InfoRow label="Member count" value={organization ? formatCount(organization.memberCount) : formatCount(activeMembers.length)} />
                <InfoRow label="Created" value={formatDate(organization?.createdAt)} />
              </div>
            </div>

            <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-[13px] font-semibold text-slate-900">Platform snapshot</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <MiniMetric label="Active RFPs" value={formatCount(dashboard?.metrics.activeRfps ?? 0)} icon={<FileText className="h-4 w-4" />} />
                <MiniMetric label="Teams" value={formatCount(teams.length)} icon={<LayoutGrid className="h-4 w-4" />} />
                <MiniMetric label="Workspaces" value={formatCount(workspaces.length)} icon={<Building2 className="h-4 w-4" />} />
                <MiniMetric label="Knowledge" value={formatCount(dashboard?.knowledge.counts.total ?? 0)} icon={<ShieldCheck className="h-4 w-4" />} />
              </div>
            </div>
          </div>

          {currentQuery.isError ? (
            <p className="mt-4 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
              Live organization data could not be loaded, so the page is falling back to your session profile where possible.
            </p>
          ) : null}
        </header>

        <TendyyResponsiveNav label="Organization section" value={activeTab} items={tabs.map((tab) => ({ value: tab.id, label: tab.label }))} onChange={(value) => setActiveTab(value as TabId)} />

        {actionError ? (
          <p className="rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700" role="alert">{actionError}</p>
        ) : null}
        {resentLink ? (
          <div className="relative">
            <InvitationLink link={resentLink.link} note={`A new invitation was emailed to ${resentLink.email}. The previous link no longer works.`} />
            <button type="button" onClick={() => setResentLink(null)} className="absolute right-3 top-3 text-xs font-semibold text-emerald-900">Dismiss</button>
          </div>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <OverviewTab active={activeTab === "overview"} organization={organization} topDetails={topDetails} seats={seats} ownerCount={ownerCount} adminCount={adminCount} />
            <MembersTab
              active={activeTab === "members"}
              members={members}
              loadError={membersQuery.isError}
              invitations={invitations}
              roleDistribution={roleDistribution}
              actions={memberActions}
            />
            <TeamsTab
              active={activeTab === "teams"}
              teams={teams}
              workspaces={workspaces}
              loadError={teamsQuery.isError}
              canCreate={teamWorkspaces.length > 0}
              canManageMembers={(team: TeamSummary) => access.canInWorkspace("team:member:manage", team.workspaceId)}
              canArchive={(team: TeamSummary) => access.canInWorkspace("team:archive", team.workspaceId)}
              onCreate={() => setTeamOpen(true)}
              onManageMembers={(team) => setTeamPeopleId(team.id)}
              onArchive={(team) => archiveTeamMutation.mutate(team.id)}
              confirm={setConfirmRequest}
            />
            <RolesTab active={activeTab === "roles"} roles={roles} loadError={rolesQuery.isError} />
            <WorkspacesTab
              active={activeTab === "workspaces"}
              workspaces={workspaces}
              loadError={workspacesQuery.isError}
              statusFilter={workspaceStatus}
              onStatusFilter={setWorkspaceStatus}
              canCreate={canCreateWorkspace}
              canArchive={canArchiveWorkspace}
              canManageMembers={(workspace: WorkspaceSummary) => access.canInWorkspace("workspace:member:manage", workspace.id)}
              onCreate={() => setWorkspaceOpen(true)}
              onManageMembers={(workspace) => setWorkspacePeopleId(workspace.id)}
              onArchive={(workspace) => archiveWorkspaceMutation.mutate(workspace.id)}
              onRestore={(workspace) => unarchiveWorkspaceMutation.mutate(workspace.id)}
              confirm={setConfirmRequest}
            />
            <SettingsTab active={activeTab === "settings"} organization={organization} orgStatus={orgStatus} orgDomain={orgDomain} />
            <AuditsTab
              active={activeTab === "audits"}
              activity={(activitiesQuery.data?.items ?? []).slice(0, 6)}
              activityError={activitiesQuery.isError}
              audits={(auditsQuery.data?.items ?? []).slice(0, 8)}
              auditsError={auditsQuery.isError}
              workspaces={workspaces}
            />
          </div>

          <OrganizationSidebar
            organization={organization}
            seats={seats}
            inactiveCount={inactiveCount}
            roleDistribution={roleDistribution}
            usage={{ activeRfps: dashboard?.metrics.activeRfps ?? 0, workspaces: workspaces.length, teams: teams.length, knowledge: dashboard?.knowledge.counts.total ?? 0 }}
          />
        </div>
      </div>

      <InviteMemberDialog
        open={inviteOpen}
        workspaces={activeWorkspaces}
        teams={teams}
        roles={assignableRoles(access.role)}
        seats={seats.limit ? { used: seats.activeMembers + seats.pendingInvitations, limit: seats.limit } : null}
        pending={inviteMutation.isPending}
        error={errorMessage(inviteMutation.error)}
        invitationLink={invitationLink}
        onClose={() => {
          setInviteOpen(false);
          setInvitationLink(null);
          inviteMutation.reset();
        }}
        onInvite={(input) => inviteMutation.mutate(input, { onSuccess: (result) => setInvitationLink((result as OrganizationInvitationCreated).acceptUrl) })}
      />
      <WorkspaceDialog
        open={workspaceOpen}
        pending={createWorkspaceMutation.isPending}
        error={errorMessage(createWorkspaceMutation.error)}
        onClose={() => {
          setWorkspaceOpen(false);
          createWorkspaceMutation.reset();
        }}
        onCreate={(input) => createWorkspaceMutation.mutate(input, { onSuccess: () => setWorkspaceOpen(false) })}
      />
      <TeamDialog
        open={teamOpen}
        workspaces={teamWorkspaces}
        pending={createTeamMutation.isPending}
        error={errorMessage(createTeamMutation.error)}
        onClose={() => {
          setTeamOpen(false);
          createTeamMutation.reset();
        }}
        onCreate={(input) => createTeamMutation.mutate(input, { onSuccess: () => setTeamOpen(false) })}
      />
      <WorkspacePeopleDialog
        workspace={workspaces.find((workspace) => workspace.id === workspacePeopleId) ?? null}
        organizationMembers={members}
        adding={addWorkspaceMemberMutation.isPending}
        removing={removeWorkspaceMemberMutation.isPending}
        onClose={() => setWorkspacePeopleId(null)}
        onInvite={
          canInviteMembers
            ? () => {
                setWorkspacePeopleId(null);
                setInviteOpen(true);
              }
            : null
        }
        onAdd={(workspaceId, organizationMemberId) => addWorkspaceMemberMutation.mutate({ workspaceId, organizationMemberId })}
        onRemove={(workspaceId, organizationMemberId) => removeWorkspaceMemberMutation.mutate({ workspaceId, organizationMemberId })}
      />
      <TeamPeopleDialog
        team={teams.find((team) => team.id === teamPeopleId) ?? null}
        adding={addTeamMemberMutation.isPending}
        removing={removeTeamMemberMutation.isPending}
        onClose={() => setTeamPeopleId(null)}
        onAdd={(teamId, organizationMemberId) => addTeamMemberMutation.mutate({ teamId, organizationMemberId })}
        onRemove={(teamId, organizationMemberId) => removeTeamMemberMutation.mutate({ teamId, organizationMemberId })}
      />
      <ConfirmDialog request={confirmRequest} onClose={() => setConfirmRequest(null)} />
    </AppShell>
  );
}
