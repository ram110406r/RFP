import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

/**
 * Reads the request id assigned by RequestIdMiddleware. Available on every
 * route since the middleware is applied globally in AppModule.
 */
export const ReqId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<Request>();
  return request.id;
});
