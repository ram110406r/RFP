import { Module } from "@nestjs/common";

import { AuthModule } from "../auth";
import { ActivityModule } from "../../infrastructure/activity";
import { AiModule } from "../../infrastructure/ai/ai.module";
import { AuditModule } from "../../infrastructure/audit";
import { EvidenceRankingService, EvidenceRetrievalService, EvidenceSelectionService } from "./evidence";
import { TenderAiService } from "./ai";
import { AnswerGenerationService } from "./answer-generation";
import { TenderAnswerReviewsController, TenderReviewsController, TendersController } from "./tenders.controller";
import { TendersService } from "./tenders.service";

@Module({
  imports: [AuthModule, ActivityModule, AuditModule, AiModule],
  controllers: [TendersController, TenderAnswerReviewsController, TenderReviewsController],
  providers: [
    TendersService,
    AnswerGenerationService,
    TenderAiService,
    EvidenceRetrievalService,
    EvidenceRankingService,
    EvidenceSelectionService,
  ],
  exports: [TendersService],
})
export class TendersModule {}
