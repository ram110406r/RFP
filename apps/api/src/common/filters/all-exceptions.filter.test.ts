import { BadRequestException, type ArgumentsHost } from "@nestjs/common";
import { describe, expect, it, mock } from "bun:test";

import type { PinoLoggerService } from "../logger/pino-logger.service";
import { AllExceptionsFilter } from "./all-exceptions.filter";

function createHost(overrides: { statusCode?: number } = {}) {
  const json = mock((_body: unknown) => response);
  const status = mock((_code: number) => response);
  const response = { status, json, statusCode: overrides.statusCode ?? 200 };
  const request = { id: "req-1", method: "GET", originalUrl: "/thing" };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  return { host, status, json };
}

describe("AllExceptionsFilter", () => {
  it("formats an HttpException into the structured error shape", () => {
    const logger = { error: mock(() => {}) } as unknown as PinoLoggerService;
    const filter = new AllExceptionsFilter(logger);
    const { host, status, json } = createHost();

    filter.catch(new BadRequestException("bad input"), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: { code: "BAD_REQUEST", message: "bad input", requestId: "req-1" },
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("masks unknown errors as a generic 500 and logs the real error", () => {
    const logger = { error: mock(() => {}) } as unknown as PinoLoggerService;
    const filter = new AllExceptionsFilter(logger);
    const { host, status, json } = createHost();

    filter.catch(new Error("db connection string leaked here"), host);

    expect(status).toHaveBeenCalledWith(500);
    const [body] = json.mock.calls[0] as [{ error: { code: string; message: string } }];
    expect(body.error.message).not.toContain("leaked");
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(logger.error).toHaveBeenCalled();
  });

  it("maps a wrapped Postgres unique violation to a 409 without leaking the constraint", () => {
    const logger = { error: mock(() => {}) } as unknown as PinoLoggerService;
    const filter = new AllExceptionsFilter(logger);
    const { host, status, json } = createHost();
    const driverError = Object.assign(new Error("duplicate key value violates unique constraint"), {
      code: "23505",
      constraint_name: "workspaces_org_slug_uq",
    });

    filter.catch(new Error("Failed query: insert into workspaces", { cause: driverError }), host);

    expect(status).toHaveBeenCalledWith(409);
    const [body] = json.mock.calls[0] as [{ error: { code: string; message: string } }];
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toContain("slug");
    expect(body.error.message).not.toContain("workspaces_org_slug_uq");
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("uses a generic conflict message for an unlisted constraint", () => {
    const logger = { error: mock(() => {}) } as unknown as PinoLoggerService;
    const filter = new AllExceptionsFilter(logger);
    const { host, status, json } = createHost();

    filter.catch(Object.assign(new Error("dup"), { code: "23505", constraint_name: "secret_internal_uq" }), host);

    expect(status).toHaveBeenCalledWith(409);
    const [body] = json.mock.calls[0] as [{ error: { message: string } }];
    expect(body.error.message).toBe("That record already exists.");
  });
});
