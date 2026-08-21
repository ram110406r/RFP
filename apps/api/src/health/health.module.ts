import { Module } from "@nestjs/common";

import { HealthController } from "./health.controller";
import { HealthV1Controller } from "./health-v1.controller";
import { HealthService } from "./health.service";
import { ReadyController } from "./ready.controller";

@Module({
  controllers: [HealthController, ReadyController, HealthV1Controller],
  providers: [HealthService],
})
export class HealthModule {}
