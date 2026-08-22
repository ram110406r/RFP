import { Global, Module } from "@nestjs/common";

import { EventPublisher, InProcessEventPublisher } from "./event-publisher";

/**
 * Global so any domain module can publish without re-providing the transport.
 */
@Global()
@Module({
  providers: [{ provide: EventPublisher, useClass: InProcessEventPublisher }],
  exports: [EventPublisher],
})
export class EventsModule {}
