import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { timestamps } from "./_shared";
import { files } from "./files";
import { users } from "./identity";
import { organizations } from "./organization";
import { workspaces } from "./foundation";

export const tenderTypeEnum = pgEnum("tender_type", ["DOCUMENT", "ONLINE"]);

export const tenderSourceTypeEnum = pgEnum("tender_source_type", [
  "DOCUMENT_UPLOAD",
  "EMAIL_IMPORT",
  "PORTAL",
  "MANUAL",
]);

export const tenderStatusEnum = pgEnum("tender_status", [
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
]);

export const tenderQuestionStatusEnum = pgEnum("tender_question_status", [
  "UNASSIGNED",
  "ASSIGNED",
  "IN_PROGRESS",
  "ANSWERED",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "NOT_APPLICABLE",
]);

export const tenderQuestionTypeEnum = pgEnum("tender_question_type", [
  "TEXT",
  "LONG_TEXT",
  "YES_NO",
  "SINGLE_SELECT",
  "MULTI_SELECT",
  "NUMBER",
  "DATE",
  "FILE",
  "TABLE",
]);

export const tenderRequirementTypeEnum = pgEnum("tender_requirement_type", [
  "COMPLIANCE",
  "TECHNICAL",
  "LEGAL",
  "COMMERCIAL",
  "SECURITY",
  "DOCUMENTATION",
  "GENERAL",
]);

export const tenderRequirementStatusEnum = pgEnum("tender_requirement_status", [
  "UNASSIGNED",
  "ASSIGNED",
  "IN_PROGRESS",
  "ANSWERED",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "NOT_APPLICABLE",
]);

export const tenderAnswerStatusEnum = pgEnum("tender_answer_status", [
  "DRAFT",
  "GENERATED",
  "IN_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "REJECTED",
  "FINAL",
]);

export const tenderAnswerSourceEnum = pgEnum("tender_answer_source", [
  "MANUAL",
  "IMPORTED",
  "AI_GENERATED",
]);

export const tenderReviewStatusEnum = pgEnum("tender_review_status", [
  "PENDING",
  "APPROVED",
  "CHANGES_REQUESTED",
  "REJECTED",
]);

export const tenderDocumentRoleEnum = pgEnum("tender_document_role", [
  "SOURCE_TENDER",
  "ATTACHMENT",
  "RESPONSE_DOCUMENT",
]);

export const tenderSourceKindEnum = pgEnum("tender_source_kind", [
  "DOCUMENT",
  "URL",
  "ONLINE_FORM",
  "MANUAL",
  "IMPORT",
]);

export const tenderSourceStatusEnum = pgEnum("tender_source_status", [
  "REGISTERED",
  "READY",
  "REMOVED",
]);

export const evidenceFreshnessEnum = pgEnum("evidence_freshness", [
  "FRESH",
  "AGING",
  "STALE",
  "EXPIRED",
  "UNKNOWN",
]);

export const tenders = pgTable(
  "tenders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    title: text("title").notNull(),
    referenceNumber: text("reference_number"),
    description: text("description").notNull().default(""),
    buyerName: text("buyer_name"),
    location: text("location"),
    estimatedValue: numeric("estimated_value", { precision: 14, scale: 2 }),
    currency: text("currency").notNull().default("INR"),
    tenderType: tenderTypeEnum("tender_type").notNull(),
    sourceType: tenderSourceTypeEnum("source_type").notNull(),
    sourceReference: jsonb("source_reference").$type<Record<string, unknown>>().notNull().default({}),
    sourceUrl: text("source_url"),
    status: tenderStatusEnum("status").notNull().default("DRAFT"),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    timezone: text("timezone").notNull().default("UTC"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("tenders_org_idx").on(t.organizationId),
    index("tenders_workspace_idx").on(t.workspaceId),
    index("tenders_org_status_idx").on(t.organizationId, t.status),
    index("tenders_org_type_idx").on(t.organizationId, t.tenderType),
    index("tenders_org_source_type_idx").on(t.organizationId, t.sourceType),
    index("tenders_org_buyer_idx").on(t.organizationId, t.buyerName),
    index("tenders_org_location_idx").on(t.organizationId, t.location),
    index("tenders_estimated_value_idx").on(t.estimatedValue),
    index("tenders_owner_idx").on(t.ownerId),
    index("tenders_due_idx").on(t.dueAt),
    uniqueIndex("tenders_org_reference_uq").on(t.organizationId, t.referenceNumber),
  ],
);

export const savedTenders = pgTable(
  "saved_tenders",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    tenderId: uuid("tender_id")
      .notNull()
      .references(() => tenders.id, { onDelete: "cascade" }),
    savedBy: uuid("saved_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.tenderId] }),
    index("saved_tenders_org_idx").on(t.organizationId),
    index("saved_tenders_workspace_idx").on(t.workspaceId),
    index("saved_tenders_tender_idx").on(t.tenderId),
    index("saved_tenders_saved_by_idx").on(t.savedBy),
  ],
);

export const tenderStatusHistory = pgTable(
  "tender_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    tenderId: uuid("tender_id")
      .notNull()
      .references(() => tenders.id, { onDelete: "cascade" }),
    fromStatus: tenderStatusEnum("from_status"),
    toStatus: tenderStatusEnum("to_status").notNull(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tender_status_history_org_idx").on(t.organizationId),
    index("tender_status_history_tender_idx").on(t.tenderId),
    index("tender_status_history_tender_created_idx").on(t.tenderId, t.createdAt),
  ],
);

export const tenderQuestions = pgTable(
  "tender_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    tenderId: uuid("tender_id")
      .notNull()
      .references(() => tenders.id, { onDelete: "cascade" }),
    questionNumber: text("question_number"),
    section: text("section").notNull().default(""),
    questionText: text("question_text").notNull(),
    questionType: tenderQuestionTypeEnum("question_type").notNull().default("TEXT"),
    required: boolean("required").notNull().default(false),
    status: tenderRequirementStatusEnum("status").notNull().default("UNASSIGNED"),
    sourceReference: jsonb("source_reference").$type<Record<string, unknown>>().notNull().default({}),
    sortOrder: integer("sort_order").notNull().default(0),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [
    index("tender_questions_org_idx").on(t.organizationId),
    index("tender_questions_workspace_idx").on(t.workspaceId),
    index("tender_questions_tender_idx").on(t.tenderId),
    index("tender_questions_status_idx").on(t.status),
    index("tender_questions_sort_idx").on(t.tenderId, t.sortOrder),
  ],
);

export const tenderRequirements = pgTable(
  "tender_requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    tenderId: uuid("tender_id")
      .notNull()
      .references(() => tenders.id, { onDelete: "cascade" }),
    requirementCode: text("requirement_code"),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    requirementType: tenderRequirementTypeEnum("requirement_type").notNull().default("GENERAL"),
    mandatory: boolean("mandatory").notNull().default(false),
    status: tenderQuestionStatusEnum("status").notNull().default("UNASSIGNED"),
    sourceReference: jsonb("source_reference").$type<Record<string, unknown>>().notNull().default({}),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [
    index("tender_requirements_org_idx").on(t.organizationId),
    index("tender_requirements_workspace_idx").on(t.workspaceId),
    index("tender_requirements_tender_idx").on(t.tenderId),
    uniqueIndex("tender_requirements_tender_code_uq").on(t.tenderId, t.requirementCode),
  ],
);

export const tenderQuestionRequirements = pgTable(
  "tender_question_requirements",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => tenderQuestions.id, { onDelete: "cascade" }),
    requirementId: uuid("requirement_id")
      .notNull()
      .references(() => tenderRequirements.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.questionId, t.requirementId] }),
    index("tender_question_requirements_org_idx").on(t.organizationId),
    index("tender_question_requirements_workspace_idx").on(t.workspaceId),
  ],
);

export const tenderAnswers = pgTable(
  "tender_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    tenderId: uuid("tender_id")
      .notNull()
      .references(() => tenders.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => tenderQuestions.id, { onDelete: "cascade" }),
    answerText: text("answer_text").notNull().default(""),
    status: tenderAnswerStatusEnum("status").notNull().default("DRAFT"),
    source: tenderAnswerSourceEnum("source").notNull().default("MANUAL"),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull().default("0"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [
    index("tender_answers_org_idx").on(t.organizationId),
    index("tender_answers_workspace_idx").on(t.workspaceId),
    index("tender_answers_tender_idx").on(t.tenderId),
    uniqueIndex("tender_answers_question_uq").on(t.questionId),
    index("tender_answers_status_idx").on(t.status),
  ],
);

export const tenderAnswerVersions = pgTable(
  "tender_answer_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    tenderId: uuid("tender_id")
      .notNull()
      .references(() => tenders.id, { onDelete: "cascade" }),
    answerId: uuid("answer_id")
      .notNull()
      .references(() => tenderAnswers.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    content: text("content").notNull().default(""),
    source: tenderAnswerSourceEnum("source").notNull().default("MANUAL"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tender_answer_versions_org_idx").on(t.organizationId),
    index("tender_answer_versions_workspace_idx").on(t.workspaceId),
    index("tender_answer_versions_tender_idx").on(t.tenderId),
    uniqueIndex("tender_answer_versions_answer_version_uq").on(t.answerId, t.versionNumber),
    index("tender_answer_versions_answer_idx").on(t.answerId),
  ],
);

export const tenderAnswerEvidence = pgTable(
  "tender_answer_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    tenderId: uuid("tender_id")
      .notNull()
      .references(() => tenders.id, { onDelete: "cascade" }),
    answerId: uuid("answer_id")
      .notNull()
      .references(() => tenderAnswers.id, { onDelete: "cascade" }),
    sourceId: text("source_id"),
    sourceVersion: text("source_version"),
    evidenceType: text("evidence_type").notNull(),
    evidenceId: text("evidence_id").notNull(),
    relevance: numeric("relevance", { precision: 4, scale: 3 }).notNull().default("0"),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull().default("0"),
    freshness: evidenceFreshnessEnum("freshness").notNull().default("UNKNOWN"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tender_answer_evidence_org_idx").on(t.organizationId),
    index("tender_answer_evidence_answer_idx").on(t.answerId),
    index("tender_answer_evidence_source_idx").on(t.sourceId),
    uniqueIndex("tender_answer_evidence_answer_evidence_uq").on(
      t.answerId,
      t.evidenceType,
      t.evidenceId,
      t.sourceId,
      t.sourceVersion,
    ),
  ],
);

export const tenderValidationRuns = pgTable(
  "tender_validation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    tenderId: uuid("tender_id")
      .notNull()
      .references(() => tenders.id, { onDelete: "cascade" }),
    score: integer("score").notNull().default(0),
    ready: boolean("ready").notNull().default(false),
    categories: jsonb("categories").$type<Record<string, unknown>[]>().notNull().default([]),
    issues: jsonb("issues").$type<Record<string, unknown>[]>().notNull().default([]),
    result: jsonb("result").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tender_validation_runs_org_idx").on(t.organizationId),
    index("tender_validation_runs_workspace_idx").on(t.workspaceId),
    index("tender_validation_runs_tender_idx").on(t.tenderId),
  ],
);

export const tenderAnswerReviews = pgTable(
  "tender_answer_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    tenderId: uuid("tender_id")
      .notNull()
      .references(() => tenders.id, { onDelete: "cascade" }),
    answerId: uuid("answer_id")
      .notNull()
      .references(() => tenderAnswers.id, { onDelete: "cascade" }),
    reviewerId: uuid("reviewer_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: tenderReviewStatusEnum("status").notNull().default("PENDING"),
    comment: text("comment").notNull().default(""),
    ...timestamps,
  },
  (t) => [
    index("tender_answer_reviews_org_idx").on(t.organizationId),
    index("tender_answer_reviews_answer_idx").on(t.answerId),
    index("tender_answer_reviews_reviewer_idx").on(t.reviewerId),
    uniqueIndex("tender_answer_reviews_answer_reviewer_uq").on(t.answerId, t.reviewerId),
  ],
);

export const tenderDocuments = pgTable(
  "tender_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    tenderId: uuid("tender_id")
      .notNull()
      .references(() => tenders.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => files.id, { onDelete: "restrict" }),
    documentRole: tenderDocumentRoleEnum("document_role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tender_documents_org_idx").on(t.organizationId),
    index("tender_documents_tender_idx").on(t.tenderId),
    uniqueIndex("tender_documents_tender_document_role_uq").on(
      t.tenderId,
      t.documentId,
      t.documentRole,
    ),
  ],
);

export const tenderSources = pgTable(
  "tender_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    tenderId: uuid("tender_id")
      .notNull()
      .references(() => tenders.id, { onDelete: "cascade" }),
    sourceType: tenderSourceKindEnum("source_type").notNull().default("DOCUMENT"),
    name: text("name").notNull(),
    externalReference: text("external_reference"),
    sourceUrl: text("source_url"),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "restrict" }),
    mimeType: text("mime_type").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull().default(0),
    checksumSha256: text("checksum_sha256"),
    status: tenderSourceStatusEnum("status").notNull().default("REGISTERED"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("tender_sources_org_idx").on(t.organizationId),
    index("tender_sources_workspace_idx").on(t.workspaceId),
    index("tender_sources_tender_idx").on(t.tenderId),
    index("tender_sources_status_idx").on(t.status),
    index("tender_sources_checksum_idx").on(t.checksumSha256),
    uniqueIndex("tender_sources_tender_checksum_uq").on(t.tenderId, t.checksumSha256),
  ],
);
