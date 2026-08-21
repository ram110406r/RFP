import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException, VERSION_NEUTRAL } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

import { HealthService } from "./health.service";

/**
 * Readiness probe: can this instance actually serve traffic right now (are
 * its dependencies reachable). Distinct from liveness — a process can be up
 * but not ready (e.g. database unreachable).
 */
@SkipThrottle()
@Controller({ path: "ready", version: VERSION_NEUTRAL })
export class ReadyController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check() {
    const result = await this.health.readiness();
    if (result.status === "degraded") {
      throw new ServiceUnavailableException({
        code: "SERVICE_UNAVAILABLE",
        message: "One or more dependencies are unavailable.",
        checks: result.checks,
      });
    }
    return result;
  }
}
