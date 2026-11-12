import { Module } from '@nestjs/common';
import { InvestorsController } from './investors.controller';
import { InvestorsService } from './investors.service';

/** Investor register + investor detail (staff). */
@Module({ controllers: [InvestorsController], providers: [InvestorsService], exports: [InvestorsService] })
export class InvestorsModule {}
