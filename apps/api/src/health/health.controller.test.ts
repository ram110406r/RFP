import { beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const SOURCE_DIR = import.meta.dir;
const apiPackageTest = process.cwd().replace(/\\/g, "/").endsWith("/apps/api") ? describe : describe.skip;

apiPackageTest("Health endpoints", () => {
  let HealthController: any;
  let HealthService: any;
  let HealthV1Controller: any;
  let ReadyController: any;

  beforeAll(async () => {
    const [healthController, healthService, healthV1Controller, readyController] = await Promise.all(
      [
        import(pathToFileURL(join(SOURCE_DIR, "health.controller.ts")).href),
        import(pathToFileURL(join(SOURCE_DIR, "health.service.ts")).href),
        import(pathToFileURL(join(SOURCE_DIR, "health-v1.controller.ts")).href),
        import(pathToFileURL(join(SOURCE_DIR, "ready.controller.ts")).href),
      ],
    );

    HealthController = healthController.HealthController;
    HealthService = healthService.HealthService;
    HealthV1Controller = healthV1Controller.HealthV1Controller;
    ReadyController = readyController.ReadyController;
  });

  test("GET /health returns the liveness payload", () => {
    const service = new HealthService(
      { get: () => undefined } as never,
      { execute: async () => undefined } as never,
      { bucketReachable: async () => true } as never,
    );
    const controller = new HealthController(service);

    const body = controller.check();

    expect(body.status).toBe("ok");
    expect(typeof body.timestamp).toBe("string");
    expect(body.version).toBe("unknown");
    expect(body.buildTime).toBeNull();
  });

  test("GET /api/v1/health returns the same liveness payload", () => {
    const service = new HealthService(
      { get: () => undefined } as never,
      { execute: async () => undefined } as never,
      { bucketReachable: async () => true } as never,
    );
    const controller = new HealthV1Controller(service);

    const body = controller.check();

    expect(body.status).toBe("ok");
    expect(typeof body.timestamp).toBe("string");
    expect(body.version).toBe("unknown");
    expect(body.buildTime).toBeNull();
  });

  test("GET /ready reports healthy dependencies when probes succeed", async () => {
    const service = new HealthService(
      {
        get: (key: string) => {
          if (key === "DATABASE_URL") return "postgres://example";
          if (key === "STORAGE_ENDPOINT") return "http://example";
          return undefined;
        },
      } as never,
      { execute: async () => undefined } as never,
      { bucketReachable: async () => true } as never,
    );
    const controller = new ReadyController(service);

    await expect(controller.check()).resolves.toEqual({
      status: "ok",
      checks: { database: "ok", redis: "skipped", storage: "ok", opensearch: "skipped" },
    });
  });
});
