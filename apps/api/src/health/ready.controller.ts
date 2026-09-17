import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

import { HealthService } from "./health.service";
import { Public } from "../common/auth";

/**
 * Readiness probe: can this instance actually serve traffic right now (are
 * its dependencies reachable). Distinct from liveness — a process can be up
 * but not ready (e.g. database unreachable).
 */
@SkipThrottle()
@Public()
@Controller({ path: "ready", version: VERSION_NEUTRAL })
export class ReadyController {
  private readonly logger = new Logger(ReadyController.name);

  constructor(private readonly health: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check() {
    const result = await this.health.readiness();
    if (result.status === "degraded") {
      this.logger.warn(`Readiness degraded checks=${JSON.stringify(result.checks)}`);
      throw new ServiceUnavailableException({
        code: "SERVICE_UNAVAILABLE",
        message: "One or more dependencies are unavailable.",
        checks: result.checks,
      });
    }
    return result;
  }
}
