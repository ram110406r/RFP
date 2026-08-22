import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ObjectStorage } from "@rfp-os/storage";

import type { Env } from "../../config/env.schema";

/**
 * Object storage as a platform capability.
 *
 * `ObjectStorage` is used directly as the DI token rather than a symbol: the
 * class is a plain constructor from @rfp-os/storage with no Nest coupling, so
 * a test can substitute a stub with `overrideProvider(ObjectStorage)` and the
 * worker can construct the same class without importing Nest at all.
 *
 * Global for the same reason DatabaseModule is: storage is infrastructure that
 * several domain modules will need, and threading an import through each of
 * them adds ceremony without adding a decision.
 */
@Global()
@Module({
  providers: [
    {
      provide: ObjectStorage,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new ObjectStorage({
          endpoint: config.get("STORAGE_ENDPOINT", { infer: true }),
          region: config.get("STORAGE_REGION", { infer: true }),
          bucket: config.get("STORAGE_BUCKET", { infer: true }),
          accessKeyId: config.get("STORAGE_ACCESS_KEY_ID", { infer: true }),
          secretAccessKey: config.get("STORAGE_SECRET_ACCESS_KEY", { infer: true }),
          forcePathStyle: config.get("STORAGE_FORCE_PATH_STYLE", { infer: true }),
        }),
    },
  ],
  exports: [ObjectStorage],
})
export class StorageModule {}
