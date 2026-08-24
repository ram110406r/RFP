import { useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bell,
  Boxes,
  Building2,
  KeyRound,
  Lock,
  Plug,
  ShieldCheck,
  Sparkles,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  accessSummaryQueryOptions,
  aiSettingsQueryOptions,
  apiKeysQueryOptions,
  integrationsQueryOptions,
  knowledgeSettingsQueryOptions,
  mcpConnectionsQueryOptions,
  membersQueryOptions,
  notificationPreferencesQueryOptions,
  orgProfileQueryOptions,
  rolesQueryOptions,
} from "@/lib/api/settings";
import { PageHeader } from "@/components/common/page-header";
import { PageSkeleton } from "@/components/common/page-skeleton";
import { ProfileTab } from "@/components/settings/profile-tab";
import { OrgTab } from "@/components/settings/org-tab";
import { MembersTab } from "@/components/settings/members-tab";
import { RolesTab } from "@/components/settings/roles-tab";
import { TogglesTab } from "@/components/settings/toggles-tab";
import { IntegrationsTab } from "@/components/settings/integrations-tab";
import { NotificationsTab } from "@/components/settings/notifications-tab";
import { SecurityTab } from "@/components/settings/security-tab";
import { ApiTab } from "@/components/settings/api-tab";
import { McpTab } from "@/components/settings/mcp-tab";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings · Tendyy" }] }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(orgProfileQueryOptions()),
      context.queryClient.ensureQueryData(membersQueryOptions()),
      context.queryClient.ensureQueryData(rolesQueryOptions()),
      context.queryClient.ensureQueryData(aiSettingsQueryOptions()),
      context.queryClient.ensureQueryData(knowledgeSettingsQueryOptions()),
      context.queryClient.ensureQueryData(integrationsQueryOptions()),
      context.queryClient.ensureQueryData(notificationPreferencesQueryOptions()),
      context.queryClient.ensureQueryData(apiKeysQueryOptions()),
      context.queryClient.ensureQueryData(mcpConnectionsQueryOptions()),
      context.queryClient.ensureQueryData(accessSummaryQueryOptions()),
    ]),
  pendingComponent: PageSkeleton,
  component: Settings,
});

interface SettingsSection {
  id: string;
  label: string;
  group: "Account" | "Organization" | "Configuration" | "Security";
  icon: LucideIcon;
  content: () => ReactNode;
}

const SECTIONS: SettingsSection[] = [
  { id: "Profile", label: "Profile", group: "Account", icon: User, content: () => <ProfileTab /> },
  {
    id: "Org",
    label: "Organization",
    group: "Organization",
    icon: Building2,
    content: () => <OrgTab />,
  },
  {
    id: "Members",
    label: "Members",
    group: "Organization",
    icon: Users,
    content: () => <MembersTab />,
  },
  {
    id: "Roles",
    label: "Roles & permissions",
    group: "Organization",
    icon: ShieldCheck,
    content: () => <RolesTab />,
  },
  {
    id: "AI",
    label: "AI",
    group: "Configuration",
    icon: Sparkles,
    content: () => <TogglesTab queryOptions={aiSettingsQueryOptions} />,
  },
  {
    id: "Knowledge",
    label: "Knowledge",
    group: "Configuration",
    icon: Boxes,
    content: () => <TogglesTab queryOptions={knowledgeSettingsQueryOptions} />,
  },
  {
    id: "Integrations",
    label: "Integrations",
    group: "Configuration",
    icon: Plug,
    content: () => <IntegrationsTab />,
  },
  {
    id: "Notifications",
    label: "Notifications",
    group: "Configuration",
    icon: Bell,
    content: () => <NotificationsTab />,
  },
  {
    id: "Security",
    label: "Security",
    group: "Security",
    icon: Lock,
    content: () => <SecurityTab />,
  },
  { id: "API", label: "API", group: "Security", icon: KeyRound, content: () => <ApiTab /> },
  { id: "MCP", label: "MCP", group: "Security", icon: Boxes, content: () => <McpTab /> },
];

const GROUPS: SettingsSection["group"][] = ["Account", "Organization", "Configuration", "Security"];

function Settings() {
  const [active, setActive] = useState("Profile");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Manage your profile, organization, and Tendyy configuration."
      />

      <div className="flex flex-col gap-6 lg:flex-row">
        <nav
          className="flex shrink-0 flex-col gap-4 overflow-x-auto lg:w-56 lg:overflow-visible"
          aria-label="Settings sections"
        >
          {GROUPS.map((group) => (
            <div key={group} className="flex gap-1 lg:flex-col">
              <p className="hidden px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground lg:block">
                {group}
              </p>
              {SECTIONS.filter((s) => s.group === group).map((section) => {
                const Icon = section.icon;
                const isActive = section.id === active;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActive(section.id)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm font-medium transition-colors",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="whitespace-nowrap">{section.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/*
          Every section stays mounted (just hidden) so unsaved local state —
          form edits, optimistic toggles — survives switching away and back,
          instead of resetting to server data on remount.
        */}
        <div className="min-w-0 flex-1">
          {SECTIONS.map((section) => (
            <div key={section.id} className={cn(section.id !== active && "hidden")}>
              {section.content()}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
