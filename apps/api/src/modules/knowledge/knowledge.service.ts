import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import {
  knowledgeClaims,
  knowledgeSources,
  knowledgeVersions,
  organizationMembers,
  type Database,
  withTransaction,
} from "@rfp-os/db";
import type { AuthContext } from "@rfp-os/types";

import { ActivityService } from "../../infrastructure/activity";
import { AuditService } from "../../infrastructure/audit";
import { DATABASE } from "../../infrastructure/database";
import type { CreateKnowledgeInput, ListKnowledgeInput, UpdateKnowledgeInput } from "./knowledge.dto";

type KnowledgeRow = typeof knowledgeSources.$inferSelect;

const KNOWLEDGE_ACTIVITY_ACTIONS = {
  CREATED: "knowledge.created",
  UPDATED: "knowledge.updated",
  APPROVED: "knowledge.approved",
  ARCHIVED: "knowledge.archived",
} as const;

const KNOWLEDGE_AUDIT_ACTIONS = {
  CREATED: "KNOWLEDGE_CREATED",
  UPDATED: "KNOWLEDGE_UPDATED",
  APPROVED: "KNOWLEDGE_APPROVED",
  ARCHIVED: "KNOWLEDGE_ARCHIVED",
} as const;

@Injectable()
export class KnowledgeService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly activity: ActivityService,
    private readonly audit: AuditService,
  ) {}

  async list(auth: AuthContext, filters: Partial<ListKnowledgeInput> = {}) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 25;
    const where = and(
      eq(knowledgeSources.organizationId, auth.organizationId),
      filters.status ? sql`${knowledgeSources.metadata} ->> 'lifecycleStatus' = ${filters.status}` : undefined,
      filters.search
        ? or(
            ilike(knowledgeSources.name, `%${filters.search}%`),
            ilike(knowledgeSources.type, `%${filters.search}%`),
            ilike(knowledgeSources.summary, `%${filters.search}%`),
            ilike(sql<string>`${knowledgeSources.category}::text`, `%${filters.search}%`),
            ilike(knowledgeSources.version, `%${filters.search}%`),
          )
        : undefined,
    );

    const [totalRow] = await this.db
      .select({ value: sql<number>`count(*)` })
      .from(knowledgeSources)
      .where(where);

    const rows = await this.db
      .select()
      .from(knowledgeSources)
      .where(where)
      .orderBy(desc(knowledgeSources.updatedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return {
      items: rows.map((row) => serializeKnowledgeSource(row)),
      total: Number(totalRow?.value ?? 0),
      page,
      pageSize,
    };
  }

  async summary(auth: AuthContext) {
    const rows = await this.db
      .select()
      .from(knowledgeSources)
      .where(eq(knowledgeSources.organizationId, auth.organizationId))
      .orderBy(desc(knowledgeSources.updatedAt));

    const items = rows.map((row) => serializeKnowledgeSource(row));
    const counts = items.reduce(
      (acc, item) => {
        acc.total += 1;
        acc[item.status.toLowerCase() as "draft" | "active" | "archived"] += 1;
        if (item.lastVerified && isOlderThanDays(item.lastVerified, 180)) {
          acc.stale += 1;
        }
        return acc;
      },
      { total: 0, draft: 0, active: 0, archived: 0, stale: 0 },
    );

    return {
      counts,
      items: items.slice(0, 3),
      attention: items
        .filter((item) => item.status === "DRAFT" || (item.lastVerified && isOlderThanDays(item.lastVerified, 180)))
        .slice(0, 3),
    };
  }

  async getById(auth: AuthContext, id: string) {
    const row = await this.requireKnowledgeSource(auth.organizationId, id);
    return this.serializeWithChildren(row);
  }

  async create(auth: AuthContext, input: CreateKnowledgeInput) {
    await this.requireActiveMember(auth.organizationId, input.ownerId ?? auth.userId);
    const created = await withTransaction(async (tx) => {
      const [row] = await tx
        .insert(knowledgeSources)
        .values({
          organizationId: auth.organizationId,
          name: input.name,
          type: input.type,
          category: input.category as never,
          version: input.version ?? "1.0",
          authority: input.authority ?? "medium",
          ownerId: input.ownerId ?? auth.userId,
          lastVerified: input.lastVerified ?? null,
          lastUpdated: todayIso(),
          expiresAt: input.expiresAt ?? null,
          summary: input.summary ?? "",
          metadata: {
            lifecycleStatus: "DRAFT",
            source: "manual",
            approvedAt: null,
            approvedBy: null,
          },
        })
        .returning();
      if (!row) throw new BadRequestException("Could not create knowledge source.");

      if (input.claims?.length) {
        await tx.insert(knowledgeClaims).values(
          input.claims.map((claim) => ({
            sourceId: row.id,
            label: claim.label,
            value: claim.value,
            confidence: stringifyConfidence(claim.confidence ?? 0.5),
          })),
        );
      }

      await tx.insert(knowledgeVersions).values({
        sourceId: row.id,
        version: row.version,
        date: todayIso(),
        note: "Created as draft knowledge.",
      });

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: null,
          actorId: auth.userId,
          actorType: "user",
          action: KNOWLEDGE_AUDIT_ACTIONS.CREATED,
          entityType: "knowledge_source",
          entityId: row.id,
          newValue: serializeKnowledgeSource(row),
        },
        tx,
      );

      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: null,
          actorId: auth.userId,
          actorType: "user",
          label: `Created knowledge source ${row.name}`,
          action: KNOWLEDGE_ACTIVITY_ACTIONS.CREATED,
          entityType: "knowledge_source",
          entityId: row.id,
          summary: `Created knowledge source ${row.name}`,
        },
        tx,
      );

      return row;
    });

    return this.serializeWithChildren(created);
  }

  async update(auth: AuthContext, id: string, input: UpdateKnowledgeInput) {
    const existing = await this.requireKnowledgeSource(auth.organizationId, id);
    if (metadataStatus(existing) === "ARCHIVED") {
      throw new ConflictException("Archived knowledge sources cannot be updated.");
    }
    await this.requireActiveMember(auth.organizationId, input.ownerId ?? existing.ownerId ?? auth.userId);

    const nextVersion = input.version ?? bumpVersion(existing.version);
    const updated = await withTransaction(async (tx) => {
      const [row] = await tx
        .update(knowledgeSources)
        .set({
          name: input.name ?? existing.name,
          type: input.type ?? existing.type,
          category: (input.category ?? existing.category) as never,
          version: nextVersion,
          authority: input.authority ?? existing.authority,
          ownerId: input.ownerId ?? existing.ownerId,
          lastVerified: input.lastVerified ?? existing.lastVerified,
          lastUpdated: todayIso(),
          expiresAt: input.expiresAt === undefined ? existing.expiresAt : input.expiresAt,
          summary: input.summary ?? existing.summary,
          metadata: {
            ...(existing.metadata ?? {}),
            lifecycleStatus: metadataStatus(existing) === "ACTIVE" ? "DRAFT" : metadataStatus(existing),
            previousVersion: existing.version,
          },
          updatedAt: new Date(),
        })
        .where(and(eq(knowledgeSources.organizationId, auth.organizationId), eq(knowledgeSources.id, id)))
        .returning();
      if (!row) throw new NotFoundException("Knowledge source not found.");

      if (input.claims) {
        await tx.delete(knowledgeClaims).where(eq(knowledgeClaims.sourceId, row.id));
        if (input.claims.length > 0) {
          await tx.insert(knowledgeClaims).values(
            input.claims.map((claim) => ({
              sourceId: row.id,
              label: claim.label,
              value: claim.value,
              confidence: stringifyConfidence(claim.confidence ?? 0.5),
            })),
          );
        }
      }

      await tx.insert(knowledgeVersions).values({
        sourceId: row.id,
        version: row.version,
        date: todayIso(),
        note: "Updated knowledge source.",
      });

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: null,
          actorId: auth.userId,
          action: KNOWLEDGE_AUDIT_ACTIONS.UPDATED,
          entityType: "knowledge_source",
          entityId: row.id,
          previousValue: serializeKnowledgeSource(existing),
          newValue: serializeKnowledgeSource(row),
          metadata: { changedFields: Object.keys(input) },
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: null,
          actorId: auth.userId,
          label: `Updated knowledge source ${row.name}`,
          action: KNOWLEDGE_ACTIVITY_ACTIONS.UPDATED,
          entityType: "knowledge_source",
          entityId: row.id,
          summary: `Updated knowledge source ${row.name}`,
          metadata: { changedFields: Object.keys(input) },
        },
        tx,
      );
      return row;
    });

    return this.serializeWithChildren(updated);
  }

  async approve(auth: AuthContext, id: string) {
    const existing = await this.requireKnowledgeSource(auth.organizationId, id);
    if (metadataStatus(existing) === "ARCHIVED") {
      throw new ConflictException("Archived knowledge sources cannot be approved.");
    }
    const approved = await withTransaction(async (tx) => {
      const [row] = await tx
        .update(knowledgeSources)
        .set({
          metadata: {
            ...(existing.metadata ?? {}),
            lifecycleStatus: "ACTIVE",
            approvedAt: new Date().toISOString(),
            approvedBy: auth.userId,
          },
          lastVerified: todayIso(),
          lastUpdated: todayIso(),
          updatedAt: new Date(),
        })
        .where(and(eq(knowledgeSources.organizationId, auth.organizationId), eq(knowledgeSources.id, id)))
        .returning();
      if (!row) throw new NotFoundException("Knowledge source not found.");

      await tx.insert(knowledgeVersions).values({
        sourceId: row.id,
        version: row.version,
        date: todayIso(),
        note: "Approved knowledge source.",
      });

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: null,
          actorId: auth.userId,
          action: KNOWLEDGE_AUDIT_ACTIONS.APPROVED,
          entityType: "knowledge_source",
          entityId: row.id,
          previousValue: serializeKnowledgeSource(existing),
          newValue: serializeKnowledgeSource(row),
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: null,
          actorId: auth.userId,
          label: `Approved knowledge source ${row.name}`,
          action: KNOWLEDGE_ACTIVITY_ACTIONS.APPROVED,
          entityType: "knowledge_source",
          entityId: row.id,
          summary: `Approved knowledge source ${row.name}`,
        },
        tx,
      );
      return row;
    });

    return this.serializeWithChildren(approved);
  }

  async archive(auth: AuthContext, id: string) {
    const existing = await this.requireKnowledgeSource(auth.organizationId, id);
    if (metadataStatus(existing) === "ARCHIVED") {
      return this.serializeWithChildren(existing);
    }
    const archived = await withTransaction(async (tx) => {
      const [row] = await tx
        .update(knowledgeSources)
        .set({
          metadata: {
            ...(existing.metadata ?? {}),
            lifecycleStatus: "ARCHIVED",
            archivedAt: new Date().toISOString(),
          },
          lastUpdated: todayIso(),
          updatedAt: new Date(),
        })
        .where(and(eq(knowledgeSources.organizationId, auth.organizationId), eq(knowledgeSources.id, id)))
        .returning();
      if (!row) throw new NotFoundException("Knowledge source not found.");

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: null,
          actorId: auth.userId,
          action: KNOWLEDGE_AUDIT_ACTIONS.ARCHIVED,
          entityType: "knowledge_source",
          entityId: row.id,
          previousValue: serializeKnowledgeSource(existing),
          newValue: serializeKnowledgeSource(row),
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: null,
          actorId: auth.userId,
          label: `Archived knowledge source ${row.name}`,
          action: KNOWLEDGE_ACTIVITY_ACTIONS.ARCHIVED,
          entityType: "knowledge_source",
          entityId: row.id,
          summary: `Archived knowledge source ${row.name}`,
        },
        tx,
      );
      return row;
    });

    return this.serializeWithChildren(archived);
  }

  private async serializeWithChildren(row: KnowledgeRow) {
    const [claims, versions] = await Promise.all([
      this.db.select().from(knowledgeClaims).where(eq(knowledgeClaims.sourceId, row.id)),
      this.db.select().from(knowledgeVersions).where(eq(knowledgeVersions.sourceId, row.id)),
    ]);
    const serialized = serializeKnowledgeSource(row);
    return {
      ...serialized,
      claims: claims.map((claim) => ({
        id: claim.id,
        label: claim.label,
        value: claim.value,
        confidence: Number(claim.confidence),
      })),
      versions: versions.map((version) => ({
        id: version.id,
        version: version.version,
        date: version.date,
        note: version.note,
      })),
    };
  }

  private async requireKnowledgeSource(organizationId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(knowledgeSources)
      .where(and(eq(knowledgeSources.organizationId, organizationId), eq(knowledgeSources.id, id)));
    if (!row) throw new NotFoundException("Knowledge source not found.");
    return row;
  }

  private async requireActiveMember(organizationId: string, userId: string) {
    const [row] = await this.db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.status, "active"),
        ),
      );
    if (!row) throw new BadRequestException("Knowledge owner must belong to the organization.");
    return row;
  }
}

function metadataStatus(row: KnowledgeRow): "DRAFT" | "ACTIVE" | "ARCHIVED" {
  const status = (row.metadata as Record<string, unknown> | null | undefined)?.lifecycleStatus;
  if (status === "DRAFT" || status === "ACTIVE" || status === "ARCHIVED") return status;
  return "ACTIVE";
}

function serializeKnowledgeSource(row: KnowledgeRow) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    type: row.type,
    category: row.category,
    version: row.version,
    authority: row.authority,
    status: metadataStatus(row),
    ownerId: row.ownerId,
    lastVerified: row.lastVerified,
    lastUpdated: row.lastUpdated,
    expiresAt: row.expiresAt,
    summary: row.summary,
    metadata: row.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isOlderThanDays(value: string, days: number) {
  const diffDays = Math.round((Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24));
  return diffDays > days;
}

function stringifyConfidence(value: number) {
  return Math.max(0, Math.min(1, value)).toFixed(3);
}

function bumpVersion(version: string) {
  const parts = version.split(".").map((part) => Number(part));
  if (parts.length === 2 && parts.every((part) => Number.isFinite(part))) {
    const [major, minor] = parts;
    return `${major}.${(minor ?? 0) + 1}`;
  }
  return `${version}.1`;
}
