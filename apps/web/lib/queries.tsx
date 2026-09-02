"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  analyzeRequirementAnswer,
  analyzeTender,
  fetchAudits,
  fetchActivities,
  fetchOrganizationCurrent,
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
  fetchTeams,
  fetchWorkspaces,
  fetchWorkspaceOverview,
  fetchRoles,
  fetchTeamMembers,
  fetchWorkspaceMembers,
  generateRequirementAnswer,
  improveRequirementAnswer,
  updateAnswer,
  updateKnowledge,
  updateReview,
  updateOrganizationCurrent,
  parseTenderSource,
  transitionTender,
} from "./api";
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

export const tenderKeys = {
  detail: (tenderId: string) => ["tender", tenderId] as const,
  workspace: (tenderId: string) => ["tender", tenderId, "workspace"] as const,
  brief: (tenderId: string) => ["tender", tenderId, "brief"] as const,
  analysis: (tenderId: string) => ["tender", tenderId, "analysis"] as const,
  questions: (tenderId: string) => ["tender", tenderId, "questions"] as const,
  requirements: (tenderId: string) => ["tender", tenderId, "requirements"] as const,
  answers: (tenderId: string) => ["tender", tenderId, "answers"] as const,
  reviews: (tenderId: string) => ["tender", tenderId, "reviews"] as const,
  sources: (tenderId: string) => ["tender", tenderId, "sources"] as const,
  answerVersions: (tenderId: string, answerId: string) => ["tender", tenderId, "answers", answerId, "versions"] as const,
  answerEvidence: (tenderId: string, answerId: string) => ["tender", tenderId, "answers", answerId, "evidence"] as const,
  requirementEvidence: (tenderId: string, requirementId: string) =>
    ["tender", tenderId, "requirements", requirementId, "evidence"] as const,
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
    search?: string;
    includeArchived?: boolean;
    page?: number;
    pageSize?: number;
  }) =>
    [
      "tenders",
      params?.workspaceId ?? "all-workspaces",
      params?.status ?? "all-statuses",
      params?.tenderType ?? "all-types",
      params?.search ?? "all-search",
      params?.includeArchived ? "archived" : "active",
      params?.page ?? 1,
      params?.pageSize ?? 25,
    ] as const,
};

export const workspaceKeys = {
  list: () => ["workspaces"] as const,
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
  });
}

export function useTenders(
  params: {
    workspaceId?: string;
    status?: string;
    tenderType?: string;
    search?: string;
    includeArchived?: boolean;
    page?: number;
    pageSize?: number;
  } = {},
  initialData?: TenderListPayload | null,
) {
  return useQuery({
    queryKey: tenderListKeys.list(params),
    queryFn: () => fetchTenders(params),
    initialData: initialData ?? undefined,
    placeholderData: keepPreviousData,
  });
}

export function useWorkspaces() {
  return useQuery({
    queryKey: workspaceKeys.list(),
    queryFn: () => fetchWorkspaces(),
  });
}

export function useOrganizationCurrent(initialData?: OrganizationSummary | null) {
  return useQuery({
    queryKey: organizationKeys.current(),
    queryFn: () => fetchOrganizationCurrent(),
    initialData: initialData ?? undefined,
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
    retry: false,
  });
}

export function useOrganizationInvitations(initialData?: { invitations: OrganizationInvitationSummary[] } | null) {
  return useQuery({
    queryKey: organizationKeys.invitations(),
    queryFn: () => fetchOrganizationInvitations(),
    initialData: initialData ?? undefined,
    retry: false,
  });
}

export function useRoles(initialData?: { items: RoleSummary[] } | null) {
  return useQuery({
    queryKey: organizationKeys.roles(),
    queryFn: () => fetchRoles(),
    initialData: initialData ?? undefined,
    retry: false,
  });
}

export function useTeams(initialData?: { items: TeamSummary[] } | null) {
  return useQuery({
    queryKey: organizationKeys.teams(),
    queryFn: () => fetchTeams(),
    initialData: initialData ?? undefined,
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
