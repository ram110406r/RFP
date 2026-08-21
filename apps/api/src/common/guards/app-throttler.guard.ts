import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { Request } from "express";

/**
 * Rate-limiting foundation (basic — no per-route tuning yet). Overrides
 * tracker resolution so requests behind a reverse proxy are rate-limited by
 * the real client IP (X-Forwarded-For) rather than the proxy's address.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Request): Promise<string> {
    const forwardedFor = req.headers["x-forwarded-for"];
    if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
      return (forwardedFor.split(",")[0] ?? forwardedFor).trim();
    }
    return req.ip ?? "unknown";
  }
}
