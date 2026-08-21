import {
  Injectable,
  RequestTimeoutException,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import { catchError, timeout, TimeoutError, throwError, type Observable } from "rxjs";

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Foundation-level request timeout so a hung downstream call (DB, AI
 * provider, etc. in later phases) can't hold a connection open forever.
 * Per-route overrides can wrap this with their own `timeout()` operator
 * later if a handler genuinely needs longer.
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      timeout(DEFAULT_TIMEOUT_MS),
      catchError((err: unknown) => {
        if (err instanceof TimeoutError) {
          return throwError(() => new RequestTimeoutException());
        }
        return throwError(() => err);
      }),
    );
  }
}
