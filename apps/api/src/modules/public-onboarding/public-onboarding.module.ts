import { Module } from '@nestjs/common';
import { PublicOnboardingController } from './public-onboarding.controller';
import { PublicOnboardingService } from './public-onboarding.service';

/** Public 6-step investor application API (draft / resume / documents / submit). All routes are @Public and rate limited. */
@Module({ controllers: [PublicOnboardingController], providers: [PublicOnboardingService] })
export class PublicOnboardingModule {}
