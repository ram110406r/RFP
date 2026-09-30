import { Logger, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { KNOWLEDGE_EMBEDDING_MODEL, knowledgeEmbedderFromEnv, ModelRouter, type KnowledgeEmbedder } from "@rfp-os/ai";
import { KNOWLEDGE_EMBEDDING_DIMENSIONS } from "@rfp-os/db";

import { KNOWLEDGE_EMBEDDER, TIER_2_AI_MODELS } from "./ai.constants";
import { GroqAnswerProvider } from "./grounded-answer.provider";
import { MockAiProvider } from "./mock-ai.provider";
import type { Env } from "../../config/env.schema";

@Module({
  providers: [
    GroqAnswerProvider,
    MockAiProvider,
    {
      /**
       * Null when no embedding provider is configured: knowledge retrieval
       * then runs keyword-only instead of failing.
       */
      provide: KNOWLEDGE_EMBEDDER,
      useFactory: (): KnowledgeEmbedder | null => {
        const logger = new Logger("KnowledgeEmbedder");
        const embedder = knowledgeEmbedderFromEnv(KNOWLEDGE_EMBEDDING_DIMENSIONS, process.env, {
          log: (message) => logger.log(message),
          warn: (message) => logger.warn(message),
          error: (message) => logger.error(message),
        });
        if (!embedder) logger.warn("No VOYAGE_API_KEY configured; knowledge retrieval is keyword-only.");
        return embedder;
      },
    },
    {
      provide: ModelRouter,
      inject: [ConfigService, GroqAnswerProvider, MockAiProvider, KNOWLEDGE_EMBEDDER],
      useFactory: (
        config: ConfigService<Env, true>,
        groqProvider: GroqAnswerProvider,
        mockProvider: MockAiProvider,
        embedder: KnowledgeEmbedder | null,
      ) => {
        const router = new ModelRouter();
        const provider = config.get("AI_PROVIDER", { infer: true }) === "mock" ? mockProvider : groqProvider;
        router.registerProvider(provider, [...TIER_2_AI_MODELS]);
        if (embedder) router.registerProvider(embedder.provider, [KNOWLEDGE_EMBEDDING_MODEL]);
        return router;
      },
    },
  ],
  exports: [ModelRouter, KNOWLEDGE_EMBEDDER],
})
export class AiModule {}
