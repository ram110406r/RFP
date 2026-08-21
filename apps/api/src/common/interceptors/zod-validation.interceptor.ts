import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { Observable } from "rxjs";
import type { ZodType } from "zod";

import { ZOD_BODY_SCHEMA, ZOD_QUERY_SCHEMA } from "../decorators/zod-schema.decorator";
import { parseOrThrow } from "../pipes/zod-validation.pipe";

/**
 * Global validation enforcement: reads @ZodBody / @ZodQuery metadata off the
 * route handler and, when present, validates + replaces req.body (or merges
 * into req.query) with the parsed result before the handler runs. Routes
 * without schema metadata — everything right now, since Phase 2 has no
 * request bodies to validate — pass through untouched.
 */
@Injectable()
export class ZodValidationInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") {
      return next.handle();
    }

    const handler = context.getHandler();
    const bodySchema = this.reflector.get<ZodType | undefined>(ZOD_BODY_SCHEMA, handler);
    const querySchema = this.reflector.get<ZodType | undefined>(ZOD_QUERY_SCHEMA, handler);

    if (bodySchema || querySchema) {
      const request = context.switchToHttp().getRequest<Request>();
      if (bodySchema) {
        request.body = parseOrThrow(bodySchema, request.body);
      }
      if (querySchema) {
        Object.assign(request.query, parseOrThrow(querySchema, request.query));
      }
    }

    return next.handle();
  }
}
