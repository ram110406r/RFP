export type RiskLevel = "low" | "medium" | "high" | "critical";
export type RfpStatus =
  | "draft"
  | "analyzing"
  | "in_progress"
  | "review"
  | "needs_attention"
  | "submitted"
  | "won"
  | "lost";
export type RequirementStatus =
  "unanswered" | "drafted" | "needs_review" | "changes_requested" | "approved" | "rejected";
export type Freshness = "fresh" | "aging" | "stale" | "conflicting";
export type Authority = "high" | "medium" | "low";
export type RequirementCategory =
  "Security" | "Commercial" | "Compliance" | "Product" | "Legal" | "Architecture" | "Support";

export interface Person {
  id: string;
  name: string;
  role: string;
  team: string;
  initials: string;
}

export interface Rfp {
  id: string;
  title: string;
  customer: string;
  ownerId: string;
  opportunity: string;
  estimatedValue: number;
  deadline: string;
  status: RfpStatus;
  progress: number;
  requirementsTotal: number;
  requirementsComplete: number;
  mandatoryTotal: number;
  mandatoryComplete: number;
  riskCount: Record<RiskLevel, number>;
  needsReview: number;
  evidenceCoverage: number;
  readiness: number;
  createdAt: string;
  documents: RfpDocument[];
  collaboratorIds: string[];
}

export interface RfpDocument {
  id: string;
  name: string;
  type: "PDF" | "DOCX" | "XLSX" | "PPTX" | "ZIP" | "HTML";
  sizeMb: number;
  status: "queued" | "processing" | "ready" | "failed";
}

export interface Requirement {
  id: string;
  rfpId: string;
  code: string;
  title: string;
  question: string;
  category: RequirementCategory;
  mandatory: boolean;
  risk: RiskLevel;
  riskRationale: string;
  confidence: number;
  status: RequirementStatus;
  ownerTeam: string;
  answer: string;
  answerSource: "ai_draft" | "human_edited" | "reused";
  evidenceIds: string[];
  reviewerId: string | null;
  dueDate: string;
  activity: ActivityEntry[];
}

export interface Evidence {
  id: string;
  title: string;
  sourceId: string;
  sourceName: string;
  excerpt: string;
  verifiedAt: string;
  freshnessDays: number;
  confidence: number;
  url: string;
}

export interface KnowledgeSource {
  id: string;
  name: string;
  type: string;
  category: string;
  version: string;
  authority: Authority;
  freshness: Freshness;
  ownerId: string;
  lastVerified: string;
  lastUpdated: string;
  expiresAt: string;
  usedByAnswers: number;
  staleRiskAnswers: number;
  summary: string;
  claims: { id: string; label: string; value: string; confidence: number }[];
  versions: { version: string; date: string; note: string }[];
  conflicts: {
    id: string;
    topic: string;
    variants: { label: string; value: string }[];
    recommended: string;
    action: string;
  }[];
}

export interface ReviewItem {
  id: string;
  requirementId: string;
  rfpId: string;
  rfpTitle: string;
  requirementCode: string;
  requirementTitle: string;
  category: RequirementCategory;
  risk: RiskLevel;
  confidence: number;
  reviewerId: string;
  due: string;
  status: "pending" | "in_review" | "approved" | "rejected" | "changes_requested";
  mine: boolean;
  overdue: boolean;
  comments: { id: string; authorId: string; at: string; body: string }[];
  history: { id: string; at: string; label: string; actorId: string }[];
}

export interface ActivityEntry {
  id: string;
  at: string;
  kind:
    | "assigned"
    | "approved"
    | "evidence"
    | "comment"
    | "risk"
    | "submission"
    | "generated"
    | "rejected";
  label: string;
  actor: string;
  rfpId?: string;
}

export interface ValidationCategory {
  id: string;
  label: string;
  value: number;
  total: number | null;
  tone: "neutral" | "success" | "warning" | "danger";
  hint: string;
}

export interface ValidationIssue {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  issue: string;
  requirementCode: string;
  reason: string;
  action: string;
}

export interface SubmissionVersion {
  id: string;
  label: string;
  createdAt: string;
  createdBy: string;
  note: string;
  checklist: { id: string; label: string; done: boolean }[];
  artifacts: { id: string; label: string; description: string; ready: boolean }[];
}

export interface NotificationItem {
  id: string;
  category: "Reviews" | "Assignments" | "Risks" | "Deadlines" | "Knowledge" | "Submissions";
  title: string;
  detail: string;
  at: string;
  read: boolean;
  severity: "info" | "warning" | "danger";
}

export interface AnalyticsSnapshot {
  kpis: { id: string; label: string; value: string; delta: number; hint: string }[];
  volume: { month: string; received: number; submitted: number }[];
  winLoss: { month: string; won: number; lost: number }[];
  riskDistribution: { name: string; value: number }[];
  acceptance: { month: string; accepted: number; edited: number }[];
  completionTime: { month: string; days: number }[];
  /**
   * Review counts per team. There is deliberately no `hours` field: the
   * schema has no time-tracking entity, and a permanent zero is
   * indistinguishable from missing data at the chart.
   */
  smePerformance: { team: string; reviews: number }[];
}

export interface OrgProfile {
  name: string;
  domain: string;
  plan: "Starter" | "Growth" | "Enterprise";
  seats: number;
  seatsUsed: number;
  industry: string;
  logoInitials: string;
}

export interface MemberSetting {
  id: string;
  personId: string;
  email: string;
  role: "Admin" | "Proposal Manager" | "Contributor" | "Reviewer" | "Viewer";
  status: "active" | "invited" | "suspended";
  lastActive: string;
}

export interface RoleSetting {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  permissions: string[];
}

export interface AiSetting {
  id: string;
  label: string;
  description: string;
  value: boolean | number | string;
  kind: "toggle" | "select" | "slider";
  options?: string[];
  /** Upper bound for `kind: "slider"` settings; defaults to 100 when omitted. */
  max?: number;
}

export interface IntegrationSetting {
  id: string;
  name: string;
  category: string;
  connected: boolean;
  description: string;
  lastSynced: string | null;
}

export interface NotificationPreference {
  id: string;
  category: string;
  label: string;
  email: boolean;
  inApp: boolean;
  digest: boolean;
}

export interface ApiKeySetting {
  id: string;
  label: string;
  prefix: string;
  createdAt: string;
  lastUsed: string | null;
  scopes: string[];
}

export interface McpConnection {
  id: string;
  name: string;
  transport: "stdio" | "http" | "sse";
  status: "connected" | "disconnected" | "error";
  toolsExposed: number;
  description: string;
}
