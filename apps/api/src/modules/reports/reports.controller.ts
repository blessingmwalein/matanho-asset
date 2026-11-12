import { Body, Controller, Get, NotFoundException, Param, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { P, generateStatementSchema } from '@nexus/shared';
import { AuditService } from '../../common/audit/audit.service';
import { Perms } from '../../common/auth/decorators';
import { Ctx, RequestContext } from '../../common/auth/request-context';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ApiZodBody, ZodPipe } from '../../common/zod/zod.pipe';
import { REPORT_BY_TYPE, REPORT_DEFINITIONS, type ReportResult } from './report-definitions';
import { toCsv, toHtml } from './report-output';
import { StatementsService } from './statements.service';

const runQuery = z.object({
  format: z.enum(['json', 'csv', 'html']).default('json'),
  portfolioId: z.string().optional(),
  investorId: z.string().optional(),
  status: z.string().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

@ApiTags('Reports')
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly statements: StatementsService,
  ) {}

  /** Catalogue of available reports and the parameters each accepts. */
  @Get()
  @Perms(P.REPORTS_READ)
  catalogue() {
    return REPORT_DEFINITIONS.map((d) => ({ type: d.type, title: d.title, description: d.description, group: d.group, params: d.params ?? [] }));
  }

  /**
   * Generate an investor statement from stored portfolio records. Created as a DRAFT document;
   * approval (independent checker) and publication use the /documents endpoints.
   */
  @Post('investor-statements')
  @Perms(P.REPORTS_GENERATE)
  @ApiZodBody(generateStatementSchema)
  generateStatement(@Ctx() ctx: RequestContext, @Body(new ZodPipe(generateStatementSchema)) body: z.infer<typeof generateStatementSchema>) {
    return this.statements.generate(ctx, body);
  }

  /** Select options for report / document forms (investors and portfolios). Declared before `:type` so it is not shadowed. */
  @Get('options')
  @Perms(P.REPORTS_READ)
  async options() {
    const [investors, portfolios] = await Promise.all([
      this.prisma.investor.findMany({ select: { id: true, ref: true, legalName: true }, orderBy: { legalName: 'asc' } }),
      this.prisma.portfolio.findMany({ select: { id: true, ref: true, name: true, investorId: true, investor: { select: { legalName: true } } }, orderBy: { ref: 'asc' } }),
    ]);
    return {
      investors: investors.map((i) => ({ id: i.id, ref: i.ref, name: i.legalName })),
      portfolios: portfolios.map((p) => ({ id: p.id, ref: p.ref, name: p.name, investorId: p.investorId, investorName: p.investor.legalName })),
    };
  }

  /** Run a report as JSON (preview), CSV (operational export) or printable HTML. Data comes straight from the database. */
  @Get(':type')
  @Perms(P.REPORTS_READ)
  @ApiQuery({ name: 'format', required: false, enum: ['json', 'csv', 'html'] })
  async run(@Ctx() ctx: RequestContext, @Param('type') type: string, @Query(new ZodPipe(runQuery)) q: z.infer<typeof runQuery>, @Res({ passthrough: true }) res: Response) {
    const def = REPORT_BY_TYPE.get(type);
    if (!def) throw new NotFoundException('Unknown report');
    const built = await def.build(this.prisma, q);
    const result: ReportResult = {
      type: def.type,
      title: def.title,
      description: def.description,
      generatedAt: new Date().toISOString(),
      params: { portfolioId: q.portfolioId, investorId: q.investorId, status: q.status, from: q.from, to: q.to },
      ...built,
    };
    if (q.format !== 'json') {
      await this.audit.record({ ctx, entityType: 'Report', entityId: type, action: q.format === 'csv' ? 'REPORT_EXPORTED_CSV' : 'REPORT_PRINTED', metadata: { rows: result.rows.length, params: result.params } });
    }
    if (q.format === 'csv') {
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${def.type}-${result.generatedAt.slice(0, 10)}.csv"`,
        'Cache-Control': 'private, no-store',
      });
      return new StreamableFile(Buffer.from(toCsv(result), 'utf8'));
    }
    if (q.format === 'html') {
      res.set({
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
        'Cache-Control': 'private, no-store',
      });
      return new StreamableFile(Buffer.from(toHtml(result), 'utf8'));
    }
    return result;
  }
}
