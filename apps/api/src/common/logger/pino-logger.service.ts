import { Injectable, type LoggerService } from "@nestjs/common";
import { createLogger, type Logger } from "@rfp-os/observability";

type Level = "info" | "error" | "warn" | "debug" | "trace";

/**
 * Adapts the shared pino logger (packages/observability) to Nest's
 * LoggerService interface, so both Nest's internal framework logs and our
 * own structured request/error logs go through one pino instance with one
 * format. Wired in via `app.useLogger(...)` in main.ts.
 */
@Injectable()
export class PinoLoggerService implements LoggerService {
  private readonly logger: Logger = createLogger("api");

  log(message: unknown, context?: string) {
    this.write("info", message, context);
  }

  error(message: unknown, trace?: string, context?: string) {
    this.write("error", message, context, trace);
  }

  warn(message: unknown, context?: string) {
    this.write("warn", message, context);
  }

  debug(message: unknown, context?: string) {
    this.write("debug", message, context);
  }

  verbose(message: unknown, context?: string) {
    this.write("trace", message, context);
  }

  private write(level: Level, message: unknown, context?: string, trace?: string) {
    const meta = {
      ...(context ? { context } : {}),
      ...(trace ? { trace } : {}),
    };
    if (typeof message === "object" && message !== null) {
      this.logger[level]({ ...meta, ...message });
    } else {
      this.logger[level](meta, String(message));
    }
  }
}
