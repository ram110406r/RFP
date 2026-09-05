import { Module } from "@nestjs/common";

import { ActivityModule } from "../../infrastructure/activity";
import { AuditModule } from "../../infrastructure/audit";
import { AssignmentsController } from "./assignments.controller";
import { AssignmentsService } from "./assignments.service";

@Module({
  imports: [ActivityModule, AuditModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
