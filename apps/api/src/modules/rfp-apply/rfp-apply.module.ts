import { Module } from "@nestjs/common";

import { TendersModule } from "../tenders/tenders.module";
import { AssignmentsModule } from "../assignments/assignments.module";
import { ApplyAutomationController, TenderAutomationController } from "./apply-automation.controller";
import { ApplyAutomationService } from "./apply-automation.service";
import { RfpApplyController } from "./rfp-apply.controller";
import { RfpApplyService } from "./rfp-apply.service";
import { ApplyRunnerService } from "./apply-runner.service";

@Module({
  imports: [TendersModule, AssignmentsModule],
  controllers: [RfpApplyController, ApplyAutomationController, TenderAutomationController],
  providers: [RfpApplyService, ApplyAutomationService, ApplyRunnerService],
})
export class RfpApplyModule {}
