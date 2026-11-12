import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { acknowledgeCapitalCallSchema, P, serviceRequestSchema } from '@nexus/shared';
import { OrgTypes, Perms } from '../../common/auth/decorators';
import { Ctx, RequestContext } from '../../common/auth/request-context';
import { ApiZodBody, ZodPipe } from '../../common/zod/zod.pipe';
import { InvestorPortalService } from './investor-portal.service';

/**
 * Investor portal API. Class-level policy: investor organisations with the portal permission only.
 * Every query in the service is scoped by `ctx.investorId`; out-of-scope ids are 404s.
 */
@ApiTags('Investor portal')
@Controller('investor-portal')
@Perms(P.PORTAL_INVESTOR)
@OrgTypes('INVESTOR')
export class InvestorPortalController {
  constructor(private readonly svc: InvestorPortalService) {}

  @Get('accounts')
  accounts(@Ctx() ctx: RequestContext) {
    return this.svc.accounts(ctx);
  }

  @Get('overview')
  @ApiQuery({ name: 'accountId', required: false })
  overview(@Ctx() ctx: RequestContext, @Query('accountId') accountId?: string) {
    return this.svc.overview(ctx, accountId);
  }

  @Get('investments')
  @ApiQuery({ name: 'accountId', required: false })
  investments(@Ctx() ctx: RequestContext, @Query('accountId') accountId?: string) {
    return this.svc.investments(ctx, accountId);
  }

  @Get('investments/:kind/:id')
  investment(@Ctx() ctx: RequestContext, @Param('kind') kind: string, @Param('id') id: string) {
    return this.svc.investmentDetail(ctx, kind, id);
  }

  @Get('capital')
  @ApiQuery({ name: 'accountId', required: false })
  capital(@Ctx() ctx: RequestContext, @Query('accountId') accountId?: string) {
    return this.svc.capital(ctx, accountId);
  }

  @Post('capital-calls/:id/acknowledge')
  @ApiZodBody(acknowledgeCapitalCallSchema)
  acknowledge(@Ctx() ctx: RequestContext, @Param('id') id: string, @Body(new ZodPipe(acknowledgeCapitalCallSchema)) body: z.infer<typeof acknowledgeCapitalCallSchema>) {
    return this.svc.acknowledge(ctx, id, body.note);
  }

  @Get('documents')
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'accountId', required: false })
  documents(@Ctx() ctx: RequestContext, @Query('q') q?: string, @Query('type') type?: string, @Query('accountId') accountId?: string) {
    return this.svc.documents(ctx, { q, type, accountId });
  }

  @Get('profile')
  profile(@Ctx() ctx: RequestContext) {
    return this.svc.profile(ctx);
  }

  @Post('service-requests')
  @ApiZodBody(serviceRequestSchema)
  serviceRequest(@Ctx() ctx: RequestContext, @Body(new ZodPipe(serviceRequestSchema)) body: z.infer<typeof serviceRequestSchema>) {
    return this.svc.serviceRequest(ctx, body);
  }
}
