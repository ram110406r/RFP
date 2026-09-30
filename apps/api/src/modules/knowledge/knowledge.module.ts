import { Module } from "@nestjs/common";

import { ActivityModule } from "../../infrastructure/activity";
import { AuditModule } from "../../infrastructure/audit";
import { AuthModule } from "../auth";
import { KnowledgeDocumentsService } from "./knowledge-documents.service";
import { KnowledgeController } from "./knowledge.controller";
import { KnowledgeService } from "./knowledge.service";

@Module({
  imports: [AuthModule, ActivityModule, AuditModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, KnowledgeDocumentsService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
