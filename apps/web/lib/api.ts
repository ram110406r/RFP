import type {
  AnswerAnalysisResult,
  AnswerImprovementResult,
} from "@rfp-os/types";
import type { User } from "firebase/auth";

import type {
  AnswerGenerationPayload,
  AuditLogSummary,
  KnowledgeItem,
  KnowledgeListPayload,
  DashboardOverview,
  OrganizationInvitationSummary,
  OrganizationInvitationCreated,
  OrganizationMemberSummary,
  OrganizationSummary,
  RoleSummary,
  RequirementEvidenceSearchPayload,
  TenderAnswer,
  TenderAnswerEvidence,
  TenderAnswerVersion,
  TenderAnalysisPayload,
  TenderBriefPayload,
  TenderDocumentContentPayload,
  TenderDiscoveryPayload,
  TenderNoticeDetail,
  TenderSourceHealth,
  TenderIngestionAlert,
  TenderListPayload,
  TenderQuestion,
  TenderSource,
  TenderRequirement,
  TenderReview,
  WorkspaceSummary,
  WorkspaceOverview,
  RfpApplyProgress,
  RfpApplyRunResult,
  TeamSummary,
  TeamMemberSummary,
  WorkspaceMemberSummary,
  TenderAutomationRun,
  TenderRequirementCandidate,
  TenderSubmissionPackage,
  TenderMilestone,
  TenderSubmission,
} from "./models";

export interface TenderDiscoveryParams {
  workspaceId?: string;
  q?: string;
  portal?: string;
  authorityType?: string;
  buyer?: string;
  state?: string;
  location?: string;
  category?: string;
  procurementType?: string;
  status?: string;
  minValue?: number;
  maxValue?: number;
  publishedFrom?: string;
  publishedTo?: string;
  deadlineFrom?: string;
  deadlineTo?: string;
  saved?: boolean;
  applied?: boolean;
  freshness?: "current" | "stale" | "all";
  sort?: string;
  page?: number;
  pageSize?: number;
  cursor?: string;
}

const VERSION_PREFIX = "/api/v1";

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(message: string, status: number, code = "API_ERROR", details: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type ApiInit = RequestInit & {
  cookie?: string | null;
  baseUrl?: string;
};

export function getApiBaseUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? "";
}

export type OnboardingStatus = {
  user: { id: string; name: string; email: string; image?: string | null; preferredName: string; accountType: string | null; jobTitle: string; department: string; timezone: string; phone: string };
  progress: {
    currentStep: number;
    currentState: string;
    journey: "COMPANY" | "EMPLOYEE" | null;
    invitationId: string | null;
    completed: boolean;
    company: Record<string, unknown>;
    profile: Record<string, unknown>;
    team: Record<string, unknown>;
    rfpContext: Record<string, unknown>;
  };
  journey: "COMPANY" | "EMPLOYEE" | null;
  emailVerified: boolean;
  accountState: string;
  lifecycleState: "EMAIL_VERIFICATION_REQUIRED" | "PENDING_INVITATION" | "COMPANY_SETUP_REQUIRED" | "PROFILE_REQUIRED" | "NO_WORKSPACE_ACCESS" | "ACTIVE_MEMBER";
  complete: boolean;
  hasMembership: boolean;
  hasWorkspaceAccess: boolean;
  workspaceIds: string[];
  needsOnboarding: boolean;
  organizationId: string | null;
  workspaceId: string | null;
  workspace: { id: string; name: string; slug: string } | null;
  membership: { id: string; organizationId: string; organizationName: string; role: string } | null;
  invitations: Array<{ id: string; organizationId: string; organizationName: string; workspaceId: string | null; workspaceName: string | null; proposedTeamId: string | null; proposedTeamName: string | null; proposedDepartment: string | null; role: string; status: string; expiresAt: string }>;
  controlledValues: { departments: string[]; jobTitles: string[] };
};

export function fetchOnboardingStatus(init?: ApiInit) {
  return requestJson<OnboardingStatus>("/onboarding/status", init);
}

export async function fetchOrganizationCurrent(init?: ApiInit) {
  return requestJson<OrganizationSummary>("/organizations/current", init);
}

export async function updateOrganizationCurrent(
  body: {
    name?: string;
    domain?: string;
    industry?: string;
    logoInitials?: string;
  },
  init?: ApiInit,
) {
  return requestJson<OrganizationSummary>("/organizations/current", {
    ...init,
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function fetchOrganizationMembers(init?: ApiInit) {
  return requestJson<{ members: OrganizationMemberSummary[] }>("/organizations/current/members", init);
}

export async function fetchOrganizationInvitations(init?: ApiInit) {
  return requestJson<{ invitations: OrganizationInvitationSummary[] }>("/organizations/current/invitations", init);
}

export async function createOrganizationInvitation(
  body: {
    email: string;
    role: "OWNER" | "ADMIN" | "RFP_MANAGER" | "CONTRIBUTOR" | "REVIEWER" | "SME" | "VIEWER";
    workspaceId: string;
    proposedDepartment?: string;
    proposedTeamId?: string;
  },
  init?: ApiInit,
) {
  return requestJson<OrganizationInvitationCreated>("/organizations/current/invitations", {
    ...init,
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateOrganizationMember(
  userId: string,
  body: { role?: "OWNER" | "ADMIN" | "RFP_MANAGER" | "CONTRIBUTOR" | "REVIEWER" | "SME" | "VIEWER"; status?: "active" | "suspended" },
  init?: ApiInit,
) {
  return requestJson<OrganizationMemberSummary>(`/organizations/current/members/${userId}`, {
    ...init,
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function removeOrganizationMember(userId: string, init?: ApiInit) {
  return requestJson<{ removed: true }>(`/organizations/current/members/${userId}`, {
    ...init,
    method: "DELETE",
  });
}

export async function revokeOrganizationInvitation(invitationId: string, init?: ApiInit) {
  return requestJson<OrganizationInvitationSummary>(`/organizations/current/invitations/${invitationId}`, {
    ...init,
    method: "DELETE",
  });
}

export async function fetchRoles(init?: ApiInit) {
  return requestJson<{ items: RoleSummary[] }>("/roles", init);
}

export async function fetchTeams(init?: ApiInit) {
  return requestJson<{ items: TeamSummary[] }>("/teams", init);
}

export async function createTeam(
  body: { name: string; workspaceId: string; description?: string },
  init?: ApiInit,
) {
  return requestJson<TeamSummary>("/teams", { ...init, method: "POST", body: JSON.stringify(body) });
}

export async function archiveTeam(teamId: string, init?: ApiInit) {
  return requestJson<TeamSummary>(`/teams/${teamId}/archive`, { ...init, method: "POST" });
}

export async function addTeamMember(teamId: string, organizationMemberId: string, init?: ApiInit) {
  return requestJson<TeamMemberSummary>(`/teams/${teamId}/members`, {
    ...init,
    method: "POST",
    body: JSON.stringify({ organizationMemberId }),
  });
}

export async function removeTeamMember(teamId: string, organizationMemberId: string, init?: ApiInit) {
  return requestJson<TeamMemberSummary>(`/teams/${teamId}/members/${organizationMemberId}`, {
    ...init,
    method: "DELETE",
  });
}

export async function fetchWorkspaceMembers(workspaceId: string, init?: ApiInit) {
  return requestJson<{ items: WorkspaceMemberSummary[] }>(`/workspaces/${workspaceId}/members`, init);
}

export async function createWorkspace(
  body: { name: string; slug: string; description?: string },
  init?: ApiInit,
) {
  return requestJson<WorkspaceSummary>("/workspaces", { ...init, method: "POST", body: JSON.stringify(body) });
}

export async function updateWorkspace(
  workspaceId: string,
  body: { name?: string; slug?: string; description?: string },
  init?: ApiInit,
) {
  return requestJson<WorkspaceSummary>(`/workspaces/${workspaceId}`, { ...init, method: "PATCH", body: JSON.stringify(body) });
}

export async function archiveWorkspace(workspaceId: string, init?: ApiInit) {
  return requestJson<WorkspaceSummary>(`/workspaces/${workspaceId}/archive`, { ...init, method: "POST" });
}

export async function addWorkspaceMember(workspaceId: string, organizationMemberId: string, init?: ApiInit) {
  return requestJson<WorkspaceMemberSummary>(`/workspaces/${workspaceId}/members`, {
    ...init,
    method: "POST",
    body: JSON.stringify({ organizationMemberId }),
  });
}

export async function removeWorkspaceMember(workspaceId: string, organizationMemberId: string, init?: ApiInit) {
  return requestJson<WorkspaceMemberSummary>(`/workspaces/${workspaceId}/members/${organizationMemberId}`, {
    ...init,
    method: "DELETE",
  });
}

export async function fetchTeamMembers(teamId: string, init?: ApiInit) {
  return requestJson<{ items: TeamMemberSummary[] }>(`/teams/${teamId}/members`, init);
}

export async function fetchAudits(
  params: { workspaceId?: string; q?: string; action?: string; entityType?: string; entityId?: string; actorId?: string } = {},
  init?: ApiInit,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestJson<{ items: AuditLogSummary[] }>(`/audits${suffix}`, init);
}

export function startOnboarding(body: { journey: "COMPANY" | "EMPLOYEE"; invitationId?: string }, init?: ApiInit) {
  return requestJson("/onboarding/start", { ...init, method: "POST", body: JSON.stringify(body) });
}

export function acceptOnboardingInvitation(invitationId: string, init?: ApiInit) {
  return requestJson("/onboarding/invitation/accept", { ...init, method: "POST", body: JSON.stringify({ invitationId }) });
}

export function acceptOnboardingInvitationToken(token: string, init?: ApiInit) {
  return requestJson("/onboarding/invitation/accept-token", { ...init, method: "POST", body: JSON.stringify({ token }) });
}

export function saveOnboardingCompany(body: Record<string, unknown>, init?: ApiInit) {
  return requestJson("/onboarding/company", { ...init, method: "POST", body: JSON.stringify(body) });
}

export function createOnboardingWorkspace(body: Record<string, unknown>, init?: ApiInit) {
  return requestJson("/onboarding/workspace", { ...init, method: "POST", body: JSON.stringify(body) });
}

export function saveOnboardingProfile(body: Record<string, unknown>, init?: ApiInit) {
  return requestJson("/onboarding/profile", { ...init, method: "POST", body: JSON.stringify(body) });
}

export function saveOnboardingTeam(body: Record<string, unknown>, init?: ApiInit) {
  return requestJson("/onboarding/team", { ...init, method: "POST", body: JSON.stringify(body) });
}

export function completeOnboarding(body: Record<string, unknown>, init?: ApiInit) {
  return requestJson("/onboarding/complete", { ...init, method: "POST", body: JSON.stringify(body) });
}

export function saveOnboardingContext(body: Record<string, unknown>, init?: ApiInit) {
  return requestJson("/onboarding/context", { ...init, method: "POST", body: JSON.stringify(body) });
}

function resolveBaseUrl(baseUrl?: string) {
  if (baseUrl) return baseUrl.replace(/\/$/, "");
  const configuredBaseUrl = getApiBaseUrl().replace(/\/$/, "");
  if (configuredBaseUrl) return configuredBaseUrl;
  throw new Error("TENDYY web configuration error: API_INTERNAL_URL or NEXT_PUBLIC_API_URL is required.");
}

function buildUrl(path: string, baseUrl?: string) {
  const trimmed = path.startsWith("/") ? path : `/${path}`;
  return `${resolveBaseUrl(baseUrl)}${VERSION_PREFIX}${trimmed}`;
}

async function requestJson<T>(path: string, init: ApiInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (init.cookie) {
    headers.set("cookie", init.cookie);
  }

  let firebaseUser: User | null = null;
  const usesFirebaseBrowserAuth = typeof window !== "undefined" && !headers.has("authorization");

  // Firebase restores persisted sessions asynchronously. Waiting here prevents
  // authenticated screens from racing an anonymous API request during startup.
  if (usesFirebaseBrowserAuth) {
    const { getFirebaseAuth } = await import("./firebase");
    const firebaseAuth = getFirebaseAuth();
    await firebaseAuth.authStateReady();
    firebaseUser = firebaseAuth.currentUser;
    if (!firebaseUser) {
      throw new ApiError("Your Firebase session is not ready. Please sign in again.", 401, "FIREBASE_SESSION_MISSING");
    }
    headers.set("authorization", `Bearer ${await firebaseUser.getIdToken()}`);
  }

  const requestUrl = buildUrl(path, init.baseUrl);
  const requestOptions: RequestInit = {
    ...init,
    headers,
    credentials: "include",
    cache: init.cache ?? "no-store",
  };
  let response = await fetch(requestUrl, requestOptions);

  // A token may expire between restoration and the request. Firebase refreshes
  // it once; the API still remains authoritative and no anonymous fallback occurs.
  if (response.status === 401 && usesFirebaseBrowserAuth && firebaseUser) {
    headers.set("authorization", `Bearer ${await firebaseUser.getIdToken(true)}`);
    response = await fetch(requestUrl, requestOptions);
  }

  if (!response.ok) {
    let details: unknown = null;
    try {
      details = await response.json();
    } catch {
      details = await response.text().catch(() => null);
    }
    const error = (details as {
      error?: {
        code?: string;
        message?: string;
        details?: { issues?: Array<{ path?: string; message?: string }> };
      };
    } | null)?.error;
    const firstIssue = error?.details?.issues?.[0];
    const issueMessage = firstIssue?.message
      ? `${firstIssue.path ? `${firstIssue.path}: ` : ""}${firstIssue.message}`
      : null;
    const message = issueMessage ?? error?.message ?? response.statusText ?? "Request failed";
    const code = error?.code ?? "API_ERROR";
    throw new ApiError(message, response.status, code, details);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function fetchWorkspaceOverview(tenderId: string, init?: ApiInit) {
  return requestJson<WorkspaceOverview>(`/tenders/${tenderId}/workspace`, init);
}

export async function fetchRfpApplyProgress(tenderId: string, init?: ApiInit) {
  return requestJson<RfpApplyProgress>(`/rfp-apply/${tenderId}/progress`, init);
}

export async function runRfpApply(
  tenderId: string,
  body: { phase?: "ANALYZE" | "GENERATE" | "VALIDATE" | "FULL"; requirementIds?: string[]; limit?: number },
  init?: ApiInit,
) {
  return requestJson<RfpApplyRunResult>(`/rfp-apply/${tenderId}/run`, {
    ...init,
    method: "POST",
    body: JSON.stringify(body),
  });
}

export const fetchTenderRequirementCandidates = (tenderId: string) => requestJson<{ items: TenderRequirementCandidate[] }>(`/tenders/${tenderId}/requirement-candidates`);
export const extractTenderRequirements = (tenderId: string) => requestJson<{ created: number; reused: number }>(`/tenders/${tenderId}/requirement-extraction`, { method: "POST" });
export const decideTenderRequirementCandidates = (tenderId: string, decisions: Array<{ candidateId: string; decision: "ACCEPTED" | "REJECTED" }>) => requestJson<{ items: TenderRequirementCandidate[] }>(`/tenders/${tenderId}/requirement-candidates/decisions`, { method: "POST", body: JSON.stringify({ decisions }) });
export const fetchTenderAutomationRuns = (tenderId: string) => requestJson<{ items: TenderAutomationRun[] }>(`/rfp-apply/${tenderId}/runs`);
export const createTenderAutomationRun = (tenderId: string, body: { includePackage?: boolean; requirementIds?: string[] }) => requestJson<TenderAutomationRun>(`/rfp-apply/${tenderId}/runs`, { method: "POST", body: JSON.stringify(body) });
export const cancelTenderAutomationRun = (tenderId: string, runId: string) => requestJson<TenderAutomationRun>(`/rfp-apply/${tenderId}/runs/${runId}/cancel`, { method: "POST" });
export const retryTenderAutomationRun = (tenderId: string, runId: string) => requestJson<TenderAutomationRun>(`/rfp-apply/${tenderId}/runs/${runId}/retry`, { method: "POST" });
export const fetchTenderPackages = (tenderId: string) => requestJson<{ items: TenderSubmissionPackage[] }>(`/tenders/${tenderId}/packages`);
export const createTenderPackage = (tenderId: string) => requestJson<TenderSubmissionPackage>(`/tenders/${tenderId}/packages`, { method: "POST", body: JSON.stringify({}) });
export const approveTenderPackage = (tenderId: string, packageId: string, comment = "") => requestJson<TenderSubmissionPackage>(`/tenders/${tenderId}/packages/${packageId}/approve`, { method: "POST", body: JSON.stringify({ comment }) });
export const downloadTenderPackage = (tenderId: string, packageId: string) => requestJson<{ url: string; expiresInSeconds: number }>(`/tenders/${tenderId}/packages/${packageId}/download`);
export const fetchTenderMilestones = (tenderId: string) => requestJson<{ items: TenderMilestone[] }>(`/tenders/${tenderId}/milestones`);
export const updateTenderMilestones = (tenderId: string, milestones: Array<{ kind: TenderMilestone["kind"]; offsetDays: number }>) => requestJson<{ items: TenderMilestone[] }>(`/tenders/${tenderId}/milestones`, { method: "PUT", body: JSON.stringify({ milestones }) });
export const fetchTenderSubmissions = (tenderId: string) => requestJson<{ items: TenderSubmission[] }>(`/tenders/${tenderId}/submissions`);
export const createTenderSubmission = (tenderId: string, body: { packageId: string; portal: string; portalReference: string; submittedAt: string; notes?: string; receiptFileIds?: string[] }) => requestJson<TenderSubmission>(`/tenders/${tenderId}/submissions`, { method: "POST", body: JSON.stringify(body) });

export async function fetchDashboardSummary(
  params: { pageSize?: number } = {},
  init?: ApiInit,
) {
  const query = new URLSearchParams();
  if (typeof params.pageSize === "number") query.set("pageSize", String(params.pageSize));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestJson<DashboardOverview>(`/dashboard/summary${suffix}`, init);
}

export async function fetchTenders(
  params: {
    workspaceId?: string;
    status?: string;
    tenderType?: string;
    sourceType?: string;
    q?: string;
    search?: string;
    buyer?: string;
    location?: string;
    minValue?: number;
    maxValue?: number;
    deadlineFrom?: string;
    deadlineTo?: string;
    sort?: string;
    saved?: boolean;
    includeArchived?: boolean;
    page?: number;
    pageSize?: number;
  } = {},
  init?: ApiInit,
) {
  const query = new URLSearchParams();
  if (params.workspaceId) query.set("workspaceId", params.workspaceId);
  if (params.status) query.set("status", params.status);
  if (params.tenderType) query.set("tenderType", params.tenderType);
  if (params.sourceType) query.set("sourceType", params.sourceType);
  if (params.q) query.set("q", params.q);
  if (params.search) query.set("search", params.search);
  if (params.buyer) query.set("buyer", params.buyer);
  if (params.location) query.set("location", params.location);
  if (typeof params.minValue === "number") query.set("minValue", String(params.minValue));
  if (typeof params.maxValue === "number") query.set("maxValue", String(params.maxValue));
  if (params.deadlineFrom) query.set("deadlineFrom", params.deadlineFrom);
  if (params.deadlineTo) query.set("deadlineTo", params.deadlineTo);
  if (params.sort) query.set("sort", params.sort);
  if (typeof params.saved === "boolean") query.set("saved", String(params.saved));
  if (typeof params.includeArchived === "boolean") query.set("includeArchived", String(params.includeArchived));
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 25));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestJson<TenderListPayload>(`/tenders${suffix}`, init);
}

export async function fetchWorkspaces(params: { status?: "active" | "archived" | "all" } = {}, init?: ApiInit) {
  const suffix = params.status ? `?status=${params.status}` : "";
  return requestJson<{ items: WorkspaceSummary[] }>(`/workspaces${suffix}`, init);
}

export async function fetchTenderDiscovery(params: TenderDiscoveryParams = {}, init?: ApiInit) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  }
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 20));
  return requestJson<TenderDiscoveryPayload>(`/tender-discovery?${query.toString()}`, init);
}

export async function fetchTenderNotice(noticeId: string, workspaceId: string, init?: ApiInit) {
  return requestJson<TenderNoticeDetail>(`/tender-discovery/${noticeId}?workspaceId=${encodeURIComponent(workspaceId)}`, init);
}

export function saveTenderNotice(noticeId: string, workspaceId: string, init?: ApiInit) {
  return requestJson<{ noticeId: string; workspaceId: string; saved: boolean }>(`/tender-discovery/${noticeId}/save`, { ...init, method: "POST", body: JSON.stringify({ workspaceId }) });
}

export function unsaveTenderNotice(noticeId: string, workspaceId: string, init?: ApiInit) {
  return requestJson<{ noticeId: string; workspaceId: string; saved: boolean }>(`/tender-discovery/${noticeId}/save`, { ...init, method: "DELETE", body: JSON.stringify({ workspaceId }) });
}

export function startTenderApplication(noticeId: string, workspaceId: string, init?: ApiInit) {
  return requestJson<{ tenderId: string; created: boolean }>(`/tender-discovery/${noticeId}/start-application`, { ...init, method: "POST", body: JSON.stringify({ workspaceId }) });
}

export function fetchTenderSourceHealth(init?: ApiInit) {
  return requestJson<{ items: TenderSourceHealth[] }>("/tender-discovery/sources", init);
}

export function fetchTenderIngestionAlerts(init?: ApiInit) {
  return requestJson<{ items: TenderIngestionAlert[] }>("/platform/tender-sources/alerts", init);
}

export function setTenderPortalEnabled(portalKey: string, enabled: boolean, init?: ApiInit) {
  return requestJson<{ portalKey: string; enabled: boolean }>(`/platform/tender-sources/${encodeURIComponent(portalKey)}/${enabled ? "enable" : "disable"}`, { ...init, method: "POST" });
}

export function syncTenderPortal(portalKey: string, mode: "HEAD" | "BACKFILL" | "FULL_REFRESH" | "RECONCILE" = "HEAD", init?: ApiInit) {
  return requestJson<{ enqueued: boolean; jobId: string }>(`/platform/tender-sources/${encodeURIComponent(portalKey)}/sync`, { ...init, method: "POST", body: JSON.stringify({ mode }) });
}
export function resolveTenderIngestionAlert(alertId: string, init?: ApiInit) { return requestJson(`/platform/tender-sources/alerts/${alertId}/resolve`, { ...init, method: "POST" }); }

export function bulkSaveTenderNotices(workspaceId: string, noticeIds: string[], saved: boolean, init?: ApiInit) { return requestJson<{ results: Array<{ noticeId: string; ok: boolean; saved?: boolean; error?: string }> }>("/tender-discovery/bulk/save", { ...init, method: saved ? "POST" : "DELETE", body: JSON.stringify({ workspaceId, noticeIds }) }); }
export function bulkStartTenderApplications(workspaceId: string, noticeIds: string[], init?: ApiInit) { return requestJson<{ results: Array<{ noticeId: string; ok: boolean; tenderId?: string; created?: boolean; error?: string }> }>("/tender-discovery/bulk/start-applications", { ...init, method: "POST", body: JSON.stringify({ workspaceId, noticeIds }) }); }
export function fetchTenderComparison(workspaceId: string, noticeIds: string[], init?: ApiInit) { const query = new URLSearchParams({ workspaceId, noticeIds: noticeIds.join(",") }); return requestJson<{ items: TenderNoticeDetail[] }>(`/tender-discovery/compare?${query}`, init); }
export function fetchTenderSavedSearches(workspaceId: string, init?: ApiInit) { return requestJson<{ items: import("./models").TenderSavedSearch[] }>(`/tender-discovery/saved-searches?workspaceId=${encodeURIComponent(workspaceId)}`, init); }
export function createTenderSavedSearch(body: { workspaceId: string; name: string; query: Record<string, unknown>; cadence: "IMMEDIATE" | "DAILY"; enabled: boolean }, init?: ApiInit) { return requestJson<import("./models").TenderSavedSearch>("/tender-discovery/saved-searches", { ...init, method: "POST", body: JSON.stringify(body) }); }
export function deleteTenderSavedSearch(searchId: string, workspaceId: string, init?: ApiInit) { return requestJson<void>(`/tender-discovery/saved-searches/${searchId}`, { ...init, method: "DELETE", body: JSON.stringify({ workspaceId }) }); }
export function fetchTenderMatchProfile(init?: ApiInit) { return requestJson<import("./models").TenderMatchProfile>("/tender-discovery/match-profile", init); }
export function updateTenderMatchProfile(body: import("./models").TenderMatchProfile, init?: ApiInit) { return requestJson<import("./models").TenderMatchProfile>("/tender-discovery/match-profile", { ...init, method: "PUT", body: JSON.stringify(body) }); }
export function tenderExportUrl(params: TenderDiscoveryParams) { const query = new URLSearchParams(); for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== "") query.set(key, String(value)); return `${VERSION_PREFIX}/tender-discovery/export.csv?${query}`; }
export function fetchTenderDiscoveryAnalytics(workspaceId: string, days = 30, init?: ApiInit) { return requestJson<import("./models").TenderDiscoveryAnalytics>(`/tender-discovery/analytics?workspaceId=${encodeURIComponent(workspaceId)}&days=${days}`, init); }

export async function fetchActivities(
  params: { workspaceId?: string; q?: string; action?: string; entityType?: string; rfpId?: string; actorId?: string } = {},
  init?: ApiInit,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestJson<{ items: import("./models").ActivityItem[] }>(`/activities${suffix}`, init);
}

export async function createTender(
  body: {
    workspaceId: string;
    name: string;
    title: string;
    referenceNumber?: string;
    description?: string;
    buyerName?: string;
    location?: string;
    estimatedValue?: number;
    currency?: string;
    tenderType?: "DOCUMENT" | "ONLINE";
    sourceType?: "DOCUMENT_UPLOAD" | "EMAIL_IMPORT" | "PORTAL" | "MANUAL";
    sourceReference?: Record<string, unknown>;
    sourceUrl?: string;
    ownerId?: string;
    receivedAt?: string;
    dueAt?: string;
    timezone?: string;
    metadata?: Record<string, unknown>;
  },
  init?: ApiInit,
) {
  return requestJson<WorkspaceOverview["tender"]>(`/tenders`, {
    ...init,
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateTender(
  tenderId: string,
  body: {
    name?: string;
    title?: string;
    referenceNumber?: string | null;
    description?: string;
    buyerName?: string | null;
    location?: string | null;
    estimatedValue?: number | null;
    currency?: string;
    tenderType?: "DOCUMENT" | "ONLINE";
    sourceType?: "DOCUMENT_UPLOAD" | "EMAIL_IMPORT" | "PORTAL" | "MANUAL";
    sourceUrl?: string | null;
    dueAt?: string | null;
    timezone?: string;
    metadata?: Record<string, unknown>;
  },
  init?: ApiInit,
) {
  return requestJson<WorkspaceOverview["tender"]>(`/tenders/${tenderId}`, {
    ...init,
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function saveTender(tenderId: string, init?: ApiInit) {
  return requestJson<WorkspaceOverview["tender"]>(`/tenders/${tenderId}/save`, {
    ...init,
    method: "POST",
  });
}

export async function unsaveTender(tenderId: string, init?: ApiInit) {
  return requestJson<WorkspaceOverview["tender"]>(`/tenders/${tenderId}/save`, {
    ...init,
    method: "DELETE",
  });
}

export async function transitionTender(
  tenderId: string,
  body: { to: string; reason?: string; metadata?: Record<string, unknown> },
  init?: ApiInit,
) {
  return requestJson<{ id: string; status: string; previousStatus: string | null; reason: string | null }>(
    `/tenders/${tenderId}/transition`,
    {
      ...init,
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export type TenderSourceUploadIntent = {
  sourceId: string;
  fileId: string;
  uploadUrl: string;
  objectKey: string;
  expiresAt: string;
  source: TenderSource;
  extension: string;
};

export async function createTenderSourceUploadIntent(
  tenderId: string,
  body: {
    sourceType: "DOCUMENT";
    name?: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    metadata?: Record<string, unknown>;
  },
  init?: ApiInit,
) {
  return requestJson<TenderSourceUploadIntent>(`/tenders/${tenderId}/sources`, {
    ...init,
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function uploadTenderSourceBytes(uploadUrl: string, file: File, mimeType: string, timeoutMs = 60_000) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": mimeType },
      body: file,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ApiError("Object storage rejected the document upload.", response.status, "SOURCE_UPLOAD_FAILED");
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ApiError("Document upload timed out. Check that local object storage is running and reachable.", 408, "SOURCE_UPLOAD_TIMEOUT");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function completeTenderSourceUpload(tenderId: string, sourceId: string, init?: ApiInit) {
  return requestJson<TenderSource>(`/tenders/${tenderId}/sources/${sourceId}/complete`, {
    ...init,
    method: "POST",
  });
}

export async function fetchTender(tenderId: string, init?: ApiInit) {
  return requestJson<WorkspaceOverview["tender"]>(`/tenders/${tenderId}`, init);
}

export async function fetchTenderQuestions(tenderId: string, init?: ApiInit) {
  return requestJson<{ items: TenderQuestion[] }>(`/tenders/${tenderId}/questions`, init);
}

export async function fetchTenderRequirements(tenderId: string, init?: ApiInit) {
  return requestJson<{ items: TenderRequirement[] }>(`/tenders/${tenderId}/requirements`, init);
}

export async function fetchTenderAnswers(tenderId: string, init?: ApiInit) {
  return requestJson<{ items: TenderAnswer[] }>(`/tenders/${tenderId}/answers`, init);
}

export async function fetchTenderReviews(tenderId: string, init?: ApiInit) {
  return requestJson<{ items: TenderReview[] }>(`/tenders/${tenderId}/reviews`, init);
}

export async function fetchTenderSources(tenderId: string, init?: ApiInit) {
  return requestJson<{ items: TenderSource[] }>(`/tenders/${tenderId}/sources`, init);
}

export async function parseTenderSource(tenderId: string, sourceId: string, init?: ApiInit) {
  return requestJson<TenderSource>(`/tenders/${tenderId}/sources/${sourceId}/parse`, {
    ...init,
    method: "POST",
  });
}

export async function getTenderDocumentContent(tenderId: string, documentId: string, init?: ApiInit) {
  return requestJson<TenderDocumentContentPayload>(`/tenders/${tenderId}/documents/${documentId}/content`, init);
}

export async function fetchAnswerVersions(tenderId: string, answerId: string, init?: ApiInit) {
  return requestJson<{ items: TenderAnswerVersion[] }>(`/tenders/${tenderId}/answers/${answerId}/versions`, init);
}

export async function fetchAnswerEvidence(tenderId: string, answerId: string, init?: ApiInit) {
  return requestJson<{ items: TenderAnswerEvidence[] }>(`/tenders/${tenderId}/answers/${answerId}/evidence`, init);
}

export async function addAnswerEvidence(
  tenderId: string,
  answerId: string,
  body: {
    evidenceType: string;
    evidenceId: string;
    sourceId?: string;
    sourceVersion?: string | null;
    relevance?: number;
    confidence?: number;
    freshness?: string;
    verifiedAt?: string | null;
    metadata?: Record<string, unknown>;
  },
  init?: ApiInit,
) {
  return requestJson<TenderAnswerEvidence>(`/tenders/${tenderId}/answers/${answerId}/evidence`, {
    ...init,
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function removeAnswerEvidence(tenderId: string, answerId: string, evidenceId: string, init?: ApiInit) {
  return requestJson<TenderAnswerEvidence>(`/tenders/${tenderId}/answers/${answerId}/evidence/${evidenceId}`, {
    ...init,
    method: "DELETE",
  });
}

export async function fetchRequirementEvidence(tenderId: string, requirementId: string, init?: ApiInit) {
  return requestJson<RequirementEvidenceSearchPayload>(`/tenders/${tenderId}/requirements/${requirementId}/evidence`, init);
}

export async function searchRequirementEvidence(
  tenderId: string,
  requirementId: string,
  body: { query?: string; limit?: number; minFinalScore?: number; includeStale?: boolean },
  init?: ApiInit,
) {
  return requestJson<RequirementEvidenceSearchPayload>(
    `/tenders/${tenderId}/requirements/${requirementId}/evidence/search`,
    {
      ...init,
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export async function fetchTenderBrief(tenderId: string, init?: ApiInit) {
  return requestJson<TenderBriefPayload>(`/tenders/${tenderId}/analysis/brief`, {
    ...init,
    method: "POST",
  });
}

export async function analyzeTender(tenderId: string, init?: ApiInit) {
  return requestJson<TenderAnalysisPayload>(`/tenders/${tenderId}/analysis`, {
    ...init,
    method: "POST",
  });
}

export async function generateRequirementAnswer(tenderId: string, requirementId: string, init?: ApiInit) {
  return requestJson<{
    tender: WorkspaceOverview["tender"];
    requirement: TenderRequirement;
    question: TenderQuestion;
    answer: TenderAnswer | null;
    generation: AnswerGenerationPayload | null;
    evidenceState?: "NO_EVIDENCE" | "EVIDENCE_FOUND";
    grounding?: AnswerGenerationPayload["grounding"] | null;
    reason?: string | null;
    suggestedAction?: string | null;
  }>(`/tenders/${tenderId}/requirements/${requirementId}/answer/generate`, {
    ...init,
    method: "POST",
  });
}

export async function improveRequirementAnswer(
  tenderId: string,
  requirementId: string,
  body: { transformation: string },
  init?: ApiInit,
) {
  return requestJson<{
    tender: WorkspaceOverview["tender"];
    requirement: TenderRequirement;
    question: TenderQuestion;
    answer: TenderAnswer | null;
    analysis: AnswerAnalysisResult | null;
    improvement: AnswerImprovementResult | null;
  }>(`/tenders/${tenderId}/requirements/${requirementId}/answer/improve`, {
    ...init,
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function analyzeRequirementAnswer(tenderId: string, requirementId: string, init?: ApiInit) {
  return requestJson<{
    tender: WorkspaceOverview["tender"];
    requirement: TenderRequirement;
    question: TenderQuestion;
    answer: TenderAnswer | null;
    analysis: AnswerAnalysisResult;
    evidence: TenderAnswerEvidence[];
  }>(`/tenders/${tenderId}/requirements/${requirementId}/answer/analyze`, {
    ...init,
    method: "POST",
  });
}

export async function createAnswer(
  tenderId: string,
  questionId: string,
  body: { answerText: string; source?: string; confidence?: number; status?: string; metadata?: Record<string, unknown> },
  init?: ApiInit,
) {
  return requestJson<TenderAnswer>(`/tenders/${tenderId}/questions/${questionId}/answer`, {
    ...init,
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateAnswer(
  tenderId: string,
  answerId: string,
  body: { answerText?: string; source?: string; confidence?: number; status?: string; metadata?: Record<string, unknown> },
  init?: ApiInit,
) {
  return requestJson<TenderAnswer>(`/tenders/${tenderId}/answers/${answerId}`, {
    ...init,
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function createReview(
  answerId: string,
  body: { reviewerId?: string; status?: string; comment?: string },
  init?: ApiInit,
) {
  return requestJson<TenderReview>(`/answers/${answerId}/reviews`, {
    ...init,
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateReview(reviewId: string, body: { status?: string; comment?: string }, init?: ApiInit) {
  return requestJson<TenderReview>(`/reviews/${reviewId}`, {
    ...init,
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function submitTender(tenderId: string, init?: ApiInit) {
  return requestJson<{ id: string; status: string; previousStatus: string | null; reason: string | null }>(`/tenders/${tenderId}/submit`, {
    ...init,
    method: "POST",
  });
}

export async function approveTender(tenderId: string, init?: ApiInit) {
  return requestJson<{ id: string; status: string; previousStatus: string | null; reason: string | null }>(`/tenders/${tenderId}/approve`, {
    ...init,
    method: "POST",
  });
}

export async function fetchKnowledgeList(
  params: { status?: string; search?: string; page?: number; pageSize?: number } = {},
  init?: ApiInit,
) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 25));
  const queryString = query.toString();
  const querySuffix = queryString ? `?${queryString}` : "";
  return requestJson<KnowledgeListPayload>(`/knowledge${querySuffix}`, init);
}

export async function fetchKnowledgeSummary(init?: ApiInit) {
  return requestJson<{
    counts: { total: number; draft: number; active: number; archived: number; stale: number };
    items: KnowledgeListPayload["items"];
    attention: KnowledgeListPayload["items"];
  }>(`/knowledge/summary`, init);
}

export async function fetchKnowledgeItem(id: string, init?: ApiInit) {
  return requestJson<KnowledgeItem>(`/knowledge/${id}`, init);
}

export async function createKnowledge(
  body: {
    name: string;
    type: string;
    category: string;
    version?: string;
    authority?: "high" | "medium" | "low";
    ownerId?: string;
    summary?: string;
    lastVerified?: string;
    expiresAt?: string;
    claims?: Array<{ label: string; value: string; confidence?: number }>;
  },
  init?: ApiInit,
) {
  return requestJson<KnowledgeItem>(`/knowledge`, {
    ...init,
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateKnowledge(
  id: string,
  body: {
    name?: string;
    type?: string;
    category?: string;
    version?: string;
    authority?: "high" | "medium" | "low";
    ownerId?: string;
    summary?: string;
    lastVerified?: string;
    expiresAt?: string | null;
    claims?: Array<{ label: string; value: string; confidence?: number }>;
  },
  init?: ApiInit,
) {
  return requestJson<KnowledgeItem>(`/knowledge/${id}`, {
    ...init,
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function approveKnowledge(id: string, init?: ApiInit) {
  return requestJson<KnowledgeItem>(`/knowledge/${id}/approve`, {
    ...init,
    method: "POST",
  });
}

export async function archiveKnowledge(id: string, init?: ApiInit) {
  return requestJson<KnowledgeItem>(`/knowledge/${id}/archive`, {
    ...init,
    method: "POST",
  });
}
