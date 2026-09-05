import { ForbiddenException, Injectable } from "@nestjs/common";
import { withTransaction, type rfps } from "@rfp-os/db";
import type { AuthContext } from "@rfp-os/types";

import { PolicyService } from "../../common/auth";
import { AuditService, RFP_AUDIT_ACTIONS } from "../../infrastructure/audit";
import { EventPublisher, RFP_EVENTS } from "../../infrastructure/events";
import type { CreateRfpInput, ListRfpsInput, UpdateRfpInput } from "./dto/rfp.dto";
import {
  ArchivedRfpNotEditableError,
  ClientNotFoundError,
  RfpAlreadyArchivedError,
  RfpNotFoundError,
  RfpOwnerNotFoundError,
} from "./domain/rfp.errors";
import { RfpRepository } from "./rfp.repository";

type RfpRow = typeof rfps.$inferSelect;

/**
 * The RFP aggregate's transactional behaviour.
 *
 * Shape of every mutation here: validate the inputs against the tenant,
 * authorize (RBAC has already run in the guard; ABAC runs here where the
 * resource is known), write inside a transaction together with the audit row,
 * then publish the domain event after the commit.
 */
@Injectable()
export class RfpService {
  constructor(
    private readonly repository: RfpRepository,
    private readonly audit: AuditService,
    private readonly events: EventPublisher,
    private readonly policy: PolicyService,
  ) {}

  async list(auth: AuthContext, filters: ListRfpsInput) {
    const { items, total } = await this.repository.list(auth.organizationId, filters);
    return {
      items: items.map((row) => serialize(row.rfp, row.clientName)),
      total,
      page: filters.page,
      pageSize: filters.pageSize,
    };
  }

  async getById(auth: AuthContext, rfpId: string) {
    const row = await this.repository.findDetailById(auth.organizationId, rfpId);
    // Not found and not-yours are the same answer; see rfp.errors.ts.
    if (!row) throw new RfpNotFoundError();

    await this.assertPolicyAllows(auth, "read", row.rfp);
    return { ...serialize(row.rfp, row.clientName), ownerName: row.ownerName };
  }

  async create(auth: AuthContext, input: CreateRfpInput) {
    const ownerId = input.ownerId ?? auth.userId;

    /*
     * Both ids arrive from the request, so both are checked against this
     * tenant before they are stored. Skipping either would let a caller
     * attach another organization's client or user to their own RFP.
     */
    if (!(await this.repository.clientExists(auth.organizationId, input.clientId))) {
      throw new ClientNotFoundError();
    }
    if (!(await this.repository.isActiveMember(auth.organizationId, ownerId))) {
      throw new RfpOwnerNotFoundError();
    }

    const created = await withTransaction(async (tx) => {
      const rfp = await this.repository.insert(
        {
          organizationId: auth.organizationId,
          customerId: input.clientId,
          projectId: input.projectId ?? null,
          title: input.title,
          description: input.description ?? "",
          opportunity: input.opportunity ?? "",
          ownerId,
          createdBy: auth.userId,
          deadline: input.deadline,
          estimatedValue: input.estimatedValue?.toString() ?? "0",
          lifecycleStatus: "DRAFT",
        },
        tx,
      );
      if (!rfp) throw new RfpNotFoundError();

      /* The opening history row, so a lifecycle always has an origin. */
      await this.repository.recordStatusChange(
        {
          organizationId: auth.organizationId,
          rfpId: rfp.id,
          fromStatus: null,
          toStatus: "DRAFT",
          actorId: auth.userId,
          reason: "RFP created.",
        },
        tx,
      );

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          actorId: auth.userId,
          action: RFP_AUDIT_ACTIONS.CREATED,
          entityType: "rfp",
          entityId: rfp.id,
          newValue: { title: rfp.title, ownerId: rfp.ownerId, lifecycleStatus: "DRAFT" },
        },
        tx,
      );

      return rfp;
    });

    await this.events.publish({
      name: RFP_EVENTS.CREATED,
      organizationId: auth.organizationId,
      actorId: auth.userId,
      entityId: created.id,
      occurredAt: new Date(),
      payload: {
        rfpId: created.id,
        title: created.title,
        lifecycleStatus: created.lifecycleStatus,
        ownerId: created.ownerId,
      },
    });

    return serialize(created);
  }

  async update(auth: AuthContext, rfpId: string, input: UpdateRfpInput) {
    const existing = await this.requireRfp(auth, rfpId);
    if (existing.archivedAt) throw new ArchivedRfpNotEditableError();
    await this.assertPolicyAllows(auth, "update", existing);

    if (
      input.clientId &&
      !(await this.repository.clientExists(auth.organizationId, input.clientId))
    ) {
      throw new ClientNotFoundError();
    }
    if (
      input.ownerId &&
      !(await this.repository.isActiveMember(auth.organizationId, input.ownerId))
    ) {
      throw new RfpOwnerNotFoundError();
    }

    const patch: Partial<typeof rfps.$inferInsert> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.clientId !== undefined) patch.customerId = input.clientId;
    if (input.projectId !== undefined) patch.projectId = input.projectId;
    if (input.description !== undefined) patch.description = input.description;
    if (input.opportunity !== undefined) patch.opportunity = input.opportunity;
    if (input.deadline !== undefined) patch.deadline = input.deadline;
    if (input.estimatedValue !== undefined) patch.estimatedValue = input.estimatedValue.toString();
    if (input.ownerId !== undefined) patch.ownerId = input.ownerId;

    const changedFields = Object.keys(patch);

    const updated = await withTransaction(async (tx) => {
      const row = await this.repository.update(auth.organizationId, rfpId, patch, tx);
      if (!row) throw new RfpNotFoundError();

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          actorId: auth.userId,
          action: RFP_AUDIT_ACTIONS.UPDATED,
          entityType: "rfp",
          entityId: rfpId,
          previousValue: pick(existing, changedFields),
          newValue: pick(row, changedFields),
          metadata: { changedFields },
        },
        tx,
      );

      return row;
    });

    await this.events.publish({
      name: RFP_EVENTS.UPDATED,
      organizationId: auth.organizationId,
      actorId: auth.userId,
      entityId: rfpId,
      occurredAt: new Date(),
      payload: { rfpId, changedFields },
    });

    return serialize(updated);
  }

  /**
   * DELETE archives rather than deletes.
   *
   * An RFP is the root of requirements, answers, evidence and its own audit
   * trail; removing the row would orphan or cascade away the record of work
   * that was done. Archiving keeps the history and hides the RFP from lists.
   */
  async archive(auth: AuthContext, rfpId: string) {
    const existing = await this.requireRfp(auth, rfpId);
    if (existing.archivedAt) throw new RfpAlreadyArchivedError();
    await this.assertPolicyAllows(auth, "archive", existing);

    const archived = await withTransaction(async (tx) => {
      const row = await this.repository.update(
        auth.organizationId,
        rfpId,
        { archivedAt: new Date() },
        tx,
      );
      if (!row) throw new RfpNotFoundError();

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          actorId: auth.userId,
          action: RFP_AUDIT_ACTIONS.ARCHIVED,
          entityType: "rfp",
          entityId: rfpId,
          previousValue: { archivedAt: null },
          newValue: { archivedAt: row.archivedAt },
        },
        tx,
      );
      return row;
    });

    await this.events.publish({
      name: RFP_EVENTS.ARCHIVED,
      organizationId: auth.organizationId,
      actorId: auth.userId,
      entityId: rfpId,
      occurredAt: new Date(),
      payload: { rfpId },
    });

    return serialize(archived);
  }

  async restore(auth: AuthContext, rfpId: string) {
    const existing = await this.requireRfp(auth, rfpId);
    await this.assertPolicyAllows(auth, "archive", existing);

    const restored = await withTransaction(async (tx) => {
      const row = await this.repository.update(
        auth.organizationId,
        rfpId,
        { archivedAt: null },
        tx,
      );
      if (!row) throw new RfpNotFoundError();

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          actorId: auth.userId,
          action: RFP_AUDIT_ACTIONS.RESTORED,
          entityType: "rfp",
          entityId: rfpId,
          previousValue: { archivedAt: existing.archivedAt },
          newValue: { archivedAt: null },
        },
        tx,
      );
      return row;
    });

    await this.events.publish({
      name: RFP_EVENTS.RESTORED,
      organizationId: auth.organizationId,
      actorId: auth.userId,
      entityId: rfpId,
      occurredAt: new Date(),
      payload: { rfpId },
    });

    return serialize(restored);
  }

  /** Loads an RFP in the caller's tenant, or reports it as absent. */
  async requireRfp(auth: AuthContext, rfpId: string): Promise<RfpRow> {
    const rfp = await this.repository.findById(auth.organizationId, rfpId);
    if (!rfp) throw new RfpNotFoundError();
    return rfp;
  }

  /**
   * ABAC, after RBAC.
   *
   * The guard has already established the caller holds the permission in the
   * abstract; this asks whether it holds for *this* RFP, given attributes an
   * organization may have written policies about. With no policies configured
   * the call is allowed and this costs one indexed query.
   */
  async assertPolicyAllows(auth: AuthContext, action: string, rfp: RfpRow): Promise<void> {
    const decision = await this.policy.evaluate(auth, "rfp", action, {
      rfpId: rfp.id,
      ownerId: rfp.ownerId,
      createdBy: rfp.createdBy,
      lifecycleStatus: rfp.lifecycleStatus,
      archived: rfp.archivedAt !== null,
    });
    if (!decision.allowed) {
      throw new ForbiddenException({
        code: "RFP_ACCESS_DENIED",
        message: decision.reason ?? "You do not have access to this RFP.",
      });
    }
  }
}

function pick(row: Record<string, unknown>, fields: string[]) {
  return Object.fromEntries(fields.map((field) => [field, row[field]]));
}

function serialize(rfp: RfpRow, clientName?: string) {
  return {
    id: rfp.id,
    organizationId: rfp.organizationId,
    clientId: rfp.customerId,
    ...(clientName !== undefined ? { clientName } : {}),
    projectId: rfp.projectId,
    title: rfp.title,
    description: rfp.description,
    opportunity: rfp.opportunity,
    status: rfp.lifecycleStatus,
    /** The prototype's deprecated display status, retained for persisted data. */
    legacyStatus: rfp.status,
    deadline: rfp.deadline,
    estimatedValue: Number(rfp.estimatedValue),
    ownerId: rfp.ownerId,
    createdBy: rfp.createdBy,
    archivedAt: rfp.archivedAt,
    createdAt: rfp.createdAt,
    updatedAt: rfp.updatedAt,
  };
}
