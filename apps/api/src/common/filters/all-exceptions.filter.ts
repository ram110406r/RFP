import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Request, Response } from "express";

import { PinoLoggerService } from "../logger/pino-logger.service";

interface StructuredErrorBody {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: unknown;
  };
}

/**
 * Converts every thrown error into one structured response shape,
 * `{ error: { code, message, requestId, details? } }`, so API consumers
 * never have to branch on exception type. Unexpected (non-HttpException)
 * errors are logged with their full stack but never leak internals to the
 * client — mirrors the same contract established by the earlier API surface.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, body } = this.toStructuredError(exception, request.id);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        { requestId: request.id, method: request.method, path: request.originalUrl },
        exception instanceof Error ? exception.stack : String(exception),
        "exception",
      );
    }

    response.status(status).json(body);
  }

  private toStructuredError(
    exception: unknown,
    requestId: string,
  ): { status: number; body: StructuredErrorBody } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const { code, message, details } = this.normalizeHttpExceptionPayload(exception, payload);
      return {
        status,
        body: { error: { code, message, requestId, ...(details ? { details } : {}) } },
      };
    }

    const uniqueViolation = findUniqueViolation(exception);
    if (uniqueViolation) {
      return {
        status: HttpStatus.CONFLICT,
        body: {
          error: {
            code: "CONFLICT",
            message: UNIQUE_CONSTRAINT_MESSAGES[uniqueViolation] ?? "That record already exists.",
            requestId,
          },
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        error: {
          code: "INTERNAL_ERROR",
          message: "Something went wrong. Please try again.",
          requestId,
        },
      },
    };
  }

  private normalizeHttpExceptionPayload(exception: HttpException, payload: unknown) {
    if (typeof payload === "string") {
      return { code: this.statusToCode(exception.getStatus()), message: payload };
    }
    if (typeof payload === "object" && payload !== null) {
      const obj = payload as Record<string, unknown>;
      const message = typeof obj.message === "string" ? obj.message : exception.message;
      const code =
        typeof obj.code === "string" ? obj.code : this.statusToCode(exception.getStatus());
      const { message: _m, code: _c, statusCode: _s, error: _e, ...details } = obj;
      return {
        code,
        message,
        details: Object.keys(details).length > 0 ? details : undefined,
      };
    }
    return { code: this.statusToCode(exception.getStatus()), message: exception.message };
  }

  private statusToCode(status: number): string {
    return HttpStatus[status] ?? "ERROR";
  }
}

/**
 * Friendly messages for unique constraints a user can plausibly trip. The
 * constraint name is never sent to the client; unknown ones get a generic
 * message.
 */
const UNIQUE_CONSTRAINT_MESSAGES: Record<string, string> = {
  workspaces_org_slug_uq: "A workspace with that URL slug already exists in this organization.",
  organization_members_org_user_uq: "That person is already a member of this organization.",
  team_members_team_member_uq: "That person is already on this team.",
  workspace_members_workspace_member_uq: "That person is already a member of this workspace.",
};

/**
 * A Postgres unique violation (SQLSTATE 23505) anywhere in the cause chain —
 * Drizzle wraps the driver error, so it is usually one level down. Returns the
 * constraint name ("" when unknown), or null when this is not one.
 */
function findUniqueViolation(exception: unknown): string | null {
  let current: unknown = exception;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    const candidate = current as { code?: unknown; constraint_name?: unknown; constraint?: unknown; cause?: unknown };
    if (candidate.code === "23505") {
      const constraint = candidate.constraint_name ?? candidate.constraint;
      return typeof constraint === "string" ? constraint : "";
    }
    current = candidate.cause;
  }
  return null;
}
