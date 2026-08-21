import { queryOptions } from "@tanstack/react-query";
import { apiRequest } from "./http";
import type { Requirement, RequirementStatus, RiskLevel } from "@/types";

interface RequirementListResponse {
  items: Requirement[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// See src/lib/api/rfps.ts's LIST_ALL_LIMIT note — filtering/sorting/bulk
// selection in requirement-table.tsx (and requirement-filters.ts's saved
// views) all operate on an already-fetched array, so list fetches ask for a
// large page rather than paginating server-side.
const LIST_ALL_LIMIT = 200;

export async function fetchRequirementsForRfp(rfpId: string): Promise<Requirement[]> {
  const res = await apiRequest<RequirementListResponse>(`/api/rfps/${rfpId}/requirements`, {
    query: { limit: LIST_ALL_LIMIT },
  });
  return res.items;
}

export async function fetchAllRequirements(): Promise<Requirement[]> {
  const res = await apiRequest<RequirementListResponse>("/api/requirements", {
    query: { limit: LIST_ALL_LIMIT },
  });
  return res.items;
}

export const allRequirementsQueryOptions = () =>
  queryOptions({
    queryKey: ["requirements", "all"],
    queryFn: fetchAllRequirements,
    staleTime: 60 * 1000,
  });

export async function fetchRequirement(id: string): Promise<Requirement> {
  return apiRequest<Requirement>(`/api/requirements/${id}`);
}

export const requirementsForRfpQueryOptions = (rfpId: string) =>
  queryOptions({
    queryKey: ["requirements", "byRfp", rfpId],
    queryFn: () => fetchRequirementsForRfp(rfpId),
  });

export const requirementQueryOptions = (id: string) =>
  queryOptions({ queryKey: ["requirements", id], queryFn: () => fetchRequirement(id) });

// `actor` is accepted for API-compatibility with existing call sites (which
// pass a display name derived from the current user) but is otherwise
// unused: the server always derives the true actor from the caller's
// authenticated session, never from client input.

export async function updateRequirementAnswer(
  id: string,
  answer: string,
  _actor: string,
): Promise<Requirement> {
  return apiRequest<Requirement>(`/api/requirements/${id}/answer`, {
    method: "PATCH",
    body: { answer },
  });
}

export async function regenerateDraft(id: string, _actor: string): Promise<Requirement> {
  return apiRequest<Requirement>(`/api/requirements/${id}/answer/regenerate`, { method: "POST" });
}

export async function setRequirementStatus(
  id: string,
  status: RequirementStatus,
  _actor: string,
  note?: string,
): Promise<Requirement> {
  return apiRequest<Requirement>(`/api/requirements/${id}`, {
    method: "PATCH",
    body: { status, note },
  });
}

export async function assignReviewer(
  id: string,
  reviewerId: string,
  _actor: string,
): Promise<Requirement> {
  await apiRequest(`/api/assignments`, {
    method: "POST",
    body: { requirementId: id, userId: reviewerId },
  });
  return fetchRequirement(id);
}

export async function setRequirementRisk(
  id: string,
  risk: RiskLevel,
  _actor: string,
): Promise<Requirement> {
  return apiRequest<Requirement>(`/api/requirements/${id}`, { method: "PATCH", body: { risk } });
}

export async function setRequirementOwnerTeam(
  id: string,
  ownerTeam: string,
  _actor: string,
): Promise<Requirement> {
  return apiRequest<Requirement>(`/api/requirements/${id}`, {
    method: "PATCH",
    body: { ownerTeam },
  });
}

// Bulk variants used by the Requirements table's contextual action bar. Each
// reuses the single-item mutation above so behavior stays identical for one
// row or a hundred.
export async function bulkSetStatus(
  ids: string[],
  status: RequirementStatus,
  actor: string,
): Promise<Requirement[]> {
  return Promise.all(ids.map((id) => setRequirementStatus(id, status, actor)));
}

export async function bulkSetRisk(
  ids: string[],
  risk: RiskLevel,
  actor: string,
): Promise<Requirement[]> {
  return Promise.all(ids.map((id) => setRequirementRisk(id, risk, actor)));
}

export async function bulkAssignReviewer(
  ids: string[],
  reviewerId: string,
  actor: string,
): Promise<Requirement[]> {
  return Promise.all(ids.map((id) => assignReviewer(id, reviewerId, actor)));
}

export async function bulkSetOwnerTeam(
  ids: string[],
  ownerTeam: string,
  actor: string,
): Promise<Requirement[]> {
  return Promise.all(ids.map((id) => setRequirementOwnerTeam(id, ownerTeam, actor)));
}
