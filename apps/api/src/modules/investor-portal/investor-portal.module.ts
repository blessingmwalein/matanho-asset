import { Module } from '@nestjs/common';
import { InvestorPortalController } from './investor-portal.controller';
import { InvestorPortalService } from './investor-portal.service';

/** Investor portal endpoints (overview, investments, capital, documents, profile, service requests). */
@Module({ controllers: [InvestorPortalController], providers: [InvestorPortalService] })
export class InvestorPortalModule {}
