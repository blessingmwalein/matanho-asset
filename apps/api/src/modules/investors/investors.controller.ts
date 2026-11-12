import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { P } from '@nexus/shared';
import { AnyPerm, Perms } from '../../common/auth/decorators';
import { Ctx, RequestContext } from '../../common/auth/request-context';
import { ApiListQuery, ApiZodBody, ZodPipe } from '../../common/zod/zod.pipe';
import { InvestorListQuery, InvestorsService, investorListSchema, updateInvestorSchema, UpdateInvestorInput } from './investors.service';

@ApiTags('Investors')
@Controller('investors')
export class InvestorsController {
  constructor(private readonly svc: InvestorsService) {}

  @Get()
  @Perms(P.INVESTORS_READ)
  @ApiListQuery()
  @ApiQuery({ name: 'kycStatus', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'country', required: false })
  @ApiQuery({ name: 'investorType', required: false })
  list(@Query(new ZodPipe(investorListSchema)) q: InvestorListQuery) {
    return this.svc.list(q);
  }

  /** Slim investor list for pickers (declared before `:id`). */
  @Get('options')
  @AnyPerm(P.INVESTORS_READ, P.PORTFOLIOS_READ)
  options() {
    return this.svc.options();
  }

  /** Active internal users for relationship / portfolio manager pickers. */
  @Get('staff-options')
  @AnyPerm(P.INVESTORS_READ, P.PORTFOLIOS_READ, P.ONBOARDING_READ)
  staffOptions() {
    return this.svc.staffOptions();
  }

  @Get(':id')
  @Perms(P.INVESTORS_READ)
  detail(@Param('id') id: string) {
    return this.svc.detail(id);
  }

  @Patch(':id')
  @Perms(P.INVESTORS_MANAGE)
  @ApiZodBody(updateInvestorSchema)
  update(@Ctx() ctx: RequestContext, @Param('id') id: string, @Body(new ZodPipe(updateInvestorSchema)) body: UpdateInvestorInput) {
    return this.svc.update(ctx, id, body);
  }
}
