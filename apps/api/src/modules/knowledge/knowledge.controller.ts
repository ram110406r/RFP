import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import type { AuthContext } from "@rfp-os/types";

import { CurrentAuth, RequirePermissions } from "../../common/auth";
import { ZodBody, ZodQuery } from "../../common/decorators/zod-schema.decorator";
import { KnowledgeDocumentsService } from "./knowledge-documents.service";
import {
  bulkClaimDecisionSchema,
  createKnowledgeSchema,
  createResponseTemplateSchema,
  knowledgeDocumentIntentSchema,
  listKnowledgeSchema,
  listKnowledgeIssuesSchema,
  listResponseTemplatesSchema,
  resolveKnowledgeIssueSchema,
  revisionDecisionSchema,
  updateKnowledgeSchema,
  updateResponseTemplateSchema,
  verifyKnowledgeSchema,
  type BulkClaimDecisionInput,
  type CreateKnowledgeInput,
  type CreateResponseTemplateInput,
  type KnowledgeDocumentIntentInput,
  type ListKnowledgeInput,
  type ListKnowledgeIssuesInput,
  type ListResponseTemplatesInput,
  type ResolveKnowledgeIssueInput,
  type RevisionDecisionInput,
  type UpdateKnowledgeInput,
  type UpdateResponseTemplateInput,
  type VerifyKnowledgeInput,
} from "./knowledge.dto";
import { KnowledgeService } from "./knowledge.service";

/** Malformed ids are a 400 here rather than a Postgres uuid cast error (500). */
const Id = (name: string) =>
  new ParseUUIDPipe({
    exceptionFactory: () => new BadRequestException({ code: "INVALID_ID", message: `${name} must be a UUID.` }),
  });

/**
 * `/knowledge/sources/*` is the canonical surface. The bare `/knowledge`,
 * `/knowledge/:id` routes are kept as aliases for older clients.
 */
@Controller({ path: "knowledge", version: "1" })
export class KnowledgeController {
  constructor(
    private readonly knowledge: KnowledgeService,
    private readonly documents: KnowledgeDocumentsService,
  ) {}

  @Get()
  @RequirePermissions("ai.knowledge.read")
  @ZodQuery(listKnowledgeSchema)
  async list(@CurrentAuth() auth: AuthContext, @Query() query: ListKnowledgeInput) {
    return this.knowledge.list(auth, query);
  }

  @Get("summary")
  @RequirePermissions("ai.knowledge.read")
  async summary(@CurrentAuth() auth: AuthContext) {
    return this.knowledge.summary(auth);
  }

  @Get("sources")
  @RequirePermissions("ai.knowledge.read")
  @ZodQuery(listKnowledgeSchema)
  async listSources(@CurrentAuth() auth: AuthContext, @Query() query: ListKnowledgeInput) {
    return this.knowledge.list(auth, query);
  }

  @Post("sources")
  @RequirePermissions("ai.knowledge.create")
  @ZodBody(createKnowledgeSchema)
  async createSource(@CurrentAuth() auth: AuthContext, @Body() body: CreateKnowledgeInput) {
    return this.knowledge.create(auth, body);
  }

  @Get("sources/:id")
  @RequirePermissions("ai.knowledge.read")
  async getSource(@CurrentAuth() auth: AuthContext, @Param("id", Id("Source id")) id: string) {
    return this.knowledge.getById(auth, id);
  }

  @Patch("sources/:id")
  @RequirePermissions("ai.knowledge.update")
  @ZodBody(updateKnowledgeSchema)
  async updateSource(@CurrentAuth() auth: AuthContext, @Param("id", Id("Source id")) id: string, @Body() body: UpdateKnowledgeInput) {
    return this.knowledge.update(auth, id, body);
  }

  @Post("sources/:id/approve")
  @RequirePermissions("ai.knowledge.approve")
  async approveSource(@CurrentAuth() auth: AuthContext, @Param("id", Id("Source id")) id: string) {
    return this.knowledge.approve(auth, id);
  }

  @Post("sources/:id/archive")
  @RequirePermissions("ai.knowledge.update")
  async archiveSource(@CurrentAuth() auth: AuthContext, @Param("id", Id("Source id")) id: string) {
    return this.knowledge.archive(auth, id);
  }

  @Post("sources/:id/verify")
  @RequirePermissions("ai.knowledge.approve")
  @ZodBody(verifyKnowledgeSchema)
  async verifySource(@CurrentAuth() auth: AuthContext, @Param("id", Id("Source id")) id: string, @Body() body: VerifyKnowledgeInput) {
    return this.knowledge.verify(auth, id, body);
  }

  @Post("sources/:id/revisions/:revisionId/apply")
  @RequirePermissions("ai.knowledge.approve")
  @ZodBody(revisionDecisionSchema)
  async applyRevision(
    @CurrentAuth() auth: AuthContext,
    @Param("id", Id("Source id")) id: string,
    @Param("revisionId", Id("Revision id")) revisionId: string,
    @Body() body: RevisionDecisionInput,
  ) {
    return this.knowledge.applyRevision(auth, id, revisionId, body);
  }

  @Post("sources/:id/revisions/:revisionId/reject")
  @RequirePermissions("ai.knowledge.approve")
  @ZodBody(revisionDecisionSchema)
  async rejectRevision(
    @CurrentAuth() auth: AuthContext,
    @Param("id", Id("Source id")) id: string,
    @Param("revisionId", Id("Revision id")) revisionId: string,
    @Body() body: RevisionDecisionInput,
  ) {
    return this.knowledge.rejectRevision(auth, id, revisionId, body);
  }

  @Post("sources/:id/claims/decisions")
  @RequirePermissions("ai.knowledge.approve")
  @ZodBody(bulkClaimDecisionSchema)
  async decideClaims(@CurrentAuth() auth: AuthContext, @Param("id", Id("Source id")) id: string, @Body() body: BulkClaimDecisionInput) {
    return this.knowledge.decideClaims(auth, id, body);
  }

  @Get("sources/:id/documents")
  @RequirePermissions("ai.knowledge.read")
  async listDocuments(@CurrentAuth() auth: AuthContext, @Param("id", Id("Source id")) id: string) {
    return this.documents.list(auth, id);
  }

  @Post("sources/:id/documents")
  @RequirePermissions("ai.knowledge.update")
  @ZodBody(knowledgeDocumentIntentSchema)
  async createDocumentIntent(
    @CurrentAuth() auth: AuthContext,
    @Param("id", Id("Source id")) id: string,
    @Body() body: KnowledgeDocumentIntentInput,
  ) {
    return this.documents.createUploadIntent(auth, id, body);
  }

  @Post("sources/:id/documents/:documentId/complete")
  @RequirePermissions("ai.knowledge.update")
  async completeDocument(
    @CurrentAuth() auth: AuthContext,
    @Param("id", Id("Source id")) id: string,
    @Param("documentId", Id("Document id")) documentId: string,
  ) {
    return this.documents.completeUpload(auth, id, documentId);
  }

  @Post("sources/:id/documents/:documentId/reprocess")
  @RequirePermissions("ai.knowledge.update")
  async reprocessDocument(
    @CurrentAuth() auth: AuthContext,
    @Param("id", Id("Source id")) id: string,
    @Param("documentId", Id("Document id")) documentId: string,
  ) {
    return this.documents.reprocess(auth, id, documentId);
  }

  @Delete("sources/:id/documents/:documentId")
  @RequirePermissions("ai.knowledge.update")
  async removeDocument(
    @CurrentAuth() auth: AuthContext,
    @Param("id", Id("Source id")) id: string,
    @Param("documentId", Id("Document id")) documentId: string,
  ) {
    return this.documents.remove(auth, id, documentId);
  }

  @Get("issues")
  @RequirePermissions("ai.knowledge.read")
  @ZodQuery(listKnowledgeIssuesSchema)
  async listIssues(@CurrentAuth() auth: AuthContext, @Query() query: ListKnowledgeIssuesInput) {
    return this.knowledge.listIssues(auth, query);
  }

  @Post("issues/:id/resolve")
  @RequirePermissions("ai.knowledge.update")
  @ZodBody(resolveKnowledgeIssueSchema)
  async resolveIssue(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: ResolveKnowledgeIssueInput) {
    return this.knowledge.resolveIssue(auth, id, body);
  }

  @Get("templates")
  @RequirePermissions("ai.knowledge.read")
  @ZodQuery(listResponseTemplatesSchema)
  async listTemplates(@CurrentAuth() auth: AuthContext, @Query() query: ListResponseTemplatesInput) {
    return this.knowledge.listTemplates(auth, query);
  }

  @Post("templates")
  @RequirePermissions("ai.knowledge.create")
  @ZodBody(createResponseTemplateSchema)
  async createTemplate(@CurrentAuth() auth: AuthContext, @Body() body: CreateResponseTemplateInput) {
    return this.knowledge.createTemplate(auth, body);
  }

  @Get("templates/:id")
  @RequirePermissions("ai.knowledge.read")
  async getTemplate(@CurrentAuth() auth: AuthContext, @Param("id", Id("Template id")) id: string) {
    return this.knowledge.getTemplate(auth, id);
  }

  @Patch("templates/:id")
  @RequirePermissions("ai.knowledge.update")
  @ZodBody(updateResponseTemplateSchema)
  async updateTemplate(@CurrentAuth() auth: AuthContext, @Param("id", Id("Template id")) id: string, @Body() body: UpdateResponseTemplateInput) {
    return this.knowledge.updateTemplate(auth, id, body);
  }

  @Post("templates/:id/approve")
  @RequirePermissions("ai.knowledge.approve")
  async approveTemplate(@CurrentAuth() auth: AuthContext, @Param("id", Id("Template id")) id: string) {
    return this.knowledge.approveTemplate(auth, id);
  }

  @Post("templates/:id/archive")
  @RequirePermissions("ai.knowledge.update")
  async archiveTemplate(@CurrentAuth() auth: AuthContext, @Param("id", Id("Template id")) id: string) {
    return this.knowledge.archiveTemplate(auth, id);
  }

  @Post("templates/:id/duplicate")
  @RequirePermissions("ai.knowledge.create")
  async duplicateTemplate(@CurrentAuth() auth: AuthContext, @Param("id", Id("Template id")) id: string) {
    return this.knowledge.duplicateTemplate(auth, id);
  }

  @Get(":id")
  @RequirePermissions("ai.knowledge.read")
  async get(@CurrentAuth() auth: AuthContext, @Param("id", Id("Source id")) id: string) {
    return this.knowledge.getById(auth, id);
  }

  @Post()
  @RequirePermissions("ai.knowledge.create")
  @ZodBody(createKnowledgeSchema)
  async create(@CurrentAuth() auth: AuthContext, @Body() body: CreateKnowledgeInput) {
    return this.knowledge.create(auth, body);
  }

  @Patch(":id")
  @RequirePermissions("ai.knowledge.update")
  @ZodBody(updateKnowledgeSchema)
  async update(@CurrentAuth() auth: AuthContext, @Param("id", Id("Source id")) id: string, @Body() body: UpdateKnowledgeInput) {
    return this.knowledge.update(auth, id, body);
  }

  @Post(":id/approve")
  @RequirePermissions("ai.knowledge.approve")
  async approve(@CurrentAuth() auth: AuthContext, @Param("id", Id("Source id")) id: string) {
    return this.knowledge.approve(auth, id);
  }

  @Post(":id/archive")
  @RequirePermissions("ai.knowledge.update")
  async archive(@CurrentAuth() auth: AuthContext, @Param("id", Id("Source id")) id: string) {
    return this.knowledge.archive(auth, id);
  }
}
