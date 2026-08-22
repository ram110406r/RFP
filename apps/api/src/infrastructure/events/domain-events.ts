/**
 * Domain event contracts.
 *
 * Phase 5 defines the contracts and emits them; it does NOT build the BullMQ
 * pipeline, because nothing consumes these yet and infrastructure built ahead
 * of its first consumer tends to be wrong. The publisher is an interface with
 * an in-process implementation, so Phase 6 swaps in a queue-backed publisher
 * without touching a single domain service.
 *
 * Events are named in the past tense and describe something that has already
 * been committed — a subscriber can never veto them, only react.
 */

export const RFP_EVENTS = {
  CREATED: "RFP_CREATED",
  UPDATED: "RFP_UPDATED",
  ARCHIVED: "RFP_ARCHIVED",
  RESTORED: "RFP_RESTORED",
  DELETED: "RFP_DELETED",
  STATUS_CHANGED: "RFP_STATUS_CHANGED",
  ASSIGNMENT_CHANGED: "RFP_ASSIGNMENT_CHANGED",
} as const;

export type RfpEventName = (typeof RFP_EVENTS)[keyof typeof RFP_EVENTS];

/**
 * Fields every domain event carries.
 *
 * `organizationId` is on the envelope rather than buried in the payload
 * because a consumer must be able to scope work to a tenant without
 * understanding the payload's shape.
 */
export interface DomainEventEnvelope<TName extends string, TPayload> {
  name: TName;
  organizationId: string;
  actorId: string | null;
  /** The entity the event is about, for correlation and idempotency. */
  entityId: string;
  occurredAt: Date;
  payload: TPayload;
}

export type RfpCreatedEvent = DomainEventEnvelope<
  typeof RFP_EVENTS.CREATED,
  { rfpId: string; title: string; lifecycleStatus: string; ownerId: string }
>;

export type RfpUpdatedEvent = DomainEventEnvelope<
  typeof RFP_EVENTS.UPDATED,
  { rfpId: string; changedFields: string[] }
>;

export type RfpArchivedEvent = DomainEventEnvelope<typeof RFP_EVENTS.ARCHIVED, { rfpId: string }>;

export type RfpRestoredEvent = DomainEventEnvelope<typeof RFP_EVENTS.RESTORED, { rfpId: string }>;

export type RfpDeletedEvent = DomainEventEnvelope<typeof RFP_EVENTS.DELETED, { rfpId: string }>;

export type RfpStatusChangedEvent = DomainEventEnvelope<
  typeof RFP_EVENTS.STATUS_CHANGED,
  { rfpId: string; fromStatus: string; toStatus: string; reason?: string | undefined }
>;

export type RfpAssignmentChangedEvent = DomainEventEnvelope<
  typeof RFP_EVENTS.ASSIGNMENT_CHANGED,
  { rfpId: string; userId: string; role: string; change: "assigned" | "unassigned" }
>;

export type RfpDomainEvent =
  | RfpCreatedEvent
  | RfpUpdatedEvent
  | RfpArchivedEvent
  | RfpRestoredEvent
  | RfpDeletedEvent
  | RfpStatusChangedEvent
  | RfpAssignmentChangedEvent;

export type DomainEvent = RfpDomainEvent;
