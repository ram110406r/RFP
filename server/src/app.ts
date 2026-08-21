import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { ApiError } from "./lib/errors";
import { authModule } from "./modules/auth";
import { peopleModule } from "./modules/people";
import { rfpsModule } from "./modules/rfps";
import { requirementsModule } from "./modules/requirements";
import { reviewsModule } from "./modules/reviews";
import { assignmentsModule } from "./modules/assignments";
import { knowledgeModule } from "./modules/knowledge";
import { notificationsModule } from "./modules/notifications";
import { activitiesModule } from "./modules/activities";
import { analyticsModule } from "./modules/analytics";
import { validationModule } from "./modules/validation";
import { submissionsModule } from "./modules/submissions";
import { settingsModule } from "./modules/settings";

const corsOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:8080").split(",");

/**
 * The composed Elysia app, without `.listen()` — importable by tests (via
 * `app.handle(request)`) without binding a port. `index.ts` is the only
 * place that actually starts the server.
 */
export const app = new Elysia()
  .use(cors({ origin: corsOrigins, credentials: true }))
  .onError(({ error, set }) => {
    if (error instanceof ApiError) {
      set.status = error.status;
      return { error: { code: error.code, message: error.message } };
    }
    // Never leak SQL text, stack traces, or other internals to the client.
    console.error(error);
    set.status = 500;
    return {
      error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." },
    };
  })
  .get("/health", () => ({ status: "ok" }))
  .use(authModule)
  .use(peopleModule)
  .use(rfpsModule)
  .use(requirementsModule)
  .use(reviewsModule)
  .use(assignmentsModule)
  .use(knowledgeModule)
  .use(notificationsModule)
  .use(activitiesModule)
  .use(analyticsModule)
  .use(validationModule)
  .use(submissionsModule)
  .use(settingsModule);

export type App = typeof app;
