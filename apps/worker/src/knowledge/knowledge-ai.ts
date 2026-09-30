import {
  GroqChatProvider,
  KNOWLEDGE_EMBEDDING_MODEL,
  knowledgeEmbedderFromEnv,
  ModelRouter,
  readEnv,
  type KnowledgeEmbedder,
  type ProviderLogger,
} from "@rfp-os/ai";
import { KNOWLEDGE_EMBEDDING_DIMENSIONS } from "@rfp-os/db";

/** Logical model for claim extraction; the router maps it to GROQ_MODEL today. */
export const KNOWLEDGE_EXTRACT_MODEL = "tendyy-knowledge-extract-v1";

export interface KnowledgeAi {
  router: ModelRouter;
  embedder: KnowledgeEmbedder | null;
  /** False in mock mode or without GROQ_API_KEY: extraction falls back to a heuristic. */
  canComplete: boolean;
}

/**
 * The worker's view of the AI providers, built from the same env the API
 * reads. Either capability can be missing — ingestion still chunks without an
 * embedder, and extraction still runs a heuristic without an LLM — so a
 * half-configured environment degrades instead of failing every upload.
 */
export function knowledgeAiFromEnv(logger: ProviderLogger): KnowledgeAi {
  const router = new ModelRouter();
  const embedder = knowledgeEmbedderFromEnv(KNOWLEDGE_EMBEDDING_DIMENSIONS, process.env, logger);
  if (embedder) router.registerProvider(embedder.provider, [KNOWLEDGE_EMBEDDING_MODEL]);
  const canComplete = readEnv("AI_PROVIDER") !== "mock" && Boolean(readEnv("GROQ_API_KEY"));
  if (canComplete) router.registerProvider(new GroqChatProvider(logger), [KNOWLEDGE_EXTRACT_MODEL]);
  return { router, embedder, canComplete };
}
