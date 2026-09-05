import { describe, expect, test } from "bun:test";

import * as schema from "./index";

/** Looks a table up by its exported name, which is what these tests assert on. */
function tableNamed(name: string): Record<string, unknown> {
  return (schema as unknown as Record<string, Record<string, unknown>>)[name]!;
}

/**
 * Guards the domain split in this folder: the barrel is what every consumer
 * (apps/api, apps/worker, drizzle.config.ts) resolves, so a domain file
 * dropped from index.ts would silently remove tables from the schema —
 * and, worse, make drizzle-kit generate a migration that DROPs them.
 */
describe("schema barrel", () => {
  const EXPECTED_TABLES = [
    // organization
    "organizations",
    "roles",
    "permissions",
    "rolePermissions",
    "customers",
    "projects",
    // identity
    "users",
    // membership / foundation
    "organizationMembers",
    "invitations",
    "workspaceMembers",
    "teamMembers",
    "organizationMemberRoles",
    "workspaceMemberRoles",
    "accessPolicies",
    "policyConditions",
    "workspaces",
    "teams",
    "assignments",
    // files
    "files",
    "documentVersions",
    // tender
    "tenderPortals",
    "tenderSyncRuns",
    "tenderSourceRecords",
    "tenderNotices",
    "tenderNoticeSources",
    "tenderNoticeDocuments",
    "savedTenderNotices",
    "platformAdministrators",
    "tenderPortalEvents",
    "tenderIngestionAlerts",
    "tenders",
    "tenderStatusHistory",
    "tenderQuestions",
    "tenderRequirements",
    "tenderQuestionRequirements",
    "tenderAnswers",
    "tenderAnswerVersions",
    "tenderAnswerEvidence",
    "tenderAnswerReviews",
    "tenderDocuments",
    "tenderDocumentExtractions",
    "tenderDocumentContent",
    "tenderSources",
    "tenderValidationRuns",
    "savedTenders",
    "savedTenderNotices",
    // knowledge
    "knowledgeSources",
    "knowledgeClaims",
    "knowledgeVersions",
    "knowledgeConflicts",
    "knowledgeConflictVariants",
    // rfp
    "rfps",
    "rfpCollaborators",
    "rfpDocuments",
    "rfpRequirements",
    "rfpAnswers",
    "rfpEvidence",
    "rfpRisks",
    "rfpReviews",
    "rfpAssignments",
    "rfpSubmissions",
    "rfpSubmissionChecklistItems",
    "rfpSubmissionArtifacts",
    "rfpOutcomes",
    // extraction
    "documentExtractions",
    "documentPages",
    "documentTables",
  "documentBlocks",
  "requirementExtractions",
  "requirementCandidates",
    "assignments",
    // audit
  "activities",
  "auditLogs",
    // platform
    "notifications",
    "apiKeys",
    "integrations",
    "notificationPreferences",
    "mcpConnections",
    "configToggles",
  ];

  test.each(EXPECTED_TABLES)("exports %s", (name) => {
    expect(tableNamed(name)).toBeDefined();
  });

  test("exports the shared timestamps helper", () => {
    expect(schema.timestamps.createdAt).toBeDefined();
    expect(schema.timestamps.updatedAt).toBeDefined();
  });
});

/**
 * Every org-scoped table must carry organization_id, because multi-tenant
 * isolation is enforced by filtering on it. A new table missing the column
 * cannot be scoped at all, so catch it here rather than in a security review.
 */
describe("multi-tenancy", () => {
  const ORG_SCOPED = [
    "roles",
    "customers",
    "projects",
    "users",
    "files",
    "documentVersions",
    "tenders",
    "tenderStatusHistory",
    "tenderQuestions",
    "tenderRequirements",
    "tenderQuestionRequirements",
    "tenderAnswers",
    "tenderAnswerVersions",
    "tenderAnswerEvidence",
    "tenderAnswerReviews",
    "tenderDocuments",
    "tenderSources",
    "tenderValidationRuns",
    "savedTenders",
    "knowledgeSources",
    "rfps",
    "documentExtractions",
    "documentPages",
    "documentTables",
    "documentBlocks",
    "requirementExtractions",
    "requirementCandidates",
    "workspaces",
    "teams",
    "assignments",
    "activities",
    "auditLogs",
    "notifications",
    "apiKeys",
    "integrations",
    "notificationPreferences",
    "mcpConnections",
    "configToggles",
  ];

  test.each(ORG_SCOPED)("%s has an organizationId column", (name) => {
    expect(tableNamed(name).organizationId).toBeDefined();
  });

  test("requirementCandidateSources is lineage-scoped through its candidate", () => {
    const table = tableNamed("requirementCandidateSources");
    expect(table.organizationId).toBeUndefined();
    expect(table.candidateId).toBeDefined();
    expect(table.documentPageId).toBeDefined();
    expect(table.documentTableId).toBeDefined();
    expect(table.documentBlockId).toBeDefined();
  });

  test("workspace and team membership tables scope indirectly through their parents", () => {
    expect(tableNamed("workspaceMembers").organizationId).toBeUndefined();
    expect(tableNamed("workspaceMembers").workspaceId).toBeDefined();
    expect(tableNamed("workspaceMembers").organizationMemberId).toBeDefined();
    expect(tableNamed("teamMembers").organizationId).toBeUndefined();
    expect(tableNamed("teamMembers").teamId).toBeDefined();
    expect(tableNamed("teamMembers").organizationMemberId).toBeDefined();
  });
});
