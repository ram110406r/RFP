import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  knowledgeClaims,
  knowledgeSources,
  knowledgeVersions,
  tenderDocuments,
  tenderRequirements,
  tenderSources,
  type Database,
} from "@rfp-os/db";
import type { AuthContext } from "@rfp-os/types";
import type { EvidenceRetrievalResult } from "@rfp-os/types";

import { DATABASE } from "../../../infrastructure/database";
import {
  classifyEvidenceAuthority,
  classifyEvidenceFreshness,
  normalizeEvidenceType,
  rankEvidenceCandidates,
  scoreAuthority,
  scoreFreshness,
  scoreRelevance,
} from "./evidence.logic";

type RequirementRow = typeof tenderRequirements.$inferSelect;
type TenderRow = {
  id: string;
  organizationId: string;
  workspaceId: string;
  tenderType: string;
  name: string;
  title: string;
};

@Injectable()
export class EvidenceRetrievalService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async retrieveRequirementEvidence(
    auth: AuthContext,
    tender: TenderRow,
    requirement: RequirementRow,
    options: { query?: string } = {},
  ): Promise<EvidenceRetrievalResult[]> {
    const candidates = await this.collectCandidates(auth, tender, buildRequirementQuery(requirement), requirement);
    const query = options.query?.trim();
    const boosted = query
      ? candidates.map((candidate) => ({
          ...candidate,
          relevanceScore: Math.max(
            candidate.relevanceScore,
            scoreRelevance(query, [candidate.title, candidate.snippet, stringifyJson(candidate.metadata)].join(" ")),
          ),
        }))
      : candidates;
    return rankEvidenceCandidates(boosted);
  }

  async resolveEvidenceCandidate(
    auth: AuthContext,
    tender: TenderRow,
    input: { evidenceType: string; evidenceId: string; sourceId?: string | null },
  ): Promise<EvidenceRetrievalResult | null> {
    const candidates = await this.collectCandidates(auth, tender, input.evidenceId);
    const normalizedType = normalizeEvidenceType(input.evidenceType);
    const sourceId = input.sourceId?.trim() || null;
    return (
      candidates.find(
        (candidate) =>
          candidate.evidenceType === normalizedType &&
          candidate.evidenceId === input.evidenceId &&
          (!sourceId || candidate.sourceId === sourceId),
      ) ?? null
    );
  }

  private async collectCandidates(
    auth: AuthContext,
    tender: TenderRow,
    query: string,
    requirement?: RequirementRow,
  ): Promise<EvidenceRetrievalResult[]> {
    const [knowledgeSourceRows, tenderSourceRows, tenderDocumentRows] = await Promise.all([
      this.db
        .select()
        .from(knowledgeSources)
        .where(eq(knowledgeSources.organizationId, auth.organizationId))
        .orderBy(asc(knowledgeSources.name)),
      this.db
        .select()
        .from(tenderSources)
        .where(and(eq(tenderSources.organizationId, auth.organizationId), eq(tenderSources.tenderId, tender.id)))
        .orderBy(asc(tenderSources.name)),
      this.db
        .select()
        .from(tenderDocuments)
        .where(and(eq(tenderDocuments.organizationId, auth.organizationId), eq(tenderDocuments.tenderId, tender.id)))
        .orderBy(asc(tenderDocuments.createdAt)),
    ]);

    const sourceIds = knowledgeSourceRows.map((row) => row.id);
    const [claimRows, versionRows] =
      sourceIds.length === 0
        ? [[], []]
        : await Promise.all([
            this.db.select().from(knowledgeClaims).where(inArray(knowledgeClaims.sourceId, sourceIds)),
            this.db.select().from(knowledgeVersions).where(inArray(knowledgeVersions.sourceId, sourceIds)),
          ]);

    const claimsBySource = groupBy(claimRows, "sourceId");
    const versionsBySource = groupBy(versionRows, "sourceId");
    const requirementCategory = requirement ? requirementCategoryHint(requirement.requirementType) : "Product";
    const queryText = query || buildTenderQuery(tender);
    const candidates: EvidenceRetrievalResult[] = [];

    for (const source of knowledgeSourceRows) {
      const lifecycleStatus = metadataStatus(source.metadata);
      if (lifecycleStatus === "ARCHIVED" || lifecycleStatus === "DRAFT") {
        continue;
      }
      const authority = classifyEvidenceAuthority({
        authority: source.authority,
        type: source.type,
        category: source.category,
        name: source.name,
        summary: source.summary,
      });
      const freshness = classifyEvidenceFreshness({
        verifiedAt: source.lastVerified,
        expiresAt: source.expiresAt,
        updatedAt: source.lastUpdated ?? source.updatedAt,
      });
      const text = [source.name, source.type, source.category, source.summary].filter(Boolean).join(" ");
      candidates.push({
        sourceId: source.id,
        sourceVersion: source.version,
        evidenceId: source.id,
        evidenceType: "KNOWLEDGE",
        title: source.name,
        snippet: source.summary,
        relevanceScore: clampScore(scoreRelevance(queryText, text) + categoryBoost(requirementCategory, source.category)),
        authorityScore: scoreAuthority(authority),
        freshnessScore: scoreFreshness(freshness),
        freshness,
        authority,
        verifiedAt: source.lastVerified ? new Date(source.lastVerified).toISOString() : null,
        expiresAt: source.expiresAt ? new Date(source.expiresAt).toISOString() : null,
        ownerId: source.ownerId,
        metadata: {
          category: source.category,
          type: source.type,
          version: source.version,
          summary: source.summary,
        },
      });

      for (const claim of claimsBySource.get(source.id) ?? []) {
        const claimText = [source.name, claim.label, claim.value, source.summary].filter(Boolean).join(" ");
        candidates.push({
          sourceId: source.id,
          sourceVersion: source.version,
          evidenceId: claim.id,
          evidenceType: "RECORD",
          title: `${source.name}: ${claim.label}`,
          snippet: claim.value,
          relevanceScore: clampScore(scoreRelevance(queryText, claimText)),
          authorityScore: scoreAuthority(authority),
          freshnessScore: scoreFreshness(freshness),
          freshness,
          authority,
          verifiedAt: source.lastVerified ? new Date(source.lastVerified).toISOString() : null,
          expiresAt: source.expiresAt ? new Date(source.expiresAt).toISOString() : null,
          ownerId: source.ownerId,
          metadata: {
            category: source.category,
            type: source.type,
            claimId: claim.id,
            confidence: claim.confidence,
            label: claim.label,
            value: claim.value,
          },
        });
      }

      for (const version of versionsBySource.get(source.id) ?? []) {
        const versionText = [source.name, version.version, version.note].filter(Boolean).join(" ");
        candidates.push({
          sourceId: source.id,
          sourceVersion: version.version,
          evidenceId: version.id,
          evidenceType: "SOURCE",
          title: `${source.name} v${version.version}`,
          snippet: version.note,
          relevanceScore: clampScore(scoreRelevance(queryText, versionText) + 0.05),
          authorityScore: scoreAuthority(authority),
          freshnessScore: scoreFreshness(freshness),
          freshness,
          authority,
          verifiedAt: source.lastVerified ? new Date(source.lastVerified).toISOString() : null,
          expiresAt: source.expiresAt ? new Date(source.expiresAt).toISOString() : null,
          ownerId: source.ownerId,
          metadata: {
            category: source.category,
            type: source.type,
            versionId: version.id,
            versionDate: version.date,
            note: version.note,
          },
        });
      }
    }

    for (const source of tenderSourceRows) {
      const authority = classifyEvidenceAuthority({
        type: source.sourceType,
        category: requirementCategory,
        name: source.name,
        summary: stringifyJson(source.metadata),
        status: source.status,
      });
      const freshness = classifyEvidenceFreshness({
        verifiedAt: source.updatedAt,
        updatedAt: source.updatedAt,
      });
      const text = [source.name, source.externalReference, source.sourceUrl, stringifyJson(source.metadata)].filter(Boolean).join(" ");
      candidates.push({
        sourceId: source.id,
        sourceVersion: source.checksumSha256,
        evidenceId: source.id,
        evidenceType: "SOURCE",
        title: source.name,
        snippet: source.sourceUrl ?? source.externalReference ?? "",
        relevanceScore: clampScore(scoreRelevance(queryText, text) + 0.1),
        authorityScore: scoreAuthority(authority),
        freshnessScore: scoreFreshness(freshness),
        freshness,
        authority,
        verifiedAt: source.updatedAt ? source.updatedAt.toISOString() : null,
        expiresAt: null,
        ownerId: source.createdBy,
        metadata: {
          tenderId: source.tenderId,
          sourceType: source.sourceType,
          status: source.status,
        },
      });
    }

    for (const document of tenderDocumentRows) {
      const freshness = classifyEvidenceFreshness({ updatedAt: document.createdAt });
      const text = [document.documentRole, document.documentId, tender.name, tender.title].join(" ");
      candidates.push({
        sourceId: document.documentId,
        sourceVersion: null,
        evidenceId: document.id,
        evidenceType: "DOCUMENT",
        title: `Document ${document.documentId}`,
        snippet: document.documentRole,
        relevanceScore: clampScore(scoreRelevance(queryText, text)),
        authorityScore: 0.5,
        freshnessScore: scoreFreshness(freshness),
        freshness,
        authority: "UNKNOWN",
        verifiedAt: document.createdAt.toISOString(),
        expiresAt: null,
        ownerId: null,
        metadata: { documentRole: document.documentRole, tenderId: document.tenderId },
      });
    }

    return candidates;
  }
}

function buildRequirementQuery(requirement: RequirementRow): string {
  return [requirement.requirementCode, requirement.title, requirement.description, requirement.requirementType]
    .filter(Boolean)
    .join(" ");
}

function buildTenderQuery(tender: TenderRow): string {
  return [tender.name, tender.title, tender.tenderType].join(" ");
}

function requirementCategoryHint(requirementType: string): string {
  switch (requirementType) {
    case "SECURITY":
      return "Security";
    case "COMMERCIAL":
      return "Commercial";
    case "LEGAL":
      return "Legal";
    case "DOCUMENTATION":
      return "Support";
    case "TECHNICAL":
      return "Architecture";
    case "COMPLIANCE":
      return "Compliance";
    default:
      return "Product";
  }
}

function categoryBoost(requirementCategory: string, sourceCategory: string): number {
  return requirementCategory.toLowerCase() === sourceCategory.toLowerCase() ? 0.2 : 0;
}

function groupBy<T extends Record<string, unknown>, K extends keyof T>(rows: T[], key: K): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const groupKey = String(row[key] ?? "");
    const list = map.get(groupKey) ?? [];
    list.push(row);
    map.set(groupKey, list);
  }
  return map;
}

function stringifyJson(value: unknown): string {
  try {
    return typeof value === "string" ? value : JSON.stringify(value ?? {});
  } catch {
    return "";
  }
}

function metadataStatus(metadata: Record<string, unknown> | null | undefined) {
  const status = metadata?.lifecycleStatus;
  return status === "DRAFT" || status === "ACTIVE" || status === "ARCHIVED" ? status : "ACTIVE";
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, value));
}
