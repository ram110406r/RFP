import "reflect-metadata";
import { RequestMethod, VersioningType } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";

import { AppModule } from "./app.module";
import { PinoLoggerService } from "./common/logger/pino-logger.service";
import type { Env } from "./config/env.schema";

async function bootstrap() {
  ensureNoProxyHost(process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1");

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const logger = app.get(PinoLoggerService);
  app.useLogger(logger);

  const config = app.get(ConfigService<Env, true>);

  app.use(helmet());
  app.enableCors({
    origin: config.get("CORS_ORIGIN", { infer: true }).split(","),
    credentials: true,
  });

  // /health and /ready stay outside the /api/v1 surface (liveness/readiness
  // probes are infrastructure concerns, not versioned API endpoints) — see
  // health.controller.ts / ready.controller.ts (VERSION_NEUTRAL).
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.setGlobalPrefix("api", {
    exclude: [
      { path: "health", method: RequestMethod.GET },
      { path: "ready", method: RequestMethod.GET },
    ],
  });

  app.enableShutdownHooks();

  const port = config.get("API_PORT", { infer: true });
  await app.listen(port);
  logger.log(`RFP OS API listening on http://localhost:${port}`, "Bootstrap");
}

void bootstrap();

function ensureNoProxyHost(baseUrl: string) {
  try {
    const host = new URL(baseUrl).hostname;
    const updated = appendNoProxy(process.env.NO_PROXY, host);
    process.env.NO_PROXY = updated;
    process.env.no_proxy = updated;
  } catch {
    // If the configured base URL is invalid, env validation will fail later.
  }
}

function appendNoProxy(existing: string | undefined, host: string) {
  const entries = new Set(
    (existing ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
  entries.add(host);
  return [...entries].join(",");
}
