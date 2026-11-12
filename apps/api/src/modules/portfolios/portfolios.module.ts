import { Module } from '@nestjs/common';
import { HoldingsService } from './holdings.service';
import { HoldingsController, PortfoliosController, SecuritiesController, TransactionsController } from './portfolios.controller';
import { PortfoliosService } from './portfolios.service';
import { TransactionsService } from './transactions.service';

/** Portfolios, holdings, securities, investment transactions (staff). */
@Module({
  controllers: [PortfoliosController, SecuritiesController, HoldingsController, TransactionsController],
  providers: [PortfoliosService, HoldingsService, TransactionsService],
  exports: [PortfoliosService, HoldingsService, TransactionsService],
})
export class PortfoliosModule {}
