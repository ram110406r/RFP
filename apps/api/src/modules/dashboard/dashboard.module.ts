import { Module } from "@nestjs/common";

import { TendersModule } from "../tenders";
import { DashboardController } from "./dashboard.controller";

@Module({
  imports: [TendersModule],
  controllers: [DashboardController],
})
export class DashboardModule {}
