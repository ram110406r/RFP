import { BadRequestException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "bun:test";
import { of } from "rxjs";
import { z } from "zod";

import { ZodValidationInterceptor } from "./zod-validation.interceptor";
import { ZOD_BODY_SCHEMA, ZOD_QUERY_SCHEMA } from "../decorators/zod-schema.decorator";

/**
 * Builds a request whose `query` is a prototype getter that re-parses on each
 * access, the way Express 5 does. A plain object here would let the old
 * Object.assign implementation pass while still failing in production.
 */
function requestWithLiveQuery(raw: Record<string, string>) {
  const proto = {
    get query() {
      return { ...raw };
    },
  };
  return Object.create(proto) as { query: Record<string, unknown>; body?: unknown };
}

function contextFor(request: unknown, metadata: Record<string, unknown>) {
  const handler = () => undefined;
  for (const [key, value] of Object.entries(metadata)) {
    Reflect.defineMetadata(key, value, handler);
  }
  return {
    getType: () => "http",
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

const next = { handle: () => of(null) } as never;

describe("ZodValidationInterceptor", () => {
  const interceptor = new ZodValidationInterceptor(new Reflector());

  it("applies query defaults so the handler sees them", () => {
    const schema = z.object({
      page: z.coerce.number().int().positive().default(1),
      sort: z.enum(["deadline", "createdAt"]).default("deadline"),
    });
    const request = requestWithLiveQuery({});

    interceptor.intercept(contextFor(request, { [ZOD_QUERY_SCHEMA]: schema }), next);

    // The regression: with Express 5's getter, defaults were discarded and the
    // handler received {} — which produced an ORDER BY on nothing.
    expect(request.query).toEqual({ page: 1, sort: "deadline" });
  });

  it("keeps supplied query values and coerces them", () => {
    const schema = z.object({ page: z.coerce.number().int().positive().default(1) });
    const request = requestWithLiveQuery({ page: "3" });

    interceptor.intercept(contextFor(request, { [ZOD_QUERY_SCHEMA]: schema }), next);

    expect(request.query).toEqual({ page: 3 });
  });

  it("rejects an invalid query", () => {
    const schema = z.object({ page: z.coerce.number().int().positive() });
    const request = requestWithLiveQuery({ page: "-1" });

    expect(() =>
      interceptor.intercept(contextFor(request, { [ZOD_QUERY_SCHEMA]: schema }), next),
    ).toThrow(BadRequestException);
  });

  it("replaces the body with the parsed value", () => {
    const schema = z.object({ title: z.string().trim() });
    const request = requestWithLiveQuery({});
    request.body = { title: "  spaced  " };

    interceptor.intercept(contextFor(request, { [ZOD_BODY_SCHEMA]: schema }), next);

    expect(request.body).toEqual({ title: "spaced" });
  });

  it("leaves a route with no schema untouched", () => {
    const request = requestWithLiveQuery({ anything: "goes" });
    interceptor.intercept(contextFor(request, {}), next);
    expect(request.query).toEqual({ anything: "goes" });
  });
});
