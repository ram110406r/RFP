import { Injectable } from "@nestjs/common";
import { withTransaction } from "@rfp-os/db";
import type { AuthContext } from "@rfp-os/types";

import { AuditService, RFP_AUDIT_ACTIONS } from "../../infrastructure/audit";
import { EventPublisher, RFP_EVENTS } from "../../infrastructure/events";
import type { TransitionRfpInput } from "./dto/rfp.dto";
import {
  ArchivedRfpNotEditableError,
  InvalidRfpTransitionError,
  RfpNotFoundError,
  RfpTransitionNotAllowedError,
} from "./domain/rfp.errors";
import {
  allowedTransitionsFrom,
  canTransition,
  permissionForTransition,
  type RfpLifecycleStatus,
} from "./domain/rfp-state-machine";
import { RfpRepository } from "./rfp.repository";
import { RfpService } from "./rfp.service";

/**
 * The only path by which an RFP's lifecycle status changes.
 *
 * Nothing else writes `lifecycle_status` — the update DTO rejects the field
 * outright — so every movement through the lifecycle passes the five steps
 * below and leaves a history row behind.
 */
@Injectable()
export class RfpLifecycleService {
  constructor(
    private readonly repository: RfpRepository,
    private readonly rfps: RfpService,
    private readonly audit: AuditService,
    private readonly events: EventPublisher,
  ) {}

  /** What the caller could do next, given where the RFP is now. */
  async getAvailableTransitions(auth: AuthContext, rfpId: string) {
    const rfp = await this.rfps.requireRfp(auth, rfpId);
    const from = rfp.lifecycleStatus as RfpLifecycleStatus;
    return {
      status: from,
      transitions: allowedTransitionsFrom(from).map((rule) => ({
        to: rule.to,
        description: rule.description,
        requiresPermission: rule.permission ?? null,
        permitted: rule.permission ? auth.permissions.includes(rule.permission) : true,
      })),
    };
  }

  async getHistory(auth: AuthContext, rfpId: string) {
    // Establishes the RFP is in this tenant before any history is returned.
    await this.rfps.requireRfp(auth, rfpId);
    return { history: await this.repository.listStatusHistory(auth.organizationId, rfpId) };
  }

  /**
   * Validate, authorize, persist, record history, audit, publish — in that
   * order, with the three writes in one transaction.
   */
  async transition(auth: AuthContext, rfpId: string, input: TransitionRfpInput) {
    const rfp = await this.rfps.requireRfp(auth, rfpId);
    const from = rfp.lifecycleStatus as RfpLifecycleStatus;
    const to = input.to;

    if (rfp.archivedAt) throw new ArchivedRfpNotEditableError();

    // 1. Validate against the state machine.
    if (!canTransition(from, to)) throw new InvalidRfpTransitionError(from, to);

    /*
     * 2. Authorize. The endpoint already required rfp:update; heavier moves
     *    (approving for submission, submitting) demand their own permission,
     *    so a CONTRIBUTOR cannot walk an RFP out the door.
     */
    const required = permissionForTransition(from, to);
    if (required && !auth.permissions.includes(required)) {
      throw new RfpTransitionNotAllowedError(required);
    }

    // ABAC, now that both the resource and the intended action are known.
    await this.rfps.assertPolicyAllows(auth, `transition:${to}`, rfp);

    const updated = await withTransaction(async (tx) => {
      // 3. Persist the new status.
      const row = await this.repository.update(
        auth.organizationId,
        rfpId,
        { lifecycleStatus: to },
        tx,
      );
      if (!row) throw new RfpNotFoundError();

      // 4. Record history in the same transaction as the status write.
      await this.repository.recordStatusChange(
        {
          organizationId: auth.organizationId,
          rfpId,
          fromStatus: from,
          toStatus: to,
          actorId: auth.userId,
          reason: input.reason ?? null,
          metadata: input.metadata ?? null,
        },
        tx,
      );

      // 5. Audit, with the before/after the compliance record needs.
      await this.audit.record(
        {
          organizationId: auth.organizationId,
          actorId: auth.userId,
          action: RFP_AUDIT_ACTIONS.STATUS_CHANGED,
          entityType: "rfp",
          entityId: rfpId,
          previousValue: { lifecycleStatus: from },
          newValue: { lifecycleStatus: to },
          metadata: { reason: input.reason ?? null },
        },
        tx,
      );

      return row;
    });

    // 6. Announce it, only once the transaction has committed.
    await this.events.publish({
      name: RFP_EVENTS.STATUS_CHANGED,
      organizationId: auth.organizationId,
      actorId: auth.userId,
      entityId: rfpId,
      occurredAt: new Date(),
      payload: { rfpId, fromStatus: from, toStatus: to, reason: input.reason },
    });

    return {
      id: updated.id,
      status: updated.lifecycleStatus,
      previousStatus: from,
      reason: input.reason ?? null,
    };
  }
}
