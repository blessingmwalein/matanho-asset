import { Module } from '@nestjs/common';
import { CompaniesController, CompanyPortalController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { CompanyPortalService } from './company-portal.service';

/** Portfolio-company portal (company-scoped) + internal register and review workspace. */
@Module({
  controllers: [CompanyPortalController, CompaniesController],
  providers: [CompanyPortalService, CompaniesService],
  exports: [CompanyPortalService, CompaniesService],
})
export class CompaniesModule {}
