import { queryOptions } from "@tanstack/react-query";
import { notifications } from "@/data/notifications";
import { delay } from "./client";
import type { NotificationItem } from "@/types";

export async function fetchNotifications(): Promise<NotificationItem[]> {
  return delay(notifications);
}

export const notificationsQueryOptions = () =>
  queryOptions({ queryKey: ["notifications"], queryFn: fetchNotifications });

export async function markNotificationRead(id: string): Promise<NotificationItem[]> {
  const item = notifications.find((n) => n.id === id);
  if (item) item.read = true;
  return delay(notifications, 80);
}

export async function markAllNotificationsRead(): Promise<NotificationItem[]> {
  notifications.forEach((n) => (n.read = true));
  return delay(notifications, 80);
}
