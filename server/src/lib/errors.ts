/**
 * Structured API errors. Handlers throw these; the Elysia error mapper in
 * src/index.ts turns them into `{ error: { code, message } }` responses and
 * never leaks SQL text, stack traces, or other internals to the client.
 */
export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function notFound(entity: string, id: string): ApiError {
  return new ApiError(404, "NOT_FOUND", `${entity} "${id}" was not found.`);
}

export function unauthorized(message = "Authentication required."): ApiError {
  return new ApiError(401, "UNAUTHORIZED", message);
}

export function forbidden(message = "You don't have access to this resource."): ApiError {
  return new ApiError(403, "FORBIDDEN", message);
}

export function badRequest(message: string): ApiError {
  return new ApiError(400, "BAD_REQUEST", message);
}
