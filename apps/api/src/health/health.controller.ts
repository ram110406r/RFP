import { Controller, Get, VERSION_NEUTRAL } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

import { HealthService } from "./health.service";

/**
 * Plain liveness probe: is the process up. Deliberately outside both the
 * `/api` prefix and URI versioning (excluded in main.ts) and unthrottled —
 * this is what load balancers / orchestrators poll frequently.
 */
@SkipThrottle()
@Controller({ path: "health", version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  check() {
    return this.health.liveness();
  }
}
