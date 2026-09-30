import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  knowledgeClaims,
  knowledgeConflictVariants,
  knowledgeConflicts,
  knowledgeSources,
  knowledgeVersions,
  organizationMembers,
  responseTemplates,
  type Database,
  withTransaction,
} from "@rfp-os/db";
import type { AuthContext } from "@rfp-os/types";

import { ActivityService } from "../../infrastructure/activity";
import { AuditService } from "../../infrastructure/audit";
import { DATABASE } from "../../infrastructure/database";
import type {
  CreateKnowledgeInput,
  CreateResponseTemplateInput,
  ListKnowledgeInput,
  ListKnowledgeIssuesInput,
  ListResponseTemplatesInput,
  ResolveKnowledgeIssueInput,
  UpdateKnowledgeInput,
  UpdateResponseTemplateInput,
  VerifyKnowledgeInput,
} from "./knowledge.dto";

type KnowledgeRow = typeof knowledgeSources.$inferSelect;
type ConflictRow = typeof knowledgeConflicts.$inferSelect;
type ResponseTemplateRow = typeof responseTemplates.$inferSelect;

const KNOWLEDGE_ACTIVITY_ACTIONS = {
  CREATED: "knowledge.created",
  UPDATED: "knowledge.updated",
  APPROVED: "knowledge.approved",
  ARCHIVED: "knowledge.archived",
  VERIFIED: "knowledge.verified",
  CONFLICT_RESOLVED: "knowledge.conflict_resolved",
  TEMPLATE_CREATED: "knowledge.template.created",
  TEMPLATE_UPDATED: "knowledge.template.updated",
  TEMPLATE_APPROVED: "knowledge.template.approved",
  TEMPLATE_ARCHIVED: "knowledge.template.archived",
  TEMPLATE_DUPLICATED: "knowledge.template.duplicated",
} as const;

const KNOWLEDGE_AUDIT_ACTIONS = {
  CREATED: "KNOWLEDGE_CREATED",
  UPDATED: "KNOWLEDGE_UPDATED",
  APPROVED: "KNOWLEDGE_APPROVED",
  ARCHIVED: "KNOWLEDGE_ARCHIVED",
  VERIFIED: "KNOWLEDGE_VERIFIED",
  CONFLICT_RESOLVED: "KNOWLEDGE_CONFLICT_RESOLVED",
  TEMPLATE_CREATED: "RESPONSE_TEMPLATE_CREATED",
  TEMPLATE_UPDATED: "RESPONSE_TEMPLATE_UPDATED",
  TEMPLATE_APPROVED: "RESPONSE_TEMPLATE_APPROVED",
  TEMPLATE_ARCHIVED: "RESPONSE_TEMPLATE_ARCHIVED",
  TEMPLATE_DUPLICATED: "RESPONSE_TEMPLATE_DUPLICATED",
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
    const where = this.knowledgeWhere(auth.organizationId, filters);

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
    const templates = await this.db
      .select()
      .from(responseTemplates)
      .where(eq(responseTemplates.organizationId, auth.organizationId));

    const items = rows.map((row) => serializeKnowledgeSource(row));
    const openConflicts = await this.listOpenConflictRows(auth.organizationId);
    const counts = items.reduce(
      (acc, item) => {
        acc.total += 1;
        acc[item.status.toLowerCase() as "draft" | "active" | "archived"] += 1;
        if (isReviewDue(item)) {
          acc.stale += 1;
        }
        if (isExpired(item)) acc.expired += 1;
        if (isExpiringSoon(item)) acc.expiring += 1;
        return acc;
      },
      {
        total: 0,
        draft: 0,
        active: 0,
        archived: 0,
        stale: 0,
        expired: 0,
        expiring: 0,
        templates: templates.filter((template) => template.status !== "ARCHIVED").length,
        conflicts: openConflicts.length,
      },
    );

    return {
      counts,
      items: items.slice(0, 3),
      attention: items
        .filter((item) => item.status === "DRAFT" || isReviewDue(item) || isExpired(item) || isExpiringSoon(item))
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
            ...(input.metadata ?? {}),
            lifecycleStatus: "DRAFT",
            source: input.sourceKind ?? input.metadata?.source ?? "manual",
            sourceKind: input.sourceKind ?? input.metadata?.sourceKind ?? input.metadata?.source ?? "manual",
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
            ...(input.metadata ?? {}),
            lifecycleStatus: metadataStatus(existing) === "ACTIVE" ? "DRAFT" : metadataStatus(existing),
            previousVersion: existing.version,
            ...(input.sourceKind ? { sourceKind: input.sourceKind, source: input.sourceKind } : {}),
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

  async listSources(auth: AuthContext, filters: Partial<ListKnowledgeInput> = {}) {
    return this.list(auth, filters);
  }

  async getSource(auth: AuthContext, id: string) {
    return this.getById(auth, id);
  }

  async createSource(auth: AuthContext, input: CreateKnowledgeInput) {
    return this.create(auth, input);
  }

  async updateSource(auth: AuthContext, id: string, input: UpdateKnowledgeInput) {
    return this.update(auth, id, input);
  }

  async verify(auth: AuthContext, id: string, input: VerifyKnowledgeInput = {}) {
    const existing = await this.requireKnowledgeSource(auth.organizationId, id);
    if (metadataStatus(existing) === "ARCHIVED") {
      throw new ConflictException("Archived knowledge sources cannot be verified.");
    }
    const verified = await withTransaction(async (tx) => {
      const [row] = await tx
        .update(knowledgeSources)
        .set({
          lastVerified: todayIso(),
          lastUpdated: todayIso(),
          expiresAt: input.expiresAt === undefined ? existing.expiresAt : input.expiresAt,
          metadata: {
            ...(existing.metadata ?? {}),
            lifecycleStatus: "ACTIVE",
            verifiedAt: new Date().toISOString(),
            verifiedBy: auth.userId,
          },
          updatedAt: new Date(),
        })
        .where(and(eq(knowledgeSources.organizationId, auth.organizationId), eq(knowledgeSources.id, id)))
        .returning();
      if (!row) throw new NotFoundException("Knowledge source not found.");

      await tx.insert(knowledgeVersions).values({
        sourceId: row.id,
        version: row.version,
        date: todayIso(),
        note: input.note ?? "Verified knowledge source.",
      });

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: null,
          actorId: auth.userId,
          action: KNOWLEDGE_AUDIT_ACTIONS.VERIFIED,
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
          label: `Verified knowledge source ${row.name}`,
          action: KNOWLEDGE_ACTIVITY_ACTIONS.VERIFIED,
          entityType: "knowledge_source",
          entityId: row.id,
          summary: input.note ?? `Verified knowledge source ${row.name}`,
        },
        tx,
      );
      return row;
    });
    return this.serializeWithChildren(verified);
  }

  async listIssues(auth: AuthContext, filters: ListKnowledgeIssuesInput) {
    const rows = await this.db
      .select()
      .from(knowledgeSources)
      .where(eq(knowledgeSources.organizationId, auth.organizationId))
      .orderBy(desc(knowledgeSources.updatedAt));
    const sources = rows.map((row) => serializeKnowledgeSource(row));
    const lifecycleIssues = sources
      .flatMap((source) => lifecycleIssuesForSource(source))
      .filter((issue) => !filters.type || issue.type === filters.type)
      .filter((issue) => !filters.search || issue.source.name.toLowerCase().includes(filters.search.toLowerCase()));

    const conflictIssues = filters.type && filters.type !== "CONFLICT"
      ? []
      : await this.conflictIssues(auth.organizationId, filters.status, filters.search);
    const all = [...lifecycleIssues, ...conflictIssues].filter((issue) =>
      filters.status === "ALL" ? true : issue.status === filters.status,
    );
    const page = filters.page;
    const pageSize = filters.pageSize;
    return {
      items: all.slice((page - 1) * pageSize, page * pageSize),
      total: all.length,
      page,
      pageSize,
      counts: all.reduce(
        (acc, issue) => {
          acc.total += 1;
          acc[issue.type.toLowerCase() as "draft" | "stale" | "expired" | "expiring_soon" | "conflict"] += 1;
          return acc;
        },
        { total: 0, draft: 0, stale: 0, expired: 0, expiring_soon: 0, conflict: 0 },
      ),
    };
  }

  async resolveIssue(auth: AuthContext, issueId: string, input: ResolveKnowledgeIssueInput) {
    const [kind, id] = issueId.split(":");
    if (kind === "source") {
      if (input.action === "approve") return this.approve(auth, id ?? "");
      if (input.action === "verify") return this.verify(auth, id ?? "", { note: input.note });
      if (input.action === "archive") return this.archive(auth, id ?? "");
      throw new BadRequestException("Unsupported action for source issue.");
    }
    if (kind === "conflict" && input.action === "resolve_conflict") {
      return this.resolveConflict(auth, id ?? "", input.note);
    }
    throw new BadRequestException("Unsupported knowledge issue.");
  }

  async resolveConflict(auth: AuthContext, conflictId: string, note?: string) {
    const conflict = await this.requireConflict(auth.organizationId, conflictId);
    if (conflict.status === "RESOLVED") return serializeConflict(conflict, []);
    const resolved = await withTransaction(async (tx) => {
      const [row] = await tx
        .update(knowledgeConflicts)
        .set({
          status: "RESOLVED",
          resolvedAt: new Date(),
          resolvedBy: auth.userId,
          resolutionNote: note ?? conflict.action,
        })
        .where(eq(knowledgeConflicts.id, conflictId))
        .returning();
      if (!row) throw new NotFoundException("Knowledge conflict not found.");
      await this.audit.record(
        {
          organizationId: auth.organizationId,
          workspaceId: null,
          actorId: auth.userId,
          action: KNOWLEDGE_AUDIT_ACTIONS.CONFLICT_RESOLVED,
          entityType: "knowledge_conflict",
          entityId: row.id,
          previousValue: serializeConflict(conflict, []),
          newValue: serializeConflict(row, []),
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          workspaceId: null,
          actorId: auth.userId,
          label: `Resolved knowledge conflict ${row.topic}`,
          action: KNOWLEDGE_ACTIVITY_ACTIONS.CONFLICT_RESOLVED,
          entityType: "knowledge_conflict",
          entityId: row.id,
          summary: note ?? row.action,
        },
        tx,
      );
      return row;
    });
    const variants = await this.db.select().from(knowledgeConflictVariants).where(eq(knowledgeConflictVariants.conflictId, resolved.id));
    return serializeConflict(resolved, variants);
  }

  async listTemplates(auth: AuthContext, filters: ListResponseTemplatesInput) {
    const page = filters.page;
    const pageSize = filters.pageSize;
    const where = and(
      eq(responseTemplates.organizationId, auth.organizationId),
      filters.status !== "ALL" ? eq(responseTemplates.status, filters.status) : undefined,
      filters.category ? eq(responseTemplates.category, filters.category) : undefined,
      filters.ownerId ? eq(responseTemplates.ownerId, filters.ownerId) : undefined,
      filters.search
        ? or(
            ilike(responseTemplates.name, `%${filters.search}%`),
            ilike(responseTemplates.description, `%${filters.search}%`),
            ilike(sql<string>`${responseTemplates.category}::text`, `%${filters.search}%`),
          )
        : undefined,
    );
    const [totalRow] = await this.db.select({ value: sql<number>`count(*)` }).from(responseTemplates).where(where);
    const rows = await this.db
      .select()
      .from(responseTemplates)
      .where(where)
      .orderBy(desc(responseTemplates.updatedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return {
      items: rows.map(serializeTemplate),
      total: Number(totalRow?.value ?? 0),
      page,
      pageSize,
    };
  }

  async getTemplate(auth: AuthContext, id: string) {
    const template = await this.requireTemplate(auth.organizationId, id);
    return serializeTemplate(template);
  }

  async createTemplate(auth: AuthContext, input: CreateResponseTemplateInput) {
    await this.requireActiveMember(auth.organizationId, input.ownerId ?? auth.userId);
    const [row] = await this.db
      .insert(responseTemplates)
      .values({
        organizationId: auth.organizationId,
        name: input.name,
        category: input.category,
        ownerId: input.ownerId ?? auth.userId,
        description: input.description ?? "",
        sections: input.sections,
        variables: input.variables ?? [],
        version: input.version ?? "1.0",
        usageMetadata: input.usageMetadata ?? {},
      })
      .returning();
    if (!row) throw new BadRequestException("Could not create response template.");
    await this.recordTemplateEvent(auth, row, KNOWLEDGE_AUDIT_ACTIONS.TEMPLATE_CREATED, KNOWLEDGE_ACTIVITY_ACTIONS.TEMPLATE_CREATED);
    return serializeTemplate(row);
  }

  async updateTemplate(auth: AuthContext, id: string, input: UpdateResponseTemplateInput) {
    const existing = await this.requireTemplate(auth.organizationId, id);
    if (existing.status === "ARCHIVED") throw new ConflictException("Archived templates cannot be updated.");
    if (input.ownerId) await this.requireActiveMember(auth.organizationId, input.ownerId);
    const [row] = await this.db
      .update(responseTemplates)
      .set({
        name: input.name ?? existing.name,
        category: input.category ?? existing.category,
        ownerId: input.ownerId ?? existing.ownerId,
        description: input.description ?? existing.description,
        sections: input.sections ?? existing.sections,
        variables: input.variables ?? existing.variables,
        version: input.version ?? bumpVersion(existing.version),
        usageMetadata: input.usageMetadata ?? existing.usageMetadata,
        status: existing.status === "ACTIVE" ? "DRAFT" : existing.status,
        updatedAt: new Date(),
      })
      .where(and(eq(responseTemplates.organizationId, auth.organizationId), eq(responseTemplates.id, id)))
      .returning();
    if (!row) throw new NotFoundException("Response template not found.");
    await this.recordTemplateEvent(auth, row, KNOWLEDGE_AUDIT_ACTIONS.TEMPLATE_UPDATED, KNOWLEDGE_ACTIVITY_ACTIONS.TEMPLATE_UPDATED, existing);
    return serializeTemplate(row);
  }

  async approveTemplate(auth: AuthContext, id: string) {
    const existing = await this.requireTemplate(auth.organizationId, id);
    if (existing.status === "ARCHIVED") throw new ConflictException("Archived templates cannot be approved.");
    const [row] = await this.db
      .update(responseTemplates)
      .set({ status: "ACTIVE", updatedAt: new Date() })
      .where(and(eq(responseTemplates.organizationId, auth.organizationId), eq(responseTemplates.id, id)))
      .returning();
    if (!row) throw new NotFoundException("Response template not found.");
    await this.recordTemplateEvent(auth, row, KNOWLEDGE_AUDIT_ACTIONS.TEMPLATE_APPROVED, KNOWLEDGE_ACTIVITY_ACTIONS.TEMPLATE_APPROVED, existing);
    return serializeTemplate(row);
  }

  async archiveTemplate(auth: AuthContext, id: string) {
    const existing = await this.requireTemplate(auth.organizationId, id);
    if (existing.status === "ARCHIVED") return serializeTemplate(existing);
    const [row] = await this.db
      .update(responseTemplates)
      .set({ status: "ARCHIVED", archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(responseTemplates.organizationId, auth.organizationId), eq(responseTemplates.id, id)))
      .returning();
    if (!row) throw new NotFoundException("Response template not found.");
    await this.recordTemplateEvent(auth, row, KNOWLEDGE_AUDIT_ACTIONS.TEMPLATE_ARCHIVED, KNOWLEDGE_ACTIVITY_ACTIONS.TEMPLATE_ARCHIVED, existing);
    return serializeTemplate(row);
  }

  async duplicateTemplate(auth: AuthContext, id: string) {
    const existing = await this.requireTemplate(auth.organizationId, id);
    const [row] = await this.db
      .insert(responseTemplates)
      .values({
        organizationId: auth.organizationId,
        name: `${existing.name} copy`,
        category: existing.category,
        ownerId: auth.userId,
        description: existing.description,
        sections: existing.sections,
        variables: existing.variables,
        version: "1.0",
        usageMetadata: { duplicatedFrom: existing.id },
      })
      .returning();
    if (!row) throw new BadRequestException("Could not duplicate response template.");
    await this.recordTemplateEvent(auth, row, KNOWLEDGE_AUDIT_ACTIONS.TEMPLATE_DUPLICATED, KNOWLEDGE_ACTIVITY_ACTIONS.TEMPLATE_DUPLICATED, existing);
    return serializeTemplate(row);
  }

  private async serializeWithChildren(row: KnowledgeRow) {
    const [claims, versions, conflicts] = await Promise.all([
      this.db.select().from(knowledgeClaims).where(eq(knowledgeClaims.sourceId, row.id)),
      this.db.select().from(knowledgeVersions).where(eq(knowledgeVersions.sourceId, row.id)),
      this.db.select().from(knowledgeConflicts).where(eq(knowledgeConflicts.sourceId, row.id)),
    ]);
    const conflictIds = conflicts.map((conflict) => conflict.id);
    const variants = conflictIds.length > 0
      ? await this.db.select().from(knowledgeConflictVariants).where(inArray(knowledgeConflictVariants.conflictId, conflictIds))
      : [];
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
      conflicts: conflicts.map((conflict) =>
        serializeConflict(conflict, variants.filter((variant) => variant.conflictId === conflict.id)),
      ),
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

  private knowledgeWhere(organizationId: string, filters: Partial<ListKnowledgeInput>) {
    const today = todayIso();
    const inThirty = futureIso(30);
    return and(
      eq(knowledgeSources.organizationId, organizationId),
      filters.status ? sql`${knowledgeSources.metadata} ->> 'lifecycleStatus' = ${filters.status}` : undefined,
      filters.category ? eq(knowledgeSources.category, filters.category) : undefined,
      filters.type ? ilike(knowledgeSources.type, `%${filters.type}%`) : undefined,
      filters.authority ? eq(knowledgeSources.authority, filters.authority) : undefined,
      filters.ownerId ? eq(knowledgeSources.ownerId, filters.ownerId) : undefined,
      filters.sourceKind ? sql`${knowledgeSources.metadata} ->> 'sourceKind' = ${filters.sourceKind}` : undefined,
      filters.expires === "expired" ? sql`${knowledgeSources.expiresAt} < ${today}` : undefined,
      filters.expires === "expiring" ? sql`${knowledgeSources.expiresAt} >= ${today} and ${knowledgeSources.expiresAt} <= ${inThirty}` : undefined,
      filters.expires === "active" ? or(sql`${knowledgeSources.expiresAt} is null`, sql`${knowledgeSources.expiresAt} > ${inThirty}`) : undefined,
      filters.reviewState === "draft" ? sql`${knowledgeSources.metadata} ->> 'lifecycleStatus' = 'DRAFT'` : undefined,
      filters.reviewState === "stale" ? sql`${knowledgeSources.lastVerified} < ${pastIso(180)}` : undefined,
      filters.reviewState === "expired" ? sql`${knowledgeSources.expiresAt} < ${today}` : undefined,
      filters.reviewState === "expiring" ? sql`${knowledgeSources.expiresAt} >= ${today} and ${knowledgeSources.expiresAt} <= ${inThirty}` : undefined,
      filters.reviewState === "healthy"
        ? and(
            sql`coalesce(${knowledgeSources.metadata} ->> 'lifecycleStatus', 'ACTIVE') = 'ACTIVE'`,
            or(sql`${knowledgeSources.lastVerified} is null`, sql`${knowledgeSources.lastVerified} >= ${pastIso(180)}`),
            or(sql`${knowledgeSources.expiresAt} is null`, sql`${knowledgeSources.expiresAt} > ${inThirty}`),
          )
        : undefined,
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
  }

  private async listOpenConflictRows(organizationId: string) {
    return this.db
      .select({ conflict: knowledgeConflicts })
      .from(knowledgeConflicts)
      .innerJoin(knowledgeSources, eq(knowledgeConflicts.sourceId, knowledgeSources.id))
      .where(and(eq(knowledgeSources.organizationId, organizationId), eq(knowledgeConflicts.status, "OPEN")));
  }

  private async conflictIssues(organizationId: string, status: "OPEN" | "RESOLVED" | "ALL", search?: string) {
    const rows = await this.db
      .select({ conflict: knowledgeConflicts, source: knowledgeSources })
      .from(knowledgeConflicts)
      .innerJoin(knowledgeSources, eq(knowledgeConflicts.sourceId, knowledgeSources.id))
      .where(
        and(
          eq(knowledgeSources.organizationId, organizationId),
          status !== "ALL" ? eq(knowledgeConflicts.status, status) : undefined,
          search
            ? or(
                ilike(knowledgeConflicts.topic, `%${search}%`),
                ilike(knowledgeConflicts.recommended, `%${search}%`),
                ilike(knowledgeSources.name, `%${search}%`),
              )
            : undefined,
        ),
      );
    const variants = rows.length > 0
      ? await this.db
          .select()
          .from(knowledgeConflictVariants)
          .where(inArray(knowledgeConflictVariants.conflictId, rows.map((row) => row.conflict.id)))
      : [];
    return rows.map(({ conflict, source }) => ({
      id: `conflict:${conflict.id}`,
      type: "CONFLICT" as const,
      status: conflict.status === "RESOLVED" ? "RESOLVED" as const : "OPEN" as const,
      title: `Conflict: ${conflict.topic}`,
      detail: conflict.recommended,
      recommendedAction: conflict.action,
      source: serializeKnowledgeSource(source),
      conflict: serializeConflict(conflict, variants.filter((variant) => variant.conflictId === conflict.id)),
      createdAt: source.updatedAt,
    }));
  }

  private async requireConflict(organizationId: string, conflictId: string) {
    const [row] = await this.db
      .select({ conflict: knowledgeConflicts })
      .from(knowledgeConflicts)
      .innerJoin(knowledgeSources, eq(knowledgeConflicts.sourceId, knowledgeSources.id))
      .where(and(eq(knowledgeSources.organizationId, organizationId), eq(knowledgeConflicts.id, conflictId)));
    if (!row) throw new NotFoundException("Knowledge conflict not found.");
    return row.conflict;
  }

  private async requireTemplate(organizationId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(responseTemplates)
      .where(and(eq(responseTemplates.organizationId, organizationId), eq(responseTemplates.id, id)));
    if (!row) throw new NotFoundException("Response template not found.");
    return row;
  }

  private async recordTemplateEvent(
    auth: AuthContext,
    template: ResponseTemplateRow,
    auditAction: string,
    activityAction: string,
    previous?: ResponseTemplateRow,
  ) {
    await this.audit.record({
      organizationId: auth.organizationId,
      workspaceId: null,
      actorId: auth.userId,
      action: auditAction,
      entityType: "response_template",
      entityId: template.id,
      previousValue: previous ? serializeTemplate(previous) : undefined,
      newValue: serializeTemplate(template),
    });
    await this.activity.record({
      organizationId: auth.organizationId,
      workspaceId: null,
      actorId: auth.userId,
      actorType: "user",
      label: `${activityAction.replace("knowledge.template.", "")} response template ${template.name}`,
      action: activityAction,
      entityType: "response_template",
      entityId: template.id,
      summary: `Response template ${template.name}`,
    });
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

function serializeTemplate(row: ResponseTemplateRow) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    category: row.category,
    status: row.status,
    ownerId: row.ownerId,
    description: row.description,
    sections: row.sections,
    variables: row.variables,
    version: row.version,
    usageMetadata: row.usageMetadata,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function serializeConflict(
  row: ConflictRow,
  variants: Array<typeof knowledgeConflictVariants.$inferSelect>,
) {
  return {
    id: row.id,
    sourceId: row.sourceId,
    topic: row.topic,
    recommended: row.recommended,
    action: row.action,
    status: row.status,
    resolvedAt: row.resolvedAt,
    resolvedBy: row.resolvedBy,
    resolutionNote: row.resolutionNote,
    variants: variants.map((variant) => ({
      id: variant.id,
      label: variant.label,
      value: variant.value,
    })),
  };
}

function lifecycleIssuesForSource(source: ReturnType<typeof serializeKnowledgeSource>) {
  const issues: Array<{
    id: string;
    type: "DRAFT" | "STALE" | "EXPIRED" | "EXPIRING_SOON";
    status: "OPEN";
    title: string;
    detail: string;
    recommendedAction: string;
    source: ReturnType<typeof serializeKnowledgeSource>;
    createdAt: Date;
  }> = [];
  if (source.status === "DRAFT") {
    issues.push({
      id: `source:${source.id}:DRAFT`,
      type: "DRAFT",
      status: "OPEN",
      title: "Draft source needs approval",
      detail: `${source.name} is not yet available as verified knowledge.`,
      recommendedAction: "Approve the source after owner review.",
      source,
      createdAt: source.updatedAt,
    });
  }
  if (isReviewDue(source)) {
    issues.push({
      id: `source:${source.id}:STALE`,
      type: "STALE",
      status: "OPEN",
      title: "Source verification is stale",
      detail: `${source.name} was last verified more than 180 days ago.`,
      recommendedAction: "Verify the source or archive it.",
      source,
      createdAt: source.updatedAt,
    });
  }
  if (isExpired(source)) {
    issues.push({
      id: `source:${source.id}:EXPIRED`,
      type: "EXPIRED",
      status: "OPEN",
      title: "Source has expired",
      detail: `${source.name} passed its expiration date.`,
      recommendedAction: "Verify with a new expiration date or archive it.",
      source,
      createdAt: source.updatedAt,
    });
  } else if (isExpiringSoon(source)) {
    issues.push({
      id: `source:${source.id}:EXPIRING_SOON`,
      type: "EXPIRING_SOON",
      status: "OPEN",
      title: "Source expires soon",
      detail: `${source.name} expires within 30 days.`,
      recommendedAction: "Schedule owner verification.",
      source,
      createdAt: source.updatedAt,
    });
  }
  return issues;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function futureIso(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

function pastIso(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

function isOlderThanDays(value: string, days: number) {
  const diffDays = Math.round((Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24));
  return diffDays > days;
}

function isReviewDue(item: { status: string; lastVerified: string | null }) {
  return item.status === "ACTIVE" && Boolean(item.lastVerified) && isOlderThanDays(item.lastVerified!, 180);
}

function isExpired(item: { expiresAt: string | null }) {
  return Boolean(item.expiresAt) && new Date(item.expiresAt!).getTime() < Date.now();
}

function isExpiringSoon(item: { expiresAt: string | null }) {
  if (!item.expiresAt || isExpired(item)) return false;
  const days = Math.ceil((new Date(item.expiresAt).getTime() - Date.now()) / 86400000);
  return days <= 30;
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
