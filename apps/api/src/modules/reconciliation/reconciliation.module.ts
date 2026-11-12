import { Module } from '@nestjs/common';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationEngine } from './reconciliation.engine';
import { ReconciliationService } from './reconciliation.service';

/** Reconciliation runs, items, exceptions (matching engine + resolution workflow). */
@Module({
  controllers: [ReconciliationController],
  providers: [ReconciliationService, ReconciliationEngine],
  exports: [ReconciliationService, ReconciliationEngine],
})
export class ReconciliationModule {}
