import type {
  AnswerAnalysisResult,
  AnswerImprovementResult,
} from "@rfp-os/types";
import type { User } from "firebase/auth";

import type {
  AnswerGenerationPayload,
  KnowledgeItem,
  KnowledgeListPayload,
  DashboardOverview,
  RequirementEvidenceSearchPayload,
  TenderAnswer,
  TenderAnswerEvidence,
  TenderAnswerVersion,
  TenderAnalysisPayload,
  TenderBriefPayload,
  TenderListPayload,
  TenderQuestion,
  TenderSource,
  TenderRequirement,
  TenderReview,
  WorkspaceSummary,
  WorkspaceOverview,
} from "./models";

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
  accountState: "NO_ORGANIZATION" | "PENDING_INVITATION" | "MULTIPLE_INVITATIONS" | "EXPIRED_INVITATION" | "INVITATION_ACCEPTED" | "ACTIVE_MEMBER";
  hasMembership: boolean;
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

export function startOnboarding(body: { journey: "COMPANY" | "EMPLOYEE"; invitationId?: string }, init?: ApiInit) {
  return requestJson("/onboarding/start", { ...init, method: "POST", body: JSON.stringify(body) });
}

export function acceptOnboardingInvitation(invitationId: string, init?: ApiInit) {
  return requestJson("/onboarding/invitation/accept", { ...init, method: "POST", body: JSON.stringify({ invitationId }) });
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
  if (process.env.NODE_ENV === "production") {
    throw new Error("API_INTERNAL_URL is required in production.");
  }
  return "http://127.0.0.1:4100";
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

export async function fetchDashboardSummary(
  params: { pageSize?: number } = {},
  init?: ApiInit,
) {
  const query = new URLSearchParams();
  if (typeof params.pageSize === "number") query.set("pageSize", String(params.pageSize));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestJson<DashboardOverview>(`/dashboard/summary${suffix}`, init);
}

export async function fetchDashboardOverview(
  params: { pageSize?: number } = {},
  init?: ApiInit,
) {
  return fetchDashboardSummary(params, init);
}

export async function fetchTenders(
  params: {
    workspaceId?: string;
    status?: string;
    tenderType?: string;
    search?: string;
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
  if (params.search) query.set("search", params.search);
  if (typeof params.includeArchived === "boolean") query.set("includeArchived", String(params.includeArchived));
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 25));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestJson<TenderListPayload>(`/tenders${suffix}`, init);
}

export async function fetchWorkspaces(init?: ApiInit) {
  return requestJson<{ items: WorkspaceSummary[] }>(`/workspaces`, init);
}

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
    tenderType?: "DOCUMENT" | "ONLINE";
    sourceType?: "DOCUMENT_UPLOAD" | "EMAIL_IMPORT" | "PORTAL" | "MANUAL";
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

export async function uploadTenderSourceBytes(uploadUrl: string, file: File) {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!response.ok) {
    throw new ApiError("Object storage rejected the document upload.", response.status, "SOURCE_UPLOAD_FAILED");
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

export async function fetchAnswerVersions(tenderId: string, answerId: string, init?: ApiInit) {
  return requestJson<{ items: TenderAnswerVersion[] }>(`/tenders/${tenderId}/answers/${answerId}/versions`, init);
}

export async function fetchAnswerEvidence(tenderId: string, answerId: string, init?: ApiInit) {
  return requestJson<{ items: TenderAnswerEvidence[] }>(`/tenders/${tenderId}/answers/${answerId}/evidence`, init);
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
