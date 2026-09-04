import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthContext } from "@rfp-os/types";

import { CurrentAuth, RequirePermissions } from "../../common/auth";
import { ZodBody, ZodQuery } from "../../common/decorators/zod-schema.decorator";
import {
  createTenderAnswerSchema,
  createTenderAnswerEvidenceSchema,
  createTenderQuestionSchema,
  createTenderRequirementSchema,
  createTenderReviewSchema,
  createTenderSchema,
  dashboardSummarySchema,
  improveTenderAnswerSchema,
  listTendersSchema,
  searchTenderRequirementEvidenceSchema,
  transitionTenderSchema,
  updateTenderAnswerSchema,
  updateTenderQuestionSchema,
  updateTenderRequirementSchema,
  updateTenderReviewSchema,
  updateTenderSchema,
  type CreateTenderAnswerInput,
  type CreateTenderAnswerEvidenceInput,
  type CreateTenderQuestionInput,
  type CreateTenderRequirementInput,
  type CreateTenderReviewInput,
  type CreateTenderInput,
  type DashboardSummaryInput,
  type ImproveTenderAnswerInput,
  type ListTendersInput,
  type SearchTenderRequirementEvidenceInput,
  type TransitionTenderInput,
  type UpdateTenderAnswerInput,
  type UpdateTenderQuestionInput,
  type UpdateTenderRequirementInput,
  type UpdateTenderReviewInput,
  type UpdateTenderInput,
} from "./dto/tender.dto";
import {
  createTenderSourceUploadIntentSchema,
  type CreateTenderSourceUploadIntentInput,
} from "./dto/tender-source.dto";
import { TendersService } from "./tenders.service";

@Controller({ path: "tenders", version: "1" })
export class TendersController {
  constructor(private readonly tenders: TendersService) {}

  @Get()
  @RequirePermissions("tender:read")
  @ZodQuery(listTendersSchema)
  async list(@CurrentAuth() auth: AuthContext, @Query() query: ListTendersInput) {
    return this.tenders.list(auth, query);
  }

  @Post()
  @RequirePermissions("tender:create")
  @ZodBody(createTenderSchema)
  async create(@CurrentAuth() auth: AuthContext, @Body() body: CreateTenderInput) {
    return this.tenders.create(auth, body);
  }

  @Get("dashboard")
  @RequirePermissions("tender:read")
  @ZodQuery(dashboardSummarySchema)
  async dashboard(@CurrentAuth() auth: AuthContext, @Query() query: DashboardSummaryInput) {
    return this.tenders.getDashboard(auth, query);
  }

  @Get(":id")
  @RequirePermissions("tender:read")
  async get(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.tenders.getById(auth, id);
  }

  @Post(":id/save")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions("tender:update")
  async save(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.tenders.save(auth, id);
  }

  @Delete(":id/save")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions("tender:update")
  async unsave(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.tenders.unsave(auth, id);
  }

  @Patch(":id")
  @RequirePermissions("tender:update")
  @ZodBody(updateTenderSchema)
  async update(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: UpdateTenderInput) {
    return this.tenders.update(auth, id, body);
  }

  @Post(":id/transition")
  @RequirePermissions("tender:update")
  @ZodBody(transitionTenderSchema)
  async transition(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body() body: TransitionTenderInput,
  ) {
    return this.tenders.transition(auth, id, body);
  }

  @Get(":id/questions")
  @RequirePermissions("question:read")
  async listQuestions(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.tenders.listQuestions(auth, id);
  }

  @Get(":id/questions/:questionId")
  @RequirePermissions("question:read")
  async getQuestion(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("questionId") questionId: string,
  ) {
    return this.tenders.getQuestion(auth, id, questionId);
  }

  @Post(":id/questions")
  @RequirePermissions("question:create")
  @ZodBody(createTenderQuestionSchema)
  async createQuestion(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body() body: CreateTenderQuestionInput,
  ) {
    return this.tenders.createQuestion(auth, id, body);
  }

  @Patch(":id/questions/:questionId")
  @RequirePermissions("question:update")
  @ZodBody(updateTenderQuestionSchema)
  async updateQuestion(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("questionId") questionId: string,
    @Body() body: UpdateTenderQuestionInput,
  ) {
    return this.tenders.updateQuestion(auth, id, questionId, body);
  }

  @Get(":id/requirements")
  @RequirePermissions("requirement:read")
  async listRequirements(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.tenders.listRequirements(auth, id);
  }

  @Get(":id/requirements/:requirementId")
  @RequirePermissions("requirement:read")
  async getRequirement(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("requirementId") requirementId: string,
  ) {
    return this.tenders.getRequirement(auth, id, requirementId);
  }

  @Get(":id/requirements/:requirementId/evidence")
  @RequirePermissions("requirement:read")
  async getRequirementEvidence(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("requirementId") requirementId: string,
  ) {
    return this.tenders.getRequirementEvidence(auth, id, requirementId);
  }

  @Post(":id/requirements/:requirementId/evidence/search")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions("requirement:read")
  @ZodBody(searchTenderRequirementEvidenceSchema)
  async searchRequirementEvidence(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("requirementId") requirementId: string,
    @Body() body: SearchTenderRequirementEvidenceInput,
  ) {
    return this.tenders.searchRequirementEvidence(auth, id, requirementId, body);
  }

  @Post(":id/requirements")
  @RequirePermissions("requirement:create")
  @ZodBody(createTenderRequirementSchema)
  async createRequirement(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body() body: CreateTenderRequirementInput,
  ) {
    return this.tenders.createRequirement(auth, id, body);
  }

  @Patch(":id/requirements/:requirementId")
  @RequirePermissions("requirement:update")
  @ZodBody(updateTenderRequirementSchema)
  async updateRequirement(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("requirementId") requirementId: string,
    @Body() body: UpdateTenderRequirementInput,
  ) {
    return this.tenders.updateRequirement(auth, id, requirementId, body);
  }

  @Get(":id/answers")
  @RequirePermissions("answer:read")
  async listAnswers(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.tenders.listAnswers(auth, id);
  }

  @Get(":id/answers/:answerId/versions")
  @RequirePermissions("answer:read")
  async listAnswerVersions(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("answerId") answerId: string,
  ) {
    return this.tenders.getAnswerVersions(auth, id, answerId);
  }

  @Get(":id/answers/:answerId/evidence")
  @RequirePermissions("answer:read")
  async listAnswerEvidence(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("answerId") answerId: string,
  ) {
    return this.tenders.listAnswerEvidence(auth, id, answerId);
  }

  @Post(":id/requirements/:requirementId/answer/generate")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions("answer:create")
  async generateRequirementAnswer(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("requirementId") requirementId: string,
  ) {
    return this.tenders.generateRequirementAnswer(auth, id, requirementId);
  }

  @Post(":id/requirements/:requirementId/answer/improve")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions("ai.answer.improve")
  @ZodBody(improveTenderAnswerSchema)
  async improveRequirementAnswer(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("requirementId") requirementId: string,
    @Body() body: ImproveTenderAnswerInput,
  ) {
    return this.tenders.improveRequirementAnswer(auth, id, requirementId, body);
  }

  @Post(":id/requirements/:requirementId/answer/analyze")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions("ai.answer.analyze")
  async analyzeRequirementAnswer(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("requirementId") requirementId: string,
  ) {
    return this.tenders.analyzeRequirementAnswer(auth, id, requirementId);
  }

  @Post(":id/answers/:answerId/evidence")
  @RequirePermissions("answer:update")
  @ZodBody(createTenderAnswerEvidenceSchema)
  async addAnswerEvidence(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("answerId") answerId: string,
    @Body() body: CreateTenderAnswerEvidenceInput,
  ) {
    return this.tenders.addAnswerEvidence(auth, id, answerId, {
      evidenceType: body.evidenceType,
      evidenceId: body.evidenceId,
      sourceId: body.sourceId,
      sourceVersion: body.sourceVersion,
      relevance: body.relevance,
      confidence: body.confidence,
      freshness: body.freshness,
      verifiedAt: body.verifiedAt,
      metadata: body.metadata,
    });
  }

  @Delete(":id/answers/:answerId/evidence/:evidenceId")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions("answer:update")
  async removeAnswerEvidence(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("answerId") answerId: string,
    @Param("evidenceId") evidenceId: string,
  ) {
    return this.tenders.removeAnswerEvidence(auth, id, answerId, evidenceId);
  }

  @Get(":id/reviews")
  @RequirePermissions("answer:read")
  async listReviews(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.tenders.listReviews(auth, id);
  }

  @Get(":id/workspace")
  @RequirePermissions("tender:read")
  async getWorkspaceOverview(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.tenders.getWorkspaceOverview(auth, id);
  }

  @Post(":id/analysis/brief")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions("ai.tender.analyze")
  async getTenderBrief(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.tenders.getTenderBrief(auth, id);
  }

  @Post(":id/analysis")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions("ai.tender.analyze")
  async analyzeTender(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.tenders.analyzeTender(auth, id);
  }

  @Get(":id/validation")
  @RequirePermissions("tender:read")
  async getValidation(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.tenders.getValidation(auth, id);
  }

  @Post(":id/validation/runs")
  @RequirePermissions("tender:update")
  async runValidation(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.tenders.runValidation(auth, id);
  }

  @Post(":id/approve")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions("tender:approve")
  async approveTender(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.tenders.approveTender(auth, id);
  }

  @Post(":id/submit")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions("tender:submit")
  async submitTender(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.tenders.submitTender(auth, id);
  }

  @Get(":id/export")
  @RequirePermissions("tender:read")
  async exportTender(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.tenders.exportTender(auth, id);
  }

  @Get(":id/sources")
  @RequirePermissions("tender:source:read")
  async listSources(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.tenders.listSources(auth, id);
  }

  @Post(":id/sources")
  @RequirePermissions("tender:source:create")
  @ZodBody(createTenderSourceUploadIntentSchema)
  async createSourceUploadIntent(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body() body: CreateTenderSourceUploadIntentInput,
  ) {
    return this.tenders.createSourceUploadIntent(auth, id, body);
  }

  @Get(":id/sources/:sourceId")
  @RequirePermissions("tender:source:read")
  async getSource(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("sourceId") sourceId: string,
  ) {
    return this.tenders.getSourceById(auth, id, sourceId);
  }

  @Post(":id/sources/:sourceId/complete")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions("tender:source:create")
  async completeSourceUpload(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("sourceId") sourceId: string,
  ) {
    return this.tenders.completeSourceUpload(auth, id, sourceId);
  }

  @Post(":id/sources/:sourceId/parse")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions("tender:source:create")
  async parseSource(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("sourceId") sourceId: string,
  ) {
    return this.tenders.parseSource(auth, id, sourceId);
  }

  @Delete(":id/sources/:sourceId")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions("tender:source:delete")
  async deleteSource(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("sourceId") sourceId: string,
  ) {
    return this.tenders.removeSource(auth, id, sourceId);
  }

  @Post(":id/questions/:questionId/answer")
  @RequirePermissions("answer:create")
  @ZodBody(createTenderAnswerSchema)
  async createAnswer(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("questionId") questionId: string,
    @Body() body: CreateTenderAnswerInput,
  ) {
    return this.tenders.createAnswer(auth, id, questionId, body);
  }

  @Patch(":id/answers/:answerId")
  @RequirePermissions("answer:update")
  @ZodBody(updateTenderAnswerSchema)
  async updateAnswer(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("answerId") answerId: string,
    @Body() body: UpdateTenderAnswerInput,
  ) {
    return this.tenders.updateAnswer(auth, id, answerId, body);
  }
}

@Controller({ path: "answers", version: "1" })
export class TenderAnswerReviewsController {
  constructor(private readonly tenders: TendersService) {}

  @Post(":answerId/reviews")
  @RequirePermissions("answer:review")
  @ZodBody(createTenderReviewSchema)
  async createReview(
    @CurrentAuth() auth: AuthContext,
    @Param("answerId") answerId: string,
    @Body() body: CreateTenderReviewInput,
  ) {
    return this.tenders.createReview(auth, answerId, body);
  }
}

@Controller({ path: "reviews", version: "1" })
export class TenderReviewsController {
  constructor(private readonly tenders: TendersService) {}

  @Patch(":reviewId")
  @RequirePermissions("answer:review")
  @ZodBody(updateTenderReviewSchema)
  async updateReview(
    @CurrentAuth() auth: AuthContext,
    @Param("reviewId") reviewId: string,
    @Body() body: UpdateTenderReviewInput,
  ) {
    return this.tenders.updateReview(auth, reviewId, body);
  }
}
