import { Module } from "@nestjs/common";

import { PlatformTenderSourcesController, TenderDiscoveryController } from "./tender-discovery.controller";
import { TenderDiscoveryService } from "./tender-discovery.service";

@Module({ controllers: [TenderDiscoveryController, PlatformTenderSourcesController], providers: [TenderDiscoveryService] })
export class TenderDiscoveryModule {}
