import { queryOptions } from "@tanstack/react-query";
import { apiRequest } from "./http";
import type {
  AccessSummary,
  AiSetting,
  ApiKeySetting,
  IntegrationSetting,
  McpConnection,
  MemberSetting,
  NotificationPreference,
  OrgProfile,
  RoleSetting,
} from "@/types";

export async function fetchOrgProfile(): Promise<OrgProfile> {
  return apiRequest<OrgProfile>("/api/settings/org");
}
export async function fetchMembers(): Promise<MemberSetting[]> {
  const { items } = await apiRequest<{ items: MemberSetting[] }>("/api/settings/members");
  return items;
}
export async function fetchRoles(): Promise<RoleSetting[]> {
  const { items } = await apiRequest<{ items: RoleSetting[] }>("/api/settings/roles");
  return items;
}
export async function fetchAiSettings(): Promise<AiSetting[]> {
  const { items } = await apiRequest<{ items: AiSetting[] }>("/api/settings/ai");
  return items;
}
export async function fetchKnowledgeSettings(): Promise<AiSetting[]> {
  const { items } = await apiRequest<{ items: AiSetting[] }>("/api/settings/knowledge");
  return items;
}
export async function fetchIntegrations(): Promise<IntegrationSetting[]> {
  const { items } = await apiRequest<{ items: IntegrationSetting[] }>("/api/settings/integrations");
  return items;
}
export async function fetchNotificationPreferences(): Promise<NotificationPreference[]> {
  const { items } = await apiRequest<{ items: NotificationPreference[] }>(
    "/api/settings/notification-preferences",
  );
  return items;
}
export async function fetchApiKeys(): Promise<ApiKeySetting[]> {
  const { items } = await apiRequest<{ items: ApiKeySetting[] }>("/api/settings/api-keys");
  return items;
}
export async function fetchMcpConnections(): Promise<McpConnection[]> {
  const { items } = await apiRequest<{ items: McpConnection[] }>("/api/settings/mcp");
  return items;
}
export async function fetchAccessSummary(): Promise<AccessSummary> {
  return apiRequest<AccessSummary>("/api/settings/access-summary");
}

export const orgProfileQueryOptions = () =>
  queryOptions({ queryKey: ["settings", "org"], queryFn: fetchOrgProfile });
export const membersQueryOptions = () =>
  queryOptions({ queryKey: ["settings", "members"], queryFn: fetchMembers });
export const rolesQueryOptions = () =>
  queryOptions({ queryKey: ["settings", "roles"], queryFn: fetchRoles });
export const aiSettingsQueryOptions = () =>
  queryOptions({ queryKey: ["settings", "ai"], queryFn: fetchAiSettings });
export const knowledgeSettingsQueryOptions = () =>
  queryOptions({ queryKey: ["settings", "knowledge"], queryFn: fetchKnowledgeSettings });
export const integrationsQueryOptions = () =>
  queryOptions({ queryKey: ["settings", "integrations"], queryFn: fetchIntegrations });
export const notificationPreferencesQueryOptions = () =>
  queryOptions({
    queryKey: ["settings", "notificationPreferences"],
    queryFn: fetchNotificationPreferences,
  });
export const apiKeysQueryOptions = () =>
  queryOptions({ queryKey: ["settings", "apiKeys"], queryFn: fetchApiKeys });
export const mcpConnectionsQueryOptions = () =>
  queryOptions({ queryKey: ["settings", "mcp"], queryFn: fetchMcpConnections });
export const accessSummaryQueryOptions = () =>
  queryOptions({ queryKey: ["settings", "accessSummary"], queryFn: fetchAccessSummary });
