import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import {
  P,
  createHoldingSchema,
  createPortfolioSchema,
  createSecuritySchema,
  recordTransactionSchema,
  updateHoldingSchema,
  updatePortfolioSchema,
} from '@nexus/shared';
import { AnyPerm, Perms } from '../../common/auth/decorators';
import { Ctx, RequestContext } from '../../common/auth/request-context';
import { ApiListQuery, ApiZodBody, ZodPipe } from '../../common/zod/zod.pipe';
import { HoldingListQuery, HoldingsService, holdingListSchema } from './holdings.service';
import { PortfolioListQuery, PortfoliosService, SecurityListQuery, portfolioListSchema, securityListSchema } from './portfolios.service';
import { TransactionListQuery, TransactionsService, transactionListSchema } from './transactions.service';

@ApiTags('Portfolios')
@Controller('portfolios')
export class PortfoliosController {
  constructor(private readonly svc: PortfoliosService) {}

  @Get()
  @Perms(P.PORTFOLIOS_READ)
  @ApiListQuery()
  @ApiQuery({ name: 'investorId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'type', required: false })
  list(@Query(new ZodPipe(portfolioListSchema)) q: PortfolioListQuery) {
    return this.svc.list(q);
  }

  /** Slim list for pickers (declared before `:id`). */
  @Get('options')
  @AnyPerm(P.PORTFOLIOS_READ, P.TRANSACTIONS_READ)
  options() {
    return this.svc.options();
  }

  @Get(':id')
  @Perms(P.PORTFOLIOS_READ)
  detail(@Param('id') id: string) {
    return this.svc.detail(id);
  }

  @Post()
  @Perms(P.PORTFOLIOS_MANAGE)
  @ApiZodBody(createPortfolioSchema)
  create(@Ctx() ctx: RequestContext, @Body(new ZodPipe(createPortfolioSchema)) body: z.infer<typeof createPortfolioSchema>) {
    return this.svc.create(ctx, body);
  }

  @Patch(':id')
  @Perms(P.PORTFOLIOS_MANAGE)
  @ApiZodBody(updatePortfolioSchema)
  update(@Ctx() ctx: RequestContext, @Param('id') id: string, @Body(new ZodPipe(updatePortfolioSchema)) body: z.infer<typeof updatePortfolioSchema>) {
    return this.svc.update(ctx, id, body);
  }
}

@ApiTags('Securities')
@Controller('securities')
export class SecuritiesController {
  constructor(private readonly svc: PortfoliosService) {}

  @Get()
  @AnyPerm(P.PORTFOLIOS_READ, P.TRANSACTIONS_READ)
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'assetClass', required: false })
  list(@Query(new ZodPipe(securityListSchema)) q: SecurityListQuery) {
    return this.svc.listSecurities(q);
  }

  @Post()
  @AnyPerm(P.HOLDINGS_MANAGE, P.TRANSACTIONS_RECORD, P.PORTFOLIOS_MANAGE)
  @ApiZodBody(createSecuritySchema)
  create(@Ctx() ctx: RequestContext, @Body(new ZodPipe(createSecuritySchema)) body: z.infer<typeof createSecuritySchema>) {
    return this.svc.createSecurity(ctx, body);
  }
}

@ApiTags('Holdings')
@Controller()
export class HoldingsController {
  constructor(private readonly svc: HoldingsService) {}

  @Get('holdings')
  @Perms(P.PORTFOLIOS_READ)
  @ApiListQuery()
  @ApiQuery({ name: 'portfolioId', required: false })
  @ApiQuery({ name: 'assetClass', required: false })
  @ApiQuery({ name: 'status', required: false })
  list(@Query(new ZodPipe(holdingListSchema)) q: HoldingListQuery) {
    return this.svc.list(q);
  }

  @Post('portfolios/:id/holdings')
  @Perms(P.HOLDINGS_MANAGE)
  @ApiZodBody(createHoldingSchema)
  create(@Ctx() ctx: RequestContext, @Param('id') portfolioId: string, @Body(new ZodPipe(createHoldingSchema)) body: z.infer<typeof createHoldingSchema>) {
    return this.svc.create(ctx, portfolioId, body);
  }

  @Patch('holdings/:id')
  @Perms(P.HOLDINGS_MANAGE)
  @ApiZodBody(updateHoldingSchema)
  update(@Ctx() ctx: RequestContext, @Param('id') id: string, @Body(new ZodPipe(updateHoldingSchema)) body: z.infer<typeof updateHoldingSchema>) {
    return this.svc.update(ctx, id, body);
  }

  @Delete('holdings/:id')
  @Perms(P.HOLDINGS_MANAGE)
  remove(@Ctx() ctx: RequestContext, @Param('id') id: string) {
    return this.svc.remove(ctx, id);
  }

  @Post('holdings/:id/confirm')
  @Perms(P.HOLDINGS_MANAGE)
  confirm(@Ctx() ctx: RequestContext, @Param('id') id: string) {
    return this.svc.confirm(ctx, id);
  }
}

@ApiTags('Investment transactions')
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly svc: TransactionsService) {}

  @Get()
  @Perms(P.TRANSACTIONS_READ)
  @ApiListQuery()
  @ApiQuery({ name: 'portfolioId', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'side', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  list(@Query(new ZodPipe(transactionListSchema)) q: TransactionListQuery) {
    return this.svc.list(q);
  }

  @Get(':id')
  @Perms(P.TRANSACTIONS_READ)
  detail(@Param('id') id: string) {
    return this.svc.detail(id);
  }

  /** Accepts an `Idempotency-Key` header (handled globally) so retries / double clicks never post twice. */
  @Post()
  @Perms(P.TRANSACTIONS_RECORD)
  @ApiZodBody(recordTransactionSchema)
  record(@Ctx() ctx: RequestContext, @Body(new ZodPipe(recordTransactionSchema)) body: z.infer<typeof recordTransactionSchema>) {
    return this.svc.record(ctx, body);
  }
}
