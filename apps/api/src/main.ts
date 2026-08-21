import "reflect-metadata";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? "http://localhost:3000").split(","),
    credentials: true,
  });
  const port = Number(process.env.API_PORT ?? 4100);
  await app.listen(port);
  console.log(`RFP OS API listening on http://localhost:${port}`);
}

void bootstrap();
