"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, ChevronRight, FileText, LayoutGrid, ShieldCheck, Users } from "lucide-react";

import { AppShell } from "../../components/app-shell";
import { TendyyResponsiveNav } from "../../components/tendyy-ui";
import { useAuthSession } from "../../components/auth-gate";
import { RfpEmptyState, RfpStatusBadge } from "../../components/rfp-foundation";
import { Button } from "@rfp-os/ui";
import { can } from "../../lib/permissions";
import {
  fetchTeamMembers,
  fetchOnboardingStatus,
  fetchWorkspaceMembers,
} from "../../lib/api";
import {
  useActivities,
  useAudits,
  useDashboardSummary,
  useOrganizationCurrent,
  useOrganizationInvitations,
  useInviteOrganizationMember,
  useOrganizationMembers,
  useUpdateOrganizationMember,
  useRemoveOrganizationMember,
  useRevokeOrganizationInvitation,
  useCreateWorkspace,
  useArchiveWorkspace,
  useAddWorkspaceMember,
  useRemoveWorkspaceMember,
  useCreateTeam,
  useArchiveTeam,
  useAddTeamMember,
  useRemoveTeamMember,
  useRoles,
  useTeams,
  useWorkspaces,
} from "../../lib/queries";
import type { ActivityItem } from "../../lib/models";
import type { OrganizationInvitationCreated, OrganizationMemberSummary, TeamSummary, WorkspaceMemberSummary, WorkspaceSummary } from "../../lib/models";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "members", label: "Members" },
  { id: "teams", label: "Teams" },
  { id: "roles", label: "Roles & Permissions" },
  { id: "workspaces", label: "Workspaces" },
  { id: "settings", label: "Settings" },
  { id: "audits", label: "Audit Logs" },
] as const;

export default function OrganizationPage() {
  const session = useAuthSession();
  const currentQuery = useOrganizationCurrent();
  const onboardingStatusQuery = useQuery({ queryKey: ["onboarding", "status"], queryFn: fetchOnboardingStatus });
  const role = onboardingStatusQuery.data?.membership?.role ?? session?.profile?.role;
  const canInviteMembers = can(role, "member:invite");
  const canUpdateMembers = can(role, "member:update");
  const canRemoveMembers = can(role, "member:remove");
  const canCreateWorkspace = can(role, "workspace:create");
  const canArchiveWorkspace = can(role, "workspace:archive");
  const canManageWorkspaceMembers = can(role, "workspace:member:manage");
  const canCreateTeam = can(role, "team:create");
  const canArchiveTeam = can(role, "team:archive");
  const canManageTeamMembers = can(role, "team:member:manage");
  const canUpdateOrganization = can(role, "org:update");
  const [workspaceStatus, setWorkspaceStatus] = useState<"active" | "archived">("active");
  const membersQuery = useOrganizationMembers();
  const invitationsQuery = useOrganizationInvitations();
  const rolesQuery = useRoles();
  const teamsQuery = useTeams();
  const workspacesQuery = useWorkspaces({ status: canArchiveWorkspace ? workspaceStatus : "active" });
  const dashboardQuery = useDashboardSummary(6);
  const activitiesQuery = useActivities();
  const auditsQuery = useAudits();
  const inviteMutation = useInviteOrganizationMember();
  const updateMemberMutation = useUpdateOrganizationMember();
  const removeMemberMutation = useRemoveOrganizationMember();
  const revokeInvitationMutation = useRevokeOrganizationInvitation();
  const createWorkspaceMutation = useCreateWorkspace();
  const archiveWorkspaceMutation = useArchiveWorkspace();
  const addWorkspaceMemberMutation = useAddWorkspaceMember();
  const removeWorkspaceMemberMutation = useRemoveWorkspaceMember();
  const createTeamMutation = useCreateTeam();
  const archiveTeamMutation = useArchiveTeam();
  const addTeamMemberMutation = useAddTeamMember();
  const removeTeamMemberMutation = useRemoveTeamMember();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitationLink, setInvitationLink] = useState<string | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [workspacePeopleId, setWorkspacePeopleId] = useState<string | null>(null);
  const [teamPeopleId, setTeamPeopleId] = useState<string | null>(null);

  const organization = currentQuery.data ?? null;
  const members = membersQuery.data?.members ?? [];
  const invitations = invitationsQuery.data?.invitations ?? [];
  const roles = (rolesQuery.data?.items ?? []).filter((role) => role.isSystem);
  const teams = teamsQuery.data?.items ?? [];
  const workspaces = workspacesQuery.data?.items ?? [];
  const activityItems = activitiesQuery.data?.items ?? [];
  const auditItems = auditsQuery.data?.items ?? [];
  const dashboard = dashboardQuery.data ?? null;

  const workspaceMemberQueries = useQueries({
    queries: workspaces.map((workspace) => ({
      queryKey: ["organization", "workspace-members", workspace.id] as const,
      queryFn: () => fetchWorkspaceMembers(workspace.id),
      enabled: Boolean(workspace.id),
      retry: false,
    })),
  });

  const teamMemberQueries = useQueries({
    queries: teams.map((team) => ({
      queryKey: ["organization", "team-members", team.id] as const,
      queryFn: () => fetchTeamMembers(team.id),
      enabled: Boolean(team.id),
      retry: false,
    })),
  });

  const orgName = organization?.name ?? session?.profile?.organizationName ?? "TENDYY organization";
  const orgDomain = organization?.domain ?? session?.profile?.email?.split("@")[1] ?? "unknown";
  const orgStatus = organization?.status ?? "active";
  const activeMembers = members.filter((member) => member.status === "active");
  const invitedCount = invitations.filter((invitation) => invitation.status === "pending").length;
  const inactiveCount = members.filter((member) => member.status !== "active").length;
  const ownerCount = activeMembers.filter((member) => member.role === "OWNER").length;
  const adminCount = activeMembers.filter((member) => member.role === "ADMIN").length;
  const seatUsage = organization?.seats ? Math.min(100, Math.round((activeMembers.length / organization.seats) * 100)) : 0;
  const activeRfps = dashboard?.metrics.activeRfps ?? 0;
  const knowledgeCount = dashboard?.knowledge.counts.total ?? 0;
  const workspaceCount = workspaces.length;
  const teamCount = teams.length;
  const activeActivity = activityItems.slice(0, 6);
  const recentAudits = auditItems.slice(0, 8);
  const roleDistribution = useMemo(
    () =>
      activeMembers.reduce<Record<string, number>>((accumulator, member) => {
        accumulator[member.role] = (accumulator[member.role] ?? 0) + 1;
        return accumulator;
      }, {}),
    [activeMembers],
  );

  const workspaceRows = workspaces.map((workspace, index) => ({
    workspace,
    memberCount: workspaceMemberQueries[index]?.data?.items.length ?? null,
    members: workspaceMemberQueries[index]?.data?.items ?? [],
    loading: workspaceMemberQueries[index]?.isLoading ?? false,
    error: workspaceMemberQueries[index]?.isError ?? false,
  }));

  const teamRows = teams.map((team, index) => ({
    team,
    memberCount: teamMemberQueries[index]?.data?.items.length ?? null,
    members: teamMemberQueries[index]?.data?.items ?? [],
    loading: teamMemberQueries[index]?.isLoading ?? false,
    error: teamMemberQueries[index]?.isError ?? false,
  }));
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["id"]>("overview");

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

  const memberStatusCounts = [
    { label: "Active", value: activeMembers.length, tone: "success" as const },
    { label: "Invited", value: invitedCount, tone: "warning" as const },
    { label: "Inactive", value: inactiveCount, tone: "neutral" as const },
  ];

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
                <h1 className="max-w-[12ch] text-[clamp(2.15rem,3.9vw,2.9rem)] font-semibold leading-[0.98] tracking-[-0.04em] text-slate-950">
                  {orgName}
                </h1>
                <span className="mt-1.5 inline-flex">
                  <RfpStatusBadge tone={statusTone(orgStatus)}>{formatStatus(orgStatus)}</RfpStatusBadge>
                </span>
              </div>
              <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-600">
                Manage your workspace, people, roles, and access from one organization control plane.
              </p>
            </div>

            <div className="flex flex-wrap items-start gap-2.5 xl:pt-1">
              {canCreateWorkspace ? <Button
                type="button"
                variant="secondary"
                onClick={openWorkspaceManagement}
              >
                Manage Workspaces
                <Building2 className="h-4 w-4" />
              </Button> : null}
              {canUpdateOrganization ? <Button asChild variant="secondary">
                <Link href="/settings">
                  Edit Organization
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button> : null}
              {canInviteMembers ? <Button
                type="button"
                onClick={() => setInviteOpen(true)}
                variant="primary"
              >
                Invite Members
                <Users className="h-4 w-4" />
              </Button> : null}
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {topDetails.map((item) => (
              <DetailTile key={item.label} label={item.label} value={item.value} />
            ))}
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Building2 className="h-4 w-4 text-[#155EEF]" />
                <p className="text-[13px] font-semibold text-slate-900">Organization profile</p>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <InfoRow label="Legal name" value={organization?.legalName || orgName} />
                <InfoRow label="Seats" value={organization?.seats ? formatCount(organization.seats) : "n/a"} />
                <InfoRow label="Member count" value={organization ? formatCount(organization.memberCount) : formatCount(activeMembers.length)} />
                <InfoRow label="Created" value={formatDate(organization?.createdAt)} />
              </div>
            </div>

            <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-[13px] font-semibold text-slate-900">Platform snapshot</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <MiniMetric label="Active RFPs" value={formatCount(activeRfps)} icon={<FileText className="h-4 w-4" />} />
                <MiniMetric label="Teams" value={formatCount(teamCount)} icon={<LayoutGrid className="h-4 w-4" />} />
                <MiniMetric label="Workspaces" value={formatCount(workspaceCount)} icon={<Building2 className="h-4 w-4" />} />
                <MiniMetric label="Knowledge" value={formatCount(knowledgeCount)} icon={<ShieldCheck className="h-4 w-4" />} />
              </div>
            </div>
          </div>

          {currentQuery.isError ? (
            <p className="mt-4 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
              Live organization data could not be loaded, so the page is falling back to your session profile where possible.
            </p>
          ) : null}
        </header>

        <TendyyResponsiveNav label="Organization section" value={activeTab} items={tabs.map((tab) => ({ value: tab.id, label: tab.label }))} onChange={(value) => setActiveTab(value as (typeof tabs)[number]["id"])} />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <section
              id="overview"
              className={[
                "rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)] transition-opacity duration-200",
                activeTab === "overview" ? "opacity-100" : "hidden opacity-0",
              ].join(" ")}
            >
              <SectionHeader
                eyebrow="Overview"
                title="Workspace structure"
                description="The organization card, membership model, and access controls are all powered by the live org APIs."
              />
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <SummaryPanel title="Organization details" rows={topDetails} />
                <SummaryPanel
                  title="Access model"
                  rows={[
                    { label: "Active members", value: formatCount(activeMembers.length) },
                    { label: "Pending invitations", value: formatCount(invitedCount) },
                    { label: "Owner seats", value: formatCount(ownerCount) },
                    { label: "Admin seats", value: formatCount(adminCount) },
                  ]}
                />
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <MetricCard label="Members" value={organization ? formatCount(organization.memberCount) : formatCount(activeMembers.length)} detail="Current active organization members" />
                <MetricCard label="Invitations" value={formatCount(invitedCount)} detail="Pending invitations in flight" />
                <MetricCard label="Seat usage" value={`${seatUsage}%`} detail={`${formatCount(activeMembers.length)} of ${organization?.seats ? formatCount(organization.seats) : "n/a"} seats in use`} />
              </div>
            </section>

            <section
              id="members"
              className={[
                "rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)] transition-opacity duration-200",
                activeTab === "members" ? "opacity-100" : "hidden opacity-0",
              ].join(" ")}
            >
              <SectionHeader eyebrow="Members" title="Organization members" description="Active membership rows, roles, and team affiliations from the org service." actionLabel="View invitations" actionHref="#settings" />

              {membersQuery.isError ? (
                <EmptyNotice title="Member roster unavailable" description="You do not have permission to list organization members, or the service is temporarily unavailable." />
              ) : members.length > 0 ? (
                <div className="mt-4 overflow-hidden rounded-[10px] border border-slate-200">
                  <div className="hidden xl:block">
                    <table className="w-full table-fixed border-separate border-spacing-0 text-left">
                      <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                        <tr>
                          <Th>Member</Th>
                          <Th>Role</Th>
                          <Th>Team</Th>
                          <Th>Status</Th>
                          <Th>Joined</Th>
                          <Th>Access</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.map((member) => (
                          <tr key={member.userId} className="bg-white align-top">
                            <Td>
                              <div className="flex items-center gap-3 py-3">
                                <Avatar name={member.name} />
                                <div>
                                  <p className="text-[13px] font-semibold text-slate-950">{member.name}</p>
                                  <p className="text-[12px] text-slate-500">{member.email}</p>
                                </div>
                              </div>
                            </Td>
                            <Td>
                              <div className="flex flex-wrap gap-1.5 py-3">
                                <select
                                  value={member.role}
                                  aria-label={`Change ${member.name}'s role`}
                                  disabled={!canUpdateMembers}
                                  onChange={(event) => updateMemberMutation.mutate({ userId: member.userId, body: { role: event.target.value as "OWNER" | "ADMIN" | "RFP_MANAGER" | "CONTRIBUTOR" | "REVIEWER" | "SME" | "VIEWER" } })}
                                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700"
                                >
                                  {(["OWNER", "ADMIN", "RFP_MANAGER", "CONTRIBUTOR", "REVIEWER", "SME", "VIEWER"] as const).map((role) => <option key={role} value={role}>{formatRole(role)}</option>)}
                                </select>
                                {canUpdateMembers ? <button
                                  type="button"
                                  onClick={() => updateMemberMutation.mutate({ userId: member.userId, body: { status: member.status === "suspended" ? "active" : "suspended" } })}
                                  className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                  {member.status === "suspended" ? "Reactivate" : "Suspend"}
                                </button> : null}
                                {canRemoveMembers ? <button
                                  type="button"
                                  onClick={() => { if (window.confirm(`Remove ${member.email} from this company?`)) removeMemberMutation.mutate(member.userId); }}
                                  className="rounded-md border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
                                >
                                  Remove
                                </button> : null}
                              </div>
                            </Td>
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
                  <div className="grid gap-2 p-3 xl:hidden">{members.map((member) => <article key={member.userId} className="min-w-0 border border-slate-200 bg-white p-3"><div className="flex min-w-0 items-start gap-3"><Avatar name={member.name} /><div className="min-w-0 flex-1"><div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="tendyy-wrap-anywhere font-semibold text-slate-950">{member.name}</p><p className="tendyy-wrap-anywhere text-xs text-slate-500">{member.email}</p></div><RfpStatusBadge tone={member.status === "active" ? "success" : "warning"}>{formatStatus(member.status)}</RfpStatusBadge></div><p className="mt-2 text-xs text-slate-600">{member.team || "Unassigned"} · {member.jobTitle || "Member"}</p><p className="mt-1 text-xs text-slate-500">Joined {relativeTime(member.joinedAt)}</p></div></div><div className="mt-3 flex min-w-0 flex-wrap gap-2"><select value={member.role} aria-label={`Change ${member.name}'s role`} disabled={!canUpdateMembers} onChange={(event) => updateMemberMutation.mutate({ userId: member.userId, body: { role: event.target.value as "OWNER" | "ADMIN" | "RFP_MANAGER" | "CONTRIBUTOR" | "REVIEWER" | "SME" | "VIEWER" } })} className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700">{(["OWNER", "ADMIN", "RFP_MANAGER", "CONTRIBUTOR", "REVIEWER", "SME", "VIEWER"] as const).map((role) => <option key={role} value={role}>{formatRole(role)}</option>)}</select>{canUpdateMembers ? <button type="button" onClick={() => updateMemberMutation.mutate({ userId: member.userId, body: { status: member.status === "suspended" ? "active" : "suspended" } })} className="h-9 rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700">{member.status === "suspended" ? "Reactivate" : "Suspend"}</button> : null}{canRemoveMembers ? <button type="button" onClick={() => { if (window.confirm(`Remove ${member.email} from this company?`)) removeMemberMutation.mutate(member.userId); }} className="h-9 rounded-md border border-rose-200 px-3 text-xs font-semibold text-rose-700">Remove</button> : null}</div></article>)}</div>
                </div>
              ) : (
                <div className="mt-4">
                  <EmptyNotice title="No members yet" description="This organization does not have any active membership rows." />
                </div>
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

                <section className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[13px] font-semibold text-slate-900">Invitation queue</p>
                  <div className="mt-3 space-y-2">
                    {invitations.length > 0 ? (
                      invitations.map((invitation) => (
                        <div key={invitation.id} className="rounded-[8px] border border-slate-200 bg-white px-3 py-2">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[13px] font-medium text-slate-950">{invitation.email}</p>
                              <p className="text-[12px] text-slate-500">
                                {formatRole(invitation.role)}
                                {invitation.proposedDepartment ? ` · ${invitation.proposedDepartment}` : ""}
                              </p>
                            </div>
                            <RfpStatusBadge tone={invitation.status === "pending" ? "warning" : "neutral"}>{formatStatus(invitation.status)}</RfpStatusBadge>
                          </div>
                          {invitation.status === "pending" && canInviteMembers ? (
                            <button type="button" onClick={() => revokeInvitationMutation.mutate(invitation.id)} className="mt-2 text-[11px] font-semibold text-rose-700 hover:text-rose-800">Revoke invitation</button>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <p className="text-[13px] text-slate-500">No pending invitations are currently open.</p>
                    )}
                  </div>
                </section>
              </div>
            </section>

            <section
              id="teams"
              className={[
                "rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)] transition-opacity duration-200",
                activeTab === "teams" ? "opacity-100" : "hidden opacity-0",
              ].join(" ")}
            >
              <SectionHeader eyebrow="Teams" title="Team overview" description="Teams are workspace-scoped; only members with active workspace access are eligible." />
              {canCreateTeam ? <div className="mt-3 flex justify-end"><Button type="button" variant="secondary" onClick={() => setTeamOpen(true)}>Create team</Button></div> : null}

              {teamsQuery.isError ? (
                <EmptyNotice title="Team data unavailable" description="You do not have permission to list teams, or the service is temporarily unavailable." />
              ) : teamRows.length > 0 ? (
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
                          <Th>Actions</Th>
                          <Th>Updated</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {teamRows.map(({ team, memberCount, members: teamMembers, loading, error }) => (
                          <tr key={team.id} className="bg-white align-top">
                            <Td>
                              <div className="py-3">
                                <p className="text-[13px] font-semibold text-slate-950">{team.name}</p>
                                <p className="mt-1 text-[12px] text-slate-500">{team.description || "No description"}</p>
                              </div>
                            </Td>
                            <Td><div className="flex flex-wrap gap-2 py-3">{canManageTeamMembers ? <button type="button" onClick={() => setTeamPeopleId(team.id)} className="text-[11px] font-semibold text-[#155EEF] hover:text-[#0b4bb3]">Manage members ({teamMembers.length})</button> : null}{canArchiveTeam ? <button type="button" onClick={() => { if (window.confirm(`Archive ${team.name}?`)) archiveTeamMutation.mutate(team.id); }} className="text-[11px] font-semibold text-rose-700 hover:text-rose-800">Archive</button> : null}</div></Td>
                            <Td><div className="py-3 text-[13px] text-slate-700">{workspaceLabel(team.workspaceId, workspaces)}</div></Td>
                            <Td>
                              <div className="py-3">
                                <p className="text-[13px] font-semibold text-slate-950">{loading ? "Loading..." : error ? "Unavailable" : formatCount(memberCount ?? 0)}</p>
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
                  <div className="grid gap-2 p-3 xl:hidden">{teamRows.map(({ team, memberCount, members: teamMembers, loading, error }) => <article key={team.id} className="min-w-0 border border-slate-200 bg-white p-3"><div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1"><p className="tendyy-wrap-anywhere font-semibold text-slate-950">{team.name}</p><p className="tendyy-wrap-anywhere mt-1 text-xs text-slate-500">{team.description || "No description"}</p></div><RfpStatusBadge tone={team.status === "active" ? "success" : "neutral"}>{formatStatus(team.status)}</RfpStatusBadge></div><div className="mt-3 grid grid-cols-2 gap-3 text-xs"><span><b className="block text-[10px] uppercase text-slate-400">Workspace</b>{workspaceLabel(team.workspaceId, workspaces)}</span><span><b className="block text-[10px] uppercase text-slate-400">Members</b>{loading ? "Loading..." : error ? "Unavailable" : formatCount(memberCount ?? 0)}</span><span><b className="block text-[10px] uppercase text-slate-400">Updated</b>{relativeTime(team.updatedAt)}</span></div><div className="mt-3 flex flex-wrap gap-3">{canManageTeamMembers ? <button type="button" onClick={() => setTeamPeopleId(team.id)} className="text-xs font-semibold text-[#155EEF]">Manage members ({teamMembers.length})</button> : null}{canArchiveTeam ? <button type="button" onClick={() => { if (window.confirm(`Archive ${team.name}?`)) archiveTeamMutation.mutate(team.id); }} className="text-xs font-semibold text-rose-700">Archive</button> : null}</div></article>)}</div>
                </div>
              ) : (
                <div className="mt-4">
                  <EmptyNotice title="No teams found" description="Teams will appear here once they are created in the organization." />
                </div>
              )}
            </section>

            <section
              id="roles"
              className={[
                "rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)] transition-opacity duration-200",
                activeTab === "roles" ? "opacity-100" : "hidden opacity-0",
              ].join(" ")}
            >
              <SectionHeader eyebrow="Roles" title="Fixed roles and permissions" description="The seven fixed organization roles are the access model. Custom role changes are disabled." />

              {rolesQuery.isError ? (
                <EmptyNotice title="Role data unavailable" description="You do not have permission to list roles, or the service is temporarily unavailable." />
              ) : roles.length > 0 ? (
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {roles.map((role) => (
                    <article key={role.id} className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[13px] font-semibold text-slate-950">{role.name}</p>
                          <p className="mt-1 text-[13px] leading-6 text-slate-600">{role.description || "No description"}</p>
                        </div>
                        <RfpStatusBadge tone="neutral">Fixed</RfpStatusBadge>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <InfoRow label="Assignments" value={formatCount(role.assignmentCount)} />
                        <InfoRow label="Org scope" value={formatCount(role.organizationAssignmentCount)} />
                        <InfoRow label="Workspace scope" value={formatCount(role.workspaceAssignmentCount)} />
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {(role.permissionKeys ?? []).slice(0, 5).map((permission) => (
                          <span key={permission} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700">
                            {permission}
                          </span>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mt-4">
                  <EmptyNotice title="No roles found" description="Roles will appear here once the role catalog is initialized." />
                </div>
              )}
            </section>

            <section
              id="workspaces"
              className={[
                "rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)] transition-opacity duration-200",
                activeTab === "workspaces" ? "opacity-100" : "hidden opacity-0",
              ].join(" ")}
            >
              <SectionHeader eyebrow="Workspaces" title="Workspace inventory" description="Archive hides a workspace from normal selection while preserving membership history." />
              {canArchiveWorkspace ? <div className="mt-3 flex gap-2"><Button type="button" size="sm" variant={workspaceStatus === "active" ? "primary" : "secondary"} onClick={() => setWorkspaceStatus("active")}>Active</Button><Button type="button" size="sm" variant={workspaceStatus === "archived" ? "primary" : "secondary"} onClick={() => setWorkspaceStatus("archived")}>Archived</Button></div> : null}
              {canCreateWorkspace ? <div className="mt-3 flex justify-end"><Button type="button" variant="secondary" onClick={() => setWorkspaceOpen(true)}>Create workspace</Button></div> : null}

              {workspacesQuery.isError ? (
                <EmptyNotice title="Workspace data unavailable" description="You do not have permission to list workspaces, or the service is temporarily unavailable." />
              ) : workspaceRows.length > 0 ? (
                <div className="mt-4 overflow-hidden rounded-[10px] border border-slate-200">
                  <div className="hidden xl:block">
                    <table className="w-full table-fixed border-separate border-spacing-0 text-left">
                      <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                        <tr>
                          <Th>Workspace</Th>
                          <Th>Slug</Th>
                          <Th>Members</Th>
                          <Th>Status</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {workspaceRows.map(({ workspace, memberCount, members: workspaceMembers, loading, error }) => (
                          <tr key={workspace.id} className="bg-white align-top">
                            <Td>
                              <div className="py-3">
                                <p className="text-[13px] font-semibold text-slate-950">{workspace.name}</p>
                                <p className="mt-1 text-[12px] text-slate-500">{workspace.description || "No description"}</p>
                                {canManageWorkspaceMembers ? <button
                                  type="button"
                                  onClick={() => setWorkspacePeopleId(workspace.id)}
                                  className="mt-2 text-[12px] font-semibold text-[#155EEF] hover:text-[#0b4bb3]"
                                >
                                  Add or remove members ({workspaceMembers.length})
                                </button> : null}
                              </div>
                            </Td>
                            <Td><div className="py-3 text-[13px] text-slate-700">{workspace.slug}</div></Td>
                            <Td>
                              <div className="py-3">
                                <p className="text-[13px] font-semibold text-slate-950">{loading ? "Loading..." : error ? "Unavailable" : formatCount(memberCount ?? 0)}</p>
                                <p className="text-[12px] text-slate-500">Workspace members</p>
                              </div>
                            </Td>
                            <Td><div className="py-3"><RfpStatusBadge tone={workspace.status === "active" ? "success" : "neutral"}>{formatStatus(workspace.status)}</RfpStatusBadge></div></Td>
                            <Td><div className="py-3">{canArchiveWorkspace && workspace.status === "active" ? <button type="button" onClick={() => { if (window.confirm(`Archive ${workspace.name}?`)) archiveWorkspaceMutation.mutate(workspace.id); }} className="text-[11px] font-semibold text-rose-700 hover:text-rose-800">Archive</button> : null}</div></Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="grid gap-2 p-3 xl:hidden">{workspaceRows.map(({ workspace, memberCount, members: workspaceMembers, loading, error }) => <article key={workspace.id} className="min-w-0 border border-slate-200 bg-white p-3"><div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1"><p className="tendyy-wrap-anywhere font-semibold text-slate-950">{workspace.name}</p><p className="tendyy-wrap-anywhere mt-1 text-xs text-slate-500">{workspace.description || "No description"}</p></div><RfpStatusBadge tone={workspace.status === "active" ? "success" : "neutral"}>{formatStatus(workspace.status)}</RfpStatusBadge></div><div className="mt-3 grid grid-cols-2 gap-3 text-xs"><span><b className="block text-[10px] uppercase text-slate-400">Slug</b><span className="tendyy-wrap-anywhere">{workspace.slug}</span></span><span><b className="block text-[10px] uppercase text-slate-400">Members</b>{loading ? "Loading..." : error ? "Unavailable" : formatCount(memberCount ?? 0)}</span></div><div className="mt-3 flex flex-wrap gap-3">{canManageWorkspaceMembers ? <button type="button" onClick={() => setWorkspacePeopleId(workspace.id)} className="text-xs font-semibold text-[#155EEF]">Manage members ({workspaceMembers.length})</button> : null}{canArchiveWorkspace && workspace.status === "active" ? <button type="button" onClick={() => { if (window.confirm(`Archive ${workspace.name}?`)) archiveWorkspaceMutation.mutate(workspace.id); }} className="text-xs font-semibold text-rose-700">Archive</button> : null}</div></article>)}</div>
                </div>
              ) : (
                <div className="mt-4">
                  <EmptyNotice title="No workspaces yet" description="Workspaces will appear here once they are created in the organization." />
                </div>
              )}
            </section>

            <section
              id="settings"
              className={[
                "rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)] transition-opacity duration-200",
                activeTab === "settings" ? "opacity-100" : "hidden opacity-0",
              ].join(" ")}
            >
              <SectionHeader eyebrow="Settings" title="Organization settings" description="This area keeps the shell route complete while surfacing the live org configuration." />
              <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <InfoRow label="Status" value={formatStatus(orgStatus)} />
                    <InfoRow label="Plan" value={organization?.plan ?? "Starter"} />
                    <InfoRow label="Domain" value={orgDomain} />
                    <InfoRow label="Region" value={organization?.operatingRegion || "Not set"} />
                    <InfoRow label="Industry" value={organization?.industry || "Not set"} />
                    <InfoRow label="Last updated" value={formatDate(organization?.updatedAt)} />
                  </div>
                </div>
                <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[13px] font-semibold text-slate-900">Quick actions</p>
                  <div className="mt-3 flex flex-col gap-2.5">
                    <Button asChild variant="primary" className="w-full">
                      <Link href="/settings">Open settings</Link>
                    </Button>
                    <Button asChild variant="secondary" className="w-full">
                      <Link href="/profile">View profile</Link>
                    </Button>
                    <Button
                      type="button"
                      onClick={() => jumpTo("audits")}
                      variant="secondary"
                      className="w-full"
                    >
                      Review audit logs
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            <section
              id="audits"
              className={[
                "rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)] transition-opacity duration-200",
                activeTab === "audits" ? "opacity-100" : "hidden opacity-0",
              ].join(" ")}
            >
              <SectionHeader eyebrow="Audit Logs" title="Organization activity trail" description="Audit entries preserve the compliance record, while the activity feed keeps a human timeline." />

              <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[13px] font-semibold text-slate-900">Recent member activity</p>
                  {activitiesQuery.isError ? (
                    <EmptyNotice title="Activity feed unavailable" description="Recent activity could not be loaded." compact />
                  ) : activeActivity.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {activeActivity.map((item) => (
                        <ActivityRow key={item.id} item={item} />
                      ))}
                    </div>
                  ) : (
                    <EmptyNotice title="No recent activity" description="Member activity will appear here after users start working in the organization." compact />
                  )}
                </div>

                <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[13px] font-semibold text-slate-900">Recent audit entries</p>
                  {auditsQuery.isError ? (
                    <EmptyNotice title="Audit trail unavailable" description="Audit logs could not be loaded." compact />
                  ) : recentAudits.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {recentAudits.map((audit) => (
                        <AuditRow key={audit.id} audit={audit} workspaces={workspaces} />
                      ))}
                    </div>
                  ) : (
                    <EmptyNotice title="No audit entries yet" description="Audit logs will appear once settings or member data changes." compact />
                  )}
                </div>
              </div>
            </section>
          </div>

          <aside className="space-y-5 xl:sticky xl:top-5 xl:self-start">
            <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
              <SectionHeader eyebrow="Members Summary" title="Members summary" actionLabel="View all" actionHref="#members" />
              <div className="mt-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[29px] font-semibold tracking-tight text-slate-950">{formatCount(activeMembers.length)}</p>
                  <p className="text-[13px] text-slate-600">Total active members</p>
                </div>
                <div className="text-right text-[12px] text-slate-500">
                  <p>{organization?.seats ? `${formatCount(activeMembers.length)} / ${formatCount(organization.seats)} seats` : "Seat count unavailable"}</p>
                  <p className="mt-1">Updated {formatDate(organization?.updatedAt)}</p>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${seatUsage}%` }} />
              </div>
              <div className="mt-4 space-y-3">
                {memberStatusCounts.map((item) => (
                  <StatusBar key={item.label} label={item.label} value={item.value} tone={item.tone} total={activeMembers.length + invitedCount + inactiveCount} />
                ))}
              </div>
            </section>

            <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
              <SectionHeader eyebrow="Roles" title="Role distribution" actionLabel="View roles" actionHref="#roles" />
              <div className="mt-4 space-y-3">
                {Object.keys(roleDistribution).length > 0 ? (
                  Object.entries(roleDistribution)
                    .sort((a, b) => b[1] - a[1])
                    .map(([role, count]) => (
                      <div key={role} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-slate-900">{formatRole(role)}</p>
                          <p className="text-[12px] text-slate-500">Organization members</p>
                        </div>
                        <span className="text-[13px] font-semibold text-slate-950">{formatCount(count)}</span>
                      </div>
                    ))
                ) : (
                  <p className="text-[13px] text-slate-500">Role distribution will appear once members load.</p>
                )}
              </div>
            </section>

            <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
              <SectionHeader eyebrow="Usage" title="Usage overview" actionLabel="View workspaces" actionHref="#workspaces" />
              <div className="mt-4 space-y-3">
                <UsageRow label="Active RFPs" value={formatCount(activeRfps)} progress={Math.min(100, activeRfps * 10)} />
                <UsageRow label="Workspaces" value={formatCount(workspaceCount)} progress={Math.min(100, workspaceCount * 20)} />
                <UsageRow label="Teams" value={formatCount(teamCount)} progress={Math.min(100, teamCount * 15)} />
                <UsageRow label="Knowledge items" value={formatCount(knowledgeCount)} progress={Math.min(100, knowledgeCount / 2)} />
              </div>
            </section>
          </aside>
        </div>
      </div>
      <InviteMemberDialog
        open={inviteOpen}
        workspaces={workspaces}
        teams={teams}
        pending={inviteMutation.isPending}
        error={inviteMutation.error instanceof Error ? inviteMutation.error.message : null}
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
        onClose={() => setWorkspaceOpen(false)}
        onCreate={(input) => createWorkspaceMutation.mutate(input, { onSuccess: () => setWorkspaceOpen(false) })}
      />
      <TeamDialog
        open={teamOpen}
        workspaces={workspaces}
        pending={createTeamMutation.isPending}
        onClose={() => setTeamOpen(false)}
        onCreate={(input) => createTeamMutation.mutate(input, { onSuccess: () => setTeamOpen(false) })}
      />
      <WorkspacePeopleDialog
        workspace={workspaces.find((workspace) => workspace.id === workspacePeopleId) ?? null}
        organizationMembers={members}
        workspaceMembers={workspaceRows.find((row) => row.workspace.id === workspacePeopleId)?.members ?? []}
        adding={addWorkspaceMemberMutation.isPending}
        removing={removeWorkspaceMemberMutation.isPending}
        onClose={() => setWorkspacePeopleId(null)}
        onInvite={() => {
          setWorkspacePeopleId(null);
          setInviteOpen(true);
        }}
        onAdd={(workspaceId, organizationMemberId) => addWorkspaceMemberMutation.mutate({ workspaceId, organizationMemberId })}
        onRemove={(workspaceId, organizationMemberId) => removeWorkspaceMemberMutation.mutate({ workspaceId, organizationMemberId })}
      />
      <TeamPeopleDialog
        team={teams.find((team) => team.id === teamPeopleId) ?? null}
        workspaceMembers={workspaceRows.find((row) => row.workspace.id === teams.find((team) => team.id === teamPeopleId)?.workspaceId)?.members ?? []}
        teamMembers={teamRows.find((row) => row.team.id === teamPeopleId)?.members ?? []}
        adding={addTeamMemberMutation.isPending}
        removing={removeTeamMemberMutation.isPending}
        onClose={() => setTeamPeopleId(null)}
        onAdd={(teamId, organizationMemberId) => addTeamMemberMutation.mutate({ teamId, organizationMemberId })}
        onRemove={(teamId, organizationMemberId) => removeTeamMemberMutation.mutate({ teamId, organizationMemberId })}
      />
    </AppShell>
  );
}

function WorkspacePeopleDialog({
  workspace,
  organizationMembers,
  workspaceMembers,
  adding,
  removing,
  onClose,
  onInvite,
  onAdd,
  onRemove,
}: {
  workspace: WorkspaceSummary | null;
  organizationMembers: OrganizationMemberSummary[];
  workspaceMembers: WorkspaceMemberSummary[];
  adding: boolean;
  removing: boolean;
  onClose: () => void;
  onInvite: () => void;
  onAdd: (workspaceId: string, organizationMemberId: string) => void;
  onRemove: (workspaceId: string, organizationMemberId: string) => void;
}) {
  if (!workspace) return null;
  const activeMembers = organizationMembers.filter((member) => member.status === "active");
  const assignedMemberIds = new Set(workspaceMembers.filter((member) => member.status === "active").map((member) => member.organizationMemberId));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true">
      <section className="max-h-[calc(100dvh-2rem)] w-full min-w-0 max-w-2xl overflow-y-auto overflow-x-hidden rounded-[12px] border border-slate-200 bg-white p-4 shadow-2xl sm:p-5">
        <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#155EEF]">Workspace access</p><h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{workspace.name} people</h2><p className="mt-2 text-sm text-slate-600">Adding access does not change company membership. Removing the final workspace leaves the member in an access-required state.</p></div><button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100">Close</button></div>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div><p className="text-sm font-semibold text-slate-900">Current access</p><div className="mt-2 space-y-2">{workspaceMembers.filter((member) => member.status === "active").map((member) => <div key={member.organizationMemberId} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-900">{member.name}</p><p className="truncate text-xs text-slate-500">{member.email}</p></div><button type="button" disabled={removing} onClick={() => onRemove(workspace.id, member.organizationMemberId)} className="text-xs font-semibold text-rose-700 disabled:opacity-60">Remove</button></div>)}{workspaceMembers.filter((member) => member.status === "active").length === 0 ? <p className="text-sm text-slate-500">No active workspace members.</p> : null}</div></div>
          <div><p className="text-sm font-semibold text-slate-900">Add company member</p><div className="mt-2 space-y-2">{activeMembers.filter((member) => !assignedMemberIds.has(member.organizationMemberId)).map((member) => <div key={member.organizationMemberId} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-900">{member.name}</p><p className="truncate text-xs text-slate-500">{formatRole(member.role)} - {member.email}</p></div><button type="button" disabled={adding} onClick={() => onAdd(workspace.id, member.organizationMemberId)} className="text-xs font-semibold text-[#155EEF] disabled:opacity-60">Add</button></div>)}{activeMembers.filter((member) => !assignedMemberIds.has(member.organizationMemberId)).length === 0 ? <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3"><p className="text-sm text-slate-600">Every active company member already has access.</p><button type="button" onClick={onInvite} className="mt-2 text-sm font-semibold text-[#155EEF] hover:text-[#0b4bb3]">Invite a company member</button></div> : null}</div></div>
        </div>
      </section>
    </div>
  );
}

function TeamPeopleDialog({
  team,
  workspaceMembers,
  teamMembers,
  adding,
  removing,
  onClose,
  onAdd,
  onRemove,
}: {
  team: TeamSummary | null;
  workspaceMembers: WorkspaceMemberSummary[];
  teamMembers: import("../../lib/models").TeamMemberSummary[];
  adding: boolean;
  removing: boolean;
  onClose: () => void;
  onAdd: (teamId: string, organizationMemberId: string) => void;
  onRemove: (teamId: string, organizationMemberId: string) => void;
}) {
  if (!team) return null;
  const assignedMemberIds = new Set(teamMembers.map((member) => member.organizationMemberId));
  const eligibleMembers = workspaceMembers.filter((member) => member.status === "active" && !assignedMemberIds.has(member.organizationMemberId));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true">
      <section className="max-h-[calc(100dvh-2rem)] w-full min-w-0 max-w-2xl overflow-y-auto overflow-x-hidden rounded-[12px] border border-slate-200 bg-white p-4 shadow-2xl sm:p-5">
        <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#155EEF]">Team membership</p><h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{team.name} members</h2><p className="mt-2 text-sm text-slate-600">Only people with active access to this team&apos;s workspace can be added.</p></div><button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100">Close</button></div>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div><p className="text-sm font-semibold text-slate-900">Current team</p><div className="mt-2 space-y-2">{teamMembers.map((member) => <div key={member.organizationMemberId} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-900">{member.name}</p><p className="truncate text-xs text-slate-500">{member.email}</p></div><button type="button" disabled={removing} onClick={() => onRemove(team.id, member.organizationMemberId)} className="text-xs font-semibold text-rose-700 disabled:opacity-60">Remove</button></div>)}{teamMembers.length === 0 ? <p className="text-sm text-slate-500">No team members yet.</p> : null}</div></div>
          <div><p className="text-sm font-semibold text-slate-900">Eligible workspace members</p><div className="mt-2 space-y-2">{eligibleMembers.map((member) => <div key={member.organizationMemberId} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-900">{member.name}</p><p className="truncate text-xs text-slate-500">{member.email}</p></div><button type="button" disabled={adding} onClick={() => onAdd(team.id, member.organizationMemberId)} className="text-xs font-semibold text-[#155EEF] disabled:opacity-60">Add</button></div>)}{eligibleMembers.length === 0 ? <p className="text-sm text-slate-500">No additional eligible members.</p> : null}</div></div>
        </div>
      </section>
    </div>
  );
}

function WorkspaceDialog({
  open,
  pending,
  onClose,
  onCreate,
}: {
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onCreate: (input: { name: string; slug: string; description?: string }) => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true">
      <form className="max-h-[calc(100dvh-2rem)] w-full min-w-0 max-w-lg overflow-y-auto overflow-x-hidden rounded-[12px] border border-slate-200 bg-white p-4 shadow-2xl sm:p-5" onSubmit={(event) => { event.preventDefault(); onCreate({ name, slug, description: description || undefined }); }}>
        <h2 className="text-xl font-semibold tracking-tight text-slate-950">Create workspace</h2>
        <p className="mt-2 text-sm text-slate-600">The creator is added automatically. Invite or add other company members after creation.</p>
        <label className="mt-4 block text-sm font-medium text-slate-700">Name<input required value={name} onChange={(event) => { setName(event.target.value); if (!slug) setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); }} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5" /></label>
        <label className="mt-3 block text-sm font-medium text-slate-700">Slug<input required pattern="[a-z0-9-]+" value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase())} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5" /></label>
        <label className="mt-3 block text-sm font-medium text-slate-700">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1.5 min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2.5" /></label>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={pending}>{pending ? "Creating..." : "Create workspace"}</Button></div>
      </form>
    </div>
  );
}

function TeamDialog({
  open,
  workspaces,
  pending,
  onClose,
  onCreate,
}: {
  open: boolean;
  workspaces: WorkspaceSummary[];
  pending: boolean;
  onClose: () => void;
  onCreate: (input: { name: string; workspaceId: string; description?: string }) => void;
}) {
  const [name, setName] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [description, setDescription] = useState("");
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true">
      <form className="max-h-[calc(100dvh-2rem)] w-full min-w-0 max-w-lg overflow-y-auto overflow-x-hidden rounded-[12px] border border-slate-200 bg-white p-4 shadow-2xl sm:p-5" onSubmit={(event) => { event.preventDefault(); onCreate({ name, workspaceId, description: description || undefined }); }}>
        <h2 className="text-xl font-semibold tracking-tight text-slate-950">Create workspace team</h2>
        <p className="mt-2 text-sm text-slate-600">Teams always belong to one workspace. Only its active members can be added.</p>
        <label className="mt-4 block text-sm font-medium text-slate-700">Name<input required value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5" /></label>
        <label className="mt-3 block text-sm font-medium text-slate-700">Workspace<select required value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5"><option value="">Select workspace</option>{workspaces.filter((workspace) => workspace.status === "active").map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label>
        <label className="mt-3 block text-sm font-medium text-slate-700">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1.5 min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2.5" /></label>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={pending}>{pending ? "Creating..." : "Create team"}</Button></div>
      </form>
    </div>
  );
}

function InviteMemberDialog({
  open,
  workspaces,
  teams,
  pending,
  error,
  invitationLink,
  onClose,
  onInvite,
}: {
  open: boolean;
  workspaces: WorkspaceSummary[];
  teams: TeamSummary[];
  pending: boolean;
  error: string | null;
  invitationLink: string | null;
  onClose: () => void;
  onInvite: (input: { email: string; role: "OWNER" | "ADMIN" | "RFP_MANAGER" | "CONTRIBUTOR" | "REVIEWER" | "SME" | "VIEWER"; workspaceId: string; proposedDepartment?: string; proposedTeamId?: string }) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"OWNER" | "ADMIN" | "RFP_MANAGER" | "CONTRIBUTOR" | "REVIEWER" | "SME" | "VIEWER">("CONTRIBUTOR");
  const [workspaceId, setWorkspaceId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [department, setDepartment] = useState("");
  const workspaceTeams = teams.filter((team) => team.workspaceId === workspaceId && team.status === "active");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="invite-member-title">
      <section className="max-h-[calc(100dvh-2rem)] w-full min-w-0 max-w-lg overflow-y-auto overflow-x-hidden rounded-[12px] border border-slate-200 bg-white p-4 shadow-2xl sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#155EEF]">Workspace access</p>
            <h2 id="invite-member-title" className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Invite an employee</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Choose the role and workspace before sharing the secure invitation link.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900">Close</button>
        </div>

        {invitationLink ? (
          <div className="mt-5 rounded-[10px] border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-900">Invitation ready</p>
            <p className="mt-1 text-sm text-emerald-800">Share this link only with the invited employee.</p>
            <div className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row">
              <input readOnly value={invitationLink} className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700" />
              <Button type="button" variant="primary" onClick={() => void navigator.clipboard?.writeText(invitationLink)}>Copy link</Button>
            </div>
          </div>
        ) : (
          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              onInvite({ email, role, workspaceId, proposedDepartment: department || undefined, proposedTeamId: teamId || undefined });
            }}
          >
            <label className="block text-sm font-medium text-slate-700">Employee email
              <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-slate-950 outline-none focus:border-[#155EEF]" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">Role
                <select value={role} onChange={(event) => setRole(event.target.value as typeof role)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-slate-950 outline-none focus:border-[#155EEF]">
                  {(["OWNER", "ADMIN", "RFP_MANAGER", "CONTRIBUTOR", "REVIEWER", "SME", "VIEWER"] as const).map((value) => <option key={value} value={value}>{formatRole(value)}</option>)}
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
            {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={pending || !workspaceId}>{pending ? "Creating..." : "Create invitation"}</Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
  actionLabel,
  actionHref,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">{eyebrow}</p>
          <h2 className="mt-2 text-[19px] font-semibold leading-[1.05] tracking-tight text-slate-950">{title}</h2>
          {description ? <p className="mt-2 max-w-3xl text-[13px] leading-6 text-slate-600">{description}</p> : null}
        </div>
      {actionLabel && actionHref ? (
        <Link href={actionHref} className="inline-flex items-center gap-1 self-start pt-0.5 text-[13px] font-semibold text-[#155EEF]">
          {actionLabel}
          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}

function SummaryPanel({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
      <p className="text-[13px] font-semibold text-slate-900">{title}</p>
      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-3">
            <span className="text-[13px] text-slate-500">{row.label}</span>
            <span className="text-right text-[13px] font-medium text-slate-900">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-[13px] font-medium text-slate-900">{value}</p>
    </div>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-[24px] font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-[13px] leading-6 text-slate-600">{detail}</p>
    </div>
  );
}

function MiniMetric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">{label}</span>
      </div>
      <p className="mt-1 text-[17px] font-semibold tracking-tight text-slate-950">{value}</p>
    </div>
  );
}

function StatusBar({
  label,
  value,
  tone,
  total,
}: {
  label: string;
  value: number;
  tone: "success" | "warning" | "neutral";
  total: number;
}) {
  const width = total > 0 ? Math.max(8, Math.round((value / total) * 100)) : 0;
  const palette =
    tone === "success" ? "bg-emerald-500" : tone === "warning" ? "bg-amber-500" : "bg-slate-400";
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold text-slate-950">{formatCount(value)}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-slate-200">
        <div className={`h-2 rounded-full ${palette}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function UsageRow({ label, value, progress }: { label: string; value: string; progress: number }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold text-slate-950">{value}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-slate-200">
        <div className="h-2 rounded-full bg-[#155EEF]" style={{ width: `${Math.min(100, Math.max(8, progress))}%` }} />
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-slate-200 bg-white px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-[13px] font-medium text-slate-900">{value}</p>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-[#EFF5FF] text-[12px] font-semibold text-[#155EEF]">
      {initials(name)}
    </div>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  return (
    <div className="rounded-[8px] border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-slate-950">{item.summary || item.label}</p>
          <p className="mt-1 text-[12px] text-slate-500">
            {item.actorLabel || "System"}
            {item.kind ? ` · ${item.kind.replace(/_/g, " ")}` : ""}
          </p>
        </div>
        <span className="whitespace-nowrap text-[11px] text-slate-400">{relativeTime(item.createdAt)}</span>
      </div>
    </div>
  );
}

function AuditRow({
  audit,
  workspaces,
}: {
  audit: {
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    workspaceId: string | null;
    actorType: string;
    createdAt: string;
  };
  workspaces: Array<{ id: string; name: string }>;
}) {
  return (
    <div className="rounded-[8px] border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-slate-950">{formatStatus(audit.action)}</p>
          <p className="mt-1 text-[12px] text-slate-500">
            {audit.entityType}
            {audit.workspaceId ? ` · ${workspaceLabel(audit.workspaceId, workspaces)}` : ""}
          </p>
        </div>
        <span className="whitespace-nowrap text-[11px] text-slate-400">{relativeTime(audit.createdAt)}</span>
      </div>
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th className="px-4 py-3 font-semibold">{children}</th>;
}

function Td({ children }: { children: ReactNode }) {
  return <td className="border-t border-slate-200 px-4 align-top">{children}</td>;
}

function EmptyNotice({ title, description, compact = false }: { title: string; description: string; compact?: boolean }) {
  return (
    <div className={compact ? "py-2" : "mt-4"}>
      <RfpEmptyState title={title} description={description} />
    </div>
  );
}

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  const normalized = status.toLowerCase();
  if (normalized === "active" || normalized === "approved" || normalized === "connected") return "success";
  if (normalized === "pending" || normalized === "invited" || normalized === "review") return "warning";
  if (normalized === "removed" || normalized === "suspended" || normalized === "archived" || normalized === "expired") return "danger";
  return "neutral";
}

function roleTone(role: string): "success" | "warning" | "danger" | "neutral" {
  const normalized = role.toUpperCase();
  if (normalized === "OWNER") return "danger";
  if (normalized === "ADMIN") return "warning";
  if (normalized === "RFP_MANAGER") return "success";
  return "neutral";
}

function formatRole(role: string) {
  return role.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatStatus(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function relativeTime(value: string | null | undefined) {
  if (!value) return "Not set";
  const deltaMinutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (deltaMinutes < 1) return "Just now";
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  const hours = Math.round(deltaMinutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const [first = "AN", second = ""] = parts;
  if (parts.length <= 1) return first.slice(0, 2).toUpperCase();
  return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
}

function workspaceLabel(workspaceId: string | null, workspaces: Array<{ id: string; name: string }>) {
  if (!workspaceId) return "All workspaces";
  return workspaces.find((workspace) => workspace.id === workspaceId)?.name ?? workspaceId;
}

function jumpTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}
