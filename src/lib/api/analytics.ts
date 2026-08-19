import { queryOptions } from "@tanstack/react-query";
import { analyticsSnapshot } from "@/data/analytics";
import { delay } from "./client";
import type { AnalyticsSnapshot } from "@/types";

export async function fetchAnalyticsSnapshot(): Promise<AnalyticsSnapshot> {
  return delay(analyticsSnapshot);
}

export const analyticsSnapshotQueryOptions = () =>
  queryOptions({ queryKey: ["analytics"], queryFn: fetchAnalyticsSnapshot });
