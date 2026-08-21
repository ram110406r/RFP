import { queryOptions } from "@tanstack/react-query";
import { apiRequest } from "./http";
import type { Evidence } from "@/types";

export async function fetchEvidenceForRequirement(requirementId: string): Promise<Evidence[]> {
  const { evidence } = await apiRequest<{ evidence: Evidence[] }>(
    `/api/requirements/${requirementId}/evidence`,
  );
  return evidence;
}

export const evidenceForRequirementQueryOptions = (requirementId: string) =>
  queryOptions({
    queryKey: ["evidence", "byRequirement", requirementId],
    queryFn: () => fetchEvidenceForRequirement(requirementId),
    enabled: Boolean(requirementId),
  });
