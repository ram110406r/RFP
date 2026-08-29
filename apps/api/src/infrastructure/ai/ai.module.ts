import { Module } from "@nestjs/common";
import { ModelRouter } from "@rfp-os/ai";

import { TIER_2_AI_MODELS } from "./ai.constants";
import { GroqAnswerProvider } from "./grounded-answer.provider";

@Module({
  providers: [
    GroqAnswerProvider,
    {
      provide: ModelRouter,
      inject: [GroqAnswerProvider],
      useFactory: (provider: GroqAnswerProvider) => {
        const router = new ModelRouter();
        router.registerProvider(provider, [...TIER_2_AI_MODELS]);
        return router;
      },
    },
  ],
  exports: [ModelRouter],
})
export class AiModule {}
