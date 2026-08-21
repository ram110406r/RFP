import { queryOptions } from "@tanstack/react-query";
import { apiRequest } from "./http";
import type { ValidationCategory, ValidationIssue } from "@/types";

export interface ValidationSnapshot {
  score: number;
  categories: ValidationCategory[];
  issues: ValidationIssue[];
}

export async function fetchValidationSnapshot(rfpId: string): Promise<ValidationSnapshot> {
  return apiRequest<ValidationSnapshot>(`/api/rfps/${rfpId}/validate`, { method: "POST" });
}

export const validationSnapshotQueryOptions = (rfpId: string) =>
  queryOptions({ queryKey: ["validation", rfpId], queryFn: () => fetchValidationSnapshot(rfpId) });
