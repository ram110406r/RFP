import { SetMetadata } from "@nestjs/common";
import type { ZodType } from "zod";

export const ZOD_BODY_SCHEMA = "zod:body-schema";
export const ZOD_QUERY_SCHEMA = "zod:query-schema";

/**
 * Attaches a Zod schema to a route handler for ZodValidationPipe to enforce
 * on the request body. Routes without this metadata pass through unvalidated
 * (there is no request body to validate yet — no RFP/auth endpoints exist in
 * this phase).
 */
export const ZodBody = (schema: ZodType) => SetMetadata(ZOD_BODY_SCHEMA, schema);

/** Same as ZodBody, but validates the query string instead. */
export const ZodQuery = (schema: ZodType) => SetMetadata(ZOD_QUERY_SCHEMA, schema);
