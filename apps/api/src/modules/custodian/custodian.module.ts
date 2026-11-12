import { Module } from '@nestjs/common';
import { CustodianInternalController, CustodianPortalController } from './custodian.controller';
import { CustodianService } from './custodian.service';

/** Custodian portal (own-org scoped) + internal submissions register. */
@Module({
  controllers: [CustodianPortalController, CustodianInternalController],
  providers: [CustodianService],
  exports: [CustodianService],
})
export class CustodianModule {}
