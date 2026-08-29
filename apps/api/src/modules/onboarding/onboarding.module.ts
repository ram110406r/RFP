import { Module } from "@nestjs/common";
import { OnboardingController } from "./onboarding.controller";
import { OnboardingService } from "./onboarding.service";
import { OrganizationsModule } from "../organizations/organizations.module";
@Module({ imports: [OrganizationsModule], controllers: [OnboardingController], providers: [OnboardingService] })
export class OnboardingModule {}
