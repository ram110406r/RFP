export const TENDER_TYPES = ["DOCUMENT", "ONLINE"] as const;
export type TenderType = (typeof TENDER_TYPES)[number];

export const TENDER_SOURCE_TYPES = ["DOCUMENT_UPLOAD", "EMAIL_IMPORT", "PORTAL", "MANUAL"] as const;
export type TenderSourceType = (typeof TENDER_SOURCE_TYPES)[number];

export const TENDER_SOURCE_KINDS = [
  "DOCUMENT",
  "URL",
  "ONLINE_FORM",
  "MANUAL",
  "IMPORT",
] as const;
export type TenderSourceKind = (typeof TENDER_SOURCE_KINDS)[number];

export const TENDER_SOURCE_STATUSES = ["REGISTERED", "READY", "REMOVED"] as const;
export type TenderSourceStatus = (typeof TENDER_SOURCE_STATUSES)[number];

export const TENDER_STATUSES = [
  "DRAFT",
  "INTAKE",
  "PROCESSING",
  "READY",
  "IN_PROGRESS",
  "REVIEW",
  "APPROVED",
  "SUBMITTED",
  "CLOSED",
  "CANCELLED",
  "ARCHIVED",
] as const;
export type TenderStatus = (typeof TENDER_STATUSES)[number];

export const TENDER_QUESTION_STATUSES = [
  "UNASSIGNED",
  "ASSIGNED",
  "IN_PROGRESS",
  "ANSWERED",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "NOT_APPLICABLE",
] as const;
export type TenderQuestionStatus = (typeof TENDER_QUESTION_STATUSES)[number];

export const TENDER_QUESTION_TYPES = [
  "TEXT",
  "LONG_TEXT",
  "YES_NO",
  "SINGLE_SELECT",
  "MULTI_SELECT",
  "NUMBER",
  "DATE",
  "FILE",
  "TABLE",
] as const;
export type TenderQuestionType = (typeof TENDER_QUESTION_TYPES)[number];

export const TENDER_REQUIREMENT_TYPES = [
  "COMPLIANCE",
  "TECHNICAL",
  "LEGAL",
  "COMMERCIAL",
  "SECURITY",
  "DOCUMENTATION",
  "GENERAL",
] as const;
export type TenderRequirementType = (typeof TENDER_REQUIREMENT_TYPES)[number];

export const TENDER_REQUIREMENT_STATUSES = [
  "UNASSIGNED",
  "ASSIGNED",
  "IN_PROGRESS",
  "ANSWERED",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "NOT_APPLICABLE",
] as const;
export type TenderRequirementStatus = (typeof TENDER_REQUIREMENT_STATUSES)[number];

export const TENDER_ANSWER_STATUSES = [
  "DRAFT",
  "GENERATED",
  "IN_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "REJECTED",
  "FINAL",
] as const;
export type TenderAnswerStatus = (typeof TENDER_ANSWER_STATUSES)[number];

export const TENDER_ANSWER_SOURCES = ["MANUAL", "IMPORTED", "AI_GENERATED"] as const;
export type TenderAnswerSource = (typeof TENDER_ANSWER_SOURCES)[number];

export const ANSWER_GENERATION_RISKS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type AnswerGenerationRisk = (typeof ANSWER_GENERATION_RISKS)[number];

export const ANSWER_GENERATION_STATUSES = ["AI_DRAFT", "INSUFFICIENT_EVIDENCE", "NEEDS_REVIEW"] as const;
export type AnswerGenerationStatus = (typeof ANSWER_GENERATION_STATUSES)[number];

export const ANSWER_GENERATION_EVIDENCE_STATES = ["NO_EVIDENCE", "EVIDENCE_FOUND"] as const;
export type AnswerGenerationEvidenceState = (typeof ANSWER_GENERATION_EVIDENCE_STATES)[number];

export const ANSWER_GROUNDING_STATUSES = ["SUPPORTED", "PARTIALLY_SUPPORTED", "UNSUPPORTED"] as const;
export type AnswerGroundingStatus = (typeof ANSWER_GROUNDING_STATUSES)[number];

export interface AnswerGenerationEvidenceSummary {
  evidenceId: string;
  sourceId: string;
  sourceVersion: string | null;
  evidenceType: string;
  title: string;
  content: string;
  freshness: string;
  relevance: number;
  authority: number;
  verifiedAt?: string | null;
  sourceTitle?: string | null;
  sourceAuthority?: string | null;
}

export interface AnswerGroundingSummary {
  status: AnswerGroundingStatus;
  coverage: number;
  supportedClaims: number;
  unsupportedClaims: number;
  contradictions: Array<{ claim: string; evidenceIds: string[]; reason: string }>;
  missingEvidence: string[];
  warnings: string[];
  metadata: Record<string, unknown>;
}

export interface AnswerGenerationResult {
  answer: string | null;
  confidence: number;
  evidenceIds: string[];
  risk: AnswerGenerationRisk;
  status: AnswerGenerationStatus;
  metadata: Record<string, unknown>;
  evidenceState?: AnswerGenerationEvidenceState;
  grounding?: AnswerGroundingSummary | null;
}

export interface AnswerImprovementResult {
  answer: string | null;
  changes: string[];
  evidenceIds: string[];
  risk: AnswerGenerationRisk;
  status: AnswerGenerationStatus;
  warnings: string[];
  metadata: Record<string, unknown>;
}

export interface AnswerAnalysisClaim {
  claim: string;
  evidenceIds: string[];
  supported: boolean;
  reason: string;
}

export interface AnswerAnalysisResult {
  coverage: number;
  supportedClaims: number;
  unsupportedClaims: number;
  contradictions: Array<{ claim: string; evidenceIds: string[]; reason: string }>;
  missingEvidence: string[];
  risk: AnswerGenerationRisk;
  readiness: "READY" | "NEEDS_REVIEW" | "HIGH_RISK" | "INSUFFICIENT_EVIDENCE";
  warnings: string[];
  claims: AnswerAnalysisClaim[];
  metadata: Record<string, unknown>;
}

export interface TenderBriefResult {
  overview: string;
  keyRequirements: string[];
  questions: Array<{ id: string; question: string; group: string }>;
  documents: Array<{ id: string; name: string; role: string }>;
  dates: Array<{ label: string; value: string | null }>;
  risks: string[];
  missingInformation: string[];
  clarifications: string[];
  metadata: Record<string, unknown>;
}

export interface RequirementAnalysisResult {
  category: string;
  summary: string;
  questionClassification: string;
  missingInformation: string[];
  readiness: "READY" | "NEEDS_REVIEW" | "HIGH_RISK" | "INSUFFICIENT_EVIDENCE";
  risk: AnswerGenerationRisk;
  warnings: string[];
  metadata: Record<string, unknown>;
}

export interface ClarificationSuggestion {
  question: string;
  reason: string;
}

export interface ClarificationResult {
  readiness: "READY" | "NEEDS_REVIEW" | "HIGH_RISK" | "INSUFFICIENT_EVIDENCE";
  risk: AnswerGenerationRisk;
  suggestions: ClarificationSuggestion[];
  missingInformation: string[];
  metadata: Record<string, unknown>;
}

export const TENDER_REVIEW_STATUSES = [
  "PENDING",
  "APPROVED",
  "CHANGES_REQUESTED",
  "REJECTED",
] as const;
export type TenderReviewStatus = (typeof TENDER_REVIEW_STATUSES)[number];

export const TENDER_VALIDATION_SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export type TenderValidationSeverity = (typeof TENDER_VALIDATION_SEVERITIES)[number];

export interface TenderValidationCategory {
  id: string;
  label: string;
  value: number;
  total: number | null;
  tone: "success" | "warning" | "danger" | "neutral";
  hint: string;
}

export interface TenderValidationIssue {
  id: string;
  severity: TenderValidationSeverity;
  title: string;
  detail: string;
  recommendation: string;
  blocking: boolean;
  questionId?: string;
  requirementId?: string;
  answerId?: string;
  evidenceId?: string;
}

export interface TenderValidationRun {
  id: string;
  score: number;
  ready: boolean;
  categories: TenderValidationCategory[];
  issues: TenderValidationIssue[];
  createdBy: string | null;
  createdAt: string;
}

export const TENDER_DOCUMENT_ROLES = [
  "SOURCE_TENDER",
  "ATTACHMENT",
  "RESPONSE_DOCUMENT",
] as const;
export type TenderDocumentRole = (typeof TENDER_DOCUMENT_ROLES)[number];

export interface TenderSourceReference {
  kind?: string;
  [key: string]: unknown;
}

export interface TenderResourceContext {
  organizationId: string;
  workspaceId?: string | null;
}
