import { Module, RequestMethod, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";

import { AuthGuard, PermissionsGuard } from "./common/auth";
import { AppThrottlerGuard } from "./common/guards/app-throttler.guard";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";
import { TimeoutInterceptor } from "./common/interceptors/timeout.interceptor";
import { ZodValidationInterceptor } from "./common/interceptors/zod-validation.interceptor";
import { LoggerModule } from "./common/logger/logger.module";
import { RequestIdMiddleware } from "./common/middleware/request-id.middleware";
import { AppConfigModule } from "./config/app-config.module";
import type { Env } from "./config/env.schema";
import { HealthModule } from "./health/health.module";
import { DatabaseModule } from "./infrastructure/database";
import { AuditModule } from "./infrastructure/audit";
import { ActivityModule } from "./infrastructure/activity";
import { EventsModule } from "./infrastructure/events";
import { QueueModule } from "./infrastructure/queue";
import { StorageModule } from "./infrastructure/storage";
import { AuthModule } from "./modules/auth";
import { ActivitiesModule } from "./modules/activities";
import { AssignmentsModule } from "./modules/assignments";
import { AuditsModule } from "./modules/audits";
import { OrganizationsModule } from "./modules/organizations";
import { PoliciesModule } from "./modules/policies";
import { KnowledgeModule } from "./modules/knowledge";
import { DashboardModule } from "./modules/dashboard";
import { TendersModule } from "./modules/tenders";
import { RolesModule } from "./modules/roles";
import { TeamsModule } from "./modules/teams";
import { WorkspacesModule } from "./modules/workspaces";
import { OnboardingModule } from "./modules/onboarding/onboarding.module";
import { RfpApplyModule } from "./modules/rfp-apply/rfp-apply.module";

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    DatabaseModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [
          {
            ttl: config.get("RATE_LIMIT_TTL_MS", { infer: true }),
            limit: config.get("RATE_LIMIT_LIMIT", { infer: true }),
          },
        ],
      }),
    }),
    HealthModule,
    ActivityModule,
    AuditModule,
    EventsModule,
    QueueModule,
    StorageModule,
    AuthModule,
    OrganizationsModule,
    RolesModule,
    PoliciesModule,
    KnowledgeModule,
    DashboardModule,
    WorkspacesModule,
    OnboardingModule,
    TeamsModule,
    AssignmentsModule,
    ActivitiesModule,
    AuditsModule,
    TendersModule,
    RfpApplyModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    /*
     * Guard order is registration order. Rate limiting runs first so an
     * unauthenticated flood is rejected before it costs a session lookup;
     * AuthGuard then establishes identity and tenant, and PermissionsGuard
     * decides on the role it resolved. Authentication is global and opt-out
     * (@Public), never opt-in.
     */
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TimeoutInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ZodValidationInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Express 5's router requires the named-wildcard form ("*splat"), not
    // the bare "*" that worked under Nest + Express 4.
    consumer.apply(RequestIdMiddleware).forRoutes({ path: "*splat", method: RequestMethod.ALL });
  }
}
