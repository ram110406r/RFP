import { queryOptions } from "@tanstack/react-query";
import { getEvidenceForIds } from "@/data/evidence";
import { delay } from "./client";
import type { Evidence } from "@/types";

export async function fetchEvidenceForIds(ids: string[]): Promise<Evidence[]> {
  return delay(getEvidenceForIds(ids));
}

export const evidenceForIdsQueryOptions = (ids: string[]) =>
  queryOptions({
    queryKey: ["evidence", "byIds", [...ids].sort()],
    queryFn: () => fetchEvidenceForIds(ids),
    enabled: ids.length > 0,
  });
