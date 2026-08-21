import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

const REQUEST_ID_HEADER = "x-request-id";

/**
 * Assigns a request id (reusing an inbound `X-Request-Id` header when a
 * caller/proxy already set one) before any guard, pipe, or interceptor runs,
 * so every downstream layer — including the exception filter — can attach it
 * to logs and error responses.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const inbound = req.header(REQUEST_ID_HEADER);
    req.id = inbound && inbound.length > 0 ? inbound : randomUUID();
    res.setHeader("X-Request-Id", req.id);
    next();
  }
}
