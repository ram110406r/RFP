"use client";

import Link from "next/link";
import { Button } from "@rfp-os/ui";

import { RfpStatusBadge } from "../../../components/rfp-foundation";
import type { ActivityItem, AuditLogSummary, OrganizationSummary, RoleSummary, WorkspaceSummary } from "../../../lib/models";
import { formatCount, formatDate, formatRole, formatStatus, jumpTo } from "./format";
import { ActivityRow, AuditRow, EmptyNotice, InfoRow, MetricCard, SectionHeader, StatusBar, SummaryPanel, TabPanel, UsageRow } from "./ui";

export interface SeatUsage {
  activeMembers: number;
  pendingInvitations: number;
  limit: number | null;
}

export function seatPercent(seats: SeatUsage) {
  if (!seats.limit) return 0;
  return Math.min(100, Math.round(((seats.activeMembers + seats.pendingInvitations) / seats.limit) * 100));
}

export function OverviewTab({
  active,
  organization,
  topDetails,
  seats,
  ownerCount,
  adminCount,
}: {
  active: boolean;
  organization: OrganizationSummary | null;
  topDetails: Array<{ label: string; value: string }>;
  seats: SeatUsage;
  ownerCount: number;
  adminCount: number;
}) {
  return (
    <TabPanel id="overview" active={active}>
      <SectionHeader eyebrow="Overview" title="Workspace structure" description="The organization card, membership model, and access controls are all powered by the live org APIs." />
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <SummaryPanel title="Organization details" rows={topDetails} />
        <SummaryPanel
          title="Access model"
          rows={[
            { label: "Active members", value: formatCount(seats.activeMembers) },
            { label: "Pending invitations", value: formatCount(seats.pendingInvitations) },
            { label: "Owners", value: formatCount(ownerCount) },
            { label: "Admins", value: formatCount(adminCount) },
          ]}
        />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <MetricCard label="Members" value={organization ? formatCount(organization.memberCount) : formatCount(seats.activeMembers)} detail="Current active organization members" />
        <MetricCard label="Invitations" value={formatCount(seats.pendingInvitations)} detail="Pending invitations, each holding a seat" />
        <MetricCard
          label="Seat usage"
          value={`${seatPercent(seats)}%`}
          detail={seats.limit ? `${formatCount(seats.activeMembers + seats.pendingInvitations)} of ${formatCount(seats.limit)} seats in use, counting pending invitations` : "Seat limit unavailable"}
        />
      </div>
    </TabPanel>
  );
}

export function RolesTab({ active, roles, loadError }: { active: boolean; roles: RoleSummary[]; loadError: boolean }) {
  return (
    <TabPanel id="roles" active={active}>
      <SectionHeader eyebrow="Roles" title="Fixed roles and permissions" description="The seven fixed organization roles are the access model. Custom role changes are disabled." />
      {loadError ? (
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
              <div className="mt-4 flex flex-wrap gap-2">
                {(role.permissionKeys ?? []).slice(0, 5).map((permission) => (
                  <span key={permission} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700">{permission}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyNotice title="No roles found" description="Roles will appear here once the role catalog is initialized." />
      )}
    </TabPanel>
  );
}

export function SettingsTab({ active, organization, orgStatus, orgDomain }: { active: boolean; organization: OrganizationSummary | null; orgStatus: string; orgDomain: string }) {
  return (
    <TabPanel id="settings" active={active}>
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
            <Button asChild variant="primary" className="w-full"><Link href="/settings">Open settings</Link></Button>
            <Button asChild variant="secondary" className="w-full"><Link href="/profile">View profile</Link></Button>
            <Button type="button" onClick={() => jumpTo("audits")} variant="secondary" className="w-full">Review audit logs</Button>
          </div>
        </div>
      </div>
    </TabPanel>
  );
}

export function AuditsTab({
  active,
  activity,
  activityError,
  audits,
  auditsError,
  workspaces,
}: {
  active: boolean;
  activity: ActivityItem[];
  activityError: boolean;
  audits: AuditLogSummary[];
  auditsError: boolean;
  workspaces: WorkspaceSummary[];
}) {
  return (
    <TabPanel id="audits" active={active}>
      <SectionHeader eyebrow="Audit Logs" title="Organization activity trail" description="Audit entries preserve the compliance record, while the activity feed keeps a human timeline." />
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
          <p className="text-[13px] font-semibold text-slate-900">Recent member activity</p>
          {activityError ? (
            <EmptyNotice title="Activity feed unavailable" description="Recent activity could not be loaded." compact />
          ) : activity.length > 0 ? (
            <div className="mt-3 space-y-2">{activity.map((item) => <ActivityRow key={item.id} item={item} />)}</div>
          ) : (
            <EmptyNotice title="No recent activity" description="Member activity will appear here after users start working in the organization." compact />
          )}
        </div>
        <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
          <p className="text-[13px] font-semibold text-slate-900">Recent audit entries</p>
          {auditsError ? (
            <EmptyNotice title="Audit trail unavailable" description="Audit logs could not be loaded." compact />
          ) : audits.length > 0 ? (
            <div className="mt-3 space-y-2">{audits.map((audit) => <AuditRow key={audit.id} audit={audit} workspaces={workspaces} />)}</div>
          ) : (
            <EmptyNotice title="No audit entries yet" description="Audit logs will appear once settings or member data changes." compact />
          )}
        </div>
      </div>
    </TabPanel>
  );
}

export function OrganizationSidebar({
  organization,
  seats,
  inactiveCount,
  roleDistribution,
  usage,
}: {
  organization: OrganizationSummary | null;
  seats: SeatUsage;
  inactiveCount: number;
  roleDistribution: Record<string, number>;
  usage: { activeRfps: number; workspaces: number; teams: number; knowledge: number };
}) {
  const statusCounts = [
    { label: "Active", value: seats.activeMembers, tone: "success" as const },
    { label: "Invited", value: seats.pendingInvitations, tone: "warning" as const },
    { label: "Inactive", value: inactiveCount, tone: "neutral" as const },
  ];
  const total = seats.activeMembers + seats.pendingInvitations + inactiveCount;
  return (
    <aside className="space-y-5 xl:sticky xl:top-5 xl:self-start">
      <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
        <SectionHeader eyebrow="Members Summary" title="Members summary" actionLabel="View all" actionHref="#members" />
        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-[29px] font-semibold tracking-tight text-slate-950">{formatCount(seats.activeMembers)}</p>
            <p className="text-[13px] text-slate-600">Total active members</p>
          </div>
          <div className="text-right text-[12px] text-slate-500">
            <p>{seats.limit ? `${formatCount(seats.activeMembers + seats.pendingInvitations)} / ${formatCount(seats.limit)} seats` : "Seat count unavailable"}</p>
            <p className="mt-1">Updated {formatDate(organization?.updatedAt)}</p>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
          <div className={`h-2 rounded-full ${seatPercent(seats) >= 100 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${seatPercent(seats)}%` }} />
        </div>
        <div className="mt-4 space-y-3">
          {statusCounts.map((item) => <StatusBar key={item.label} label={item.label} value={item.value} tone={item.tone} total={total} />)}
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
          <UsageRow label="Active RFPs" value={formatCount(usage.activeRfps)} progress={Math.min(100, usage.activeRfps * 10)} />
          <UsageRow label="Workspaces" value={formatCount(usage.workspaces)} progress={Math.min(100, usage.workspaces * 20)} />
          <UsageRow label="Teams" value={formatCount(usage.teams)} progress={Math.min(100, usage.teams * 15)} />
          <UsageRow label="Knowledge items" value={formatCount(usage.knowledge)} progress={Math.min(100, usage.knowledge / 2)} />
        </div>
      </section>
    </aside>
  );
}
