"use client";

import { useEffect } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  analyzeRequirementAnswer,
  addAnswerEvidence,
  cancelTenderAutomationRun,
  addTeamMember,
  addWorkspaceMember,
  archiveTeam,
  archiveWorkspace,
  analyzeTender,
  approveTender,
  fetchAudits,
  fetchActivities,
  fetchOrganizationCurrent,
  createOrganizationInvitation,
  createTeam,
  createWorkspace,
  fetchOrganizationInvitations,
  fetchOrganizationMembers,
  fetchDashboardSummary,
  approveKnowledge,
  archiveKnowledge,
  createAnswer,
  createKnowledge,
  createTender,
  createReview,
  fetchAnswerEvidence,
  fetchAnswerVersions,
  fetchKnowledgeItem,
  fetchKnowledgeList,
  fetchKnowledgeSummary,
  fetchRequirementEvidence,
  fetchTender,
  fetchTenderAnswers,
  fetchTenderBrief,
  fetchTenderQuestions,
  fetchTenderRequirements,
  fetchTenderReviews,
  fetchTenderSources,
  fetchTenders,
  fetchTenderDiscovery,
  fetchTenderNotice,
  fetchTenderSourceHealth,
  fetchTenderIngestionAlerts,
  setTenderPortalEnabled,
  syncTenderPortal,
  resolveTenderIngestionAlert,
  getTenderDocumentContent,
  fetchTeams,
  fetchWorkspaces,
  fetchWorkspaceOverview,
  fetchRfpApplyProgress,
  fetchRoles,
  fetchTeamMembers,
  fetchWorkspaceMembers,
  generateRequirementAnswer,
  improveRequirementAnswer,
  removeAnswerEvidence,
  updateAnswer,
  updateKnowledge,
  updateReview,
  updateOrganizationCurrent,
  updateOrganizationMember,
  removeOrganizationMember,
  revokeOrganizationInvitation,
  removeTeamMember,
  removeWorkspaceMember,
  parseTenderSource,
  saveTender,
  transitionTender,
  runRfpApply,
  submitTender,
  unsaveTender,
  saveTenderNotice,
  unsaveTenderNotice,
  startTenderApplication,
  bulkSaveTenderNotices,
  bulkStartTenderApplications,
  fetchTenderComparison,
  fetchTenderSavedSearches,
  createTenderSavedSearch,
  deleteTenderSavedSearch,
  fetchTenderMatchProfile,
  updateTenderMatchProfile,
  fetchTenderDiscoveryAnalytics,
  fetchTenderRequirementCandidates,
  extractTenderRequirements,
  decideTenderRequirementCandidates,
  fetchTenderAutomationRuns,
  createTenderAutomationRun,
  retryTenderAutomationRun,
  fetchTenderPackages,
  createTenderPackage,
  approveTenderPackage,
  downloadTenderPackage,
  fetchTenderMilestones,
  updateTenderMilestones,
  fetchTenderSubmissions,
  createTenderSubmission,
} from "./api";
import type { TenderDiscoveryParams } from "./api";
import type {
  DashboardOverview,
  KnowledgeItem,
  KnowledgeListPayload,
  AnswerWorkspacePayload,
  RequirementEvidenceSearchPayload,
  TenderAnswer,
  TenderAnswerEvidence,
  TenderAnswerVersion,
  TenderBriefPayload,
  TenderQuestion,
  TenderSource,
  TenderRequirement,
  TenderReview,
  TenderSummary,
  TenderAnalysisPayload,
  TenderListPayload,
  WorkspaceOverview,
  OrganizationSummary,
  OrganizationMemberSummary,
  OrganizationInvitationSummary,
  RoleSummary,
  TeamSummary,
  WorkspaceMemberSummary,
  TeamMemberSummary,
  AuditLogSummary,
} from "./models";
import { useSelectedWorkspaceId } from "./workspace-selection";

export const tenderKeys = {
  detail: (tenderId: string) => ["tender", tenderId] as const,
  workspace: (tenderId: string) => ["tender", tenderId, "workspace"] as const,
  applyProgress: (tenderId: string) => ["tender", tenderId, "apply", "progress"] as const,
  brief: (tenderId: string) => ["tender", tenderId, "brief"] as const,
  analysis: (tenderId: string) => ["tender", tenderId, "analysis"] as const,
  questions: (tenderId: string) => ["tender", tenderId, "questions"] as const,
  requirements: (tenderId: string) => ["tender", tenderId, "requirements"] as const,
  answers: (tenderId: string) => ["tender", tenderId, "answers"] as const,
  reviews: (tenderId: string) => ["tender", tenderId, "reviews"] as const,
  sources: (tenderId: string) => ["tender", tenderId, "sources"] as const,
  documentContent: (tenderId: string, documentId: string) =>
    ["tender", tenderId, "documents", documentId, "content"] as const,
  answerVersions: (tenderId: string, answerId: string) => ["tender", tenderId, "answers", answerId, "versions"] as const,
  answerEvidence: (tenderId: string, answerId: string) => ["tender", tenderId, "answers", answerId, "evidence"] as const,
  requirementEvidence: (tenderId: string, requirementId: string) =>
    ["tender", tenderId, "requirements", requirementId, "evidence"] as const,
  requirementCandidates: (tenderId: string) => ["tender", tenderId, "requirement-candidates"] as const,
  automationRuns: (tenderId: string) => ["tender", tenderId, "automation-runs"] as const,
  packages: (tenderId: string) => ["tender", tenderId, "packages"] as const,
  milestones: (tenderId: string) => ["tender", tenderId, "milestones"] as const,
  submissions: (tenderId: string) => ["tender", tenderId, "submissions"] as const,
};

export const knowledgeKeys = {
  list: (params?: { status?: string | null; search?: string; page?: number; pageSize?: number }) =>
    [
      "knowledge",
      params?.status ?? "all",
      params?.search ?? "all",
      params?.page ?? 1,
      params?.pageSize ?? 25,
    ] as const,
  item: (id: string) => ["knowledge", id] as const,
};

export const tenderListKeys = {
  list: (params?: {
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
  }) =>
    [
      "tenders",
      params?.workspaceId ?? "all-workspaces",
      params?.status ?? "all-statuses",
      params?.tenderType ?? "all-types",
      params?.sourceType ?? "all-sources",
      params?.q ?? params?.search ?? "all-search",
      params?.buyer ?? "all-buyers",
      params?.location ?? "all-locations",
      params?.minValue ?? "no-min-value",
      params?.maxValue ?? "no-max-value",
      params?.deadlineFrom ?? "no-deadline-from",
      params?.deadlineTo ?? "no-deadline-to",
      params?.sort ?? "updated",
      params?.saved ? "saved" : "all-save-states",
      params?.includeArchived ? "archived" : "active",
      params?.page ?? 1,
      params?.pageSize ?? 25,
    ] as const,
};

export const workspaceKeys = {
  list: () => ["workspaces"] as const,
};

export const tenderDiscoveryKeys = {
  all: ["tender-discovery"] as const,
  list: (params?: TenderDiscoveryParams) => ["tender-discovery", "list", params ?? {}] as const,
  detail: (noticeId: string, workspaceId?: string) => ["tender-discovery", "detail", noticeId, workspaceId ?? ""] as const,
  sources: () => ["tender-discovery", "sources"] as const,
  alerts: () => ["tender-discovery", "alerts"] as const,
  savedSearches: (workspaceId: string) => ["tender-discovery", "saved-searches", workspaceId] as const,
  comparison: (workspaceId: string, ids: string[]) => ["tender-discovery", "comparison", workspaceId, ids] as const,
  matchProfile: () => ["tender-discovery", "match-profile"] as const,
  analytics: (workspaceId: string, days: number) => ["tender-discovery", "analytics", workspaceId, days] as const,
};

export const organizationKeys = {
  current: () => ["organization", "current"] as const,
  members: () => ["organization", "members"] as const,
  invitations: () => ["organization", "invitations"] as const,
  roles: () => ["organization", "roles"] as const,
  teams: () => ["organization", "teams"] as const,
  audits: (params?: { workspaceId?: string; q?: string; action?: string; entityType?: string; entityId?: string; actorId?: string }) =>
    [
      "organization",
      "audits",
      params?.workspaceId ?? "all-workspaces",
      params?.q ?? "all-q",
      params?.action ?? "all-actions",
      params?.entityType ?? "all-entities",
      params?.entityId ?? "all-ids",
      params?.actorId ?? "all-actors",
    ] as const,
};

export function useTender(tenderId: string, initialData?: TenderSummary | null) {
  return useQuery({
    queryKey: tenderKeys.detail(tenderId),
    queryFn: () => fetchTender(tenderId),
    enabled: Boolean(tenderId),
    initialData: initialData ?? undefined,
  });
}

export function useTenderWorkspace(tenderId: string, initialData?: WorkspaceOverview | null) {
  return useQuery({
    queryKey: tenderKeys.workspace(tenderId),
    queryFn: () => fetchWorkspaceOverview(tenderId),
    initialData: initialData ?? undefined,
  });
}

export function useRfpApplyProgress(tenderId: string) {
  return useQuery({
    queryKey: tenderKeys.applyProgress(tenderId),
    queryFn: () => fetchRfpApplyProgress(tenderId),
    enabled: Boolean(tenderId),
  });
}

export function useTenderRequirementCandidates(tenderId: string) { return useQuery({ queryKey: tenderKeys.requirementCandidates(tenderId), queryFn: () => fetchTenderRequirementCandidates(tenderId), enabled: Boolean(tenderId) }); }
export function useTenderAutomationRuns(tenderId: string) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: tenderKeys.automationRuns(tenderId), queryFn: () => fetchTenderAutomationRuns(tenderId), enabled: Boolean(tenderId), staleTime: 10_000, refetchInterval: (current) => current.state.data?.items.some((item) => item.status === "RUNNING" || item.status === "QUEUED") ? 2000 : false });
  const latestId = query.data?.items[0]?.id;
  const latestStatus = query.data?.items[0]?.status;
  useEffect(() => {
    if (latestId && latestStatus && !["QUEUED", "RUNNING"].includes(latestStatus)) {
      void client.invalidateQueries({ queryKey: ["tender", tenderId], predicate: (item) => item.queryKey[2] !== "automation-runs" });
      void client.invalidateQueries({ queryKey: ["dashboard", "summary"] });
    }
  }, [client, tenderId, latestId, latestStatus]);
  return query;
}
export function useTenderPackages(tenderId: string) { return useQuery({ queryKey: tenderKeys.packages(tenderId), queryFn: () => fetchTenderPackages(tenderId), enabled: Boolean(tenderId), staleTime: 15_000 }); }
export function useTenderMilestones(tenderId: string) { return useQuery({ queryKey: tenderKeys.milestones(tenderId), queryFn: () => fetchTenderMilestones(tenderId), enabled: Boolean(tenderId), staleTime: 30_000 }); }
export function useTenderSubmissions(tenderId: string) { return useQuery({ queryKey: tenderKeys.submissions(tenderId), queryFn: () => fetchTenderSubmissions(tenderId), enabled: Boolean(tenderId), staleTime: 15_000 }); }

function useAutomationMutation<TInput, TResult>(tenderId: string, mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn, onSuccess: async () => { await Promise.all([
    queryClient.invalidateQueries({ queryKey: tenderKeys.requirementCandidates(tenderId) }),
    queryClient.invalidateQueries({ queryKey: tenderKeys.requirements(tenderId) }),
    queryClient.invalidateQueries({ queryKey: tenderKeys.questions(tenderId) }),
    queryClient.invalidateQueries({ queryKey: tenderKeys.answers(tenderId) }),
    queryClient.invalidateQueries({ queryKey: tenderKeys.reviews(tenderId) }),
    queryClient.invalidateQueries({ queryKey: tenderKeys.workspace(tenderId) }),
    queryClient.invalidateQueries({ queryKey: tenderKeys.applyProgress(tenderId) }),
    queryClient.invalidateQueries({ queryKey: tenderKeys.automationRuns(tenderId) }),
    queryClient.invalidateQueries({ queryKey: tenderKeys.packages(tenderId) }),
    queryClient.invalidateQueries({ queryKey: tenderKeys.milestones(tenderId) }),
    queryClient.invalidateQueries({ queryKey: tenderKeys.submissions(tenderId) }),
    queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] }),
  ]); } });
}

export function useExtractTenderRequirements(tenderId: string) { return useAutomationMutation<void, { created: number; reused: number }>(tenderId, () => extractTenderRequirements(tenderId)); }
export function useDecideTenderRequirementCandidates(tenderId: string) { return useAutomationMutation<Array<{ candidateId: string; decision: "ACCEPTED" | "REJECTED" }>, unknown>(tenderId, (decisions) => decideTenderRequirementCandidates(tenderId, decisions)); }
export function useCreateTenderAutomationRun(tenderId: string) { return useAutomationMutation<{ includePackage?: boolean }, unknown>(tenderId, (body) => createTenderAutomationRun(tenderId, body)); }
export function useCancelTenderAutomationRun(tenderId: string) { return useAutomationMutation<string, unknown>(tenderId, (runId) => cancelTenderAutomationRun(tenderId, runId)); }
export function useRetryTenderAutomationRun(tenderId: string) { return useAutomationMutation<string, unknown>(tenderId, (runId) => retryTenderAutomationRun(tenderId, runId)); }
export function useCreateTenderPackage(tenderId: string) { return useAutomationMutation<void, unknown>(tenderId, () => createTenderPackage(tenderId)); }
export function useApproveTenderPackage(tenderId: string) { return useAutomationMutation<{ packageId: string; comment?: string }, unknown>(tenderId, ({ packageId, comment }) => approveTenderPackage(tenderId, packageId, comment)); }
export function useDownloadTenderPackage(tenderId: string) { return useMutation({ mutationFn: async (packageId: string) => { const result = await downloadTenderPackage(tenderId, packageId); window.location.assign(result.url); return result; } }); }
export function useUpdateTenderMilestones(tenderId: string) { return useAutomationMutation<Array<{ kind: "REVIEW" | "APPROVAL" | "PACKAGE" | "SUBMISSION"; offsetDays: number }>, unknown>(tenderId, (milestones) => updateTenderMilestones(tenderId, milestones)); }
export function useCreateTenderSubmission(tenderId: string) { return useAutomationMutation<{ packageId: string; portal: string; portalReference: string; submittedAt: string; notes?: string; receiptFileIds?: string[] }, unknown>(tenderId, (body) => createTenderSubmission(tenderId, body)); }

export function useTenderBrief(tenderId: string, initialData?: TenderBriefPayload | null) {
  return useQuery({
    queryKey: tenderKeys.brief(tenderId),
    queryFn: () => fetchTenderBrief(tenderId),
    initialData: initialData ?? undefined,
  });
}

export function useTenderQuestions(tenderId: string, initialData?: { items: TenderQuestion[] } | null) {
  return useQuery({
    queryKey: tenderKeys.questions(tenderId),
    queryFn: () => fetchTenderQuestions(tenderId),
    initialData: initialData ?? undefined,
  });
}

export function useTenderRequirements(tenderId: string, initialData?: { items: TenderRequirement[] } | null) {
  return useQuery({
    queryKey: tenderKeys.requirements(tenderId),
    queryFn: () => fetchTenderRequirements(tenderId),
    initialData: initialData ?? undefined,
  });
}

export function useTenderAnswers(tenderId: string, initialData?: { items: TenderAnswer[] } | null) {
  return useQuery({
    queryKey: tenderKeys.answers(tenderId),
    queryFn: () => fetchTenderAnswers(tenderId),
    initialData: initialData ?? undefined,
  });
}

export function useTenderReviews(tenderId: string, initialData?: { items: TenderReview[] } | null) {
  return useQuery({
    queryKey: tenderKeys.reviews(tenderId),
    queryFn: () => fetchTenderReviews(tenderId),
    initialData: initialData ?? undefined,
  });
}

export function useTenderSources(tenderId: string, initialData?: { items: TenderSource[] } | null) {
  return useQuery({
    queryKey: tenderKeys.sources(tenderId),
    queryFn: () => fetchTenderSources(tenderId),
    initialData: initialData ?? undefined,
  });
}

export function useTenderDocumentContent(tenderId: string, documentId: string | null | undefined) {
  return useQuery({
    queryKey: tenderKeys.documentContent(tenderId, documentId ?? "none"),
    queryFn: () => getTenderDocumentContent(tenderId, documentId ?? ""),
    enabled: Boolean(tenderId && documentId),
  });
}

export function useAnswerVersions(tenderId: string, answerId: string | null | undefined, initialData?: { items: TenderAnswerVersion[] } | null) {
  return useQuery({
    queryKey: tenderKeys.answerVersions(tenderId, answerId ?? "none"),
    queryFn: () => fetchAnswerVersions(tenderId, answerId ?? ""),
    enabled: Boolean(answerId),
    initialData: initialData ?? undefined,
  });
}

export function useAnswerEvidence(tenderId: string, answerId: string | null | undefined, initialData?: { items: TenderAnswerEvidence[] } | null) {
  return useQuery({
    queryKey: tenderKeys.answerEvidence(tenderId, answerId ?? "none"),
    queryFn: () => fetchAnswerEvidence(tenderId, answerId ?? ""),
    enabled: Boolean(answerId),
    initialData: initialData ?? undefined,
  });
}

export function useRequirementEvidence(
  tenderId: string,
  requirementId: string | null | undefined,
  initialData?: RequirementEvidenceSearchPayload | null,
) {
  return useQuery({
    queryKey: tenderKeys.requirementEvidence(tenderId, requirementId ?? "none"),
    queryFn: () => fetchRequirementEvidence(tenderId, requirementId ?? ""),
    enabled: Boolean(requirementId),
    initialData: initialData ?? undefined,
  });
}

export function useKnowledgeList(
  params: { status?: string | null; search?: string; page?: number; pageSize?: number } = {},
  initialData?: KnowledgeListPayload | null,
) {
  return useQuery({
    queryKey: knowledgeKeys.list(params),
    queryFn: () =>
      fetchKnowledgeList({
        status: params.status ?? undefined,
        search: params.search,
        page: params.page,
        pageSize: params.pageSize,
      }),
    initialData: initialData ?? undefined,
    placeholderData: keepPreviousData,
  });
}

export function useDashboardSummary(pageSize = 6, initialData?: DashboardOverview | null) {
  return useQuery({
    queryKey: ["dashboard", "summary", pageSize] as const,
    queryFn: () => fetchDashboardSummary({ pageSize }),
    initialData: initialData ?? undefined,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useTenders(
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
  initialData?: TenderListPayload | null,
) {
  const selectedWorkspaceId = useSelectedWorkspaceId();
  const effectiveParams = {
    ...params,
    workspaceId: params.workspaceId ?? selectedWorkspaceId ?? undefined,
  };
  return useQuery({
    queryKey: tenderListKeys.list(effectiveParams),
    queryFn: () => fetchTenders(effectiveParams),
    initialData: initialData ?? undefined,
    placeholderData: keepPreviousData,
  });
}

export function useWorkspaces(params: { status?: "active" | "archived" | "all" } = {}) {
  return useQuery({
    queryKey: [...workspaceKeys.list(), params.status ?? "active"],
    queryFn: () => fetchWorkspaces(params),
    staleTime: 5 * 60_000,
  });
}

export function useTenderDiscovery(params: TenderDiscoveryParams = {}) {
  const selectedWorkspaceId = useSelectedWorkspaceId();
  const effectiveParams = { ...params, workspaceId: params.workspaceId ?? selectedWorkspaceId ?? undefined };
  return useQuery({ queryKey: tenderDiscoveryKeys.list(effectiveParams), queryFn: () => fetchTenderDiscovery(effectiveParams), enabled: Boolean(effectiveParams.workspaceId), placeholderData: keepPreviousData });
}

export function useTenderNotice(noticeId: string | null) {
  const workspaceId = useSelectedWorkspaceId();
  return useQuery({ queryKey: tenderDiscoveryKeys.detail(noticeId ?? "", workspaceId ?? undefined), queryFn: () => fetchTenderNotice(noticeId ?? "", workspaceId ?? ""), enabled: Boolean(noticeId && workspaceId) });
}

function useTenderNoticeSaveMutation(saved: boolean) {
  const queryClient = useQueryClient();
  const workspaceId = useSelectedWorkspaceId();
  return useMutation({
    mutationFn: (noticeId: string) => {
      if (!workspaceId) throw new Error("Select a workspace before saving a tender.");
      return saved ? saveTenderNotice(noticeId, workspaceId) : unsaveTenderNotice(noticeId, workspaceId);
    },
    onSuccess: async (result) => { await Promise.all([queryClient.invalidateQueries({ queryKey: tenderDiscoveryKeys.all }), queryClient.invalidateQueries({ queryKey: tenderDiscoveryKeys.detail(result.noticeId, workspaceId ?? undefined) })]); },
  });
}

export function useSaveTenderNotice() { return useTenderNoticeSaveMutation(true); }
export function useUnsaveTenderNotice() { return useTenderNoticeSaveMutation(false); }

export function useStartTenderApplication() {
  const queryClient = useQueryClient();
  const workspaceId = useSelectedWorkspaceId();
  return useMutation({
    mutationFn: (noticeId: string) => { if (!workspaceId) throw new Error("Select a workspace before starting an application."); return startTenderApplication(noticeId, workspaceId); },
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: tenderDiscoveryKeys.all }), queryClient.invalidateQueries({ queryKey: ["tenders"] }), queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] })]); },
  });
}

export function useBulkSaveTenderNotices() {
  const queryClient = useQueryClient(); const workspaceId = useSelectedWorkspaceId();
  return useMutation({ mutationFn: ({ noticeIds, saved }: { noticeIds: string[]; saved: boolean }) => { if (!workspaceId) throw new Error("Select a workspace first."); return bulkSaveTenderNotices(workspaceId, noticeIds, saved); }, onSuccess: async () => queryClient.invalidateQueries({ queryKey: tenderDiscoveryKeys.all }) });
}

export function useBulkStartTenderApplications() {
  const queryClient = useQueryClient(); const workspaceId = useSelectedWorkspaceId();
  return useMutation({ mutationFn: (noticeIds: string[]) => { if (!workspaceId) throw new Error("Select a workspace first."); return bulkStartTenderApplications(workspaceId, noticeIds); }, onSuccess: async () => Promise.all([queryClient.invalidateQueries({ queryKey: tenderDiscoveryKeys.all }), queryClient.invalidateQueries({ queryKey: ["tenders"] })]) });
}

export function useTenderComparison(ids: string[], enabled = true) { const workspaceId = useSelectedWorkspaceId(); return useQuery({ queryKey: tenderDiscoveryKeys.comparison(workspaceId ?? "", ids), queryFn: () => fetchTenderComparison(workspaceId ?? "", ids), enabled: enabled && Boolean(workspaceId) && ids.length >= 2 }); }
export function useTenderSavedSearches() { const workspaceId = useSelectedWorkspaceId(); return useQuery({ queryKey: tenderDiscoveryKeys.savedSearches(workspaceId ?? ""), queryFn: () => fetchTenderSavedSearches(workspaceId ?? ""), enabled: Boolean(workspaceId) }); }
export function useCreateTenderSavedSearch() { const workspaceId = useSelectedWorkspaceId(); const client = useQueryClient(); return useMutation({ mutationFn: (input: { name: string; query: Record<string, unknown>; cadence: "IMMEDIATE" | "DAILY" }) => { if (!workspaceId) throw new Error("Select a workspace first."); return createTenderSavedSearch({ workspaceId, ...input, enabled: true }); }, onSuccess: async () => client.invalidateQueries({ queryKey: tenderDiscoveryKeys.savedSearches(workspaceId ?? "") }) }); }
export function useDeleteTenderSavedSearch() { const workspaceId = useSelectedWorkspaceId(); const client = useQueryClient(); return useMutation({ mutationFn: (id: string) => { if (!workspaceId) throw new Error("Select a workspace first."); return deleteTenderSavedSearch(id, workspaceId); }, onSuccess: async () => client.invalidateQueries({ queryKey: tenderDiscoveryKeys.savedSearches(workspaceId ?? "") }) }); }
export function useTenderMatchProfile() { return useQuery({ queryKey: tenderDiscoveryKeys.matchProfile(), queryFn: () => fetchTenderMatchProfile() }); }
export function useTenderDiscoveryAnalytics(days = 30) { const workspaceId = useSelectedWorkspaceId(); return useQuery({ queryKey: tenderDiscoveryKeys.analytics(workspaceId ?? "", days), queryFn: () => fetchTenderDiscoveryAnalytics(workspaceId ?? "", days), enabled: Boolean(workspaceId) }); }
export function useUpdateTenderMatchProfile() { const client = useQueryClient(); return useMutation({ mutationFn: (body: import("./models").TenderMatchProfile) => updateTenderMatchProfile(body), onSuccess: async () => Promise.all([client.invalidateQueries({ queryKey: tenderDiscoveryKeys.matchProfile() }), client.invalidateQueries({ queryKey: tenderDiscoveryKeys.all })]) }); }

export function useTenderSourceHealth() {
  return useQuery({ queryKey: tenderDiscoveryKeys.sources(), queryFn: () => fetchTenderSourceHealth(), retry: false });
}

export function useTenderIngestionAlerts(enabled: boolean) {
  return useQuery({ queryKey: tenderDiscoveryKeys.alerts(), queryFn: () => fetchTenderIngestionAlerts(), enabled, retry: false });
}

export function useSetTenderPortalEnabled() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: ({ portalKey, enabled }: { portalKey: string; enabled: boolean }) => setTenderPortalEnabled(portalKey, enabled), onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: tenderDiscoveryKeys.sources() }), queryClient.invalidateQueries({ queryKey: tenderDiscoveryKeys.all })]); } });
}

export function useSyncTenderPortal() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: ({ portalKey, mode = "HEAD" }: { portalKey: string; mode?: "HEAD" | "BACKFILL" | "FULL_REFRESH" | "RECONCILE" }) => syncTenderPortal(portalKey, mode), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: tenderDiscoveryKeys.sources() }); } });
}
export function useResolveTenderIngestionAlert() { const client = useQueryClient(); return useMutation({ mutationFn: (alertId: string) => resolveTenderIngestionAlert(alertId), onSuccess: async () => Promise.all([client.invalidateQueries({ queryKey: tenderDiscoveryKeys.alerts() }), client.invalidateQueries({ queryKey: tenderDiscoveryKeys.sources() })]) }); }

export function useOrganizationCurrent(initialData?: OrganizationSummary | null) {
  return useQuery({
    queryKey: organizationKeys.current(),
    queryFn: () => fetchOrganizationCurrent(),
    initialData: initialData ?? undefined,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; domain?: string; industry?: string; logoInitials?: string }) =>
      updateOrganizationCurrent(body),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: organizationKeys.current() }),
        queryClient.invalidateQueries({ queryKey: organizationKeys.members() }),
        queryClient.invalidateQueries({ queryKey: organizationKeys.invitations() }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] }),
      ]);
    },
  });
}

export function useOrganizationMembers(initialData?: { members: OrganizationMemberSummary[] } | null) {
  return useQuery({
    queryKey: organizationKeys.members(),
    queryFn: () => fetchOrganizationMembers(),
    initialData: initialData ?? undefined,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useOrganizationInvitations(initialData?: { invitations: OrganizationInvitationSummary[] } | null) {
  return useQuery({
    queryKey: organizationKeys.invitations(),
    queryFn: () => fetchOrganizationInvitations(),
    initialData: initialData ?? undefined,
    staleTime: 60_000,
    retry: false,
  });
}

export function useInviteOrganizationMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createOrganizationInvitation>[0]) => createOrganizationInvitation(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: organizationKeys.invitations() }),
        queryClient.invalidateQueries({ queryKey: organizationKeys.members() }),
        queryClient.invalidateQueries({ queryKey: ["onboarding", "status"] }),
      ]);
    },
  });
}

function useOrganizationAccessMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: organizationKeys.members() }),
        queryClient.invalidateQueries({ queryKey: organizationKeys.invitations() }),
        queryClient.invalidateQueries({ queryKey: organizationKeys.teams() }),
        queryClient.invalidateQueries({ queryKey: workspaceKeys.list() }),
      ]);
    },
  });
}

export function useUpdateOrganizationMember() {
  return useOrganizationAccessMutation(({ userId, body }: { userId: string; body: Parameters<typeof updateOrganizationMember>[1] }) =>
    updateOrganizationMember(userId, body),
  );
}

export function useRemoveOrganizationMember() {
  return useOrganizationAccessMutation((userId: string) => removeOrganizationMember(userId));
}

export function useRevokeOrganizationInvitation() {
  return useOrganizationAccessMutation((invitationId: string) => revokeOrganizationInvitation(invitationId));
}

export function useCreateWorkspace() {
  return useOrganizationAccessMutation((body: Parameters<typeof createWorkspace>[0]) => createWorkspace(body));
}

export function useArchiveWorkspace() {
  return useOrganizationAccessMutation((workspaceId: string) => archiveWorkspace(workspaceId));
}

export function useAddWorkspaceMember() {
  return useOrganizationAccessMutation(({ workspaceId, organizationMemberId }: { workspaceId: string; organizationMemberId: string }) =>
    addWorkspaceMember(workspaceId, organizationMemberId),
  );
}

export function useRemoveWorkspaceMember() {
  return useOrganizationAccessMutation(({ workspaceId, organizationMemberId }: { workspaceId: string; organizationMemberId: string }) =>
    removeWorkspaceMember(workspaceId, organizationMemberId),
  );
}

export function useCreateTeam() {
  return useOrganizationAccessMutation((body: Parameters<typeof createTeam>[0]) => createTeam(body));
}

export function useArchiveTeam() {
  return useOrganizationAccessMutation((teamId: string) => archiveTeam(teamId));
}

export function useAddTeamMember() {
  return useOrganizationAccessMutation(({ teamId, organizationMemberId }: { teamId: string; organizationMemberId: string }) =>
    addTeamMember(teamId, organizationMemberId),
  );
}

export function useRemoveTeamMember() {
  return useOrganizationAccessMutation(({ teamId, organizationMemberId }: { teamId: string; organizationMemberId: string }) =>
    removeTeamMember(teamId, organizationMemberId),
  );
}

export function useRoles(initialData?: { items: RoleSummary[] } | null) {
  return useQuery({
    queryKey: organizationKeys.roles(),
    queryFn: () => fetchRoles(),
    initialData: initialData ?? undefined,
    staleTime: 10 * 60_000,
    retry: false,
  });
}

export function useTeams(initialData?: { items: TeamSummary[] } | null) {
  return useQuery({
    queryKey: organizationKeys.teams(),
    queryFn: () => fetchTeams(),
    initialData: initialData ?? undefined,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useWorkspaceMembers(workspaceId: string | null | undefined, initialData?: { items: WorkspaceMemberSummary[] } | null) {
  return useQuery({
    queryKey: ["workspace", workspaceId ?? "none", "members"] as const,
    queryFn: () => fetchWorkspaceMembers(workspaceId ?? ""),
    enabled: Boolean(workspaceId),
    initialData: initialData ?? undefined,
    retry: false,
  });
}

export function useTeamMembers(teamId: string | null | undefined, initialData?: { items: TeamMemberSummary[] } | null) {
  return useQuery({
    queryKey: ["team", teamId ?? "none", "members"] as const,
    queryFn: () => fetchTeamMembers(teamId ?? ""),
    enabled: Boolean(teamId),
    initialData: initialData ?? undefined,
    retry: false,
  });
}

export function useAudits(
  params: { workspaceId?: string; q?: string; action?: string; entityType?: string; entityId?: string; actorId?: string } = {},
  initialData?: { items: AuditLogSummary[] } | null,
) {
  return useQuery({
    queryKey: organizationKeys.audits(params),
    queryFn: () => fetchAudits(params),
    initialData: initialData ?? undefined,
    retry: false,
  });
}

export function useKnowledgeItem(id: string | null | undefined, initialData?: KnowledgeItem | null) {
  return useQuery({
    queryKey: knowledgeKeys.item(id ?? "none"),
    queryFn: () => fetchKnowledgeItem(id ?? ""),
    enabled: Boolean(id),
    initialData: initialData ?? undefined,
  });
}

export function useKnowledgeSummary() {
  return useQuery({
    queryKey: ["knowledge", "summary"] as const,
    queryFn: () => fetchKnowledgeSummary(),
  });
}

export function useCreateTender() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
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
    }) => createTender(body),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] }),
        queryClient.invalidateQueries({ queryKey: tenderListKeys.list() }),
      ]);
    },
  });
}

function useTenderSaveMutation(saved: boolean) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tenderId: string) => (saved ? saveTender(tenderId) : unsaveTender(tenderId)),
    onSuccess: async (tender) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] }),
        queryClient.invalidateQueries({ queryKey: ["tenders"] }),
        queryClient.invalidateQueries({ queryKey: tenderKeys.detail(tender.id) }),
        queryClient.invalidateQueries({ queryKey: tenderKeys.workspace(tender.id) }),
      ]);
    },
  });
}

export function useSaveTender() {
  return useTenderSaveMutation(true);
}

export function useUnsaveTender() {
  return useTenderSaveMutation(false);
}

export function useActivities(params: { workspaceId?: string; q?: string; action?: string; entityType?: string; rfpId?: string; actorId?: string } = {}) {
  return useQuery({
    queryKey: ["activities", params] as const,
    queryFn: () => fetchActivities(params),
  });
}

export function useTransitionTender(tenderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { to: string; reason?: string }) => transitionTender(tenderId, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] }),
        queryClient.invalidateQueries({ queryKey: tenderKeys.detail(tenderId) }),
        queryClient.invalidateQueries({ queryKey: tenderKeys.workspace(tenderId) }),
        queryClient.invalidateQueries({ queryKey: tenderListKeys.list() }),
      ]);
    },
  });
}

export function useGenerateAnswer(tenderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requirementId: string) => generateRequirementAnswer(tenderId, requirementId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tenderKeys.answers(tenderId) }),
        queryClient.invalidateQueries({ queryKey: ["tender", tenderId, "answers"] }),
        queryClient.invalidateQueries({ queryKey: ["tender", tenderId, "requirements"] }),
        queryClient.invalidateQueries({ queryKey: tenderKeys.workspace(tenderId) }),
        queryClient.invalidateQueries({ queryKey: tenderKeys.brief(tenderId) }),
        queryClient.invalidateQueries({ queryKey: tenderKeys.analysis(tenderId) }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] }),
      ]);
    },
  });
}

export function useRunRfpApply(tenderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { phase?: "ANALYZE" | "GENERATE" | "VALIDATE" | "FULL"; requirementIds?: string[]; limit?: number }) =>
      runRfpApply(tenderId, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tenderKeys.applyProgress(tenderId) }),
        queryClient.invalidateQueries({ queryKey: tenderKeys.workspace(tenderId) }),
        queryClient.invalidateQueries({ queryKey: tenderKeys.answers(tenderId) }),
        queryClient.invalidateQueries({ queryKey: tenderKeys.reviews(tenderId) }),
        queryClient.invalidateQueries({ queryKey: tenderKeys.analysis(tenderId) }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] }),
      ]);
    },
  });
}

function useTenderLifecycleMutation(tenderId: string, mutationFn: () => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tenderKeys.applyProgress(tenderId) }),
        queryClient.invalidateQueries({ queryKey: tenderKeys.workspace(tenderId) }),
        queryClient.invalidateQueries({ queryKey: tenderKeys.detail(tenderId) }),
        queryClient.invalidateQueries({ queryKey: tenderListKeys.list() }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] }),
      ]);
    },
  });
}

export function useApproveTender(tenderId: string) {
  return useTenderLifecycleMutation(tenderId, () => approveTender(tenderId));
}

export function useSubmitTender(tenderId: string) {
  return useTenderLifecycleMutation(tenderId, () => submitTender(tenderId));
}

export function useRegenerateAnswer(tenderId: string) {
  return useGenerateAnswer(tenderId);
}

export function useImproveAnswer(tenderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ requirementId, transformation }: { requirementId: string; transformation: string }) =>
      improveRequirementAnswer(tenderId, requirementId, { transformation }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tenderKeys.answers(tenderId) }),
        queryClient.invalidateQueries({ queryKey: ["tender", tenderId, "answers"] }),
        queryClient.invalidateQueries({ queryKey: tenderKeys.workspace(tenderId) }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] }),
      ]);
    },
  });
}

export function useAnalyzeAnswer(tenderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requirementId: string) => analyzeRequirementAnswer(tenderId, requirementId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tenderKeys.analysis(tenderId) }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] }),
      ]);
    },
  });
}

export function useSaveAnswer(tenderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      questionId: string;
      answerId?: string | null;
      answerText: string;
      source?: string;
      confidence?: number;
      status?: string;
      metadata?: Record<string, unknown>;
    }) =>
      input.answerId
        ? updateAnswer(tenderId, input.answerId, {
            answerText: input.answerText,
            source: input.source,
            confidence: input.confidence,
            status: input.status,
            metadata: input.metadata,
          })
        : createAnswer(tenderId, input.questionId, {
            answerText: input.answerText,
            source: input.source,
            confidence: input.confidence,
            status: input.status,
            metadata: input.metadata,
          }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tenderKeys.answers(tenderId) }),
        queryClient.invalidateQueries({ queryKey: ["tender", tenderId, "answers"] }),
        queryClient.invalidateQueries({ queryKey: tenderKeys.workspace(tenderId) }),
        queryClient.invalidateQueries({ queryKey: tenderKeys.brief(tenderId) }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] }),
      ]);
    },
  });
}

export function useSubmitReview(tenderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { answerId: string; reviewerId?: string; status?: string; comment?: string }) =>
      createReview(input.answerId, {
        reviewerId: input.reviewerId,
        status: input.status,
        comment: input.comment,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tenderKeys.reviews(tenderId) }),
        queryClient.invalidateQueries({ queryKey: tenderKeys.answers(tenderId) }),
        queryClient.invalidateQueries({ queryKey: ["tender", tenderId, "answers"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] }),
      ]);
    },
  });
}

export function useAttachAnswerEvidence(tenderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      answerId: string;
      evidenceType: string;
      evidenceId: string;
      sourceId?: string;
      sourceVersion?: string | null;
      relevance?: number;
      confidence?: number;
      freshness?: string;
      verifiedAt?: string | null;
      metadata?: Record<string, unknown>;
    }) =>
      addAnswerEvidence(tenderId, input.answerId, {
        evidenceType: input.evidenceType,
        evidenceId: input.evidenceId,
        sourceId: input.sourceId,
        sourceVersion: input.sourceVersion,
        relevance: input.relevance,
        confidence: input.confidence,
        freshness: input.freshness,
        verifiedAt: input.verifiedAt,
        metadata: input.metadata,
      }),
    onSuccess: async (_row, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tenderKeys.answers(tenderId) }),
        queryClient.invalidateQueries({ queryKey: tenderKeys.answerEvidence(tenderId, input.answerId) }),
        queryClient.invalidateQueries({ queryKey: tenderKeys.workspace(tenderId) }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] }),
      ]);
    },
  });
}

export function useRemoveAnswerEvidence(tenderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { answerId: string; evidenceId: string }) => removeAnswerEvidence(tenderId, input.answerId, input.evidenceId),
    onSuccess: async (_row, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tenderKeys.answers(tenderId) }),
        queryClient.invalidateQueries({ queryKey: tenderKeys.answerEvidence(tenderId, input.answerId) }),
        queryClient.invalidateQueries({ queryKey: tenderKeys.workspace(tenderId) }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] }),
      ]);
    },
  });
}

export function useUpdateReview(tenderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { reviewId: string; status?: string; comment?: string }) =>
      updateReview(input.reviewId, { status: input.status, comment: input.comment }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tenderKeys.reviews(tenderId) }),
        queryClient.invalidateQueries({ queryKey: tenderKeys.answers(tenderId) }),
        queryClient.invalidateQueries({ queryKey: ["tender", tenderId, "answers"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] }),
      ]);
    },
  });
}

export function useTenderBriefRefresh(tenderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => fetchTenderBrief(tenderId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tenderKeys.brief(tenderId) }),
        queryClient.invalidateQueries({ queryKey: tenderKeys.analysis(tenderId) }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] }),
      ]);
    },
  });
}

export function useAnalyzeTenderMutation(tenderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => analyzeTender(tenderId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tenderKeys.analysis(tenderId) }),
        queryClient.invalidateQueries({ queryKey: tenderKeys.brief(tenderId) }),
        queryClient.invalidateQueries({ queryKey: tenderKeys.sources(tenderId) }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] }),
      ]);
    },
  });
}

export function useParseTenderSource(tenderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sourceId: string) => parseTenderSource(tenderId, sourceId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tenderKeys.sources(tenderId) }),
        queryClient.invalidateQueries({ queryKey: ["tender", tenderId, "documents"] }),
        queryClient.invalidateQueries({ queryKey: ["tender", tenderId, "requirements"] }),
        queryClient.invalidateQueries({ queryKey: ["tender", tenderId, "answers"] }),
        queryClient.invalidateQueries({ queryKey: tenderKeys.workspace(tenderId) }),
        queryClient.invalidateQueries({ queryKey: tenderKeys.brief(tenderId) }),
        queryClient.invalidateQueries({ queryKey: tenderKeys.analysis(tenderId) }),
      ]);
    },
  });
}

export function useCreateKnowledge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof createKnowledge>[0]) => createKnowledge(body),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["knowledge"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] }),
      ]);
    },
  });
}

export function useUpdateKnowledge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof updateKnowledge>[1] }) => updateKnowledge(id, body),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["knowledge"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] }),
      ]);
    },
  });
}

export function useApproveKnowledge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => approveKnowledge(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["knowledge"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] }),
      ]);
    },
  });
}

export function useArchiveKnowledge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveKnowledge(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["knowledge"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] }),
      ]);
    },
  });
}

export type {
  AnswerWorkspacePayload,
  KnowledgeItem,
  KnowledgeListPayload,
  TenderBriefPayload,
  TenderAnalysisPayload,
  TenderSource,
  WorkspaceOverview,
};
