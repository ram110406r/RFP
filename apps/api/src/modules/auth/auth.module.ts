import { Global, Module } from "@nestjs/common";

import { PolicyService } from "../../common/auth";
import { AuthController, AuthSessionController } from "./auth.controller";
import { AuthService } from "./auth.service";

/**
 * Global because AuthGuard is registered application-wide and therefore needs
 * AuthService injectable everywhere, not only inside modules that import this
 * one. PolicyService is exported alongside it so domain modules can run ABAC
 * checks without re-providing it.
 */
@Global()
@Module({
  controllers: [AuthController, AuthSessionController],
  providers: [AuthService, PolicyService],
  exports: [AuthService, PolicyService],
})
export class AuthModule {}
