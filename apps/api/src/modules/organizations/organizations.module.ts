import { Module } from "@nestjs/common";

import { ActivityModule } from "../../infrastructure/activity";
import { AuditModule } from "../../infrastructure/audit";
import { InvitationsController, OrganizationsController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";

@Module({
  imports: [ActivityModule, AuditModule],
  controllers: [OrganizationsController, InvitationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
