import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthContext } from "@rfp-os/types";

import { CurrentAuth, RequirePermissions } from "../../common/auth";
import { ZodBody, ZodQuery } from "../../common/decorators/zod-schema.decorator";
import {
  createKnowledgeSchema,
  listKnowledgeSchema,
  updateKnowledgeSchema,
  type CreateKnowledgeInput,
  type ListKnowledgeInput,
  type UpdateKnowledgeInput,
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
