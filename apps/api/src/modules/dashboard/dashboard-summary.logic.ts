export type TenderSummaryLike = {
  id: string;
  name: string;
  title: string;
  referenceNumber: string | null;
  status: string;
  dueAt: string | Date | null;
};

export type KnowledgeItemLike = {
  id: string;
  name: string;
  type: string;
  category: string;
  version: string;
  authority: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  ownerId: string | null;
  lastVerified: string | Date | null;
  lastUpdated: string | Date | null;
  expiresAt: string | Date | null;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type DashboardIssue = {
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
};

export type DashboardTenderCard = {
  tender: TenderSummaryLike;
  readiness: number | null;
  ready: boolean;
  issueCount: number;
  blockingIssueCount: number;
  highestIssue: DashboardIssue | null;
  pendingReviews: number;
  totalReviews: number;
};

export type DashboardKnowledgeHealth = {
  counts: {
    total: number;
    draft: number;
    active: number;
    archived: number;
    stale: number;
  };
  items: KnowledgeItemLike[];
  attention: KnowledgeItemLike[];
};

export type DashboardAiActivity = {
  totalAnswers: number;
  aiGenerated: number;
  imported: number;
  manual: number;
  inReview: number;
  approved: number;
  final: number;
  aiAccepted: number;
  aiAcceptanceRate: number | null;
};

export type DashboardEvidenceHealth = {
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
};

export type DashboardSectionError = {
  section: string;
  message: string;
};

export type DashboardSummaryInput = {
  generatedAt: string;
  pageSize: number;
  tenders: DashboardTenderCard[];
  knowledge: DashboardKnowledgeHealth;
  aiActivity: DashboardAiActivity | null;
  evidenceHealth: DashboardEvidenceHealth | null;
  errors: DashboardSectionError[];
};

export type DashboardSummary = DashboardSummaryInput & {
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
      dueAt: string | Date | null;
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
        dueAt: string | Date | null;
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
        dueAt: string | Date | null;
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
        dueAt: string | Date | null;
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
        dueAt: string | Date | null;
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
  knowledgeHealth: DashboardKnowledgeHealth;
  aiActivitySummary: DashboardAiActivity | null;
  evidenceHealthSummary: DashboardEvidenceHealth | null;
};

export function buildDashboardSummary(input: DashboardSummaryInput): DashboardSummary {
  const previewSize = Math.max(1, input.pageSize);
  const pipelineCounts = new Map<string, number>();
  const deadlines = {
    overdue: [] as DashboardSummary["deadlines"]["overdue"]["items"],
    dueThisWeek: [] as DashboardSummary["deadlines"]["dueThisWeek"]["items"],
    later: [] as DashboardSummary["deadlines"]["later"]["items"],
    unscheduled: [] as DashboardSummary["deadlines"]["unscheduled"]["items"],
  };
  const reviewQueueItems = [] as DashboardSummary["reviewQueue"]["items"];
  const submissionItems = [] as DashboardSummary["submissionReadiness"]["items"];
  const attention: DashboardSummary["attention"] = [];
  let dueThisWeekCount = 0;
  let awaitingReview = 0;
  let highRiskItems = 0;
  let readinessTotal = 0;
  let readinessCount = 0;
  let readyCount = 0;
  let blockedCount = 0;
  let aiAccepted = 0;
  let aiGenerated = 0;
  let evidenceFreshnessCount = 0;
  let evidenceFreshnessTotal = 0;

  for (const tender of input.tenders) {
    const bucket = mapPipelineStage(tender.tender.status);
    pipelineCounts.set(bucket, (pipelineCounts.get(bucket) ?? 0) + 1);

    if (typeof tender.readiness === "number") {
      readinessTotal += tender.readiness;
      readinessCount += 1;
    }
    if (tender.ready) readyCount += 1;
    if (tender.blockingIssueCount > 0 || !tender.ready) blockedCount += 1;

    const dueBucket: "overdue" | "dueThisWeek" | "later" | "unscheduled" = classifyDueDate(tender.tender.dueAt);
    const deadlineItem = {
      id: tender.tender.id,
      tenderId: tender.tender.id,
      title: tender.tender.title,
      name: tender.tender.name,
      dueAt: tender.tender.dueAt,
      readiness: tender.readiness,
      status: tender.tender.status,
    };
    deadlines[dueBucket].push(deadlineItem);
    if (dueBucket === "dueThisWeek") dueThisWeekCount += 1;

    if (tender.pendingReviews > 0) {
      awaitingReview += tender.pendingReviews;
      reviewQueueItems.push({
        id: tender.tender.id,
        tenderId: tender.tender.id,
        title: tender.tender.title,
        name: tender.tender.name,
        pendingReviews: tender.pendingReviews,
        dueAt: tender.tender.dueAt,
        readiness: tender.readiness,
        status: tender.tender.status,
      });
    }

    if (tender.highestIssue && isHighRiskSeverity(tender.highestIssue.severity)) {
      highRiskItems += 1;
      attention.push({
        id: `${tender.tender.id}-${tender.highestIssue.id}`,
        kind: "tender",
        title: tender.highestIssue.title,
        detail: tender.tender.title,
        severity: tender.highestIssue.severity as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
        href: `/tenders/${tender.tender.id}`,
      });
    }

    submissionItems.push({
      id: tender.tender.id,
      tenderId: tender.tender.id,
      title: tender.tender.title,
      name: tender.tender.name,
      readiness: tender.readiness,
      blockingIssueCount: tender.blockingIssueCount,
      ready: tender.ready,
      status: tender.tender.status,
    });
  }

  if (input.aiActivity) {
    aiAccepted = input.aiActivity.aiAccepted;
    aiGenerated = input.aiActivity.aiGenerated;
  }

  if (input.evidenceHealth) {
    evidenceFreshnessTotal = input.evidenceHealth.total;
    evidenceFreshnessCount = input.evidenceHealth.fresh + input.evidenceHealth.aging;
  }

  const pipeline = [
    { id: "intake", label: "Intake", count: pipelineCounts.get("intake") ?? 0 },
    { id: "answering", label: "Answering", count: pipelineCounts.get("answering") ?? 0 },
    { id: "review", label: "Review", count: pipelineCounts.get("review") ?? 0 },
    { id: "approval", label: "Approval", count: pipelineCounts.get("approval") ?? 0 },
    { id: "ready", label: "Ready", count: pipelineCounts.get("ready") ?? 0 },
    { id: "submitted", label: "Submitted", count: pipelineCounts.get("submitted") ?? 0 },
  ];

  reviewQueueItems.sort((a, b) => {
    if (b.pendingReviews !== a.pendingReviews) return b.pendingReviews - a.pendingReviews;
    return compareDueDate(a.dueAt, b.dueAt);
  });
  deadlines.overdue.sort((a, b) => compareDueDate(a.dueAt, b.dueAt));
  deadlines.dueThisWeek.sort((a, b) => compareDueDate(a.dueAt, b.dueAt));
  deadlines.later.sort((a, b) => compareDueDate(a.dueAt, b.dueAt));
  deadlines.unscheduled.sort((a, b) => a.title.localeCompare(b.title));
  submissionItems.sort((a, b) => {
    if (a.ready !== b.ready) return a.ready ? -1 : 1;
    if (b.blockingIssueCount !== a.blockingIssueCount) return b.blockingIssueCount - a.blockingIssueCount;
    return a.title.localeCompare(b.title);
  });
  attention.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

  const averageReadiness = readinessCount === 0 ? null : Math.round(readinessTotal / readinessCount);
  const aiAcceptanceRate = aiGenerated === 0 ? null : Math.round((aiAccepted / aiGenerated) * 100);
  const evidenceFreshnessPercent = evidenceFreshnessTotal === 0 ? null : Math.round((evidenceFreshnessCount / evidenceFreshnessTotal) * 100);

  return {
    ...input,
    metrics: {
      activeRfps: input.tenders.length,
      dueThisWeek: dueThisWeekCount,
      awaitingReview,
      highRiskItems,
      averageReadiness,
      submissionReady: readyCount,
      blockedFromSubmission: blockedCount,
      aiDraftAcceptance: aiAcceptanceRate,
      evidenceFreshness: evidenceFreshnessPercent,
    },
    pipeline,
    activeTenders: input.tenders.slice(0, previewSize),
    reviewQueue: {
      count: reviewQueueItems.length,
      items: reviewQueueItems.slice(0, previewSize),
    },
    attention: [
      ...attention.slice(0, 4),
      ...input.knowledge.attention.slice(0, 2).map((item) => ({
        id: item.id,
        kind: "knowledge" as const,
        title: item.name,
        detail: item.summary,
        severity: item.status === "DRAFT" ? ("HIGH" as const) : ("MEDIUM" as const),
        href: "/knowledge",
      })),
    ].slice(0, 6),
    deadlines: {
      overdue: { count: deadlines.overdue.length, items: deadlines.overdue.slice(0, previewSize) },
      dueThisWeek: { count: deadlines.dueThisWeek.length, items: deadlines.dueThisWeek.slice(0, previewSize) },
      later: { count: deadlines.later.length, items: deadlines.later.slice(0, previewSize) },
      unscheduled: { count: deadlines.unscheduled.length, items: deadlines.unscheduled.slice(0, previewSize) },
    },
    submissionReadiness: {
      ready: readyCount,
      blocked: blockedCount,
      items: submissionItems.slice(0, previewSize),
    },
    knowledgeHealth: input.knowledge,
    aiActivitySummary: input.aiActivity,
    evidenceHealthSummary: input.evidenceHealth,
    knowledge: input.knowledge,
    aiActivity: input.aiActivity,
    evidenceHealth: input.evidenceHealth,
    errors: input.errors,
  };
}

export function mapPipelineStage(status: string) {
  const normalized = status.toUpperCase();
  if (["DRAFT", "INTAKE", "PROCESSING"].includes(normalized)) return "intake";
  if (normalized === "IN_PROGRESS") return "answering";
  if (normalized === "REVIEW") return "review";
  if (normalized === "APPROVED") return "approval";
  if (normalized === "READY") return "ready";
  if (["SUBMITTED", "CLOSED"].includes(normalized)) return "submitted";
  return "intake";
}

function classifyDueDate(value: string | Date | null): "overdue" | "dueThisWeek" | "later" | "unscheduled" {
  if (!value) return "unscheduled";
  const diffDays = Math.floor((normalizeDate(value).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "overdue";
  if (diffDays <= 7) return "dueThisWeek";
  return "later";
}

function compareDueDate(a: string | Date | null, b: string | Date | null) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return normalizeDate(a).getTime() - normalizeDate(b).getTime();
}

function normalizeDate(value: string | Date) {
  return value instanceof Date ? value : new Date(value);
}

function severityRank(severity: string) {
  if (severity === "CRITICAL") return 4;
  if (severity === "HIGH") return 3;
  if (severity === "MEDIUM") return 2;
  if (severity === "LOW") return 1;
  return 0;
}

function isHighRiskSeverity(severity: string) {
  return severity === "HIGH" || severity === "CRITICAL";
}
