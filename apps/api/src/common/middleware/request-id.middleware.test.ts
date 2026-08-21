import { describe, expect, it, mock } from "bun:test";
import type { Request, Response } from "express";

import { RequestIdMiddleware } from "./request-id.middleware";

function createReqRes(inboundId?: string) {
  const headers: Record<string, string> = inboundId ? { "x-request-id": inboundId } : {};
  const req = { header: (name: string) => headers[name.toLowerCase()] } as unknown as Request;
  const setHeader = mock((_name: string, _value: string) => res);
  const res = { setHeader } as unknown as Response;
  return { req, res, setHeader };
}

describe("RequestIdMiddleware", () => {
  const middleware = new RequestIdMiddleware();

  it("generates a request id when none is supplied", () => {
    const { req, res, setHeader } = createReqRes();
    const next = mock(() => {});

    middleware.use(req, res, next);

    expect(typeof req.id).toBe("string");
    expect(req.id.length).toBeGreaterThan(0);
    expect(setHeader).toHaveBeenCalledWith("X-Request-Id", req.id);
    expect(next).toHaveBeenCalled();
  });

  it("reuses an inbound X-Request-Id header", () => {
    const { req, res } = createReqRes("client-supplied-id");
    middleware.use(req, res, () => {});
    expect(req.id).toBe("client-supplied-id");
  });
});
