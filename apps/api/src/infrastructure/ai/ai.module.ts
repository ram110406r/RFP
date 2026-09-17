import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ModelRouter } from "@rfp-os/ai";

import { TIER_2_AI_MODELS } from "./ai.constants";
import { GroqAnswerProvider } from "./grounded-answer.provider";
import { MockAiProvider } from "./mock-ai.provider";
import type { Env } from "../../config/env.schema";

@Module({
  providers: [
    GroqAnswerProvider,
    MockAiProvider,
    {
      provide: ModelRouter,
      inject: [ConfigService, GroqAnswerProvider, MockAiProvider],
      useFactory: (
        config: ConfigService<Env, true>,
        groqProvider: GroqAnswerProvider,
        mockProvider: MockAiProvider,
      ) => {
        const router = new ModelRouter();
        const provider = config.get("AI_PROVIDER", { infer: true }) === "mock" ? mockProvider : groqProvider;
        router.registerProvider(provider, [...TIER_2_AI_MODELS]);
        return router;
      },
    },
  ],
  exports: [ModelRouter],
})
export class AiModule {}
