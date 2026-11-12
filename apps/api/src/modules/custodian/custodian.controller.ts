import { Body, Controller, Get, Param, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { RECON_STATUSES, UPLOAD_LIMITS, dayEndApiSchema, executionCorrectionSchema, executionSchema, listQuerySchema, P } from '@nexus/shared';
import { OrgTypes, Perms } from '../../common/auth/decorators';
import { Ctx, RequestContext } from '../../common/auth/request-context';
import { ApiListQuery, ApiZodBody, ZodPipe } from '../../common/zod/zod.pipe';
import { CustodianService, type SubmissionListQuery } from './custodian.service';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date');

const submissionListSchema = listQuerySchema.extend({
  kind: z.enum(['EXECUTION', 'DAY_END']).optional(),
  reconStatus: z.enum(RECON_STATUSES).optional(),
  accountId: z.string().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  includeSuperseded: z.enum(['true', 'false']).optional(),
});
const internalListSchema = submissionListSchema.extend({ custodianId: z.string().optional() });

/** Multipart day-end fields arrive as strings; extend the shared API schema with the correction flag. */
const dayEndMultipartSchema = dayEndApiSchema.extend({
  correction: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((v) => v === true || v === 'true'),
  correctionReason: z.string().trim().optional(),
});

const fileInterceptor = FileInterceptor('file', { limits: { fileSize: UPLOAD_LIMITS.maxBytes } });

/** Custodian portal: every query is scoped to accounts of the caller's own custodian organisation. */
@ApiTags('Custodian portal')
@Controller('custodian')
@Perms(P.PORTAL_CUSTODIAN)
@OrgTypes('CUSTODIAN')
export class CustodianPortalController {
  constructor(private readonly svc: CustodianService) {}

  @Get('accounts')
  accounts(@Ctx() ctx: RequestContext) {
    return this.svc.accounts(ctx);
  }

  @Get('securities')
  securities() {
    return this.svc.securities();
  }

  @Get('summary')
  summary(@Ctx() ctx: RequestContext) {
    return this.svc.summary(ctx);
  }

  @Post('executions')
  @ApiZodBody(executionSchema)
  submitExecution(@Ctx() ctx: RequestContext, @Body(new ZodPipe(executionSchema)) body: z.infer<typeof executionSchema>) {
    return this.svc.submitExecution(ctx, body);
  }

  @Post('executions/:id/corrections')
  @ApiZodBody(executionCorrectionSchema)
  correct(
    @Ctx() ctx: RequestContext,
    @Param('id') id: string,
    @Body(new ZodPipe(executionCorrectionSchema)) body: z.infer<typeof executionCorrectionSchema>,
  ) {
    return this.svc.correctExecution(ctx, id, body);
  }

  @Post('day-end')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        statementDate: { type: 'string' },
        custodianAccountId: { type: 'string' },
        closingCash: { type: 'number' },
        currency: { type: 'string' },
        holdingsMarketValue: { type: 'number' },
        tradeCount: { type: 'integer' },
        controlNote: { type: 'string' },
        correction: { type: 'boolean' },
        correctionReason: { type: 'string' },
      },
    },
  })
  @UseInterceptors(fileInterceptor)
  submitDayEnd(
    @Ctx() ctx: RequestContext,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodPipe(dayEndMultipartSchema)) body: z.infer<typeof dayEndMultipartSchema>,
  ) {
    return this.svc.submitDayEnd(ctx, body, file);
  }

  @Get('submissions')
  @ApiListQuery()
  list(@Ctx() ctx: RequestContext, @Query(new ZodPipe(submissionListSchema)) q: z.infer<typeof submissionListSchema>) {
    return this.svc.list(ctx.orgId, q as SubmissionListQuery);
  }

  @Get('submissions/:kind/:id')
  detail(@Ctx() ctx: RequestContext, @Param('kind') kind: string, @Param('id') id: string) {
    return this.svc.detail(ctx.orgId, kind, id);
  }
}

/** Internal view of every custodian submission (operations / read-only staff). */
@ApiTags('Custodian submissions (internal)')
@Controller('custodian-submissions')
export class CustodianInternalController {
  constructor(private readonly svc: CustodianService) {}

  @Get()
  @Perms(P.CUSTODIAN_READ)
  @ApiListQuery()
  list(@Query(new ZodPipe(internalListSchema)) q: z.infer<typeof internalListSchema>) {
    return this.svc.list(undefined, q as SubmissionListQuery);
  }

  @Get('options')
  @Perms(P.CUSTODIAN_READ)
  options() {
    return this.svc.options();
  }

  @Get(':kind/:id')
  @Perms(P.CUSTODIAN_READ)
  detail(@Param('kind') kind: string, @Param('id') id: string) {
    return this.svc.detail(undefined, kind, id);
  }
}
