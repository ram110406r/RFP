import { Injectable } from "@nestjs/common";

import { PinoLoggerService } from "../../common/logger/pino-logger.service";
import type { DomainEvent } from "./domain-events";

/**
 * What domain services depend on. An interface rather than a concrete class so
 * Phase 6 can put BullMQ behind it without editing any caller.
 */
export abstract class EventPublisher {
  abstract publish(event: DomainEvent): Promise<void>;
}

/**
 * The Phase 5 implementation: records the event and does nothing else.
 *
 * Nothing subscribes yet — document processing, requirement extraction and the
 * rest arrive in later phases — so a queue here would be infrastructure with
 * no consumer. What matters now is that every domain mutation goes through
 * this seam, so switching to a durable transport is a one-class change.
 *
 * Publishing is deliberately AFTER the transaction commits, never inside it:
 * an event announces something that has happened, and emitting one for a
 * transaction that later rolls back would have consumers acting on a change
 * that does not exist.
 */
@Injectable()
export class InProcessEventPublisher extends EventPublisher {
  constructor(private readonly logger: PinoLoggerService) {
    super();
  }

  async publish(event: DomainEvent): Promise<void> {
    this.logger.log(
      `domain event ${event.name} org=${event.organizationId} entity=${event.entityId}`,
      "DomainEvent",
    );
  }
}
