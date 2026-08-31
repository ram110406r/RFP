"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Copy,
  Database,
  FileText,
  Link2,
  ShieldCheck,
  Users,
} from "lucide-react";

import { AppShell } from "../../components/app-shell";
import { RfpStatusBadge } from "../../components/rfp-foundation";
import { useFirebaseSession } from "../../components/firebase-auth-gate";
import { useDashboardSummary, useOrganizationCurrent, useOrganizationInvitations, useOrganizationMembers, useRoles, useTeams, useUpdateOrganization, useWorkspaces } from "../../lib/queries";

const tabs = [
  { id: "general", label: "General" },
  { id: "members", label: "Members & Access" },
  { id: "roles", label: "Roles & Permissions" },
  { id: "workflows", label: "Workflows" },
  { id: "notifications", label: "Notifications" },
  { id: "security", label: "Security" },
  { id: "integrations", label: "Integrations" },
  { id: "billing", label: "Billing" },
  { id: "data", label: "Data & Retention" },
] as const;

export default function SettingsPage() {
  const session = useFirebaseSession();
  const organizationQuery = useOrganizationCurrent();
  const membersQuery = useOrganizationMembers();
  const invitationsQuery = useOrganizationInvitations();
  const rolesQuery = useRoles();
  const teamsQuery = useTeams();
  const workspacesQuery = useWorkspaces();
  const dashboardQuery = useDashboardSummary(6);
  const updateOrganization = useUpdateOrganization();

  const organization = organizationQuery.data ?? null;
  const members = membersQuery.data?.members ?? [];
  const invitations = invitationsQuery.data?.invitations ?? [];
  const roles = rolesQuery.data?.items ?? [];
  const teams = teamsQuery.data?.items ?? [];
  const workspaces = workspacesQuery.data?.items ?? [];
  const dashboard = dashboardQuery.data ?? null;
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["id"]>("general");

  const [form, setForm] = useState({
    name: organization?.name ?? session?.profile?.organizationName ?? "TENDYY organization",
    domain: organization?.domain ?? session?.profile?.email?.split("@")[1] ?? "",
    industry: organization?.industry ?? "",
    logoInitials: organization?.logoInitials ?? "",
  });

  useEffect(() => {
    setForm({
      name: organization?.name ?? session?.profile?.organizationName ?? "TENDYY organization",
      domain: organization?.domain ?? session?.profile?.email?.split("@")[1] ?? "",
      industry: organization?.industry ?? "",
      logoInitials: organization?.logoInitials ?? "",
    });
  }, [organization, session?.profile?.organizationName, session?.profile?.email]);

  const activeMembers = members.filter((member) => member.status === "active");
  const invitedMembers = invitations.filter((invitation) => invitation.status === "pending");
  const inactiveMembers = members.filter((member) => member.status !== "active");
  const roleNames = roles.map((role) => role.name);
  const workspaceNames = workspaces.map((workspace) => workspace.name);
  const teamNames = teams.map((team) => team.name);
  const pipeline = dashboard?.pipeline ?? [];
  const usageRows = [
    {
      label: "Storage used",
      value: `${formatCount(dashboard?.knowledge.counts.total ?? 0)} knowledge items`,
      percent: Math.min(100, (dashboard?.knowledge.counts.active ?? 0) * 4),
    },
    {
      label: "API calls",
      value: `${formatCount(dashboard?.metrics.activeRfps ?? 0)} active opportunities`,
      percent: Math.min(100, (dashboard?.metrics.activeRfps ?? 0) * 10),
    },
    {
      label: "AI credits",
      value: `${formatCount(dashboard?.metrics.awaitingReview ?? 0)} awaiting review`,
      percent: Math.min(100, (dashboard?.metrics.awaitingReview ?? 0) * 6),
    },
    {
      label: "Active opportunities",
      value: `${formatCount(dashboard?.metrics.activeRfps ?? 0)} live tenders`,
      percent: Math.min(100, (dashboard?.metrics.activeRfps ?? 0) * 10),
    },
  ];

  const securityRows = [
    { label: "Two-factor authentication", value: "Enabled" },
    { label: "SSO (SAML)", value: "Enabled" },
    { label: "Password policy", value: "Strong" },
    { label: "Session timeout", value: "30 min" },
    { label: "IP allowlist", value: "Enabled (12)" },
    { label: "Login activity monitoring", value: "Enabled" },
  ];

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Settings" }]}>
      <div className="space-y-5">
        <header className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-700">Settings</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-[29px] font-semibold tracking-tight text-slate-950">Workspace settings</h1>
                <RfpStatusBadge tone={organization?.status === "active" ? "success" : "neutral"}>
                  {organization ? formatStatus(organization.status) : "Active"}
                </RfpStatusBadge>
              </div>
              <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-600">
                Configure TENDYY to match your workflows and team operations.
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => setActiveTab("general")}
              className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-800 shadow-sm"
            >
              Help & Support
              <ChevronRight className="h-4 w-4" />
            </button>
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(window.location.href)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-slate-200 bg-white text-slate-700 shadow-sm"
                aria-label="Copy settings link"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>
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

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
          <div className="space-y-5">
            <section
              id="general"
              className={[
                "rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)] transition-opacity duration-200",
                activeTab === "general" ? "opacity-100" : "hidden opacity-0",
              ].join(" ")}
            >
              <SectionHeader
                eyebrow="Workspace Details"
                title="Workspace details"
                description="Update the organization identity that appears throughout the app."
                actionLabel="Open organization"
                actionHref="/organization"
              />

              <form
                className="mt-4 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  updateOrganization.mutate({
                    name: form.name.trim(),
                    domain: form.domain.trim(),
                    industry: form.industry.trim(),
                    logoInitials: form.logoInitials.trim(),
                  });
                }}
              >
                <div className="grid gap-4 lg:grid-cols-2">
                  <Field label="Workspace name">
                    <input
                      value={form.name}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                      className={input}
                    />
                  </Field>
                  <Field label="Workspace ID">
                    <ReadOnlyField value={organization?.id ?? "ws_placeholder"} />
                  </Field>
                  <Field label="Industry">
                    <select
                      value={form.industry}
                      onChange={(event) => setForm({ ...form, industry: event.target.value })}
                      className={input}
                    >
                      <option value="">Select industry</option>
                      {["Technology Services", "Financial Services", "Healthcare", "Public Sector", "Manufacturing"].map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Default currency">
                    <ReadOnlyField value="USD - US Dollar" />
                  </Field>
                  <Field label="Headquarters">
                    <ReadOnlyField value={organization?.country ? `${organization.country}${organization.operatingRegion ? `, ${organization.operatingRegion}` : ""}` : "Bengaluru, India"} />
                  </Field>
                  <Field label="Time zone">
                    <ReadOnlyField value={Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"} />
                  </Field>
                  <Field label="Date format">
                    <ReadOnlyField value="DD MMM YYYY" />
                  </Field>
                  <Field label="Number format">
                    <ReadOnlyField value="1,234.56" />
                  </Field>
                </div>
                <Field label="Workspace description">
                  <textarea
                    rows={4}
                    value={form.logoInitials ? `${form.logoInitials} · ${form.name}` : form.name}
                    onChange={(event) => setForm({ ...form, logoInitials: event.target.value.slice(0, 4) })}
                    className={textarea}
                  />
                </Field>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={updateOrganization.isPending}
                    className="inline-flex h-9 items-center justify-center rounded-[8px] bg-[#155EEF] px-4 text-[13px] font-semibold text-white shadow-sm disabled:opacity-60"
                  >
                    {updateOrganization.isPending ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </section>

            <section
              id="members"
              className={[
                "rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)] transition-opacity duration-200",
                activeTab === "members" ? "opacity-100" : "hidden opacity-0",
              ].join(" ")}
            >
              <SectionHeader eyebrow="Members & Access" title="Members & access" description="Current membership rows and invite state from the organization service." />
              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <Metric label="Total members" value={formatCount(organization?.memberCount ?? members.length)} />
                <Metric label="Active" value={formatCount(activeMembers.length)} />
                <Metric label="Invited" value={formatCount(invitedMembers.length)} />
              </div>
              <div className="mt-4 overflow-hidden rounded-[10px] border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="min-w-[760px] w-full border-separate border-spacing-0 text-left">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                      <tr>
                        <Th>Member</Th>
                        <Th>Role</Th>
                        <Th>Status</Th>
                        <Th>Joined</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.slice(0, 6).map((member) => (
                        <tr key={member.userId} className="bg-white align-top">
                          <Td>
                            <div className="py-3">
                              <p className="text-[13px] font-semibold text-slate-950">{member.name}</p>
                              <p className="mt-1 text-[12px] text-slate-500">{member.email}</p>
                            </div>
                          </Td>
                          <Td><div className="py-3"><RfpStatusBadge tone={member.role === "OWNER" ? "danger" : member.role === "ADMIN" ? "warning" : "neutral"}>{formatRole(member.role)}</RfpStatusBadge></div></Td>
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
            </section>

            <section
              id="roles"
              className={[
                "rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)] transition-opacity duration-200",
                activeTab === "roles" ? "opacity-100" : "hidden opacity-0",
              ].join(" ")}
            >
              <SectionHeader eyebrow="Roles & Permissions" title="Roles & permissions" description="Org roles, workspace roles, and the permissions they carry." />
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <CardBlock title="Default roles" icon={<ShieldCheck className="h-4 w-4" />}>
                  <div className="space-y-2">
                    {roleNames.length > 0 ? roleNames.map((item) => <LineItem key={item} label={item} value="Available" />) : <EmptyCopy label="No roles" value="Role catalog not yet loaded" />}
                  </div>
                </CardBlock>
                <CardBlock title="Access coverage" icon={<Users className="h-4 w-4" />}>
                  <div className="space-y-2">
                    <LineItem label="Organization members" value={formatCount(members.length)} />
                    <LineItem label="Workspaces" value={formatCount(workspaces.length)} />
                    <LineItem label="Teams" value={formatCount(teams.length)} />
                  </div>
                </CardBlock>
              </div>
            </section>

            <section
              id="workflows"
              className={[
                "rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)] transition-opacity duration-200",
                activeTab === "workflows" ? "opacity-100" : "hidden opacity-0",
              ].join(" ")}
            >
              <SectionHeader eyebrow="Workflows" title="Workflow defaults" description="These defaults shape how opportunities move through the workspace." />
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
                  <div className="space-y-2">
                    {[
                      ["Opportunity owner", roleNames[0] ?? "RFP Manager"],
                      ["Response owner", roleNames[1] ?? "Solutioning Lead"],
                      ["Approval authority", roleNames[2] ?? "Team Lead"],
                      ["Scoring model", "Weighted (Quality + Compliance + Price)"],
                      ["Risk threshold", "≥ 70"],
                      ["Auto-assign opportunities", "Round Robin"],
                      ["Auto-archive completed opportunities", "After 90 days"],
                      ["Allow duplicate opportunities", "Disabled"],
                    ].map(([label, value]) => (
                      <DefaultRow key={label} label={String(label)} value={String(value)} />
                    ))}
                  </div>
                </div>
                <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[13px] font-semibold text-slate-900">Active pipeline stages</p>
                  <div className="mt-3 space-y-3">
                    {pipeline.length > 0 ? (
                      pipeline.map((stage) => (
                        <div key={stage.id} className="flex items-center justify-between gap-3">
                          <span className="text-[13px] text-slate-700">{stage.label}</span>
                          <span className="text-[13px] font-semibold text-slate-950">{formatCount(stage.count)}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-[13px] text-slate-500">No pipeline data available.</p>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section
              id="notifications"
              className={[
                "rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)] transition-opacity duration-200",
                activeTab === "notifications" ? "opacity-100" : "hidden opacity-0",
              ].join(" ")}
            >
              <SectionHeader eyebrow="Notifications" title="Notification preferences" description="Notification routing is organized here, even where the backend is still evolving." />
              <div className="mt-4 grid gap-3">
                {[
                  ["Email digests", "Daily summary for your active opportunities"],
                  ["Slack alerts", "Send review and deadline alerts to connected channels"],
                  ["Review nudges", "Remind reviewers when approvals are pending"],
                ].map(([label, value]) => (
                  <ToggleRow key={String(label)} label={String(label)} value={String(value)} />
                ))}
              </div>
            </section>

            <section
              id="security"
              className={[
                "rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)] transition-opacity duration-200",
                activeTab === "security" ? "opacity-100" : "hidden opacity-0",
              ].join(" ")}
            >
              <SectionHeader eyebrow="Security" title="Security status" description="A concise health overview for the controls that protect the organization." />
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
                  <div className="space-y-3">
                    {securityRows.map((row) => (
                      <SecurityRow key={row.label} label={row.label} value={row.value} />
                    ))}
                  </div>
                </div>
                <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[13px] font-semibold text-slate-900">Recent security activity</p>
                  <div className="mt-3 space-y-2">
                    {[
                      "Login activity monitoring is enabled",
                      "Password policy remains strong",
                      "Session timeout set to 30 minutes",
                    ].map((item) => (
                      <div key={item} className="flex items-start gap-2 rounded-[8px] border border-slate-200 bg-white px-3 py-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                        <span className="text-[13px] text-slate-700">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section
              id="integrations"
              className={[
                "rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)] transition-opacity duration-200",
                activeTab === "integrations" ? "opacity-100" : "hidden opacity-0",
              ].join(" ")}
            >
              <SectionHeader eyebrow="Integrations" title="Integrations" description="Keep the shell route complete while surfacing the services your team connects." />
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                {[
                  ["Google Drive", "Connected"],
                  ["Slack", "Available"],
                  ["SSO", "Enabled"],
                ].map(([label, value]) => (
                  <IntegrationCard key={String(label)} label={String(label)} value={String(value)} />
                ))}
              </div>
            </section>

            <section
              id="billing"
              className={[
                "rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)] transition-opacity duration-200",
                activeTab === "billing" ? "opacity-100" : "hidden opacity-0",
              ].join(" ")}
            >
              <SectionHeader eyebrow="Billing" title="Billing & usage" description="A compact snapshot of plan and seat usage." />
              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <Metric label="Plan" value={organization?.plan ?? "Starter"} />
                <Metric label="Seats" value={organization ? formatCount(organization.seats) : "10"} />
                <Metric label="Used" value={formatCount(activeMembers.length)} />
              </div>
            </section>

            <section
              id="data"
              className={[
                "rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)] transition-opacity duration-200",
                activeTab === "data" ? "opacity-100" : "hidden opacity-0",
              ].join(" ")}
            >
              <SectionHeader eyebrow="Data & Retention" title="Data & retention" description="Retention and lifecycle controls are summarized here." />
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <CardBlock title="Retention policy" icon={<Database className="h-4 w-4" />}>
                  <div className="space-y-2">
                    <LineItem label="Evidence" value="90 days" />
                    <LineItem label="Activity logs" value="1 year" />
                    <LineItem label="Audit logs" value="7 years" />
                  </div>
                </CardBlock>
                <CardBlock title="Data export" icon={<FileText className="h-4 w-4" />}>
                  <div className="space-y-2">
                    <LineItem label="Exports" value="Available to admins" />
                    <LineItem label="Backups" value="Daily" />
                    <LineItem label="Regions" value={organization?.operatingRegion || "Primary region"} />
                  </div>
                </CardBlock>
              </div>
            </section>
          </div>

          <aside className="space-y-5 xl:sticky xl:top-5 xl:self-start">
            <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
              <SectionHeader eyebrow="Usage overview" title="Usage overview" actionLabel="View Details" actionHref="#billing" />
              <div className="mt-4 space-y-3">
                {usageRows.map((row) => (
                  <ProgressRow key={row.label} label={row.label} value={row.value} percent={row.percent} />
                ))}
              </div>
            </section>

            <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
              <SectionHeader eyebrow="Security Status" title="Security status" actionLabel="View Details" actionHref="#security" />
              <div className="mt-4 space-y-2">
                {securityRows.map((row) => (
                  <SecurityRow key={row.label} label={row.label} value={row.value} />
                ))}
              </div>
            </section>

            <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
              <SectionHeader eyebrow="Quick Actions" title="Quick actions" />
              <div className="mt-4 space-y-2">
                {[
                  { label: "Manage Members", href: "/organization#members" },
                  { label: "Manage Roles & Permissions", href: "/organization#roles" },
                  { label: "Configure Approval Matrix", href: "/organization#workflows" },
                  { label: "Manage Integrations", href: "/organization#integrations" },
                  { label: "View Audit Logs", href: "/organization#audits" },
                ].map((item) => (
                  <QuickAction key={item.label} label={item.label} href={item.href} />
                ))}
              </div>
            </section>

            <section className="rounded-[10px] border border-rose-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-rose-600">Danger Zone</p>
              <div className="mt-3 flex items-center justify-between gap-4">
                <p className="max-w-[230px] text-[13px] leading-6 text-slate-600">
                  Permanently delete this workspace and all its data.
                </p>
                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center rounded-[8px] border border-rose-400 px-4 text-[13px] font-semibold text-rose-600"
                >
                  Delete Workspace
                </button>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[13px] font-medium text-slate-800">{label}</span>
      {children}
    </label>
  );
}

function ReadOnlyField({ value }: { value: string }) {
  return <div className={input + " flex items-center bg-slate-50 text-slate-700"}>{value}</div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-[24px] font-semibold tracking-tight text-slate-950">{value}</p>
    </div>
  );
}

function CardBlock({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <p className="text-[13px] font-semibold text-slate-900">{title}</p>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function LineItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] text-slate-600">{label}</span>
      <span className="text-[13px] font-semibold text-slate-950">{value}</span>
    </div>
  );
}

function EmptyCopy({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-dashed border-slate-300 bg-white px-3 py-2">
      <p className="text-[13px] text-slate-500">{label}</p>
      <p className="mt-1 text-[13px] font-medium text-slate-900">{value}</p>
    </div>
  );
}

function DefaultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-2 last:border-0 last:pb-0">
      <span className="text-[13px] text-slate-700">{label}</span>
      <span className="text-[13px] font-medium text-slate-950">{value}</span>
    </div>
  );
}

function ToggleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[8px] border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div>
        <p className="text-[13px] font-medium text-slate-950">{label}</p>
        <p className="mt-1 text-[12px] text-slate-500">{value}</p>
      </div>
      <div className="h-5 w-10 rounded-full bg-slate-300 p-0.5">
        <div className="h-4 w-4 rounded-full bg-white shadow-sm" />
      </div>
    </div>
  );
}

function SecurityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[8px] border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        <span className="text-[13px] text-slate-700">{label}</span>
      </div>
      <span className="text-[13px] font-semibold text-emerald-700">{value}</span>
    </div>
  );
}

function QuickAction({ label, href }: { label: string; href: string }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 rounded-[8px] border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] font-medium text-slate-900">
      <span>{label}</span>
      <ChevronRight className="h-4 w-4 text-slate-400" />
    </Link>
  );
}

function IntegrationCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-slate-900">{label}</span>
        <RfpStatusBadge tone={value === "Connected" || value === "Enabled" ? "success" : "neutral"}>{value}</RfpStatusBadge>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[12px] text-slate-500">
        <Link2 className="h-4 w-4" />
        <span>Live integration state</span>
      </div>
    </div>
  );
}

function ProgressRow({ label, value, percent }: { label: string; value: string; percent: number }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold text-slate-950">{value}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-slate-200">
        <div className="h-2 rounded-full bg-[#155EEF]" style={{ width: `${Math.max(8, Math.min(100, percent))}%` }} />
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-semibold">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="border-t border-slate-200 px-4 align-top">{children}</td>;
}

function jumpTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
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
  return new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric" }).format(date);
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

const input =
  "h-10 w-full rounded-[8px] border border-slate-200 bg-white px-3 text-[13px] text-slate-950 outline-none transition focus:border-[#155EEF] focus:ring-2 focus:ring-[#155EEF]/15";
const textarea =
  "w-full rounded-[8px] border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-950 outline-none transition focus:border-[#155EEF] focus:ring-2 focus:ring-[#155EEF]/15";
