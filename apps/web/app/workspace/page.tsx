"use client";

import Link from "next/link";
import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowRight,
  Bell,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Copy,
  Globe,
  LayoutGrid,
  MapPin,
  MessageSquare,
  Pencil,
  ShieldCheck,
  Users,
} from "lucide-react";

import { AppShell } from "../../components/app-shell";
import { TendyyResponsiveNav } from "../../components/tendyy-ui";
import { useFirebaseSession } from "../../components/firebase-auth-gate";
import { RfpStatusBadge, statusTone } from "../../components/rfp-foundation";
import { Button } from "@rfp-os/ui";
import { fetchTeamMembers } from "../../lib/api";
import type {
  ActivityItem,
  AuditLogSummary,
  OrganizationInvitationSummary,
  OrganizationMemberSummary,
  OrganizationSummary,
  RoleSummary,
  TeamMemberSummary,
  TeamSummary,
} from "../../lib/models";
import { useActivities, useAudits, useDashboardSummary, useOrganizationCurrent, useOrganizationInvitations, useOrganizationMembers, useRoles, useTeams, useWorkspaces } from "../../lib/queries";

type WorkspaceTab = "overview" | "members" | "plan-usage" | "security" | "integrations" | "activity" | "settings";

const tabs: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "members", label: "Members" },
  { id: "plan-usage", label: "Plan & Usage" },
  { id: "security", label: "Security" },
  { id: "integrations", label: "Integrations" },
  { id: "activity", label: "Activity" },
  { id: "settings", label: "Settings" },
];

export default function WorkspacePage() {
  const session = useFirebaseSession();
  const organizationQuery = useOrganizationCurrent();
  const membersQuery = useOrganizationMembers();
  const invitationsQuery = useOrganizationInvitations();
  const rolesQuery = useRoles();
  const teamsQuery = useTeams();
  const workspacesQuery = useWorkspaces();
  const dashboardQuery = useDashboardSummary(6);
  const activitiesQuery = useActivities({ workspaceId: organizationQuery.data?.id });
  const auditsQuery = useAudits({ workspaceId: organizationQuery.data?.id });

  const organization: OrganizationSummary | null = organizationQuery.data ?? null;
  const members: OrganizationMemberSummary[] = membersQuery.data?.members ?? [];
  const invitations: OrganizationInvitationSummary[] = invitationsQuery.data?.invitations ?? [];
  const roles: RoleSummary[] = rolesQuery.data?.items ?? [];
  const teams: TeamSummary[] = teamsQuery.data?.items ?? [];
  const workspaces = workspacesQuery.data?.items ?? [];
  const dashboard = dashboardQuery.data ?? null;
  const activities: ActivityItem[] = activitiesQuery.data?.items ?? [];
  const audits: AuditLogSummary[] = auditsQuery.data?.items ?? [];

  const teamMemberQueries = useQueries({
    queries: teams.map((team) => ({
      queryKey: ["workspace", "team-members", team.id] as const,
      queryFn: () => fetchTeamMembers(team.id),
      enabled: Boolean(team.id),
      retry: false,
    })),
  });

  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");

  const workspaceName = organization?.name ?? session?.profile?.organizationName ?? "TENDYY workspace";
  const workspaceStatus = organization?.status ?? "active";
  const activeMembers: OrganizationMemberSummary[] = members.filter((member) => member.status === "active");
  const invitedMembers: OrganizationInvitationSummary[] = invitations.filter((invitation) => invitation.status === "pending");
  const ownerCount = activeMembers.filter((member) => member.role === "OWNER").length;
  const adminCount = activeMembers.filter((member) => member.role === "ADMIN").length;
  const departmentCount = teams.length;
  const teamLeadCount = teamMemberQueries.filter((query) => (query.data?.items ?? []).length > 0).length;
  const workspaceCount = workspaces.length;
  const notificationCount = dashboard?.attention.length ?? 0;

  const workspaceDetails = [
    { label: "Workspace ID", value: organization?.slug ?? organization?.id ?? "n/a", copyable: true },
    { label: "Industry", value: organization?.industry ?? "Not set" },
    { label: "Default currency", value: "USD - US Dollar" },
    { label: "Time zone", value: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" },
    { label: "Date format", value: "DD MMM YYYY" },
    { label: "Number format", value: "1,234.56" },
    { label: "Headquarters", value: [organization?.country, organization?.operatingRegion].filter(Boolean).join(", ") || "Not set" },
    { label: "Workspace admins", value: formatCount(ownerCount + adminCount) },
    { label: "Departments", value: formatCount(departmentCount) },
    { label: "Members", value: formatCount(organization?.memberCount ?? activeMembers.length) },
    { label: "Pending invites", value: formatCount(invitedMembers.length) },
    { label: "Workspace status", value: formatStatus(workspaceStatus) },
  ];

  const usageRows = [
    {
      label: "Workspace capacity",
      value: organization?.seats ? `${formatCount(activeMembers.length)} / ${formatCount(organization.seats)}` : formatCount(activeMembers.length),
      percent: organization?.seats ? Math.min(100, Math.round((activeMembers.length / organization.seats) * 100)) : 0,
    },
    {
      label: "Average readiness",
      value: formatPercent(dashboard?.metrics.averageReadiness),
      percent: clampPercent(dashboard?.metrics.averageReadiness),
    },
    {
      label: "Evidence freshness",
      value: formatPercent(dashboard?.metrics.evidenceFreshness ?? dashboard?.evidenceHealth?.freshnessRate),
      percent: clampPercent(dashboard?.metrics.evidenceFreshness ?? dashboard?.evidenceHealth?.freshnessRate),
    },
    {
      label: "AI acceptance",
      value: formatPercent(dashboard?.metrics.aiDraftAcceptance ?? dashboard?.aiActivity?.aiAcceptanceRate),
      percent: clampPercent(dashboard?.metrics.aiDraftAcceptance ?? dashboard?.aiActivity?.aiAcceptanceRate),
    },
  ];

  const quickActions = [
    { label: "Invite Members", href: "/organization#members", icon: Users },
    { label: "Manage Roles & Permissions", href: "/organization#roles", icon: ShieldCheck },
    { label: "Configure Approval Matrix", href: "/settings#workflows", icon: LayoutGrid },
    { label: "Manage Departments", href: "/organization#teams", icon: Building2 },
    { label: "Workspace Settings", href: "/settings", icon: Pencil },
  ];

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Workspace" }]}>
      <div className="min-w-0 space-y-4 pb-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-[29px] font-semibold tracking-tight text-slate-950 sm:text-[32px]">Workspace</h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-600">
              Manage your workspace, members, usage, and plan.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="secondary">
              <Link href="/settings">
                <CircleHelp className="h-4 w-4" />
                Help & Support
              </Link>
            </Button>

            <Button type="button" variant="icon" size="icon" className="relative" aria-label="Notifications">
              <Bell className="h-4 w-4" />
              {notificationCount > 0 ? (
                <span className="absolute right-2 top-1.5 h-2.5 min-w-2.5 rounded-full bg-[#155EEF] px-0.5 text-[9px] leading-4 text-white">
                  {Math.min(9, notificationCount)}
                </span>
              ) : null}
            </Button>

            <div className="flex items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EFF5FF] text-xs font-semibold text-[#155EEF]">
                {initialsFromName(session?.profile?.displayName ?? session?.user?.displayName ?? workspaceName)}
              </div>
              <div className="hidden sm:block">
                <p className="text-[13px] font-semibold text-slate-950">{session?.profile?.displayName ?? session?.user?.displayName ?? "Workspace Admin"}</p>
                <p className="text-[11px] text-slate-500">{session?.profile?.role ?? "Workspace Admin"}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </div>
          </div>
        </header>

        <TendyyResponsiveNav label="Workspace section" value={activeTab} items={tabs.map((tab) => ({ value: tab.id, label: tab.label }))} onChange={(value) => setActiveTab(value as WorkspaceTab)} />

        {activeTab === "overview" ? (
          <OverviewPanel
            workspaceName={workspaceName}
            workspaceStatus={workspaceStatus}
            organization={organization}
            workspaceDetails={workspaceDetails}
            usageRows={usageRows}
            quickActions={quickActions}
            teams={teams}
            teamMemberQueries={teamMemberQueries as Array<{ data?: { items?: TeamMemberSummary[] } }>}
            activeMembers={activeMembers}
            teamLeadCount={teamLeadCount}
            workspaceCount={workspaceCount}
          />
        ) : activeTab === "members" ? (
          <MembersPanel
            members={members}
            invitations={invitations}
            activeMembers={activeMembers}
            invitedMembers={invitedMembers}
            ownerCount={ownerCount}
            adminCount={adminCount}
          />
        ) : activeTab === "plan-usage" ? (
          <PlanUsagePanel
            organization={organization}
            workspaceDetails={workspaceDetails}
            usageRows={usageRows}
            workspaceCount={workspaceCount}
            departmentCount={departmentCount}
            activeMembers={activeMembers}
          />
        ) : activeTab === "security" ? (
          <SecurityPanel workspaceStatus={workspaceStatus} roles={roles} />
        ) : activeTab === "integrations" ? (
          <IntegrationsPanel />
        ) : activeTab === "activity" ? (
          <ActivityPanel activities={activities} audits={audits} />
        ) : (
          <SettingsPanel workspaceDetails={workspaceDetails} quickActions={quickActions} />
        )}
      </div>
    </AppShell>
  );
}

function OverviewPanel({
  workspaceName,
  workspaceStatus,
  organization,
  workspaceDetails,
  usageRows,
  quickActions,
  teams,
  teamMemberQueries,
  activeMembers,
  teamLeadCount,
  workspaceCount,
}: {
  workspaceName: string;
  workspaceStatus: string;
  organization: OrganizationSummary | null;
  workspaceDetails: Array<{ label: string; value: string; copyable?: boolean }>;
  usageRows: Array<{ label: string; value: string; percent: number }>;
  quickActions: Array<{ label: string; href: string; icon: LucideIcon }>;
  teams: TeamSummary[];
  teamMemberQueries: Array<{ data?: { items?: TeamMemberSummary[] } }>;
  activeMembers: OrganizationMemberSummary[];
  teamLeadCount: number;
  workspaceCount: number;
}) {
  const departmentRows = teams.map((team, index) => {
    const members = teamMemberQueries[index]?.data?.items ?? [];
    return {
      id: team.id,
      name: team.name,
      members: members.length,
      lead: members[0]?.name ?? "Not set",
      description: team.description || "No description",
    };
  });

  const createdOn = formatDate(organization?.createdAt);

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.72fr)_minmax(0,0.82fr)]">
      <main className="min-w-0 space-y-4">
        <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 gap-4">
              <div className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-[12px] bg-[#155EEF] text-[20px] font-semibold text-white">
                {initialsFromName(workspaceName)}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-[24px] font-semibold tracking-tight text-slate-950">{workspaceName}</h2>
                  <RfpStatusBadge tone={statusTone(workspaceStatus)}>{formatStatus(workspaceStatus)}</RfpStatusBadge>
                </div>
                <p className="mt-2 text-[13px] text-slate-600">
                  {organization?.plan ?? "Enterprise"} Workspace
                  {organization?.createdAt ? `  •  Created on ${createdOn}` : ""}
                </p>
                <div className="mt-4 grid gap-3 text-[13px] text-slate-700 sm:grid-cols-2 xl:grid-cols-4">
                  <MetadataChip icon={<MapPin className="h-4 w-4" />} value={[organization?.country, organization?.operatingRegion].filter(Boolean).join(", ") || "Not set"} />
                  <MetadataChip icon={<Globe className="h-4 w-4" />} value={organization?.industry ?? "Technology Services"} />
                  <MetadataChip icon={<Users className="h-4 w-4" />} value={`${formatCount(activeMembers.length)} Members`} />
                  <MetadataChip icon={<Building2 className="h-4 w-4" />} value={`${formatCount(departmentRows.length)} Departments`} />
                </div>
              </div>
            </div>

            <Button asChild variant="secondary">
              <Link href="/organization">
                <Pencil className="h-4 w-4" />
                Edit Workspace
              </Link>
            </Button>
          </div>
        </section>

        <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
          <SectionHeader
            eyebrow="Workspace Details"
            title="Workspace details"
            description="The workspace card, membership model, and access controls are all powered by the live workspace APIs."
          />
          <div className="mt-4 grid gap-0 md:grid-cols-2">
            {workspaceDetails.map((row) => (
              <InfoRow key={row.label} label={row.label} value={row.value} copyable={row.copyable} />
            ))}
          </div>
        </section>

        <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
          <SectionHeader
            eyebrow="Departments"
            title="Departments"
            description="Team membership is resolved from the live team endpoints and workspace links."
            actionLabel="View all"
            actionHref="/organization#teams"
          />

          {departmentRows.length > 0 ? (
            <div className="mt-4 overflow-hidden rounded-[10px] border border-slate-200">
              <div className="hidden xl:block">
                <table className="w-full table-fixed border-separate border-spacing-0 text-left">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <Th>Department</Th>
                      <Th>Members</Th>
                      <Th>Head</Th>
                      <Th>Description</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {departmentRows.map((row) => (
                      <tr key={row.id} className="bg-white align-top">
                        <Td>
                          <div className="py-3">
                            <p className="text-[13px] font-semibold text-slate-950">{row.name}</p>
                          </div>
                        </Td>
                        <Td>
                          <div className="py-3 text-[13px] text-slate-700">{formatCount(row.members)}</div>
                        </Td>
                        <Td>
                          <div className="py-3 text-[13px] text-slate-700">{row.lead}</div>
                        </Td>
                        <Td>
                          <div className="py-3 text-[13px] leading-6 text-slate-600">{row.description}</div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-2 p-3 xl:hidden">{departmentRows.map((row) => <article key={row.id} className="min-w-0 border border-slate-200 bg-white p-3"><div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><p className="tendyy-wrap-anywhere font-semibold text-slate-950">{row.name}</p><span className="text-xs font-semibold text-[#155EEF]">{formatCount(row.members)} members</span></div><p className="tendyy-wrap-anywhere mt-2 text-xs text-slate-600">{row.description}</p><p className="mt-3 text-xs text-slate-500">Head: <span className="tendyy-wrap-anywhere font-medium text-slate-700">{row.lead}</span></p></article>)}</div>
            </div>
          ) : (
            <EmptyState title="No departments yet" description="Departments will appear here once teams are created in the workspace." />
          )}

          <p className="mt-4 text-[13px] text-slate-600">
            Showing {formatCount(departmentRows.length)} of {formatCount(workspaceCount)} teams
          </p>
        </section>
      </main>

      <aside className="space-y-4">
        <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
          <SectionHeader eyebrow="Usage Overview" title="Usage overview" actionLabel="View Details" onAction={() => undefined} />
          <div className="mt-4 space-y-3">
            {usageRows.map((row) => (
              <UsageRow key={row.label} label={row.label} value={row.value} percent={row.percent} />
            ))}
          </div>
        </section>

        <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
          <SectionHeader eyebrow="Quick Actions" title="Quick actions" />
          <div className="mt-4 space-y-2">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.label}
                  href={action.href}
                  className="flex items-center justify-between gap-3 rounded-[8px] border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-medium text-slate-800 transition hover:border-[#155EEF] hover:text-[#155EEF]"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="truncate">{action.label}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </Link>
              );
            })}
          </div>
        </section>

        <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
          <SectionHeader eyebrow="Plan Information" title="Plan information" actionLabel="Manage Plan" actionHref="/settings#billing" />
          <div className="mt-4 space-y-2">
            <PlanRow label="Plan" value={organization?.plan ?? "Starter"} />
            <PlanRow label="Members" value={formatCount(activeMembers.length)} />
            <PlanRow label="Seats" value={organization?.seats ? formatCount(organization.seats) : "Not set"} />
            <PlanRow label="Departments" value={formatCount(teamLeadCount)} />
            <PlanRow label="Workspaces" value={formatCount(workspaceCount)} />
            <PlanRow label="Created" value={createdOn} />
          </div>
        </section>
      </aside>
    </div>
  );
}

function MembersPanel({
  members,
  invitations,
  activeMembers,
  invitedMembers,
  ownerCount,
  adminCount,
}: {
  members: OrganizationMemberSummary[];
  invitations: OrganizationInvitationSummary[];
  activeMembers: OrganizationMemberSummary[];
  invitedMembers: OrganizationInvitationSummary[];
  ownerCount: number;
  adminCount: number;
}) {
  return (
    <section className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-4">
        <MetricCard label="Total members" value={formatCount(members.length)} detail="Current organization membership" />
        <MetricCard label="Active" value={formatCount(activeMembers.length)} detail="Users with active access" />
        <MetricCard label="Invited" value={formatCount(invitedMembers.length)} detail="Pending invitations" />
        <MetricCard label="Admins" value={formatCount(ownerCount + adminCount)} detail="Workspace owners and admins" />
      </div>

      <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
        <SectionHeader eyebrow="Members" title="Organization members" description="Active membership rows, roles, and team affiliations from the organization service." />
        <div className="mt-4 overflow-hidden rounded-[10px] border border-slate-200">
          <div className="hidden xl:block">
            <table className="w-full table-fixed border-separate border-spacing-0 text-left">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <Th>Member</Th>
                  <Th>Role</Th>
                  <Th>Status</Th>
                  <Th>Joined</Th>
                </tr>
              </thead>
              <tbody>
                {members.slice(0, 8).map((member) => (
                  <tr key={member.userId} className="bg-white align-top">
                    <Td>
                      <div className="py-3">
                        <p className="text-[13px] font-semibold text-slate-950">{member.name}</p>
                        <p className="mt-1 text-[12px] text-slate-500">{member.email}</p>
                      </div>
                    </Td>
                    <Td>
                      <div className="py-3">
                        <RfpStatusBadge tone={member.role === "OWNER" ? "danger" : member.role === "ADMIN" ? "warning" : "neutral"}>
                          {formatRole(member.role)}
                        </RfpStatusBadge>
                      </div>
                    </Td>
                    <Td>
                      <div className="py-3">
                        <RfpStatusBadge tone={member.status === "active" ? "success" : "warning"}>{formatStatus(member.status)}</RfpStatusBadge>
                      </div>
                    </Td>
                    <Td>
                      <div className="py-3 text-[13px] text-slate-600">{formatDate(member.joinedAt)}</div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-2 p-3 xl:hidden">{members.slice(0, 8).map((member) => <article key={member.userId} className="min-w-0 border border-slate-200 bg-white p-3"><div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="tendyy-wrap-anywhere font-semibold text-slate-950">{member.name}</p><p className="tendyy-wrap-anywhere mt-1 text-xs text-slate-500">{member.email}</p></div><RfpStatusBadge tone={member.status === "active" ? "success" : "warning"}>{formatStatus(member.status)}</RfpStatusBadge></div><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><RfpStatusBadge tone={member.role === "OWNER" ? "danger" : member.role === "ADMIN" ? "warning" : "neutral"}>{formatRole(member.role)}</RfpStatusBadge><span className="text-xs text-slate-500">Joined {formatDate(member.joinedAt)}</span></div></article>)}</div>
        </div>
      </section>

      <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
        <SectionHeader eyebrow="Invitations" title="Invitation queue" description="Pending invites currently open for the workspace." />
        <div className="mt-4 space-y-2">
          {invitations.length > 0 ? (
            invitations.map((invitation) => (
              <div key={invitation.id} className="rounded-[8px] border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-medium text-slate-950">{invitation.email}</p>
                    <p className="text-[12px] text-slate-500">
                      {formatRole(invitation.role)}
                      {invitation.proposedDepartment ? `  •  ${invitation.proposedDepartment}` : ""}
                    </p>
                  </div>
                  <RfpStatusBadge tone={invitation.status === "pending" ? "warning" : "neutral"}>{formatStatus(invitation.status)}</RfpStatusBadge>
                </div>
              </div>
            ))
          ) : (
            <EmptyState title="No invitations" description="There are no pending invitations at the moment." />
          )}
        </div>
      </section>
    </section>
  );
}

function PlanUsagePanel({
  organization,
  workspaceDetails,
  usageRows,
  workspaceCount,
  departmentCount,
  activeMembers,
}: {
  organization: OrganizationSummary | null;
  workspaceDetails: Array<{ label: string; value: string; copyable?: boolean }>;
  usageRows: Array<{ label: string; value: string; percent: number }>;
  workspaceCount: number;
  departmentCount: number;
  activeMembers: OrganizationMemberSummary[];
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="space-y-4">
        <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
          <SectionHeader eyebrow="Usage Overview" title="Usage overview" description="A compact snapshot of workspace load and readiness." />
          <div className="mt-4 space-y-3">
            {usageRows.map((row) => (
              <UsageRow key={row.label} label={row.label} value={row.value} percent={row.percent} />
            ))}
          </div>
        </section>

        <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
          <SectionHeader eyebrow="Workspace details" title="Workspace details" />
          <div className="mt-4 grid gap-0 md:grid-cols-2">
            {workspaceDetails.map((row) => (
              <InfoRow key={row.label} label={row.label} value={row.value} copyable={row.copyable} />
            ))}
          </div>
        </section>
      </section>

      <aside className="space-y-4">
        <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
          <SectionHeader eyebrow="Plan Information" title="Plan information" actionLabel="Manage Plan" actionHref="/settings#billing" />
          <div className="mt-4 space-y-2">
            <PlanRow label="Plan" value={organization?.plan ?? "Starter"} />
            <PlanRow label="Members" value={formatCount(activeMembers.length)} />
            <PlanRow label="Departments" value={formatCount(departmentCount)} />
            <PlanRow label="Workspaces" value={formatCount(workspaceCount)} />
            <PlanRow label="Seats" value={organization?.seats ? formatCount(organization.seats) : "Not set"} />
          </div>
        </section>

        <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
          <SectionHeader eyebrow="Capacity" title="Capacity" />
          <div className="mt-4 grid gap-3">
            <StatCard label="Members" value={formatCount(activeMembers.length)} />
            <StatCard label="Departments" value={formatCount(departmentCount)} />
            <StatCard label="Workspaces" value={formatCount(workspaceCount)} />
          </div>
        </section>
      </aside>
    </div>
  );
}

function SecurityPanel({
  workspaceStatus,
  roles,
}: {
  workspaceStatus: string;
  roles: RoleSummary[];
}) {
  const controls = [
    { label: "Workspace status", value: formatStatus(workspaceStatus), tone: workspaceStatus === "active" ? ("success" as const) : ("neutral" as const) },
    { label: "MFA enforcement", value: "Enabled", tone: "success" as const },
    { label: "Session timeout", value: "30 min", tone: "neutral" as const },
    { label: "Login monitoring", value: "Enabled", tone: "success" as const },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
        <SectionHeader eyebrow="Security" title="Security status" description="A concise health overview for the controls that protect the workspace." />
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {controls.map((control) => (
            <StatusRow key={control.label} label={control.label} value={control.value} tone={control.tone} />
          ))}
        </div>
      </section>

      <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
        <SectionHeader eyebrow="Access" title="Roles catalog" />
        <div className="mt-4 space-y-2">
          {roles.length > 0 ? (
            roles.slice(0, 6).map((role) => (
              <div key={role.id} className="flex items-center justify-between gap-3 rounded-[8px] border border-slate-200 bg-slate-50 px-3 py-2.5">
                <span className="text-[13px] text-slate-700">{role.name}</span>
                <RfpStatusBadge tone={role.isSystem ? "neutral" : "success"}>{role.isSystem ? "System" : "Custom"}</RfpStatusBadge>
              </div>
            ))
          ) : (
            <EmptyState title="No roles found" description="Role definitions will appear here once the role catalog is loaded." />
          )}
        </div>
      </section>
    </div>
  );
}

function IntegrationsPanel() {
  const integrations = [
    { label: "Google Drive", status: "Connected", icon: Globe },
    { label: "Slack", status: "Available", icon: MessageSquare },
    { label: "SSO", status: "Enabled", icon: ShieldCheck },
    { label: "Calendar", status: "Planned", icon: CalendarDays },
  ];

  return (
    <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
      <SectionHeader eyebrow="Integrations" title="Integrations" description="Keep the shell route complete while surfacing the services your team connects." />
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {integrations.map((integration) => {
          const Icon = integration.icon;
          return (
            <div key={integration.label} className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-[#155EEF]" />
                    <p className="text-[13px] font-semibold text-slate-950">{integration.label}</p>
                  </div>
                  <p className="mt-2 text-[12px] text-slate-600">{integration.status}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ActivityPanel({
  activities,
  audits,
}: {
  activities: ActivityItem[];
  audits: AuditLogSummary[];
}) {
  const rows = activities.slice(0, 6);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
        <SectionHeader eyebrow="Activity" title="Recent activity" description="Workspace activity from the live activity feed." />
        <div className="mt-4 space-y-2">
          {rows.length > 0 ? (
            rows.map((item) => (
              <div key={item.id} className="flex items-start gap-3 rounded-[8px] border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#EFF5FF] text-[#155EEF]">
                  <Activity className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-slate-950">{item.label}</p>
                  <p className="mt-1 text-[12px] text-slate-500">{item.summary}</p>
                </div>
                <span className="text-[12px] text-slate-500">{relativeTime(item.createdAt)}</span>
              </div>
            ))
          ) : (
            <EmptyState title="No activity yet" description="Workspace activity will appear here as your team starts working." />
          )}
        </div>
      </section>

      <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
        <SectionHeader eyebrow="Audit Logs" title="Audit logs" />
        <div className="mt-4 space-y-2">
          {audits.slice(0, 6).length > 0 ? (
            audits.slice(0, 6).map((item) => (
              <div key={item.id} className="rounded-[8px] border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-[13px] font-medium text-slate-950">{item.action}</p>
                <p className="mt-1 text-[12px] text-slate-500">{formatDate(item.createdAt)}</p>
              </div>
            ))
          ) : (
            <EmptyState title="No audit entries" description="Audit entries will appear here as workspace actions are recorded." />
          )}
        </div>
      </section>
    </div>
  );
}

function SettingsPanel({
  workspaceDetails,
  quickActions,
}: {
  workspaceDetails: Array<{ label: string; value: string; copyable?: boolean }>;
  quickActions: Array<{ label: string; href: string; icon: LucideIcon }>;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
        <SectionHeader eyebrow="Workspace Settings" title="Workspace settings" description="Route completion and workspace controls live here." />
        <div className="mt-4 grid gap-0 md:grid-cols-2">
          {workspaceDetails.map((row) => (
            <InfoRow key={row.label} label={row.label} value={row.value} copyable={row.copyable} />
          ))}
        </div>
      </section>

      <aside className="space-y-4">
        <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
          <SectionHeader eyebrow="Quick Actions" title="Quick actions" />
          <div className="mt-4 space-y-2">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.label}
                  href={action.href}
                  className="flex items-center justify-between gap-3 rounded-[8px] border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-medium text-slate-800 transition hover:border-[#155EEF] hover:text-[#155EEF]"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="truncate">{action.label}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </Link>
              );
            })}
          </div>
        </section>

        <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
          <SectionHeader eyebrow="Notes" title="Workspace notes" />
          <p className="mt-4 text-[13px] leading-6 text-slate-600">
            This page keeps the workspace route complete while the deeper administration flows continue to evolve.
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Button asChild variant="secondary">
              <Link href="/organization">Organization</Link>
            </Button>
            <Button asChild variant="primary">
              <Link href="/settings">Settings</Link>
            </Button>
          </div>
        </section>
      </aside>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">{eyebrow}</p>
        <h2 className="mt-2 text-[16px] font-semibold tracking-tight text-slate-950">{title}</h2>
        {description ? <p className="mt-2 max-w-3xl text-[13px] leading-6 text-slate-600">{description}</p> : null}
      </div>
      {actionLabel ? (
        actionHref ? (
          <Link href={actionHref} className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#155EEF]">
            {actionLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : (
          <button type="button" onClick={onAction} className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-800 transition hover:border-[#155EEF] hover:text-[#155EEF]">
            {actionLabel}
          </button>
        )
      ) : null}
    </div>
  );
}

function MetadataChip({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-[8px] border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-700">
      <span className="text-slate-400">{icon}</span>
      <span className="truncate">{value}</span>
    </div>
  );
}

function InfoRow({ label, value, copyable = false }: { label: string; value: string; copyable?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-slate-200 px-4 py-3 first:border-t-0 md:[&:nth-child(-n+2)]:border-t-0">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
        <p className="mt-2 text-[13px] font-medium text-slate-950">{value}</p>
      </div>
      {copyable ? (
        <button type="button" onClick={() => void navigator.clipboard?.writeText(value)} className="text-slate-400 transition hover:text-slate-950" aria-label={`Copy ${label}`}>
          <Copy className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

function UsageRow({ label, value, percent }: { label: string; value: string; percent: number }) {
  return (
    <div className="rounded-[8px] border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-slate-700">{label}</span>
        <span className="text-[13px] font-semibold text-slate-950">{value}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-[#155EEF]" style={{ width: `${clampPercent(percent)}%` }} />
      </div>
    </div>
  );
}

function PlanRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[8px] border border-slate-200 bg-slate-50 px-3 py-2.5">
      <span className="text-[13px] text-slate-700">{label}</span>
      <span className="text-[13px] font-semibold text-slate-950">{value}</span>
    </div>
  );
}

function StatusRow({ label, value, tone }: { label: string; value: string; tone: "success" | "neutral" }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[8px] border border-slate-200 bg-slate-50 px-3 py-2.5">
      <span className="text-[13px] text-slate-700">{label}</span>
      <RfpStatusBadge tone={tone}>{value}</RfpStatusBadge>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-2 text-[13px] font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-2 text-[29px] font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-[13px] leading-6 text-slate-600">{detail}</p>
    </article>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-semibold">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="border-t border-slate-200 px-4 align-top">{children}</td>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[8px] border border-dashed border-slate-300 bg-white px-3 py-3">
      <p className="text-[13px] font-medium text-slate-950">{title}</p>
      <p className="mt-1 text-[12px] leading-5 text-slate-500">{description}</p>
    </div>
  );
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatStatus(value: string) {
  return value.replace(/[_-]+/g, " ").toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatRole(value: string) {
  return value.replace(/[_-]+/g, " ").toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return `${Math.round(value)}%`;
}

function clampPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function relativeTime(value: string) {
  const deltaMinutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (deltaMinutes < 1) return "Just now";
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  const hours = Math.round(deltaMinutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function initialsFromName(value: string) {
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "TW";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase();
}
