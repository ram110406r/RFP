import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import {
  customers,
  organizationMembers,
  orgScope,
  rfpStatusHistory,
  rfpTeamAssignments,
  rfps,
  users,
  type Database,
  type Transaction,
} from "@rfp-os/db";

import { DATABASE } from "../../infrastructure/database";
import type { ListRfpsInput } from "./dto/rfp.dto";

type Executor = Database | Transaction;

/**
 * All RFP data access, and the only place RFP SQL is written.
 *
 * Every method takes `organizationId` as its first argument and applies it via
 * `orgScope`, so tenant isolation is a property of this file rather than a
 * discipline spread across services. There is deliberately no "find by id"
 * that omits the organization — the unsafe version simply does not exist to be
 * called by mistake.
 */
@Injectable()
export class RfpRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private exec(tx?: Executor): Executor {
    return tx ?? this.db;
  }

  async findById(organizationId: string, rfpId: string, tx?: Executor) {
    const [rfp] = await this.exec(tx)
      .select()
      .from(rfps)
      .where(and(orgScope(rfps, organizationId), eq(rfps.id, rfpId)))
      .limit(1);
    return rfp ?? null;
  }

  /** Row plus the joined client name, for read endpoints. */
  async findDetailById(organizationId: string, rfpId: string) {
    const [row] = await this.db
      .select({
        rfp: rfps,
        clientName: customers.name,
        ownerName: users.name,
      })
      .from(rfps)
      .innerJoin(customers, eq(customers.id, rfps.customerId))
      .innerJoin(users, eq(users.id, rfps.ownerId))
      .where(and(orgScope(rfps, organizationId), eq(rfps.id, rfpId)))
      .limit(1);
    return row ?? null;
  }

  async list(organizationId: string, filters: ListRfpsInput) {
    const conditions: SQL[] = [orgScope(rfps, organizationId)];

    if (!filters.includeArchived) conditions.push(isNull(rfps.archivedAt));
    if (filters.status) conditions.push(eq(rfps.lifecycleStatus, filters.status));
    if (filters.ownerId) conditions.push(eq(rfps.ownerId, filters.ownerId));
    if (filters.search) {
      const term = `%${filters.search}%`;
      const match = or(ilike(rfps.title, term), ilike(customers.name, term));
      if (match) conditions.push(match);
    }

    const where = and(...conditions);
    const sortColumn = {
      deadline: rfps.deadline,
      createdAt: rfps.createdAt,
      title: rfps.title,
      estimatedValue: rfps.estimatedValue,
    }[filters.sort];
    const order = filters.direction === "desc" ? desc(sortColumn) : asc(sortColumn);

    const offset = (filters.page - 1) * filters.pageSize;

    const [items, [totals]] = await Promise.all([
      this.db
        .select({ rfp: rfps, clientName: customers.name })
        .from(rfps)
        .innerJoin(customers, eq(customers.id, rfps.customerId))
        .where(where)
        .orderBy(order)
        .limit(filters.pageSize)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(rfps)
        .innerJoin(customers, eq(customers.id, rfps.customerId))
        .where(where),
    ]);

    return { items, total: totals?.total ?? 0 };
  }

  async insert(values: typeof rfps.$inferInsert, tx?: Executor) {
    const [created] = await this.exec(tx).insert(rfps).values(values).returning();
    return created ?? null;
  }

  async update(
    organizationId: string,
    rfpId: string,
    values: Partial<typeof rfps.$inferInsert>,
    tx?: Executor,
  ) {
    const [updated] = await this.exec(tx)
      .update(rfps)
      .set({ ...values, updatedAt: new Date() })
      .where(and(orgScope(rfps, organizationId), eq(rfps.id, rfpId)))
      .returning();
    return updated ?? null;
  }

  async recordStatusChange(
    entry: typeof rfpStatusHistory.$inferInsert,
    tx?: Executor,
  ): Promise<void> {
    await this.exec(tx).insert(rfpStatusHistory).values(entry);
  }

  async listStatusHistory(organizationId: string, rfpId: string) {
    return this.db
      .select({
        id: rfpStatusHistory.id,
        fromStatus: rfpStatusHistory.fromStatus,
        toStatus: rfpStatusHistory.toStatus,
        reason: rfpStatusHistory.reason,
        metadata: rfpStatusHistory.metadata,
        createdAt: rfpStatusHistory.createdAt,
        actorId: rfpStatusHistory.actorId,
        actorName: users.name,
      })
      .from(rfpStatusHistory)
      .leftJoin(users, eq(users.id, rfpStatusHistory.actorId))
      .where(and(orgScope(rfpStatusHistory, organizationId), eq(rfpStatusHistory.rfpId, rfpId)))
      .orderBy(asc(rfpStatusHistory.createdAt));
  }

  /**
   * Confirms a user is an active member of the organization.
   *
   * Every place a user id arrives from a request — owner on create, owner on
   * update, assignee — routes through here. Without it, a caller could name a
   * user id from another tenant and quietly attach them to this one.
   */
  async isActiveMember(organizationId: string, userId: string, tx?: Executor): Promise<boolean> {
    const [member] = await this.exec(tx)
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.status, "active"),
        ),
      )
      .limit(1);
    return member !== undefined;
  }

  /** Confirms a client belongs to this organization before it is referenced. */
  async clientExists(organizationId: string, clientId: string, tx?: Executor): Promise<boolean> {
    const [client] = await this.exec(tx)
      .select({ id: customers.id })
      .from(customers)
      .where(and(orgScope(customers, organizationId), eq(customers.id, clientId)))
      .limit(1);
    return client !== undefined;
  }

  // --- assignments ---------------------------------------------------------

  async findAssignment(
    organizationId: string,
    rfpId: string,
    userId: string,
    role: string,
    tx?: Executor,
  ) {
    const [assignment] = await this.exec(tx)
      .select()
      .from(rfpTeamAssignments)
      .where(
        and(
          orgScope(rfpTeamAssignments, organizationId),
          eq(rfpTeamAssignments.rfpId, rfpId),
          eq(rfpTeamAssignments.userId, userId),
          sql`${rfpTeamAssignments.role} = ${role}`,
        ),
      )
      .limit(1);
    return assignment ?? null;
  }

  async listAssignments(organizationId: string, rfpId: string, includeUnassigned: boolean) {
    const conditions: SQL[] = [
      orgScope(rfpTeamAssignments, organizationId),
      eq(rfpTeamAssignments.rfpId, rfpId),
    ];
    if (!includeUnassigned) conditions.push(isNull(rfpTeamAssignments.unassignedAt));

    return this.db
      .select({
        id: rfpTeamAssignments.id,
        userId: rfpTeamAssignments.userId,
        role: rfpTeamAssignments.role,
        assignedBy: rfpTeamAssignments.assignedBy,
        unassignedAt: rfpTeamAssignments.unassignedAt,
        createdAt: rfpTeamAssignments.createdAt,
        name: users.name,
        email: users.email,
      })
      .from(rfpTeamAssignments)
      .innerJoin(users, eq(users.id, rfpTeamAssignments.userId))
      .where(and(...conditions))
      .orderBy(asc(rfpTeamAssignments.createdAt));
  }

  async upsertAssignment(values: typeof rfpTeamAssignments.$inferInsert, tx?: Executor) {
    const [assignment] = await this.exec(tx)
      .insert(rfpTeamAssignments)
      .values(values)
      .onConflictDoUpdate({
        target: [rfpTeamAssignments.rfpId, rfpTeamAssignments.userId, rfpTeamAssignments.role],
        set: {
          unassignedAt: null,
          assignedBy: values.assignedBy ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
    return assignment ?? null;
  }

  async unassign(
    organizationId: string,
    rfpId: string,
    userId: string,
    role: string | undefined,
    tx?: Executor,
  ) {
    const conditions: SQL[] = [
      orgScope(rfpTeamAssignments, organizationId),
      eq(rfpTeamAssignments.rfpId, rfpId),
      eq(rfpTeamAssignments.userId, userId),
      isNull(rfpTeamAssignments.unassignedAt),
    ];
    if (role) conditions.push(sql`${rfpTeamAssignments.role} = ${role}`);

    return this.exec(tx)
      .update(rfpTeamAssignments)
      .set({ unassignedAt: new Date(), updatedAt: new Date() })
      .where(and(...conditions))
      .returning();
  }
}
