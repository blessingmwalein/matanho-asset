import { Module } from '@nestjs/common';
import { DashboardController, SearchController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/** Internal dashboard aggregates, sidebar counts and global search. */
@Module({ controllers: [DashboardController, SearchController], providers: [DashboardService], exports: [DashboardService] })
export class DashboardModule {}
