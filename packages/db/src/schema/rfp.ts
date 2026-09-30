import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { requirementCategoryEnum, rfpLifecycleStatusEnum, timestamps } from "./_shared";
import { files } from "./files";
import { users } from "./identity";
import { knowledgeSources } from "./knowledge";
import { customers, organizations, projects } from "./organization";

/**
 * Legacy compatibility schema.
 *
 * The active product domain is `tenders`: discovery/opportunity/application
 * workspace, answer/evidence/review, automation, and package generation.
 * Keep these `rfp_*` tables for migration compatibility until an explicit
 * retirement plan removes them; do not anchor new product behavior here.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * Values mirror the frontend's TypeScript unions exactly, not the lifecycle
 * named in the implementation plan (DRAFT → INTAKE → PARSING → …). The
 * frontend's StatusBadge, filters, and saved views are keyed off these
 * literals. Expanding this enum to the full state machine is Phase 7 work,
 * done as an explicit value-mapping migration plus a frontend update — not
 * something to smuggle into the schema foundation.
 */
export const rfpStatusEnum = pgEnum("rfp_status", [
  "draft",
  "analyzing",
  "in_progress",
  "review",
  "needs_attention",
  "submitted",
  "won",
  "lost",
]);

export const requirementStatusEnum = pgEnum("requirement_status", [
  "unanswered",
  "drafted",
  "needs_review",
  "changes_requested",
  "approved",
  "rejected",
]);

export const riskLevelEnum = pgEnum("risk_level", ["low", "medium", "high", "critical"]);

export const documentTypeEnum = pgEnum("document_type", [
  "PDF",
  "DOCX",
  "XLSX",
  "PPTX",
  "ZIP",
  "HTML",
]);

/**
 * The document processing lifecycle.
 *
 * Value order matches the physical enum order in Postgres, which matters:
 * migration 0008 adds `uploaded` BEFORE `queued` and `parsed` AFTER
 * `processing`, so declaring them in any other order here would show up as
 * drift on the next `db:generate`.
 *
 * `ready` is the prototype's terminal value and is deprecated in favour of
 * `parsed`. New code must write `parsed`.
 */
export const documentStatusEnum = pgEnum("document_status", [
  "uploaded",
  "queued",
  "processing",
  "parsed",
  "ready",
  "failed",
  "archived",
]);

export const answerSourceEnum = pgEnum("answer_source", ["ai_draft", "human_edited", "reused"]);

export const reviewActionEnum = pgEnum("review_action", [
  "APPROVED",
  "REJECTED",
  "REQUEST_CHANGES",
  "COMMENT",
  "ASSIGNED",
]);

export const assignmentStatusEnum = pgEnum("assignment_status", [
  "pending",
  "in_review",
  "approved",
  "rejected",
  "changes_requested",
]);

export const outcomeEnum = pgEnum("outcome", ["won", "lost"]);

// ---------------------------------------------------------------------------
// RFPs
// ---------------------------------------------------------------------------

export const rfps = pgTable(
  "rfps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    opportunity: text("opportunity").notNull().default(""),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    deadline: date("deadline").notNull(),
    estimatedValue: numeric("estimated_value", { precision: 14, scale: 2 }).notNull().default("0"),
    status: rfpStatusEnum("status").notNull().default("draft"),
    /**
     * The lifecycle position the state machine owns (Phase 5). Separate from
     * `status` above, which remains the prototype's display state — see
     * schema/rfp-lifecycle.ts for why the two coexist.
     */
    lifecycleStatus: rfpLifecycleStatusEnum("lifecycle_status").notNull().default("DRAFT"),
    /**
     * Soft archive. Deleting an RFP would orphan its requirements, answers,
     * evidence and audit trail, so "delete" archives: the row stays, and every
     * list query excludes it unless explicitly asked for.
     */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    progress: integer("progress").notNull().default(0),
    evidenceCoverage: integer("evidence_coverage").notNull().default(0),
    readiness: integer("readiness").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("rfps_org_idx").on(t.organizationId),
    index("rfps_org_status_idx").on(t.organizationId, t.status),
    index("rfps_org_lifecycle_idx").on(t.organizationId, t.lifecycleStatus),
    index("rfps_org_owner_idx").on(t.organizationId, t.ownerId),
    index("rfps_org_deadline_idx").on(t.organizationId, t.deadline),
    index("rfps_org_created_idx").on(t.organizationId, t.createdAt),
    index("rfps_org_archived_idx").on(t.organizationId, t.archivedAt),
  ],
);

export const rfpCollaborators = pgTable(
  "rfp_collaborators",
  {
    rfpId: uuid("rfp_id")
      .notNull()
      .references(() => rfps.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.rfpId, t.userId] })],
);

/**
 * An RFP's source material: the uploaded questionnaire, requirements sheet,
 * and anything else the buyer supplied.
 *
 * `organizationId` is carried directly rather than inferred through `rfpId`.
 * The Phase 6 processing worker acts on documents with no `AuthContext` to
 * join from, and making this the one domain table whose tenancy needs a join
 * is exactly the discipline-over-structure trade the rest of the schema
 * avoids.
 *
 * `storageKey` is the prototype's inline key and is superseded by `fileId`,
 * which points at the `files` row registered at upload. New code writes
 * `fileId`; the old column stays for existing persisted rows.
 */
export const rfpDocuments = pgTable(
  "rfp_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    rfpId: uuid("rfp_id")
      .notNull()
      .references(() => rfps.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    type: documentTypeEnum("type").notNull(),
    sizeMb: numeric("size_mb", { precision: 10, scale: 2 }).notNull().default("0"),
    status: documentStatusEnum("status").notNull().default("uploaded"),
    storageKey: text("storage_key"),
    fileId: uuid("file_id").references(() => files.id, { onDelete: "set null" }),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    /** Which `document_versions` row is live; bumped by POST /versions. */
    currentVersion: integer("current_version").notNull().default(1),
    pageCount: integer("page_count"),
    /** Populated when status is `failed`, so the UI can say why. */
    failureReason: text("failure_reason"),
    /**
     * Soft delete. The `files` row is never removed, because evidence
     * provenance cites it — archiving hides the document without breaking the
     * chain from an answer back to the bytes it was drawn from.
     */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("rfp_documents_rfp_idx").on(t.rfpId),
    index("rfp_documents_org_idx").on(t.organizationId),
    index("rfp_documents_org_status_idx").on(t.organizationId, t.status),
  ],
);

// ---------------------------------------------------------------------------
// Requirements, answers, evidence, risks
// ---------------------------------------------------------------------------

export const rfpRequirements = pgTable(
  "rfp_requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rfpId: uuid("rfp_id")
      .notNull()
      .references(() => rfps.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    title: text("title").notNull(),
    question: text("question").notNull(),
    category: requirementCategoryEnum("category").notNull(),
    mandatory: boolean("mandatory").notNull().default(false),
    risk: riskLevelEnum("risk").notNull().default("low"),
    riskRationale: text("risk_rationale").notNull().default(""),
    ownerTeam: text("owner_team").notNull().default(""),
    status: requirementStatusEnum("status").notNull().default("unanswered"),
    reviewerId: uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    sourceLocation: text("source_location"),
    dueDate: date("due_date"),
    ...timestamps,
  },
  (t) => [
    index("rfp_requirements_rfp_idx").on(t.rfpId),
    uniqueIndex("rfp_requirements_rfp_code_uq").on(t.rfpId, t.code),
    index("rfp_requirements_risk_idx").on(t.risk),
    index("rfp_requirements_status_idx").on(t.status),
  ],
);

/**
 * History table, not a single mutable row: editing or regenerating an answer
 * inserts a new record and flips the previous one's isCurrent to false, so
 * no answer is ever silently destroyed.
 */
export const rfpAnswers = pgTable(
  "rfp_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requirementId: uuid("requirement_id")
      .notNull()
      .references(() => rfpRequirements.id, { onDelete: "cascade" }),
    answer: text("answer").notNull().default(""),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull().default("0"),
    generatedBy: answerSourceEnum("generated_by").notNull().default("ai_draft"),
    isCurrent: boolean("is_current").notNull().default(true),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("rfp_answers_requirement_idx").on(t.requirementId),
    index("rfp_answers_current_idx").on(t.requirementId, t.isCurrent),
  ],
);

/**
 * The traceability link that makes an answer defensible: which knowledge
 * source, at which version, supports this claim, and when it was last
 * verified. `sourceId` is onDelete: restrict — evidence must not be
 * orphaned by deleting the source it cites.
 */
export const rfpEvidence = pgTable(
  "rfp_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    answerId: uuid("answer_id")
      .notNull()
      .references(() => rfpAnswers.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "restrict" }),
    sourceVersion: text("source_version"),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull().default(""),
    relevance: numeric("relevance", { precision: 4, scale: 3 }).notNull().default("0"),
    verifiedAt: date("verified_at"),
    verifiedBy: uuid("verified_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rfp_evidence_answer_idx").on(t.answerId)],
);

/**
 * Audit-style log of risk changes on a requirement. `rfp_requirements.risk`
 * holds the current value (cheap reads for the table/filters); every change
 * — including bulk "Set Risk" actions — appends a row here instead of only
 * overwriting the column.
 */
export const rfpRisks = pgTable(
  "rfp_risks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requirementId: uuid("requirement_id")
      .notNull()
      .references(() => rfpRequirements.id, { onDelete: "cascade" }),
    level: riskLevelEnum("level").notNull(),
    rationale: text("rationale").notNull().default(""),
    setBy: uuid("set_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rfp_risks_requirement_idx").on(t.requirementId)],
);

// ---------------------------------------------------------------------------
// Reviews & assignments
// ---------------------------------------------------------------------------

/** Immutable event log — one row per review action taken. */
export const rfpReviews = pgTable(
  "rfp_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requirementId: uuid("requirement_id")
      .notNull()
      .references(() => rfpRequirements.id, { onDelete: "cascade" }),
    reviewerId: uuid("reviewer_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    action: reviewActionEnum("action").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rfp_reviews_requirement_idx").on(t.requirementId)],
);

/** Current-state "who is reviewing what, by when" — one active row per requirement. */
export const rfpAssignments = pgTable(
  "rfp_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requirementId: uuid("requirement_id")
      .notNull()
      .references(() => rfpRequirements.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("reviewer"),
    deadline: date("deadline"),
    status: assignmentStatusEnum("status").notNull().default("pending"),
    ...timestamps,
  },
  (t) => [
    index("rfp_assignments_requirement_idx").on(t.requirementId),
    index("rfp_assignments_user_idx").on(t.userId),
  ],
);

// ---------------------------------------------------------------------------
// Submissions & outcomes
// ---------------------------------------------------------------------------

export const rfpSubmissions = pgTable(
  "rfp_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rfpId: uuid("rfp_id")
      .notNull()
      .references(() => rfps.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    note: text("note").notNull().default(""),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rfp_submissions_rfp_idx").on(t.rfpId)],
);

export const rfpSubmissionChecklistItems = pgTable(
  "rfp_submission_checklist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => rfpSubmissions.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    done: boolean("done").notNull().default(false),
  },
  (t) => [index("rfp_submission_checklist_submission_idx").on(t.submissionId)],
);

export const rfpSubmissionArtifacts = pgTable(
  "rfp_submission_artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => rfpSubmissions.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    description: text("description").notNull().default(""),
    ready: boolean("ready").notNull().default(false),
    storageKey: text("storage_key"),
  },
  (t) => [index("rfp_submission_artifacts_submission_idx").on(t.submissionId)],
);

/** One row per RFP (unique rfpId) — the win/loss record Phase 23 learns from. */
export const rfpOutcomes = pgTable("rfp_outcomes", {
  id: uuid("id").primaryKey().defaultRandom(),
  rfpId: uuid("rfp_id")
    .notNull()
    .references(() => rfps.id, { onDelete: "cascade" })
    .unique(),
  outcome: outcomeEnum("outcome").notNull(),
  value: numeric("value", { precision: 14, scale: 2 }).notNull().default("0"),
  closedAt: date("closed_at").notNull(),
  reason: text("reason"),
});
