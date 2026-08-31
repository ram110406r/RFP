"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useQueries } from "@tanstack/react-query";
import { ArrowRight, Building2, ChevronRight, FileText, LayoutGrid, ShieldCheck, Users } from "lucide-react";

import { AppShell } from "../../components/app-shell";
import { useFirebaseSession } from "../../components/firebase-auth-gate";
import { RfpEmptyState, RfpStatusBadge } from "../../components/rfp-foundation";
import {
  fetchTeamMembers,
  fetchWorkspaceMembers,
} from "../../lib/api";
import {
  useActivities,
  useAudits,
  useDashboardSummary,
  useOrganizationCurrent,
  useOrganizationInvitations,
  useOrganizationMembers,
  useRoles,
  useTeams,
  useWorkspaces,
} from "../../lib/queries";
import type { ActivityItem } from "../../lib/models";

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
  const session = useFirebaseSession();
  const currentQuery = useOrganizationCurrent();
  const membersQuery = useOrganizationMembers();
  const invitationsQuery = useOrganizationInvitations();
  const rolesQuery = useRoles();
  const teamsQuery = useTeams();
  const workspacesQuery = useWorkspaces();
  const dashboardQuery = useDashboardSummary(6);
  const activitiesQuery = useActivities();
  const auditsQuery = useAudits();

  const organization = currentQuery.data ?? null;
  const members = membersQuery.data?.members ?? [];
  const invitations = invitationsQuery.data?.invitations ?? [];
  const roles = rolesQuery.data?.items ?? [];
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
    loading: workspaceMemberQueries[index]?.isLoading ?? false,
    error: workspaceMemberQueries[index]?.isError ?? false,
  }));

  const teamRows = teams.map((team, index) => ({
    team,
    memberCount: teamMemberQueries[index]?.data?.items.length ?? null,
    loading: teamMemberQueries[index]?.isLoading ?? false,
    error: teamMemberQueries[index]?.isError ?? false,
  }));
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["id"]>("overview");

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
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-[29px] font-semibold tracking-tight text-slate-950">{orgName}</h1>
                <RfpStatusBadge tone={statusTone(orgStatus)}>{formatStatus(orgStatus)}</RfpStatusBadge>
              </div>
              <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-600">
                Manage your workspace, people, roles, and access from one organization control plane.
              </p>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <Link href="/settings" className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-800 shadow-sm">
                Edit Organization
                <ChevronRight className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={() => jumpTo("members")}
                className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-slate-950 px-4 text-[13px] font-semibold text-white shadow-sm"
              >
                Invite Members
                <Users className="h-4 w-4" />
              </button>
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

        <nav className="flex gap-2 overflow-x-auto border-b border-slate-200 pb-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-selected={activeTab === tab.id}
              className={[
                "whitespace-nowrap border-b-2 px-1 pb-2 text-[13px] font-semibold transition",
                activeTab === tab.id
                  ? "border-[#155EEF] text-[#155EEF]"
                  : "border-transparent text-slate-700 hover:text-slate-950",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </nav>

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
                  <div className="overflow-x-auto">
                    <table className="min-w-[860px] w-full border-separate border-spacing-0 text-left">
                      <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                        <tr>
                          <Th>Member</Th>
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
                                <div>
                                  <p className="text-[13px] font-semibold text-slate-950">{member.name}</p>
                                  <p className="text-[12px] text-slate-500">{member.email}</p>
                                </div>
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
              <SectionHeader eyebrow="Teams" title="Team overview" description="Team membership is resolved from the team endpoints and live workspace links." />

              {teamsQuery.isError ? (
                <EmptyNotice title="Team data unavailable" description="You do not have permission to list teams, or the service is temporarily unavailable." />
              ) : teamRows.length > 0 ? (
                <div className="mt-4 overflow-hidden rounded-[10px] border border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="min-w-[820px] w-full border-separate border-spacing-0 text-left">
                      <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                        <tr>
                          <Th>Team</Th>
                          <Th>Workspace</Th>
                          <Th>Members</Th>
                          <Th>Status</Th>
                          <Th>Updated</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {teamRows.map(({ team, memberCount, loading, error }) => (
                          <tr key={team.id} className="bg-white align-top">
                            <Td>
                              <div className="py-3">
                                <p className="text-[13px] font-semibold text-slate-950">{team.name}</p>
                                <p className="mt-1 text-[12px] text-slate-500">{team.description || "No description"}</p>
                              </div>
                            </Td>
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
              <SectionHeader eyebrow="Roles" title="Roles and permissions" description="Role definitions, assignment totals, and the permission catalog are pulled from the live role API." />

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
                        <RfpStatusBadge tone={role.isSystem ? "neutral" : "success"}>{role.isSystem ? "System" : "Custom"}</RfpStatusBadge>
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
              <SectionHeader eyebrow="Workspaces" title="Workspace inventory" description="Workspace rows are combined with live membership counts from each workspace endpoint." />

              {workspacesQuery.isError ? (
                <EmptyNotice title="Workspace data unavailable" description="You do not have permission to list workspaces, or the service is temporarily unavailable." />
              ) : workspaceRows.length > 0 ? (
                <div className="mt-4 overflow-hidden rounded-[10px] border border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="min-w-[760px] w-full border-separate border-spacing-0 text-left">
                      <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                        <tr>
                          <Th>Workspace</Th>
                          <Th>Slug</Th>
                          <Th>Members</Th>
                          <Th>Status</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {workspaceRows.map(({ workspace, memberCount, loading, error }) => (
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
                                <p className="text-[13px] font-semibold text-slate-950">{loading ? "Loading..." : error ? "Unavailable" : formatCount(memberCount ?? 0)}</p>
                                <p className="text-[12px] text-slate-500">Workspace members</p>
                              </div>
                            </Td>
                            <Td><div className="py-3"><RfpStatusBadge tone={workspace.status === "active" ? "success" : "neutral"}>{formatStatus(workspace.status)}</RfpStatusBadge></div></Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
                    <Link href="/settings" className="inline-flex h-9 items-center justify-center rounded-[8px] bg-slate-950 px-4 text-[13px] font-semibold text-white shadow-sm">
                      Open settings
                    </Link>
                    <Link href="/profile" className="inline-flex h-9 items-center justify-center rounded-[8px] border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-800 shadow-sm">
                      View profile
                    </Link>
                    <button
                      type="button"
                      onClick={() => jumpTo("audits")}
                      className="inline-flex h-9 items-center justify-center rounded-[8px] border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-800 shadow-sm"
                    >
                      Review audit logs
                    </button>
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
    </AppShell>
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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">{eyebrow}</p>
        <h2 className="mt-2 text-[19px] font-semibold tracking-tight text-slate-950">{title}</h2>
        {description ? <p className="mt-2 max-w-3xl text-[13px] leading-6 text-slate-600">{description}</p> : null}
      </div>
      {actionLabel && actionHref ? (
        <Link href={actionHref} className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#155EEF]">
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
