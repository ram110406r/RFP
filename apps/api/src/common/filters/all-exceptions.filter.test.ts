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
});
