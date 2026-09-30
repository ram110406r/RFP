import type { AiProvider, CompletionRequest, CompletionResponse, EmbeddingRequest, EmbeddingResponse } from "../provider";
import { consoleProviderLogger, postJson, ProviderHttpError, type ProviderLogger, readEnv, readNumberEnv } from "./http";

type VoyageEmbeddingResponse = {
  data: Array<{ embedding: number[]; index: number }>;
  model: string;
  usage?: { total_tokens?: number };
};

export interface VoyageEmbeddingOptions {
  apiKey: string;
  /** Vendor model id, e.g. "voyage-3.5". Logical model names are mapped by the ModelRouter. */
  model: string;
  dimensions: number;
  baseUrl?: string;
  timeoutMs?: number;
  /** Max inputs per request; Voyage accepts up to 1000 but smaller batches fail cheaper. */
  batchSize?: number;
  maxRetries?: number;
  logger?: ProviderLogger;
}

/**
 * Voyage AI embeddings, used for knowledge chunk retrieval.
 *
 * Chosen for retrieval quality on long business documents and because it
 * separates document and query embeddings (`input_type`), which measurably
 * improves search. Output dimension is pinned (the pgvector column is fixed
 * at 1024) so a model change can never silently write vectors of the wrong
 * size.
 */
export class VoyageEmbeddingProvider implements AiProvider {
  readonly name = "voyage";
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly batchSize: number;
  private readonly maxRetries: number;
  private readonly logger: ProviderLogger;

  constructor(private readonly options: VoyageEmbeddingOptions) {
    this.baseUrl = (options.baseUrl ?? "https://api.voyageai.com/v1").replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.batchSize = options.batchSize ?? 128;
    this.maxRetries = options.maxRetries ?? 3;
    this.logger = options.logger ?? consoleProviderLogger;
  }

  get model(): string {
    return this.options.model;
  }

  async complete(_request: CompletionRequest): Promise<CompletionResponse> {
    throw new Error("VoyageEmbeddingProvider only serves embeddings.");
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const embeddings: number[][] = [];
    for (let start = 0; start < request.input.length; start += this.batchSize) {
      const batch = request.input.slice(start, start + this.batchSize).map((text) => text.slice(0, 32_000));
      const response = await this.withRetry(() =>
        postJson<VoyageEmbeddingResponse>(
          `${this.baseUrl}/embeddings`,
          {
            model: this.options.model,
            input: batch,
            input_type: request.inputType ?? "document",
            output_dimension: this.options.dimensions,
          },
          { apiKey: this.options.apiKey, timeoutMs: this.timeoutMs, operation: "Voyage embeddings" },
        ),
      );
      const ordered = [...response.data].sort((a, b) => a.index - b.index);
      for (const item of ordered) {
        if (item.embedding.length !== this.options.dimensions) {
          throw new Error(
            `Voyage returned ${item.embedding.length}-dimension vectors; expected ${this.options.dimensions}.`,
          );
        }
        embeddings.push(item.embedding);
      }
    }
    return { embeddings, model: this.options.model };
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    for (;;) {
      try {
        return await fn();
      } catch (error) {
        attempt += 1;
        const retryable = error instanceof ProviderHttpError ? error.retryable : (error as Error).name === "AbortError";
        if (!retryable || attempt > this.maxRetries) throw error;
        const delay = Math.min(8_000, 500 * 2 ** (attempt - 1));
        this.logger.warn(`Voyage embeddings retry ${attempt}/${this.maxRetries} in ${delay}ms: ${(error as Error).message}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
}

/**
 * Deterministic, offline embeddings with the production dimension, for
 * `AI_PROVIDER=mock` and tests. Hashed bag-of-words, L2-normalised, so texts
 * sharing words really are closer — vector search behaves plausibly in dev
 * instead of returning noise.
 */
export class HashEmbeddingProvider implements AiProvider {
  readonly name = "hash-embeddings";

  constructor(
    private readonly dimensions: number,
    readonly model = "hash-embedding-v1",
  ) {}

  async complete(_request: CompletionRequest): Promise<CompletionResponse> {
    throw new Error("HashEmbeddingProvider only serves embeddings.");
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    return { embeddings: request.input.map((text) => hashEmbedding(text, this.dimensions)), model: this.model };
  }
}

export function hashEmbedding(text: string, dimensions: number): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 1);
  for (const token of tokens) {
    let hash = 2166136261;
    for (let index = 0; index < token.length; index += 1) {
      hash ^= token.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    vector[hash % dimensions]! += hash & 1 ? 1 : -1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

/** The logical model name knowledge code embeds with; the router maps it to a vendor. */
export const KNOWLEDGE_EMBEDDING_MODEL = "tendyy-embed-v1";

export interface KnowledgeEmbedder {
  provider: AiProvider;
  /** Vendor model recorded on each chunk, so a model switch is detectable. */
  vendorModel: string;
}

/**
 * Resolves the knowledge embedder from the environment:
 * - `AI_PROVIDER=mock` → deterministic hash embeddings
 * - `VOYAGE_API_KEY` set → Voyage (`EMBEDDING_MODEL`, default voyage-3.5)
 * - otherwise null: retrieval degrades to keyword search, ingestion still chunks.
 */
export function knowledgeEmbedderFromEnv(
  dimensions: number,
  env: Record<string, string | undefined> = process.env,
  logger?: ProviderLogger,
): KnowledgeEmbedder | null {
  if (readEnv("AI_PROVIDER", env) === "mock") {
    const provider = new HashEmbeddingProvider(dimensions);
    return { provider, vendorModel: provider.model };
  }
  const apiKey = readEnv("VOYAGE_API_KEY", env);
  if (!apiKey) return null;
  const model = readEnv("EMBEDDING_MODEL", env) ?? "voyage-3.5";
  const configured = readNumberEnv("EMBEDDING_DIMENSIONS", env);
  if (configured && configured !== dimensions) {
    throw new Error(
      `EMBEDDING_DIMENSIONS=${configured} does not match the knowledge_chunks vector column (${dimensions}). ` +
        "Changing dimension needs a migration.",
    );
  }
  const provider = new VoyageEmbeddingProvider({
    apiKey,
    model,
    dimensions,
    baseUrl: readEnv("VOYAGE_BASE_URL", env),
    timeoutMs: readNumberEnv("VOYAGE_TIMEOUT_MS", env),
    logger,
  });
  return { provider, vendorModel: model };
}
