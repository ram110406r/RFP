import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const API_ROOT = join(import.meta.dir, "..", "..");
const DIST_DIR = join(API_ROOT, "dist", "health");

describe("Health endpoints", () => {
  let HealthController: any;
  let HealthService: any;
  let HealthV1Controller: any;
  let ReadyController: any;

  beforeAll(async () => {
    if (
      !existsSync(join(DIST_DIR, "health.controller.js")) ||
      !existsSync(join(DIST_DIR, "health.service.js")) ||
      !existsSync(join(DIST_DIR, "health-v1.controller.js")) ||
      !existsSync(join(DIST_DIR, "ready.controller.js"))
    ) {
      throw new Error(`Built API not found at ${DIST_DIR}. Run bun run build first.`);
    }

    const [healthController, healthService, healthV1Controller, readyController] = await Promise.all(
      [
        import(pathToFileURL(join(DIST_DIR, "health.controller.js")).href),
        import(pathToFileURL(join(DIST_DIR, "health.service.js")).href),
        import(pathToFileURL(join(DIST_DIR, "health-v1.controller.js")).href),
        import(pathToFileURL(join(DIST_DIR, "ready.controller.js")).href),
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
      checks: { database: "ok", storage: "ok" },
    });
  });
});
