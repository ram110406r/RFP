import { pgEnum, timestamp } from "drizzle-orm/pg-core";

/**
 * Column helpers and enums used by more than one domain. Domain-specific
 * enums live in the domain file that owns them — only genuinely shared
 * definitions belong here, so a reader of e.g. schema/rfp.ts doesn't have to
 * jump files to understand tables that are local to that domain.
 */

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/**
 * Shared by rfp.rfpRequirements.category and knowledge.knowledgeSources.category
 * — the same taxonomy classifies a question and the knowledge that answers it,
 * which is what makes category-based retrieval possible.
 *
 * Values intentionally mirror the frontend's TypeScript unions exactly (see
 * apps/legacy-web src/types), not the uppercase names in the implementation
 * plan: StatusBadge, filters, and saved views are keyed off these literal
 * strings. Reconciling the two vocabularies is Phase 7 work, done as an
 * explicit value-mapping migration.
 */
export const requirementCategoryEnum = pgEnum("requirement_category", [
  "Security",
  "Commercial",
  "Compliance",
  "Product",
  "Legal",
  "Architecture",
  "Support",
]);

/**
 * The RFP lifecycle (Phase 5), shared by `rfps.lifecycle_status` and
 * `rfp_status_history`. Lives here rather than in either domain file because
 * both need it, and defining it in one would make the two import each other.
 *
 * Distinct from `rfp_status` in schema/rfp.ts, which is the prototype's
 * display state — see schema/rfp-lifecycle.ts for why both exist.
 */
export const rfpLifecycleStatusEnum = pgEnum("rfp_lifecycle_status", [
  "DRAFT",
  "INTAKE",
  "PARSING",
  "ANALYZING",
  "QUALIFICATION",
  "RESPONSE",
  "REVIEW",
  "VALIDATION",
  "READY_FOR_SUBMISSION",
  "SUBMITTED",
  "OUTCOME_RECORDED",
  "CLOSED",
  "PARSING_FAILED",
  "ANALYSIS_FAILED",
  "VALIDATION_FAILED",
]);
