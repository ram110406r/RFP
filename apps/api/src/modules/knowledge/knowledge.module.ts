import { Module } from "@nestjs/common";

import { ActivityModule } from "../../infrastructure/activity";
import { AuditModule } from "../../infrastructure/audit";
import { AuthModule } from "../auth";
import { KnowledgeController } from "./knowledge.controller";
import { KnowledgeService } from "./knowledge.service";

@Module({
  imports: [AuthModule, ActivityModule, AuditModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
