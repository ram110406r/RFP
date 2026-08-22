import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Redirect,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import type { AuthContext } from "@rfp-os/types";

import { CurrentAuth, RequirePermissions } from "../../common/auth";
import { ZodBody, ZodQuery } from "../../common/decorators/zod-schema.decorator";
import { DocumentsService } from "./documents.service";
import {
  createUploadIntentSchema,
  createVersionIntentSchema,
  listDocumentsSchema,
  type CreateUploadIntentInput,
  type CreateVersionIntentInput,
  type ListDocumentsInput,
} from "./dto/document.dto";

/**
 * RFP documents.
 *
 * Nested under the RFP because a document has no meaning outside one, and
 * because carrying the rfpId in the path lets every handler check that the
 * document actually belongs to the RFP the caller named — see
 * DocumentsService.requireDocument.
 *
 * As with RfpController, the tenant comes from @CurrentAuth alone; there is no
 * request shape that can address another organization's documents.
 */
@Controller({ path: "rfps/:rfpId/documents", version: "1" })
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @RequirePermissions("document:read")
  @ZodQuery(listDocumentsSchema)
  async list(
    @CurrentAuth() auth: AuthContext,
    @Param("rfpId") rfpId: string,
    @Query() query: ListDocumentsInput,
  ) {
    return this.documents.list(auth, rfpId, query);
  }

  /**
   * Phase one of an upload. Returns a presigned PUT; the client sends the
   * bytes straight to object storage and then calls `complete`.
   */
  @Post("upload-intent")
  @RequirePermissions("document:upload")
  @ZodBody(createUploadIntentSchema)
  async createUploadIntent(
    @CurrentAuth() auth: AuthContext,
    @Param("rfpId") rfpId: string,
    @Body() body: CreateUploadIntentInput,
  ) {
    return this.documents.createUploadIntent(auth, rfpId, body);
  }

  @Get(":documentId")
  @RequirePermissions("document:read")
  async get(
    @CurrentAuth() auth: AuthContext,
    @Param("rfpId") rfpId: string,
    @Param("documentId") documentId: string,
  ) {
    return this.documents.getById(auth, rfpId, documentId);
  }

  /**
   * Phase two. 200 rather than 201: the document row was created at intent,
   * so this confirms and advances an existing resource rather than making one.
   */
  @Post(":documentId/complete")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions("document:upload")
  async complete(
    @CurrentAuth() auth: AuthContext,
    @Param("rfpId") rfpId: string,
    @Param("documentId") documentId: string,
  ) {
    return this.documents.completeUpload(auth, rfpId, documentId);
  }

  /**
   * Redirects to a short-lived presigned URL rather than streaming the bytes,
   * for the same reason uploads are presigned: the API stays out of the data
   * path. 302 and not 301 — the URL expires, so it must never be cached as
   * permanent.
   */
  @Get(":documentId/download")
  @RequirePermissions("document:read")
  @Redirect(undefined, HttpStatus.FOUND)
  async download(
    @CurrentAuth() auth: AuthContext,
    @Param("rfpId") rfpId: string,
    @Param("documentId") documentId: string,
  ) {
    const { url } = await this.documents.createDownloadUrl(auth, rfpId, documentId);
    return { url, statusCode: HttpStatus.FOUND };
  }

  /** Archives rather than deletes — see DocumentsService.archive. */
  @Delete(":documentId")
  @RequirePermissions("document:delete")
  async archive(
    @CurrentAuth() auth: AuthContext,
    @Param("rfpId") rfpId: string,
    @Param("documentId") documentId: string,
  ) {
    return this.documents.archive(auth, rfpId, documentId);
  }

  @Post(":documentId/versions")
  @RequirePermissions("document:upload")
  @ZodBody(createVersionIntentSchema)
  async createVersion(
    @CurrentAuth() auth: AuthContext,
    @Param("rfpId") rfpId: string,
    @Param("documentId") documentId: string,
    @Body() body: CreateVersionIntentInput,
  ) {
    return this.documents.createVersionIntent(auth, rfpId, documentId, body);
  }
}
