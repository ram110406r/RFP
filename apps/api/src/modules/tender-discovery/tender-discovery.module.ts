import { Module } from "@nestjs/common";

import { TenderDiscoveryController } from "./tender-discovery.controller";
import { TenderDiscoveryService } from "./tender-discovery.service";

@Module({ controllers: [TenderDiscoveryController], providers: [TenderDiscoveryService] })
export class TenderDiscoveryModule {}
