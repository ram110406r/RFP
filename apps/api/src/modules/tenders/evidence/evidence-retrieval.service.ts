import { Inject, Injectable, Optional } from "@nestjs/common";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { KNOWLEDGE_EMBEDDING_MODEL, type KnowledgeEmbedder } from "@rfp-os/ai";
import {
  knowledgeChunks,
  knowledgeClaims,
  knowledgeDocuments,
  knowledgeSources,
  knowledgeVersions,
  tenderDocumentContent,
  tenderDocuments,
  tenderRequirements,
  tenderSources,
  type Database,
} from "@rfp-os/db";
import type { AuthContext } from "@rfp-os/types";
import type { EvidenceRetrievalResult } from "@rfp-os/types";

import { PinoLoggerService } from "../../../common/logger/pino-logger.service";
import { KNOWLEDGE_EMBEDDER } from "../../../infrastructure/ai/ai.constants";
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
import { searchKnowledgeChunks } from "./knowledge-chunk-search";

type RequirementRow = typeof tenderRequirements.$inferSelect;
type KnowledgeSourceRow = typeof knowledgeSources.$inferSelect;
type ChunkRow = typeof knowledgeChunks.$inferSelect;
type TenderRow = {
  id: string;
  organizationId: string;
  workspaceId: string;
  tenderType: string;
  name: string;
  title: string;
};

/** Pages of the tender's own documents considered per retrieval. */
const TENDER_PAGE_SCAN_LIMIT = 400;
const TENDER_PAGE_CANDIDATES = 8;
const CHUNK_CANDIDATES = 20;

@Injectable()
export class EvidenceRetrievalService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Optional() @Inject(KNOWLEDGE_EMBEDDER) private readonly embedder: KnowledgeEmbedder | null = null,
    @Optional() private readonly logger?: PinoLoggerService,
  ) {}

  async retrieveRequirementEvidence(
    auth: AuthContext,
    tender: TenderRow,
    requirement: RequirementRow,
    options: { query?: string } = {},
  ): Promise<EvidenceRetrievalResult[]> {
    const requirementQuery = buildRequirementQuery(requirement);
    const query = options.query?.trim();
    const candidates = await this.collectCandidates(auth, tender, requirementQuery, requirement, {
      searchText: query ? `${query} ${requirementQuery}` : requirementQuery,
    });
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

  /**
   * Re-derives a candidate so a citation is stored with server-computed
   * scores, never client-supplied ones. Chunks and tender pages are looked up
   * directly by id; the rest come from the same collection drafting uses.
   */
  async resolveEvidenceCandidate(
    auth: AuthContext,
    tender: TenderRow,
    input: { evidenceType: string; evidenceId: string; sourceId?: string | null },
  ): Promise<EvidenceRetrievalResult | null> {
    const normalizedType = normalizeEvidenceType(input.evidenceType);
    if (normalizedType === "CHUNK") return this.resolveChunk(auth, input.evidenceId);
    if (normalizedType === "DOCUMENT_PAGE") return this.resolveTenderPage(auth, tender, input.evidenceId);

    const candidates = await this.collectCandidates(auth, tender, input.evidenceId, undefined, { searchText: null });
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
    requirement: RequirementRow | undefined,
    options: { searchText: string | null },
  ): Promise<EvidenceRetrievalResult[]> {
    // Only ACTIVE knowledge is citable: drafts are unreviewed and archived
    // sources are retired. Freshness (stale/expired) is left to selection so
    // drafting can report what it skipped.
    const [knowledgeSourceRows, tenderSourceRows, tenderDocumentRows] = await Promise.all([
      this.db
        .select()
        .from(knowledgeSources)
        .where(and(eq(knowledgeSources.organizationId, auth.organizationId), eq(knowledgeSources.lifecycleStatus, "ACTIVE")))
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
            this.db
              .select()
              .from(knowledgeClaims)
              .where(and(inArray(knowledgeClaims.sourceId, sourceIds), eq(knowledgeClaims.status, "ACTIVE"))),
            this.db.select().from(knowledgeVersions).where(inArray(knowledgeVersions.sourceId, sourceIds)),
          ]);

    const claimsBySource = groupBy(claimRows, "sourceId");
    const versionsBySource = groupBy(versionRows, "sourceId");
    const requirementCategory = requirement ? requirementCategoryHint(requirement.requirementType) : "Product";
    const queryText = query || buildTenderQuery(tender);
    const candidates: EvidenceRetrievalResult[] = [];

    for (const source of knowledgeSourceRows) {
      const { authority, freshness } = describeSource(source);
      const text = [source.name, source.type, source.category, source.summary].filter(Boolean).join(" ");
      candidates.push({
        ...sourceFields(source, authority, freshness),
        sourceVersion: source.version,
        evidenceId: source.id,
        evidenceType: "KNOWLEDGE",
        title: source.name,
        snippet: source.summary,
        relevanceScore: clampScore(scoreRelevance(queryText, text) + categoryBoost(requirementCategory, source.category)),
        metadata: { category: source.category, type: source.type, version: source.version, summary: source.summary },
      });

      for (const claim of claimsBySource.get(source.id) ?? []) {
        const claimText = [source.name, claim.label, claim.value, source.summary].filter(Boolean).join(" ");
        candidates.push({
          ...sourceFields(source, authority, freshness),
          sourceVersion: source.version,
          evidenceId: claim.id,
          evidenceType: "RECORD",
          title: `${source.name}: ${claim.label}`,
          snippet: claim.value,
          relevanceScore: clampScore(scoreRelevance(queryText, claimText)),
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
          ...sourceFields(source, authority, freshness),
          sourceVersion: version.version,
          evidenceId: version.id,
          evidenceType: "SOURCE",
          title: `${source.name} v${version.version}`,
          snippet: version.note,
          relevanceScore: clampScore(scoreRelevance(queryText, versionText) + 0.05),
          metadata: { category: source.category, type: source.type, versionId: version.id, versionDate: version.date, note: version.note },
        });
      }
    }

    if (options.searchText) {
      const sourcesById = new Map(knowledgeSourceRows.map((source) => [source.id, source]));
      candidates.push(...(await this.chunkCandidates(auth, options.searchText, sourcesById, requirementCategory)));
      candidates.push(...(await this.tenderPageCandidates(auth, tender, options.searchText)));
    }

    for (const source of tenderSourceRows) {
      const authority = classifyEvidenceAuthority({
        type: source.sourceType,
        category: requirementCategory,
        name: source.name,
        summary: stringifyJson(source.metadata),
        status: source.status,
      });
      const freshness = classifyEvidenceFreshness({ verifiedAt: source.updatedAt, updatedAt: source.updatedAt });
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
        metadata: { tenderId: source.tenderId, sourceType: source.sourceType, status: source.status },
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

  /**
   * Passages from uploaded knowledge documents, ranked by hybrid search.
   * Relevance is the stronger of the fused rank and plain token overlap, so a
   * chunk that literally restates the requirement is never under-scored by
   * a weak vector ranking.
   */
  private async chunkCandidates(
    auth: AuthContext,
    searchText: string,
    sourcesById: Map<string, KnowledgeSourceRow>,
    requirementCategory: string,
  ): Promise<EvidenceRetrievalResult[]> {
    if (sourcesById.size === 0) return [];
    let queryEmbedding: number[] | null = null;
    if (this.embedder) {
      try {
        const response = await this.embedder.provider.embed({ model: KNOWLEDGE_EMBEDDING_MODEL, input: [searchText.slice(0, 8_000)], inputType: "query" });
        queryEmbedding = response.embeddings[0] ?? null;
      } catch (error) {
        // Semantic search is an enhancement; keyword retrieval still runs.
        this.logger?.warn(`query embedding failed, falling back to keyword search: ${(error as Error).message}`, "EvidenceRetrieval");
      }
    }
    const hits = await searchKnowledgeChunks(this.db, {
      organizationId: auth.organizationId,
      queryText: searchText,
      queryEmbedding,
      embeddingModel: queryEmbedding ? this.embedder?.vendorModel ?? null : null,
      limit: CHUNK_CANDIDATES,
    });
    if (hits.length === 0) return [];
    const rows = await this.loadChunks(hits.map((hit) => hit.chunkId));
    const byId = new Map(rows.map((row) => [row.chunk.id, row]));
    const results: EvidenceRetrievalResult[] = [];
    for (const hit of hits) {
      const row = byId.get(hit.chunkId);
      const source = row ? sourcesById.get(row.chunk.sourceId) : undefined;
      if (!row || !source) continue;
      const lexical = scoreRelevance(searchText, [row.chunk.heading, row.chunk.text].filter(Boolean).join(" "));
      const relevance = clampScore(Math.max(hit.score, lexical) + categoryBoost(requirementCategory, source.category) / 2);
      results.push(chunkCandidate(row.chunk, source, row.fileName, relevance, { keywordRank: hit.keywordRank, vectorRank: hit.vectorRank }));
    }
    return results;
  }

  /**
   * The tender's own parsed pages. They explain what the buyer is asking, not
   * what the company can do, so they carry low authority and rarely clear the
   * auto-draft threshold — they show up in evidence search for manual use.
   */
  private async tenderPageCandidates(auth: AuthContext, tender: TenderRow, searchText: string): Promise<EvidenceRetrievalResult[]> {
    const pages = await this.db
      .select()
      .from(tenderDocumentContent)
      .where(and(eq(tenderDocumentContent.organizationId, auth.organizationId), eq(tenderDocumentContent.tenderId, tender.id)))
      .orderBy(asc(tenderDocumentContent.tenderDocumentId), asc(tenderDocumentContent.sequence))
      .limit(TENDER_PAGE_SCAN_LIMIT);
    return pages
      .map((page) => ({ page, relevance: scoreRelevance(searchText, [page.section, page.text].filter(Boolean).join(" ")) }))
      .filter((entry) => entry.relevance >= 0.4 && entry.page.text.trim().length > 0)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, TENDER_PAGE_CANDIDATES)
      .map(({ page, relevance }) => tenderPageCandidate(page, relevance));
  }

  private async resolveChunk(auth: AuthContext, chunkId: string): Promise<EvidenceRetrievalResult | null> {
    const [row] = await this.loadChunks([chunkId], auth.organizationId);
    if (!row) return null;
    const [source] = await this.db
      .select()
      .from(knowledgeSources)
      .where(
        and(
          eq(knowledgeSources.id, row.chunk.sourceId),
          eq(knowledgeSources.organizationId, auth.organizationId),
          eq(knowledgeSources.lifecycleStatus, "ACTIVE"),
        ),
      );
    if (!source) return null;
    return chunkCandidate(row.chunk, source, row.fileName, 1, {});
  }

  private async resolveTenderPage(auth: AuthContext, tender: TenderRow, pageId: string): Promise<EvidenceRetrievalResult | null> {
    const [page] = await this.db
      .select()
      .from(tenderDocumentContent)
      .where(
        and(
          eq(tenderDocumentContent.id, pageId),
          eq(tenderDocumentContent.organizationId, auth.organizationId),
          eq(tenderDocumentContent.tenderId, tender.id),
        ),
      );
    return page ? tenderPageCandidate(page, 1) : null;
  }

  private async loadChunks(chunkIds: string[], organizationId?: string) {
    if (chunkIds.length === 0) return [];
    return this.db
      .select({ chunk: knowledgeChunks, fileName: knowledgeDocuments.fileName })
      .from(knowledgeChunks)
      .innerJoin(knowledgeDocuments, eq(knowledgeChunks.documentId, knowledgeDocuments.id))
      .where(
        and(
          inArray(knowledgeChunks.id, chunkIds),
          organizationId ? eq(knowledgeChunks.organizationId, organizationId) : undefined,
        ),
      )
      .orderBy(desc(knowledgeChunks.createdAt));
  }
}

function describeSource(source: KnowledgeSourceRow) {
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
  return { authority, freshness };
}

function sourceFields(
  source: KnowledgeSourceRow,
  authority: ReturnType<typeof classifyEvidenceAuthority>,
  freshness: ReturnType<typeof classifyEvidenceFreshness>,
) {
  return {
    sourceId: source.id,
    authorityScore: scoreAuthority(authority),
    freshnessScore: scoreFreshness(freshness),
    freshness,
    authority,
    verifiedAt: source.lastVerified ? new Date(source.lastVerified).toISOString() : null,
    expiresAt: source.expiresAt ? new Date(source.expiresAt).toISOString() : null,
    ownerId: source.ownerId,
  };
}

function chunkCandidate(
  chunk: ChunkRow,
  source: KnowledgeSourceRow,
  fileName: string,
  relevance: number,
  ranks: { keywordRank?: number | null; vectorRank?: number | null },
): EvidenceRetrievalResult {
  const { authority, freshness } = describeSource(source);
  const page = chunk.pageNumber ? ` p.${chunk.pageNumber}` : "";
  return {
    ...sourceFields(source, authority, freshness),
    sourceVersion: source.version,
    evidenceId: chunk.id,
    evidenceType: "CHUNK",
    title: `${source.name} — ${fileName}${page}`,
    snippet: chunk.text.length > 600 ? `${chunk.text.slice(0, 600)}…` : chunk.text,
    relevanceScore: clampScore(relevance),
    metadata: {
      category: source.category,
      documentId: chunk.documentId,
      fileName,
      pageNumber: chunk.pageNumber,
      heading: chunk.heading,
      text: chunk.text,
      keywordRank: ranks.keywordRank ?? null,
      vectorRank: ranks.vectorRank ?? null,
    },
  };
}

function tenderPageCandidate(page: typeof tenderDocumentContent.$inferSelect, relevance: number): EvidenceRetrievalResult {
  const label = page.pageNumber ? `page ${page.pageNumber}` : page.section ?? `section ${page.sequence}`;
  return {
    sourceId: page.tenderDocumentId,
    sourceVersion: page.contentHash,
    evidenceId: page.id,
    evidenceType: "DOCUMENT_PAGE",
    title: `Tender document ${label}`,
    snippet: page.text.length > 600 ? `${page.text.slice(0, 600)}…` : page.text,
    relevanceScore: clampScore(relevance),
    authorityScore: scoreAuthority("UNKNOWN"),
    freshnessScore: scoreFreshness("FRESH"),
    freshness: "FRESH",
    authority: "UNKNOWN",
    verifiedAt: page.createdAt.toISOString(),
    expiresAt: null,
    ownerId: null,
    metadata: { tenderDocumentId: page.tenderDocumentId, pageNumber: page.pageNumber, section: page.section, text: page.text },
  };
}

function buildRequirementQuery(requirement: RequirementRow): string {
  return [requirement.requirementCode, requirement.title, requirement.description, requirement.requirementType]
    .filter(Boolean)
    .join(" ");
}

function buildTenderQuery(tender: TenderRow): string {
  return [tender.name, tender.title, tender.tenderType].join(" ");
}

export function requirementCategoryHint(requirementType: string): string {
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

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, value));
}
