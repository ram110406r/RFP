import { Controller, Get, VERSION_NEUTRAL } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

import { HealthService } from "./health.service";

/**
 * Same liveness check as GET /health, but under the versioned API surface
 * (GET /api/v1/health).
 *
 * This controller hardcodes "v1/health" and opts out of Nest's automatic
 * version-insertion (VERSION_NEUTRAL) instead of just using
 * `@Controller('health')` under the global defaultVersion — Nest's
 * setGlobalPrefix `exclude` matching strips the version segment before
 * comparing paths (see RoutePathFactory#isExcludedFromGlobalPrefix), so a
 * versioned "health" route would still match the "health" exclude entry
 * used by the unversioned HealthController and lose its /api prefix. Giving
 * this one controller a literal, non-colliding path sidesteps that; every
 * *other* v1 controller (e.g. `@Controller('rfps')`) still gets "/api/v1/..."
 * automatically from the global defaultVersion with no boilerplate.
 */
@SkipThrottle()
@Controller({ path: "v1/health", version: VERSION_NEUTRAL })
export class HealthV1Controller {
  constructor(private readonly health: HealthService) {}

  @Get()
  check() {
    return this.health.liveness();
  }
}
