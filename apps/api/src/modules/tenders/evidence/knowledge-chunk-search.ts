import { sql } from "drizzle-orm";
import type { Database } from "@rfp-os/db";

/**
 * Hybrid retrieval over knowledge_chunks.
 *
 * Two ranked lists — Postgres full-text (keyword) and pgvector cosine
 * distance (semantic) — fused with reciprocal rank fusion. RRF needs no score
 * calibration between the two systems, which is the whole difficulty with
 * mixing ts_rank and cosine similarity directly, and it degrades cleanly:
 * with no embedder configured the vector list is simply empty.
 *
 * Only chunks of ACTIVE sources are searched, matching what drafting may cite.
 */

export const RRF_K = 60;
const LIST_LIMIT = 50;

export interface ChunkHit {
  chunkId: string;
  keywordRank: number | null;
  vectorRank: number | null;
  /** Fused score normalised to 0..1, where 1 is rank 1 in both lists. */
  score: number;
}

export function fuseRankings(
  keyword: string[],
  vector: string[],
  options: { k?: number; limit?: number } = {},
): ChunkHit[] {
  const k = options.k ?? RRF_K;
  const hits = new Map<string, ChunkHit>();
  const add = (ids: string[], field: "keywordRank" | "vectorRank") => {
    ids.forEach((id, index) => {
      const hit = hits.get(id) ?? { chunkId: id, keywordRank: null, vectorRank: null, score: 0 };
      hit[field] = index + 1;
      hits.set(id, hit);
    });
  };
  add(keyword, "keywordRank");
  add(vector, "vectorRank");
  // Normalise by the best achievable score for the lists that exist, so a
  // keyword-only deployment can still reach 1.0 for its top hit.
  const lists = (keyword.length > 0 ? 1 : 0) + (vector.length > 0 ? 1 : 0);
  const best = lists / (k + 1) || 1;
  for (const hit of hits.values()) {
    const raw = (hit.keywordRank ? 1 / (k + hit.keywordRank) : 0) + (hit.vectorRank ? 1 / (k + hit.vectorRank) : 0);
    hit.score = Math.min(1, raw / best);
  }
  return [...hits.values()].sort((a, b) => b.score - a.score).slice(0, options.limit ?? 20);
}

/**
 * Requirement text is long; websearch_to_tsquery ANDs its terms, which would
 * match almost nothing. OR the distinctive terms instead and let ts_rank_cd
 * reward chunks that contain more of them.
 */
export function buildKeywordQuery(text: string, maxTerms = 24): string {
  const stop = new Set(["the", "and", "for", "with", "that", "this", "from", "your", "you", "are", "will", "shall", "must", "should", "have", "has", "not", "all", "any", "can", "our", "its", "per", "may", "such", "provide", "please", "describe"]);
  const terms: string[] = [];
  for (const token of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (token.length < 3 || stop.has(token) || terms.includes(token)) continue;
    terms.push(token);
    if (terms.length >= maxTerms) break;
  }
  return terms.join(" or ");
}

export async function searchKnowledgeChunks(
  db: Database,
  input: { organizationId: string; queryText: string; queryEmbedding: number[] | null; embeddingModel: string | null; limit?: number },
): Promise<ChunkHit[]> {
  const keywordQuery = buildKeywordQuery(input.queryText);
  const [keywordRows, vectorRows] = await Promise.all([
    keywordQuery
      ? db.execute(sql`
          select c.id
          from knowledge_chunks c
          join knowledge_sources s on s.id = c.source_id
          where c.organization_id = ${input.organizationId}
            and s.lifecycle_status = 'ACTIVE'
            and c.search_vector @@ websearch_to_tsquery('english', ${keywordQuery})
          order by ts_rank_cd(c.search_vector, websearch_to_tsquery('english', ${keywordQuery})) desc
          limit ${LIST_LIMIT}`)
      : Promise.resolve([]),
    input.queryEmbedding && input.embeddingModel
      ? db.execute(sql`
          select c.id
          from knowledge_chunks c
          join knowledge_sources s on s.id = c.source_id
          where c.organization_id = ${input.organizationId}
            and s.lifecycle_status = 'ACTIVE'
            and c.embedding is not null
            and c.embedding_model = ${input.embeddingModel}
          order by c.embedding <=> ${toVectorLiteral(input.queryEmbedding)}::vector
          limit ${LIST_LIMIT}`)
      : Promise.resolve([]),
  ]);
  return fuseRankings(ids(keywordRows), ids(vectorRows), { limit: input.limit ?? 20 });
}

export function toVectorLiteral(values: number[]): string {
  return `[${values.map((value) => (Number.isFinite(value) ? value : 0)).join(",")}]`;
}

function ids(rows: unknown): string[] {
  return (rows as Array<{ id: string }>).map((row) => String(row.id));
}
