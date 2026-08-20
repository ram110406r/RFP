import { queryOptions } from "@tanstack/react-query";
import {
  aiSettings,
  apiKeys,
  integrations,
  knowledgeSettings,
  mcpConnections,
  members,
  notificationPreferences,
  orgProfile,
  roles,
} from "@/data/settings";
import { delay } from "./client";

export async function fetchOrgProfile() {
  return delay(orgProfile);
}
export async function fetchMembers() {
  return delay(members);
}
export async function fetchRoles() {
  return delay(roles);
}
export async function fetchAiSettings() {
  return delay(aiSettings);
}
export async function fetchKnowledgeSettings() {
  return delay(knowledgeSettings);
}
export async function fetchIntegrations() {
  return delay(integrations);
}
export async function fetchNotificationPreferences() {
  return delay(notificationPreferences);
}
export async function fetchApiKeys() {
  return delay(apiKeys);
}
export async function fetchMcpConnections() {
  return delay(mcpConnections);
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
