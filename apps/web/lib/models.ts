import type {
  AnswerAnalysisResult,
  AnswerGenerationResult,
  AnswerImprovementResult,
  ClarificationResult,
  RequirementAnalysisResult,
  TenderBriefResult,
  TenderValidationRun,
  AnswerGroundingSummary,
} from "@rfp-os/types";

export interface TenderSummary {
  id: string;
  organizationId: string;
  workspaceId: string;
  name: string;
  title: string;
  referenceNumber: string | null;
  description: string;
  tenderType: string;
  sourceType: string;
  sourceReference: Record<string, unknown>;
  sourceUrl: string | null;
  status: string;
  ownerId: string;
  createdBy: string | null;
  receivedAt: string | null;
  dueAt: string | null;
  timezone: string;
  metadata: Record<string, unknown>;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TenderSource {
  id: string;
  organizationId: string;
  workspaceId: string;
  tenderId: string;
  sourceType: string;
  name: string;
  externalReference: Record<string, unknown>;
  sourceUrl: string | null;
  fileId: string | null;
  mimeType: string | null;
  fileSize: number;
  checksum: string | null;
  status: string;
  parseStatus: "REGISTERED" | "UPLOADED" | "PARSED" | "REMOVED";
  parsedAt: string | null;
  createdBy: string | null;
  metadata: Record<string, unknown>;
  removedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceOverview {
  tender: TenderSummary;
  counts: {
    questions: number;
    requirements: number;
    answers: number;
    sources: number;
    reviews: number;
  };
  validation: {
    tenderId: string;
    latestRun: TenderValidationRun | null;
    current: {
      score: number;
      ready: boolean;
      categories: Array<{
        id: string;
        label: string;
        value: number;
        total: number | null;
        tone: "success" | "warning" | "danger" | "neutral";
        hint: string;
      }>;
      issues: Array<{
        id: string;
        severity: string;
        title: string;
        detail: string;
        recommendation: string;
        blocking: boolean;
        questionId?: string;
        requirementId?: string;
        answerId?: string;
        evidenceId?: string;
      }>;
    };
  };
  sections: Array<{ id: string; label: string; items: number }>;
}

export interface RfpApplyProgress {
  tenderId: string;
  status: string;
  phases: {
    intake: { status: string; count: number };
    analysis: { status: string; count: number };
    response: { status: string; count: number };
    review: { status: string; count: number };
    validation: { status: string; score: number; ready: boolean; issueCount: number };
    approval: { status: string };
    submission: { status: string };
  };
}

export interface RfpApplyRunResult {
  phase: "ANALYZE" | "GENERATE" | "VALIDATE" | "FULL";
  result: unknown;
  generated: Array<{ requirementId: string; result?: unknown; error?: string }>;
  progress: RfpApplyProgress;
  nextAction: string | null;
}

export interface TenderListPayload {
  items: TenderSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ActivityItem {
  id: string;
  workspaceId: string | null;
  rfpId: string | null;
  actorId: string | null;
  actorLabel: string;
  kind: string;
  label: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface WorkspaceSummary {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  legalName: string;
  slug: string | null;
  status: string;
  domain: string;
  plan: string;
  seats: number;
  industry: string | null;
  country: string;
  operatingRegion: string;
  profile: Record<string, unknown>;
  logoInitials: string | null;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
}

export interface OrganizationMemberSummary {
  organizationMemberId: string;
  userId: string;
  role: string;
  status: string;
  joinedAt: string;
  name: string;
  email: string;
  jobTitle: string;
  team: string;
}

export interface OrganizationInvitationSummary {
  id: string;
  email: string;
  role: string;
  workspaceId: string | null;
  proposedDepartment: string | null;
  proposedTeamId: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export interface OrganizationInvitationCreated {
  invitation: OrganizationInvitationSummary;
  acceptUrl: string;
}

export interface RoleSummary {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  organizationId: string | null;
  createdAt: string;
  updatedAt: string;
  permissionKeys: string[];
  assignmentCount: number;
  organizationAssignmentCount: number;
  workspaceAssignmentCount: number;
}

export interface TeamSummary {
  id: string;
  organizationId: string;
  workspaceId: string | null;
  name: string;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMemberSummary {
  workspaceMemberId: string;
  organizationMemberId: string;
  status: string;
  userId: string;
  name: string;
  email: string;
}

export interface TeamMemberSummary {
  teamMemberId: string;
  organizationMemberId: string;
  userId: string;
  name: string;
  email: string;
}

export interface AuditLogSummary {
  id: string;
  organizationId: string;
  workspaceId: string | null;
  actorId: string | null;
  actorType: string;
  action: string;
  entityType: string;
  entityId: string;
  previousValue: unknown;
  newValue: unknown;
  beforeState: unknown;
  afterState: unknown;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  correlationId: string | null;
  createdAt: string;
}

export interface TenderQuestion {
  id: string;
  organizationId: string;
  workspaceId: string;
  tenderId: string;
  questionNumber: string | null;
  section: string;
  questionText: string;
  questionType: string;
  required: boolean;
  status: string;
  sourceReference: Record<string, unknown>;
  sortOrder: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  requirementIds: string[];
}

export interface TenderRequirement {
  id: string;
  organizationId: string;
  workspaceId: string;
  tenderId: string;
  requirementCode: string | null;
  title: string;
  description: string;
  requirementType: string;
  mandatory: boolean;
  status: string;
  sourceReference: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  questionIds: string[];
}

export interface TenderAnswer {
  id: string;
  organizationId: string;
  workspaceId: string;
  tenderId: string;
  questionId: string;
  answerText: string;
  status: string;
  source: string;
  confidence: number;
  createdBy: string | null;
  updatedBy: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  versionCount: number;
  evidenceCount: number;
  reviewCount: number;
}

export interface TenderAnswerVersion {
  id: string;
  organizationId: string;
  workspaceId: string;
  tenderId: string;
  answerId: string;
  versionNumber: number;
  content: string;
  source: string;
  createdBy: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface TenderAnswerEvidence {
  id: string;
  organizationId: string;
  workspaceId: string;
  tenderId: string;
  answerId: string;
  sourceId: string | null;
  sourceVersion: string | null;
  evidenceType: string;
  evidenceId: string;
  relevance: number;
  confidence: number;
  freshness: string;
  verifiedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface EvidenceCandidate {
  evidenceId: string;
  sourceId: string;
  sourceVersion: string | null;
  evidenceType: string;
  title: string;
  snippet: string;
  freshness: string;
  relevanceScore: number;
  authorityScore: number;
  ownerId?: string | null;
  verifiedAt?: string | null;
  freshnessScore?: number;
  authority?: string;
  metadata: Record<string, unknown>;
}

export interface RequirementEvidenceSearchPayload {
  requirement: TenderRequirement;
  candidates: EvidenceCandidate[];
  selected: EvidenceCandidate[];
  query: string | null;
}

export interface TenderReview {
  id: string;
  organizationId: string;
  workspaceId: string;
  tenderId: string;
  answerId: string;
  reviewerId: string | null;
  reviewerName?: string | null;
  status: string;
  comment: string;
  createdAt: string;
  updatedAt: string;
}

export interface TenderBriefPayload {
  tender: TenderSummary;
  brief: TenderBriefResult;
  sections: Array<{ id: string; label: string; items: number }>;
}

export interface TenderAnalysisPayload {
  tender: TenderSummary;
  brief: TenderBriefResult;
  sections: Array<{ id: string; label: string; items: number }>;
  questionClassifications: Array<{ id: string; questionText: string; group: string }>;
  requirementAnalyses: Array<{ requirementId: string; analysis: RequirementAnalysisResult }>;
  missingInformation: string[];
  clarifications: ClarificationResult;
}

export interface AnswerGenerationPayload extends AnswerGenerationResult {
  evidence: Array<{
    evidenceId: string;
    sourceId: string;
    sourceVersion: string | null;
    evidenceType: string;
    title: string;
    content: string;
    freshness: string;
    relevance: number;
    authority: number;
  }>;
  prompt: string;
  reason?: string | null;
  suggestedAction?: string | null;
  grounding?: AnswerGroundingSummary | null;
}

export interface AnswerWorkspacePayload {
  tender: TenderSummary;
  requirement: TenderRequirement;
  question: TenderQuestion;
  answer: TenderAnswer | null;
  analysis: AnswerAnalysisResult | null;
  improvement: AnswerImprovementResult | null;
  generation: AnswerGenerationPayload | null;
  evidence: TenderAnswerEvidence[];
  versions: TenderAnswerVersion[];
  reviews: TenderReview[];
  availableEvidence: TenderAnswerEvidence[];
}

export interface KnowledgeClaim {
  id?: string;
  label: string;
  value: string;
  confidence: number;
}

export interface KnowledgeVersion {
  id: string;
  version: string;
  date: string;
  note: string;
}

export interface KnowledgeItem {
  id: string;
  organizationId: string;
  name: string;
  type: string;
  category: string;
  version: string;
  authority: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  ownerId: string;
  lastVerified: string | null;
  lastUpdated: string;
  expiresAt: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  claims?: KnowledgeClaim[];
  versions?: KnowledgeVersion[];
}

export interface KnowledgeListPayload {
  items: KnowledgeItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DashboardIssue {
  id: string;
  severity: string;
  title: string;
  detail: string;
  recommendation: string;
  blocking: boolean;
  questionId?: string;
  requirementId?: string;
  answerId?: string;
  evidenceId?: string;
}

export interface DashboardTenderCard {
  tender: TenderSummary;
  readiness: number | null;
  ready: boolean;
  issueCount: number;
  blockingIssueCount: number;
  highestIssue: DashboardIssue | null;
  pendingReviews: number;
  totalReviews: number;
}

export interface DashboardKnowledgeHealth {
  counts: {
    total: number;
    draft: number;
    active: number;
    archived: number;
    stale: number;
  };
  items: KnowledgeItem[];
  attention: KnowledgeItem[];
}

export interface DashboardAiActivity {
  totalAnswers: number;
  aiGenerated: number;
  imported: number;
  manual: number;
  inReview: number;
  approved: number;
  final: number;
  aiAccepted: number;
  aiAcceptanceRate: number | null;
}

export interface DashboardEvidenceHealth {
  total: number;
  answerCount: number;
  answersWithEvidence: number;
  answersWithoutEvidence: number;
  fresh: number;
  aging: number;
  stale: number;
  expired: number;
  unknown: number;
  coverageRate: number | null;
  freshnessRate: number | null;
}

export interface DashboardSummary {
  generatedAt: string;
  metrics: {
    activeRfps: number;
    dueThisWeek: number;
    awaitingReview: number;
    highRiskItems: number;
    averageReadiness: number | null;
    submissionReady: number;
    blockedFromSubmission: number;
    aiDraftAcceptance: number | null;
    evidenceFreshness: number | null;
  };
  pipeline: Array<{
    id: string;
    label: string;
    count: number;
  }>;
  activeTenders: DashboardTenderCard[];
  reviewQueue: {
    count: number;
    items: Array<{
      id: string;
      tenderId: string;
      title: string;
      name: string;
      pendingReviews: number;
      dueAt: string | null;
      readiness: number | null;
      status: string;
    }>;
  };
  attention: Array<{
    id: string;
    kind: "tender" | "review" | "knowledge" | "evidence" | "deadline";
    title: string;
    detail: string;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    href?: string;
  }>;
  deadlines: {
    overdue: {
      count: number;
      items: Array<{
        id: string;
        tenderId: string;
        title: string;
        name: string;
        dueAt: string | null;
        readiness: number | null;
        status: string;
      }>;
    };
    dueThisWeek: {
      count: number;
      items: Array<{
        id: string;
        tenderId: string;
        title: string;
        name: string;
        dueAt: string | null;
        readiness: number | null;
        status: string;
      }>;
    };
    later: {
      count: number;
      items: Array<{
        id: string;
        tenderId: string;
        title: string;
        name: string;
        dueAt: string | null;
        readiness: number | null;
        status: string;
      }>;
    };
    unscheduled: {
      count: number;
      items: Array<{
        id: string;
        tenderId: string;
        title: string;
        name: string;
        dueAt: string | null;
        readiness: number | null;
        status: string;
      }>;
    };
  };
  submissionReadiness: {
    ready: number;
    blocked: number;
    items: Array<{
      id: string;
      tenderId: string;
      title: string;
      name: string;
      readiness: number | null;
      blockingIssueCount: number;
      ready: boolean;
      status: string;
    }>;
  };
  aiActivity: DashboardAiActivity | null;
  evidenceHealth: DashboardEvidenceHealth | null;
  knowledge: DashboardKnowledgeHealth;
  aiActivitySummary?: DashboardAiActivity | null;
  evidenceHealthSummary?: DashboardEvidenceHealth | null;
  knowledgeHealth?: DashboardKnowledgeHealth;
  errors: Array<{ section: string; message: string }>;
}

export interface DashboardOverview extends DashboardSummary {
  tenders: DashboardTenderCard[];
  knowledge: DashboardKnowledgeHealth;
}
