import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { StatementsService } from './statements.service';

/** Tabular reports (JSON / CSV / printable HTML) and investor statement generation. */
@Module({ controllers: [ReportsController], providers: [StatementsService] })
export class ReportsModule {}
