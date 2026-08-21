import { queryOptions } from "@tanstack/react-query";
import { apiRequest } from "./http";
import type { ActivityEntry } from "@/types";

export async function fetchActivityFeed(): Promise<ActivityEntry[]> {
  const { items } = await apiRequest<{ items: ActivityEntry[] }>("/api/activities");
  return items;
}

export const activityFeedQueryOptions = () =>
  queryOptions({ queryKey: ["activity"], queryFn: fetchActivityFeed });
