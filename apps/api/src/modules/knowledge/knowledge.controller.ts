import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthContext } from "@rfp-os/types";

import { CurrentAuth, RequirePermissions } from "../../common/auth";
import { ZodBody, ZodQuery } from "../../common/decorators/zod-schema.decorator";
import {
  createKnowledgeSchema,
  createResponseTemplateSchema,
  listKnowledgeSchema,
  listKnowledgeIssuesSchema,
  listResponseTemplatesSchema,
  resolveKnowledgeIssueSchema,
  updateKnowledgeSchema,
  updateResponseTemplateSchema,
  verifyKnowledgeSchema,
  type CreateKnowledgeInput,
  type CreateResponseTemplateInput,
  type ListKnowledgeInput,
  type ListKnowledgeIssuesInput,
  type ListResponseTemplatesInput,
  type ResolveKnowledgeIssueInput,
  type UpdateKnowledgeInput,
  type UpdateResponseTemplateInput,
  type VerifyKnowledgeInput,
} from "./knowledge.dto";
import { KnowledgeService } from "./knowledge.service";

@Controller({ path: "knowledge", version: "1" })
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

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
    return this.knowledge.listSources(auth, query);
  }

  @Post("sources")
  @RequirePermissions("ai.knowledge.create")
  @ZodBody(createKnowledgeSchema)
  async createSource(@CurrentAuth() auth: AuthContext, @Body() body: CreateKnowledgeInput) {
    return this.knowledge.createSource(auth, body);
  }

  @Get("sources/:id")
  @RequirePermissions("ai.knowledge.read")
  async getSource(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.knowledge.getSource(auth, id);
  }

  @Patch("sources/:id")
  @RequirePermissions("ai.knowledge.update")
  @ZodBody(updateKnowledgeSchema)
  async updateSource(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: UpdateKnowledgeInput) {
    return this.knowledge.updateSource(auth, id, body);
  }

  @Post("sources/:id/approve")
  @RequirePermissions("ai.knowledge.approve")
  async approveSource(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.knowledge.approve(auth, id);
  }

  @Post("sources/:id/archive")
  @RequirePermissions("ai.knowledge.update")
  async archiveSource(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.knowledge.archive(auth, id);
  }

  @Post("sources/:id/verify")
  @RequirePermissions("ai.knowledge.approve")
  @ZodBody(verifyKnowledgeSchema)
  async verifySource(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: VerifyKnowledgeInput) {
    return this.knowledge.verify(auth, id, body);
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
  async getTemplate(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.knowledge.getTemplate(auth, id);
  }

  @Patch("templates/:id")
  @RequirePermissions("ai.knowledge.update")
  @ZodBody(updateResponseTemplateSchema)
  async updateTemplate(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: UpdateResponseTemplateInput) {
    return this.knowledge.updateTemplate(auth, id, body);
  }

  @Post("templates/:id/approve")
  @RequirePermissions("ai.knowledge.approve")
  async approveTemplate(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.knowledge.approveTemplate(auth, id);
  }

  @Post("templates/:id/archive")
  @RequirePermissions("ai.knowledge.update")
  async archiveTemplate(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.knowledge.archiveTemplate(auth, id);
  }

  @Post("templates/:id/duplicate")
  @RequirePermissions("ai.knowledge.create")
  async duplicateTemplate(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.knowledge.duplicateTemplate(auth, id);
  }

  @Get(":id")
  @RequirePermissions("ai.knowledge.read")
  async get(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
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
  async update(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: UpdateKnowledgeInput) {
    return this.knowledge.update(auth, id, body);
  }

  @Post(":id/approve")
  @RequirePermissions("ai.knowledge.approve")
  async approve(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.knowledge.approve(auth, id);
  }

  @Post(":id/archive")
  @RequirePermissions("ai.knowledge.update")
  async archive(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.knowledge.archive(auth, id);
  }
}
