import { queryOptions } from "@tanstack/react-query";
import { activityFeed } from "@/data/activity";
import { delay } from "./client";
import type { ActivityEntry } from "@/types";

export async function fetchActivityFeed(): Promise<ActivityEntry[]> {
  return delay(activityFeed);
}

export const activityFeedQueryOptions = () =>
  queryOptions({ queryKey: ["activity"], queryFn: fetchActivityFeed });
