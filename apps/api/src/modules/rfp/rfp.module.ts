import { Module } from "@nestjs/common";

import { RfpAssignmentController, RfpController, RfpLifecycleController } from "./rfp.controller";
import { RfpAssignmentService } from "./rfp-assignment.service";
import { RfpLifecycleService } from "./rfp-lifecycle.service";
import { RfpRepository } from "./rfp.repository";
import { RfpService } from "./rfp.service";

/**
 * Legacy compatibility surface.
 *
 * `tenders` is the canonical active product domain. Keep this module working
 * for migration compatibility, but do not add new product behavior here.
 */

/**
 * The RFP domain module. Consumes the platform services (database, auth,
 * audit, events) rather than providing its own — those are all global modules
 * registered in AppModule.
 */
@Module({
  controllers: [RfpController, RfpAssignmentController, RfpLifecycleController],
  providers: [RfpRepository, RfpService, RfpAssignmentService, RfpLifecycleService],
  exports: [RfpService, RfpLifecycleService, RfpAssignmentService],
})
export class RfpModule {}
