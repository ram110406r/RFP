import { queryOptions } from "@tanstack/react-query";
import { apiRequest } from "./http";
import type { SubmissionVersion } from "@/types";

export async function fetchSubmissionVersions(rfpId: string): Promise<SubmissionVersion[]> {
  const { items } = await apiRequest<{ items: SubmissionVersion[] }>(
    `/api/rfps/${rfpId}/submissions`,
  );
  return items;
}

export const submissionVersionsQueryOptions = (rfpId: string) =>
  queryOptions({ queryKey: ["submission", rfpId], queryFn: () => fetchSubmissionVersions(rfpId) });

export async function generateSubmissionPackage(
  rfpId: string,
  _actor: string,
): Promise<SubmissionVersion> {
  return apiRequest<SubmissionVersion>(`/api/rfps/${rfpId}/submissions`, {
    method: "POST",
    body: { note: "Generated from the latest approved requirement responses." },
  });
}
