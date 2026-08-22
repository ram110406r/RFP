import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { ObjectStorage } from "@rfp-os/storage";
import { beforeEach, describe, expect, it } from "bun:test";

import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import { ReadyController } from "./ready.controller";
import { DATABASE } from "../infrastructure/database";

/**
 * Config stub keyed by variable name.
 *
 * Deliberately not a `get: () => value` catch-all: readiness now consults both
 * DATABASE_URL and STORAGE_ENDPOINT, and a stub that answers every key with
 * the same value cannot express "database configured, storage not" — which is
 * the ordinary development case.
 */
const configWith = (values: Record<string, unknown>) => ({
  provide: ConfigService,
  useValue: { get: (key: string) => values[key] },
});

/** Minimal stand-in for the Drizzle instance — only `execute` is exercised. */
const databaseThat = (execute: () => Promise<unknown>) => ({
  provide: DATABASE,
  useValue: { execute },
});

const storageThat = (bucketReachable: () => Promise<boolean>) => ({
  provide: ObjectStorage,
  useValue: { bucketReachable },
});

const reachable = databaseThat(() => Promise.resolve([{ ok: 1 }]));
const unreachable = databaseThat(() => Promise.reject(new Error("connection refused")));
const storageUp = storageThat(() => Promise.resolve(true));
const storageDown = storageThat(() => Promise.resolve(false));

const nothingConfigured = configWith({});
const databaseOnly = configWith({ DATABASE_URL: "postgres://stub" });
const allConfigured = configWith({
  DATABASE_URL: "postgres://stub",
  STORAGE_ENDPOINT: "http://localhost:59000",
});

describe("HealthController", () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService, nothingConfigured, reachable, storageUp],
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

  it("skips checks for dependencies that are not configured", async () => {
    const controller = await readyControllerWith(nothingConfigured, reachable, storageUp);

    const result = await controller.check();
    expect(result).toEqual({
      status: "ok",
      checks: { database: "skipped", storage: "skipped" },
    });
  });

  it("reports ok when the database answers", async () => {
    const controller = await readyControllerWith(databaseOnly, reachable, storageUp);

    const result = await controller.check();
    expect(result).toEqual({ status: "ok", checks: { database: "ok", storage: "skipped" } });
  });

  it("checks storage once an endpoint is configured", async () => {
    const controller = await readyControllerWith(allConfigured, reachable, storageUp);

    const result = await controller.check();
    expect(result).toEqual({ status: "ok", checks: { database: "ok", storage: "ok" } });
  });

  /**
   * The reason readiness exists: the process is alive but cannot serve
   * traffic, so orchestrators must take it out of rotation rather than
   * restart it.
   */
  it("throws 503 when the database is unreachable", async () => {
    const controller = await readyControllerWith(databaseOnly, unreachable, storageUp);

    await expect(controller.check()).rejects.toThrow();
  });

  /** Storage is a hard dependency once configured: uploads fail without it. */
  it("throws 503 when configured storage is unreachable", async () => {
    const controller = await readyControllerWith(allConfigured, reachable, storageDown);

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
