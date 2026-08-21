import { BadRequestException, Injectable, type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

/**
 * Validates a single value against a Zod schema. Use directly via
 * `@UsePipes(new ZodValidationPipe(schema))` on a controller or handler.
 *
 * Global, metadata-driven enforcement (reading @ZodBody/@ZodQuery) is
 * handled by ZodValidationInterceptor instead — a plain PipeTransform only
 * receives the value being transformed, not the route handler, so it can't
 * look up per-route schema metadata itself.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown) {
    return parseOrThrow(this.schema, value);
  }
}

export function parseOrThrow<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({
      code: "VALIDATION_ERROR",
      message: "Request validation failed.",
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  return result.data;
}
