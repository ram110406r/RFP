import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { catchError, tap, throwError, type Observable } from "rxjs";

import { PinoLoggerService } from "../logger/pino-logger.service";

/**
 * Structured access log for every HTTP request: method, path, status,
 * duration, and the request id assigned by RequestIdMiddleware — so a
 * single id ties together the access log line and any error log line.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: PinoLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const start = performance.now();

    return next.handle().pipe(
      tap(() => this.logRequest(request, response.statusCode, start)),
      catchError((err: unknown) => {
        const status = err instanceof Object && "getStatus" in err ? undefined : 500;
        this.logRequest(request, response.statusCode || status || 500, start);
        return throwError(() => err);
      }),
    );
  }

  private logRequest(request: Request, statusCode: number, start: number) {
    const durationMs = Math.round(performance.now() - start);
    this.logger.log(
      {
        requestId: request.id,
        method: request.method,
        path: request.originalUrl,
        statusCode,
        durationMs,
      },
      "http",
    );
  }
}
