import { queryOptions } from "@tanstack/react-query";
import { apiRequest } from "./http";
import type { NotificationItem } from "@/types";

export async function fetchNotifications(): Promise<NotificationItem[]> {
  const { items } = await apiRequest<{ items: NotificationItem[] }>("/api/notifications");
  return items;
}

export const notificationsQueryOptions = () =>
  queryOptions({ queryKey: ["notifications"], queryFn: fetchNotifications });

export async function markNotificationRead(id: string): Promise<NotificationItem[]> {
  await apiRequest(`/api/notifications/${id}`, { method: "PATCH" });
  return fetchNotifications();
}

export async function markAllNotificationsRead(): Promise<NotificationItem[]> {
  await apiRequest("/api/notifications/read-all", { method: "PATCH" });
  return fetchNotifications();
}
