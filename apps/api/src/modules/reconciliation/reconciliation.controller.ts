import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { addItemNoteSchema, listQuerySchema, P, RECON_ITEM_KINDS, RECON_STATUSES, resolveExceptionSchema, runReconciliationSchema } from '@nexus/shared';
import { Perms } from '../../common/auth/decorators';
import { Ctx, RequestContext } from '../../common/auth/request-context';
import { ApiListQuery, ApiZodBody, ZodPipe } from '../../common/zod/zod.pipe';
import { ReconciliationEngine } from './reconciliation.engine';
import { ReconciliationService, type ItemListQuery } from './reconciliation.service';

const itemListSchema = listQuerySchema.extend({
  status: z.enum(RECON_STATUSES).optional(),
  kind: z.enum(RECON_ITEM_KINDS).optional(),
  portfolioId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  includeSuperseded: z.enum(['true', 'false']).optional(),
});

@ApiTags('Reconciliation')
@Controller('reconciliation')
export class ReconciliationController {
  constructor(
    private readonly svc: ReconciliationService,
    private readonly engine: ReconciliationEngine,
  ) {}

  @Get('summary')
  @Perms(P.RECON_READ)
  summary() {
    return this.svc.summary();
  }

  @Get('items')
  @Perms(P.RECON_READ)
  @ApiListQuery()
  items(@Query(new ZodPipe(itemListSchema)) q: z.infer<typeof itemListSchema>) {
    return this.svc.list(q as ItemListQuery);
  }

  @Get('items/:id')
  @Perms(P.RECON_READ)
  item(@Param('id') id: string) {
    return this.svc.detail(id);
  }

  /** Idempotent matching run over every current custodian record that is not yet reconciled or is unresolved. */
  @Post('run')
  @Perms(P.RECON_RUN)
  @ApiZodBody(runReconciliationSchema)
  run(@Ctx() ctx: RequestContext, @Body(new ZodPipe(runReconciliationSchema)) body: z.infer<typeof runReconciliationSchema>) {
    return this.engine.run(ctx, body.businessDate);
  }

  @Post('exceptions/:id/resolve')
  @Perms(P.RECON_RESOLVE)
  @ApiZodBody(resolveExceptionSchema)
  resolve(@Ctx() ctx: RequestContext, @Param('id') id: string, @Body(new ZodPipe(resolveExceptionSchema)) body: z.infer<typeof resolveExceptionSchema>) {
    return this.svc.resolveException(ctx, id, body.note);
  }

  @Post('items/:id/notes')
  @Perms(P.RECON_RESOLVE)
  @ApiZodBody(addItemNoteSchema)
  note(@Ctx() ctx: RequestContext, @Param('id') id: string, @Body(new ZodPipe(addItemNoteSchema)) body: z.infer<typeof addItemNoteSchema>) {
    return this.svc.addNote(ctx, id, body.note);
  }
}
