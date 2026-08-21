import {
  boolean,
  date,
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
import { relations } from "drizzle-orm";

/**
 * Enum values intentionally mirror the existing frontend's TypeScript unions
 * (src/types/index.ts) exactly — not the differently-named lifecycle the
 * migration brief suggested — because the frontend's StatusBadge, filters,
 * and saved views are keyed off these literal strings and must not be
 * redesigned. See the migration report for the full rationale.
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

export const requirementCategoryEnum = pgEnum("requirement_category", [
  "Security",
  "Commercial",
  "Compliance",
  "Product",
  "Legal",
  "Architecture",
  "Support",
]);

export const documentTypeEnum = pgEnum("document_type", [
  "PDF",
  "DOCX",
  "XLSX",
  "PPTX",
  "ZIP",
  "HTML",
]);

export const documentStatusEnum = pgEnum("document_status", [
  "queued",
  "processing",
  "ready",
  "failed",
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

export const memberRoleEnum = pgEnum("member_role", [
  "Admin",
  "Proposal Manager",
  "Contributor",
  "Reviewer",
  "Viewer",
]);

export const memberStatusEnum = pgEnum("member_status", ["active", "invited", "suspended"]);

export const authorityEnum = pgEnum("authority", ["high", "medium", "low"]);

export const activityKindEnum = pgEnum("activity_kind", [
  "assigned",
  "approved",
  "evidence",
  "comment",
  "risk",
  "submission",
  "generated",
  "rejected",
]);

export const notificationCategoryEnum = pgEnum("notification_category", [
  "Reviews",
  "Assignments",
  "Risks",
  "Deadlines",
  "Knowledge",
  "Submissions",
]);

export const notificationSeverityEnum = pgEnum("notification_severity", [
  "info",
  "warning",
  "danger",
]);

export const outcomeEnum = pgEnum("outcome", ["won", "lost"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

// ---------------------------------------------------------------------------
// Organizations, users, roles, permissions
// ---------------------------------------------------------------------------

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  plan: text("plan").notNull().default("Starter"),
  seats: integer("seats").notNull().default(10),
  industry: text("industry"),
  logoInitials: text("logo_initials"),
  ...timestamps,
});

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    ...timestamps,
  },
  (t) => [uniqueIndex("roles_org_name_uq").on(t.organizationId, t.name)],
);

export const permissions = pgTable("permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    roleId: uuid("role_id").references(() => roles.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    jobTitle: text("job_title").notNull().default(""),
    team: text("team").notNull().default(""),
    memberRole: memberRoleEnum("member_role").notNull().default("Contributor"),
    status: memberStatusEnum("status").notNull().default("active"),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("users_org_email_uq").on(t.organizationId, t.email),
    index("users_org_idx").on(t.organizationId),
  ],
);

// ---------------------------------------------------------------------------
// Customers / projects
// ---------------------------------------------------------------------------

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    industry: text("industry"),
    ...timestamps,
  },
  (t) => [index("customers_org_idx").on(t.organizationId)],
);

/**
 * Present per the requested schema, but not yet surfaced anywhere in the
 * frontend — the current product treats each RFP as its own unit of work
 * with no separate "project" concept. Left minimal rather than inventing
 * UI for it. See migration report.
 */
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    ...timestamps,
  },
  (t) => [index("projects_org_idx").on(t.organizationId)],
);

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
    opportunity: text("opportunity").notNull().default(""),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    deadline: date("deadline").notNull(),
    estimatedValue: numeric("estimated_value", { precision: 14, scale: 2 }).notNull().default("0"),
    status: rfpStatusEnum("status").notNull().default("draft"),
    progress: integer("progress").notNull().default(0),
    evidenceCoverage: integer("evidence_coverage").notNull().default(0),
    readiness: integer("readiness").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("rfps_org_idx").on(t.organizationId),
    index("rfps_org_status_idx").on(t.organizationId, t.status),
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

export const rfpDocuments = pgTable(
  "rfp_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rfpId: uuid("rfp_id")
      .notNull()
      .references(() => rfps.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    type: documentTypeEnum("type").notNull(),
    sizeMb: numeric("size_mb", { precision: 10, scale: 2 }).notNull().default("0"),
    status: documentStatusEnum("status").notNull().default("queued"),
    storageKey: text("storage_key"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("rfp_documents_rfp_idx").on(t.rfpId)],
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

// ---------------------------------------------------------------------------
// Knowledge base
// ---------------------------------------------------------------------------

export const knowledgeSources = pgTable(
  "knowledge_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull(),
    category: requirementCategoryEnum("category").notNull(),
    version: text("version").notNull().default("1.0"),
    authority: authorityEnum("authority").notNull().default("medium"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    lastVerified: date("last_verified"),
    lastUpdated: date("last_updated"),
    expiresAt: date("expires_at"),
    summary: text("summary").notNull().default(""),
    ...timestamps,
  },
  (t) => [index("knowledge_sources_org_idx").on(t.organizationId)],
);

export const knowledgeClaims = pgTable(
  "knowledge_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    value: text("value").notNull(),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull().default("0"),
  },
  (t) => [index("knowledge_claims_source_idx").on(t.sourceId)],
);

export const knowledgeVersions = pgTable(
  "knowledge_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    date: date("date").notNull(),
    note: text("note").notNull().default(""),
  },
  (t) => [index("knowledge_versions_source_idx").on(t.sourceId)],
);

export const knowledgeConflicts = pgTable(
  "knowledge_conflicts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
    recommended: text("recommended").notNull().default(""),
    action: text("action").notNull().default(""),
  },
  (t) => [index("knowledge_conflicts_source_idx").on(t.sourceId)],
);

export const knowledgeConflictVariants = pgTable(
  "knowledge_conflict_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conflictId: uuid("conflict_id")
      .notNull()
      .references(() => knowledgeConflicts.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    value: text("value").notNull(),
  },
  (t) => [index("knowledge_conflict_variants_conflict_idx").on(t.conflictId)],
);

// ---------------------------------------------------------------------------
// Notifications, activities, audit log
// ---------------------------------------------------------------------------

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: notificationCategoryEnum("category").notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    severity: notificationSeverityEnum("severity").notNull().default("info"),
    relatedEntityType: text("related_entity_type"),
    relatedEntityId: uuid("related_entity_id"),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId),
    index("notifications_user_read_idx").on(t.userId, t.read),
  ],
);

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    rfpId: uuid("rfp_id").references(() => rfps.id, { onDelete: "cascade" }),
    requirementId: uuid("requirement_id").references(() => rfpRequirements.id, {
      onDelete: "cascade",
    }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorLabel: text("actor_label").notNull().default("System"),
    kind: activityKindEnum("kind").notNull(),
    label: text("label").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("activities_org_idx").on(t.organizationId),
    index("activities_rfp_idx").on(t.rfpId),
    index("activities_requirement_idx").on(t.requirementId),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    previousValue: jsonb("previous_value"),
    newValue: jsonb("new_value"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_org_idx").on(t.organizationId),
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
  ],
);

// ---------------------------------------------------------------------------
// Settings-page-only config (still real, persistent, org-scoped data)
// ---------------------------------------------------------------------------

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    prefix: text("prefix").notNull(),
    scopes: jsonb("scopes").notNull().default([]),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("api_keys_org_idx").on(t.organizationId)],
);

export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category").notNull(),
    connected: boolean("connected").notNull().default(false),
    description: text("description").notNull().default(""),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  },
  (t) => [index("integrations_org_idx").on(t.organizationId)],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    label: text("label").notNull(),
    email: boolean("email").notNull().default(true),
    inApp: boolean("in_app").notNull().default(true),
    digest: boolean("digest").notNull().default(false),
  },
  (t) => [index("notification_preferences_org_idx").on(t.organizationId)],
);

export const mcpConnections = pgTable(
  "mcp_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    transport: text("transport").notNull(),
    status: text("status").notNull().default("disconnected"),
    toolsExposed: integer("tools_exposed").notNull().default(0),
    description: text("description").notNull().default(""),
  },
  (t) => [index("mcp_connections_org_idx").on(t.organizationId)],
);

export const settingToggleKindEnum = pgEnum("setting_toggle_kind", ["toggle", "select", "slider"]);

/**
 * Backs both the Settings > AI tab and Settings > Knowledge tab — same shape
 * (label/description/value/kind), distinguished by the `group` column, so one
 * table and one pair of endpoints cover both instead of duplicating either.
 */
export const configToggles = pgTable(
  "config_toggles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    group: text("group").notNull(), // "ai" | "knowledge"
    sortOrder: integer("sort_order").notNull().default(0),
    label: text("label").notNull(),
    description: text("description").notNull().default(""),
    kind: settingToggleKindEnum("kind").notNull(),
    value: jsonb("value").notNull(),
    options: jsonb("options"),
    max: integer("max"),
  },
  (t) => [index("config_toggles_org_group_idx").on(t.organizationId, t.group)],
);

// ---------------------------------------------------------------------------
// Relations (drizzle query API)
// ---------------------------------------------------------------------------

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  rfps: many(rfps),
  customers: many(customers),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
  ownedRfps: many(rfps),
}));

export const rfpsRelations = relations(rfps, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [rfps.organizationId],
    references: [organizations.id],
  }),
  customer: one(customers, { fields: [rfps.customerId], references: [customers.id] }),
  owner: one(users, { fields: [rfps.ownerId], references: [users.id] }),
  documents: many(rfpDocuments),
  requirements: many(rfpRequirements),
  collaborators: many(rfpCollaborators),
  submissions: many(rfpSubmissions),
  outcome: one(rfpOutcomes, { fields: [rfps.id], references: [rfpOutcomes.rfpId] }),
}));

export const rfpRequirementsRelations = relations(rfpRequirements, ({ one, many }) => ({
  rfp: one(rfps, { fields: [rfpRequirements.rfpId], references: [rfps.id] }),
  reviewer: one(users, { fields: [rfpRequirements.reviewerId], references: [users.id] }),
  answers: many(rfpAnswers),
  reviews: many(rfpReviews),
  assignments: many(rfpAssignments),
  risks: many(rfpRisks),
}));

export const rfpAnswersRelations = relations(rfpAnswers, ({ one, many }) => ({
  requirement: one(rfpRequirements, {
    fields: [rfpAnswers.requirementId],
    references: [rfpRequirements.id],
  }),
  evidence: many(rfpEvidence),
}));

export const rfpEvidenceRelations = relations(rfpEvidence, ({ one }) => ({
  answer: one(rfpAnswers, { fields: [rfpEvidence.answerId], references: [rfpAnswers.id] }),
  source: one(knowledgeSources, {
    fields: [rfpEvidence.sourceId],
    references: [knowledgeSources.id],
  }),
}));

export const knowledgeSourcesRelations = relations(knowledgeSources, ({ many, one }) => ({
  claims: many(knowledgeClaims),
  versions: many(knowledgeVersions),
  conflicts: many(knowledgeConflicts),
  owner: one(users, { fields: [knowledgeSources.ownerId], references: [users.id] }),
}));

export const knowledgeConflictsRelations = relations(knowledgeConflicts, ({ many, one }) => ({
  variants: many(knowledgeConflictVariants),
  source: one(knowledgeSources, {
    fields: [knowledgeConflicts.sourceId],
    references: [knowledgeSources.id],
  }),
}));

export const rfpSubmissionsRelations = relations(rfpSubmissions, ({ many, one }) => ({
  checklist: many(rfpSubmissionChecklistItems),
  artifacts: many(rfpSubmissionArtifacts),
  rfp: one(rfps, { fields: [rfpSubmissions.rfpId], references: [rfps.id] }),
}));
