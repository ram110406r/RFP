import { Module } from "@nestjs/common";

import { DocumentsController } from "./documents.controller";
import { DocumentsRepository } from "./documents.repository";
import { DocumentsService } from "./documents.service";

/**
 * The document domain module. Like RfpModule it consumes platform services
 * (database, storage, auth, audit, events) rather than providing its own —
 * those are global modules registered in AppModule.
 */
@Module({
  controllers: [DocumentsController],
  providers: [DocumentsRepository, DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
