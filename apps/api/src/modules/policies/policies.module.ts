import { Module } from "@nestjs/common";

import { ActivityModule } from "../../infrastructure/activity";
import { AuditModule } from "../../infrastructure/audit";
import { PoliciesController } from "./policies.controller";
import { PoliciesService } from "./policies.service";

@Module({
  imports: [ActivityModule, AuditModule],
  controllers: [PoliciesController],
  providers: [PoliciesService],
})
export class PoliciesModule {}
