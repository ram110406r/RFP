import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Plug, ShieldCheck } from "lucide-react";
import {
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
import { PersonAvatar } from "@/components/common/person-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getPerson, CURRENT_USER_ID } from "@/data/people";
import { cn } from "@/lib/utils";
import type { AiSetting } from "@/types";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings · RFP OS" }] }),
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
    ]),
  pendingComponent: PageSkeleton,
  component: Settings,
});

const TABS = [
  "Profile",
  "Org",
  "Members",
  "Roles",
  "AI",
  "Knowledge",
  "Integrations",
  "Notifications",
  "Security",
  "API",
  "MCP",
];

function Settings() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your profile, organization, and RFP OS configuration."
      />

      <Tabs defaultValue="Profile">
        <TabsList className="h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
          {TABS.map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-none"
            >
              {tab}
            </TabsTrigger>
          ))}
        </TabsList>

        {/*
          forceMount + data-[state=inactive]:hidden keeps every tab's local
          state (unsaved form edits, optimistic toggles) alive across tab
          switches instead of unmounting it — Radix drops the subtree on
          switch by default, which silently discards in-progress edits.
        */}
        <TabsContent
          value="Profile"
          forceMount
          className="max-w-lg space-y-4 data-[state=inactive]:hidden"
        >
          <ProfileTab />
        </TabsContent>

        <TabsContent value="Org" forceMount className="data-[state=inactive]:hidden">
          <OrgTab />
        </TabsContent>
        <TabsContent value="Members" forceMount className="data-[state=inactive]:hidden">
          <MembersTab />
        </TabsContent>
        <TabsContent value="Roles" forceMount className="data-[state=inactive]:hidden">
          <RolesTab />
        </TabsContent>
        <TabsContent value="AI" forceMount className="data-[state=inactive]:hidden">
          <TogglesTab queryOptions={aiSettingsQueryOptions} />
        </TabsContent>
        <TabsContent value="Knowledge" forceMount className="data-[state=inactive]:hidden">
          <TogglesTab queryOptions={knowledgeSettingsQueryOptions} />
        </TabsContent>
        <TabsContent value="Integrations" forceMount className="data-[state=inactive]:hidden">
          <IntegrationsTab />
        </TabsContent>
        <TabsContent value="Notifications" forceMount className="data-[state=inactive]:hidden">
          <NotificationsTab />
        </TabsContent>
        <TabsContent value="Security" forceMount className="data-[state=inactive]:hidden">
          <SecurityTab />
        </TabsContent>
        <TabsContent value="API" forceMount className="data-[state=inactive]:hidden">
          <ApiTab />
        </TabsContent>
        <TabsContent value="MCP" forceMount className="data-[state=inactive]:hidden">
          <McpTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProfileTab() {
  const me = getPerson(CURRENT_USER_ID);
  const [name, setName] = useState(me?.name ?? "");
  const [email, setEmail] = useState("priya.nair@halcyonsystems.com");

  return (
    <>
      <div className="flex items-center gap-3">
        <PersonAvatar personId={CURRENT_USER_ID} className="h-14 w-14 text-base" />
        <div>
          <p className="text-sm font-semibold text-foreground">{me?.name}</p>
          <p className="text-xs text-muted-foreground">
            {me?.role} · {me?.team}
          </p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Full name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Email</Label>
        <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
      </div>
      <div className="space-y-1.5">
        <Label>Team</Label>
        <Input defaultValue={me?.team} disabled />
      </div>
      <Button size="sm" onClick={() => toast.success("Profile updated")}>
        Save changes
      </Button>
    </>
  );
}

function OrgTab() {
  const { data: org } = useSuspenseQuery(orgProfileQueryOptions());
  return (
    <div className="max-w-lg space-y-4">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-sm font-bold text-primary">
          {org.logoInitials}
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">{org.name}</p>
          <p className="text-xs text-muted-foreground">{org.domain}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="surface-panel p-3.5">
          <p className="text-xs text-muted-foreground">Plan</p>
          <p className="font-medium text-foreground">{org.plan}</p>
        </div>
        <div className="surface-panel p-3.5">
          <p className="text-xs text-muted-foreground">Seats</p>
          <p className="num font-medium text-foreground">
            {org.seatsUsed} / {org.seats}
          </p>
        </div>
        <div className="surface-panel p-3.5 col-span-2">
          <p className="text-xs text-muted-foreground">Industry</p>
          <p className="font-medium text-foreground">{org.industry}</p>
        </div>
      </div>
    </div>
  );
}

function MembersTab() {
  const { data: members } = useSuspenseQuery(membersQueryOptions());
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium">Member</th>
            <th className="px-4 py-2.5 font-medium">Role</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Last active</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {members.map((m) => {
            const person = getPerson(m.personId);
            return (
              <tr key={m.id}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <PersonAvatar personId={m.personId} />
                    <div>
                      <p className="font-medium text-foreground">{person?.name}</p>
                      <p className="text-xs text-muted-foreground">{m.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{m.role}</td>
                <td className="px-4 py-3">
                  <Badge
                    variant="secondary"
                    className={cn(
                      "font-normal",
                      m.status === "active" && "bg-success-soft text-success",
                      m.status === "invited" && "bg-info-soft text-info",
                      m.status === "suspended" && "bg-muted text-muted-foreground",
                    )}
                  >
                    {m.status}
                  </Badge>
                </td>
                <td className="num px-4 py-3 text-xs text-muted-foreground">
                  {new Date(m.lastActive).toLocaleDateString("en-US")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RolesTab() {
  const { data: roles } = useSuspenseQuery(rolesQueryOptions());
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {roles.map((role) => (
        <div key={role.id} className="surface-panel space-y-2 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">{role.name}</p>
            <span className="num text-xs text-muted-foreground">{role.memberCount} members</span>
          </div>
          <p className="text-xs text-muted-foreground">{role.description}</p>
          <ul className="space-y-1">
            {role.permissions.map((perm) => (
              <li key={perm} className="text-xs text-foreground/80">
                · {perm}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function TogglesTab({
  queryOptions,
}: {
  queryOptions: () => ReturnType<typeof aiSettingsQueryOptions>;
}) {
  const { data } = useSuspenseQuery(queryOptions());
  const [local, setLocal] = useState<AiSetting[]>(data);

  function update(id: string, value: boolean | number | string) {
    setLocal((prev) => prev.map((item) => (item.id === id ? { ...item, value } : item)));
  }

  return (
    <div className="max-w-xl divide-y surface-panel p-0">
      {local.map((setting) => (
        <div key={setting.id} className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{setting.label}</p>
            <p className="text-xs text-muted-foreground">{setting.description}</p>
          </div>
          <div className="w-32 shrink-0">
            {setting.kind === "toggle" && (
              <div className="flex justify-end">
                <Switch
                  checked={Boolean(setting.value)}
                  onCheckedChange={(v) => update(setting.id, v)}
                  aria-label={setting.label}
                />
              </div>
            )}
            {setting.kind === "slider" && (
              <div className="flex items-center gap-2">
                <Slider
                  value={[Number(setting.value)]}
                  min={0}
                  max={setting.max ?? 100}
                  step={5}
                  onValueChange={([v]) => update(setting.id, v ?? 0)}
                />
                <span className="num w-8 text-right text-xs text-muted-foreground">
                  {setting.value}
                </span>
              </div>
            )}
            {setting.kind === "select" && (
              <Select value={String(setting.value)} onValueChange={(v) => update(setting.id, v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {setting.options?.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function IntegrationsTab() {
  const { data } = useSuspenseQuery(integrationsQueryOptions());
  const [local, setLocal] = useState(data);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {local.map((integration) => (
        <div key={integration.id} className="surface-panel space-y-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Plug className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">{integration.name}</p>
                <p className="text-xs text-muted-foreground">{integration.category}</p>
              </div>
            </div>
            <Switch
              checked={integration.connected}
              onCheckedChange={(v) =>
                setLocal((prev) =>
                  prev.map((i) => (i.id === integration.id ? { ...i, connected: v } : i)),
                )
              }
              aria-label={`Toggle ${integration.name}`}
            />
          </div>
          <p className="text-xs text-muted-foreground">{integration.description}</p>
          <p className="text-[11px] text-muted-foreground/70">
            {integration.connected
              ? `Last synced ${integration.lastSynced ? new Date(integration.lastSynced).toLocaleString("en-US") : "just now"}`
              : "Not connected"}
          </p>
        </div>
      ))}
    </div>
  );
}

function NotificationsTab() {
  const { data } = useSuspenseQuery(notificationPreferencesQueryOptions());
  const [local, setLocal] = useState(data);

  function toggle(id: string, key: "email" | "inApp" | "digest") {
    setLocal((prev) => prev.map((p) => (p.id === id ? { ...p, [key]: !p[key] } : p)));
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium">Notification</th>
            <th className="px-4 py-2.5 font-medium">Email</th>
            <th className="px-4 py-2.5 font-medium">In-app</th>
            <th className="px-4 py-2.5 font-medium">Digest</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {local.map((pref) => (
            <tr key={pref.id}>
              <td className="px-4 py-3">
                <p className="font-medium text-foreground">{pref.label}</p>
                <p className="text-xs text-muted-foreground">{pref.category}</p>
              </td>
              <td className="px-4 py-3">
                <Switch checked={pref.email} onCheckedChange={() => toggle(pref.id, "email")} />
              </td>
              <td className="px-4 py-3">
                <Switch checked={pref.inApp} onCheckedChange={() => toggle(pref.id, "inApp")} />
              </td>
              <td className="px-4 py-3">
                <Switch checked={pref.digest} onCheckedChange={() => toggle(pref.id, "digest")} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SecurityTab() {
  return (
    <div className="max-w-xl space-y-3">
      <div className="surface-panel flex items-start gap-3 p-4">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        <div>
          <p className="text-sm font-medium text-foreground">Single sign-on enforced</p>
          <p className="text-xs text-muted-foreground">
            All members authenticate via Okta SSO with SCIM-based provisioning.
          </p>
        </div>
      </div>
      <div className="surface-panel flex items-start gap-3 p-4">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        <div>
          <p className="text-sm font-medium text-foreground">
            Multi-factor authentication required
          </p>
          <p className="text-xs text-muted-foreground">
            Enforced for all accounts with administrative or reviewer permissions.
          </p>
        </div>
      </div>
      <div className="surface-panel flex items-start gap-3 p-4">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium text-foreground">Session timeout</p>
          <p className="text-xs text-muted-foreground">
            Idle sessions are revoked after 12 hours of inactivity.
          </p>
        </div>
      </div>
    </div>
  );
}

function ApiTab() {
  const { data } = useSuspenseQuery(apiKeysQueryOptions());
  const [keys, setKeys] = useState(data);

  function createKey() {
    const n = keys.length + 1;
    setKeys((prev) => [
      {
        id: `key-new-${n}`,
        label: `API Key ${n}`,
        prefix: "sk_live_",
        createdAt: new Date().toISOString().slice(0, 10),
        lastUsed: null,
        scopes: ["read"],
      },
      ...prev,
    ]);
    toast.success("API key created");
  }

  return (
    <div className="max-w-2xl space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={createKey}>
          <KeyRound className="h-3.5 w-3.5" /> Create API key
        </Button>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Key</th>
              <th className="px-4 py-2.5 font-medium">Scopes</th>
              <th className="px-4 py-2.5 font-medium">Created</th>
              <th className="px-4 py-2.5 font-medium">Last used</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {keys.map((key) => (
              <tr key={key.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">{key.label}</p>
                  <p className="num text-xs text-muted-foreground">{key.prefix}••••••••••••</p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {key.scopes.map((s) => (
                      <Badge key={s} variant="secondary" className="font-normal">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="num px-4 py-3 text-xs text-muted-foreground">{key.createdAt}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {key.lastUsed ? new Date(key.lastUsed).toLocaleDateString("en-US") : "Never"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function McpTab() {
  const { data: connections } = useSuspenseQuery(mcpConnectionsQueryOptions());
  return (
    <div className="max-w-2xl space-y-3">
      <p className="text-xs text-muted-foreground">
        Model Context Protocol connections are configured and run on the backend. This view reflects
        their current status only.
      </p>
      <div className="space-y-2.5">
        {connections.map((mcp) => (
          <div key={mcp.id} className="surface-panel flex items-start justify-between gap-3 p-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">{mcp.name}</p>
                <Badge variant="secondary" className="font-normal uppercase">
                  {mcp.transport}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{mcp.description}</p>
              <p className="mt-1 text-[11px] text-muted-foreground/70">
                {mcp.toolsExposed} tools exposed
              </p>
            </div>
            <Badge
              className={cn(
                "shrink-0 font-normal",
                mcp.status === "connected" && "bg-success-soft text-success",
                mcp.status === "disconnected" && "bg-muted text-muted-foreground",
                mcp.status === "error" && "bg-danger-soft text-danger",
              )}
              variant="secondary"
            >
              {mcp.status}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
