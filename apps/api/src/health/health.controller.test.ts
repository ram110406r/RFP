import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it } from "bun:test";

import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import { ReadyController } from "./ready.controller";
import { DATABASE } from "../infrastructure/database";

/** Config stub whose `get` returns whatever the test supplies for any key. */
const configWith = (value: unknown) => ({ provide: ConfigService, useValue: { get: () => value } });

/** Minimal stand-in for the Drizzle instance — only `execute` is exercised. */
const databaseThat = (execute: () => Promise<unknown>) => ({
  provide: DATABASE,
  useValue: { execute },
});

const reachable = databaseThat(() => Promise.resolve([{ ok: 1 }]));
const unreachable = databaseThat(() => Promise.reject(new Error("connection refused")));

describe("HealthController", () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService, configWith(undefined), reachable],
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it("reports ok with a timestamp", () => {
    const result = controller.check();
    expect(result.status).toBe("ok");
    expect(typeof result.timestamp).toBe("string");
  });
});

describe("ReadyController", () => {
  async function readyControllerWith(...providers: unknown[]) {
    const moduleRef = await Test.createTestingModule({
      controllers: [ReadyController],
      providers: [HealthService, ...providers] as never,
    }).compile();
    return moduleRef.get(ReadyController);
  }

  it("skips the database check when DATABASE_URL is unset", async () => {
    const controller = await readyControllerWith(configWith(undefined), reachable);

    const result = await controller.check();
    expect(result).toEqual({ status: "ok", checks: { database: "skipped" } });
  });

  it("reports ok when the database answers", async () => {
    const controller = await readyControllerWith(configWith("postgres://stub"), reachable);

    const result = await controller.check();
    expect(result).toEqual({ status: "ok", checks: { database: "ok" } });
  });

  /**
   * The reason readiness exists: the process is alive but cannot serve
   * traffic, so orchestrators must take it out of rotation rather than
   * restart it.
   */
  it("throws 503 when the database is unreachable", async () => {
    const controller = await readyControllerWith(configWith("postgres://stub"), unreachable);

    await expect(controller.check()).rejects.toThrow();
  });

  it("throws 503 when any dependency check is degraded", async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ReadyController],
      providers: [
        {
          provide: HealthService,
          useValue: {
            readiness: async () => ({ status: "degraded", checks: { database: "error" } }),
          },
        },
      ],
    }).compile();
    const controller = moduleRef.get(ReadyController);

    await expect(controller.check()).rejects.toThrow();
  });
});
