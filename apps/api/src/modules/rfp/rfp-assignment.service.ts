import { Injectable } from "@nestjs/common";
import { withTransaction } from "@rfp-os/db";
import type { AuthContext } from "@rfp-os/types";

import { AuditService, RFP_AUDIT_ACTIONS } from "../../infrastructure/audit";
import { EventPublisher, RFP_EVENTS } from "../../infrastructure/events";
import type { AssignRfpInput } from "./dto/rfp.dto";
import {
  ArchivedRfpNotEditableError,
  DuplicateRfpAssignmentError,
  RfpAssignmentNotFoundError,
  UserNotInOrganizationError,
} from "./domain/rfp.errors";
import { RfpRepository } from "./rfp.repository";
import { RfpService } from "./rfp.service";

/**
 * Who works on a given RFP.
 *
 * Assignment presupposes organization membership and never replaces it: a user
 * must already be an active member before they can be put on a deal, which is
 * what stops assignment being a back door into a tenant.
 */
@Injectable()
export class RfpAssignmentService {
  constructor(
    private readonly repository: RfpRepository,
    private readonly rfps: RfpService,
    private readonly audit: AuditService,
    private readonly events: EventPublisher,
  ) {}

  async list(auth: AuthContext, rfpId: string, includeUnassigned: boolean) {
    await this.rfps.requireRfp(auth, rfpId);
    return {
      assignments: await this.repository.listAssignments(
        auth.organizationId,
        rfpId,
        includeUnassigned,
      ),
    };
  }

  async assign(auth: AuthContext, rfpId: string, input: AssignRfpInput) {
    const rfp = await this.rfps.requireRfp(auth, rfpId);
    if (rfp.archivedAt) throw new ArchivedRfpNotEditableError();
    await this.rfps.assertPolicyAllows(auth, "assign", rfp);

    /*
     * The user id comes from the request body, so it is checked against THIS
     * organization's membership. Without this, a caller could assign a user id
     * belonging to another tenant and leak the RFP to them.
     */
    if (!(await this.repository.isActiveMember(auth.organizationId, input.userId))) {
      throw new UserNotInOrganizationError();
    }

    const existing = await this.repository.findAssignment(
      auth.organizationId,
      rfpId,
      input.userId,
      input.role,
    );
    /* Re-assigning someone already active in that role is a conflict, not a
       silent no-op — the caller's mental model is wrong and should be told. */
    if (existing && existing.unassignedAt === null) throw new DuplicateRfpAssignmentError();

    const assignment = await withTransaction(async (tx) => {
      /* Upsert reactivates a previously removed assignment rather than
         inserting a duplicate, preserving the original assignment record. */
      const row = await this.repository.upsertAssignment(
        {
          organizationId: auth.organizationId,
          rfpId,
          userId: input.userId,
          role: input.role,
          assignedBy: auth.userId,
        },
        tx,
      );
      if (!row) throw new RfpAssignmentNotFoundError();

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          actorId: auth.userId,
          action: RFP_AUDIT_ACTIONS.ASSIGNMENT_CREATED,
          entityType: "rfp",
          entityId: rfpId,
          newValue: { userId: input.userId, role: input.role },
        },
        tx,
      );
      return row;
    });

    await this.events.publish({
      name: RFP_EVENTS.ASSIGNMENT_CHANGED,
      organizationId: auth.organizationId,
      actorId: auth.userId,
      entityId: rfpId,
      occurredAt: new Date(),
      payload: { rfpId, userId: input.userId, role: input.role, change: "assigned" },
    });

    return assignment;
  }

  /** Soft-unassigns. Omitting `role` removes every active role that user holds. */
  async unassign(auth: AuthContext, rfpId: string, userId: string, role?: string) {
    const rfp = await this.rfps.requireRfp(auth, rfpId);
    if (rfp.archivedAt) throw new ArchivedRfpNotEditableError();
    await this.rfps.assertPolicyAllows(auth, "assign", rfp);

    const removed = await withTransaction(async (tx) => {
      const rows = await this.repository.unassign(auth.organizationId, rfpId, userId, role, tx);
      if (rows.length === 0) throw new RfpAssignmentNotFoundError();

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          actorId: auth.userId,
          action: RFP_AUDIT_ACTIONS.ASSIGNMENT_REMOVED,
          entityType: "rfp",
          entityId: rfpId,
          previousValue: { userId, roles: rows.map((row) => row.role) },
          newValue: { userId, roles: [] },
        },
        tx,
      );
      return rows;
    });

    for (const row of removed) {
      await this.events.publish({
        name: RFP_EVENTS.ASSIGNMENT_CHANGED,
        organizationId: auth.organizationId,
        actorId: auth.userId,
        entityId: rfpId,
        occurredAt: new Date(),
        payload: { rfpId, userId, role: row.role, change: "unassigned" },
      });
    }

    return { removed: removed.length };
  }
}
