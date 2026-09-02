import { Module } from "@nestjs/common";

import { TendersModule } from "../tenders/tenders.module";
import { RfpApplyController } from "./rfp-apply.controller";
import { RfpApplyService } from "./rfp-apply.service";

@Module({
  imports: [TendersModule],
  controllers: [RfpApplyController],
  providers: [RfpApplyService],
})
export class RfpApplyModule {}
