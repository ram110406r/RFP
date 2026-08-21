import { queryOptions } from "@tanstack/react-query";
import { apiRequest } from "./http";
import type { AnalyticsSnapshot } from "@/types";

export async function fetchAnalyticsSnapshot(): Promise<AnalyticsSnapshot> {
  return apiRequest<AnalyticsSnapshot>("/api/analytics");
}

export const analyticsSnapshotQueryOptions = () =>
  queryOptions({ queryKey: ["analytics"], queryFn: fetchAnalyticsSnapshot });
