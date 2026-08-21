import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "bun:test";

import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("reports ok", async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    const controller = moduleRef.get(HealthController);
    expect(controller.check()).toEqual({ status: "ok" });
  });
});
