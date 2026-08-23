import { Global, Module, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import IORedis from "ioredis";

import { PinoLoggerService } from "../../common/logger/pino-logger.service";
import type { Env } from "../../config/env.schema";
import { BullMqJobQueue, JobQueue, NoopJobQueue } from "./job-queue";

/**
 * The Redis connection shared by every queue in this process. Exported as its
 * own token so a future queue (answers, notifications) reuses the connection
 * rather than opening a second one.
 *
 * Null when REDIS_URL is unset, which is what selects NoopJobQueue below.
 */
export const QUEUE_REDIS = Symbol("QUEUE_REDIS");

/**
 * Background job production as a platform capability.
 *
 * Global for the same reason StorageModule is: several domain modules will
 * schedule work, and threading an import through each adds ceremony without
 * adding a decision.
 */
@Global()
@Module({
  providers: [
    {
      provide: QUEUE_REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const url = config.get("REDIS_URL", { infer: true });
        if (!url) return null;
        /*
         * maxRetriesPerRequest must be null for BullMQ: it blocks on BRPOPLPUSH
         * for long stretches, and ioredis' default would abort those reads and
         * surface them as command errors rather than a healthy idle worker.
         */
        return new IORedis(url, { maxRetriesPerRequest: null });
      },
    },
    {
      provide: JobQueue,
      inject: [QUEUE_REDIS, PinoLoggerService],
      useFactory: (connection: IORedis | null, logger: PinoLoggerService) =>
        connection ? new BullMqJobQueue(connection, logger) : new NoopJobQueue(logger),
    },
  ],
  exports: [JobQueue],
})
export class QueueModule implements OnApplicationShutdown {
  constructor(private readonly queue: JobQueue) {}

  /**
   * Without this the process hangs on shutdown: BullMQ's Redis connection is
   * an open handle, and Nest will not exit while one is live.
   */
  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
  }
}
