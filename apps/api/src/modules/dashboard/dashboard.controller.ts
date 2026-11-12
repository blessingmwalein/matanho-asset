import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { P } from '@nexus/shared';
import { Authenticated, Perms } from '../../common/auth/decorators';
import { Ctx, RequestContext } from '../../common/auth/request-context';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  /** One call for the whole command centre. Everything is aggregated from the database. */
  @Get('overview')
  @Perms(P.DASHBOARD_VIEW)
  overview() {
    return this.svc.overview();
  }

  /** Sidebar badge counts. */
  @Get('nav-counts')
  @Perms(P.DASHBOARD_VIEW)
  navCounts() {
    return this.svc.navCounts();
  }
}

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly svc: DashboardService) {}

  /** Global staff search. Each category is only searched when the caller holds its read permission. */
  @Get()
  @Authenticated()
  @ApiQuery({ name: 'q', required: true })
  search(@Ctx() ctx: RequestContext, @Query('q') q?: string) {
    return this.svc.search(ctx, q);
  }
}
