import { Body, Controller, Get, Param, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  COMPANY_SUBMISSION_STATUSES,
  P,
  UPLOAD_LIMITS,
  acceptSubmissionSchema,
  answerQuestionSchema,
  listQuerySchema,
  raiseQuestionSchema,
  requestCorrectionsSchema,
  savePackValuesSchema,
} from '@nexus/shared';
import { OrgTypes, Perms } from '../../common/auth/decorators';
import { Ctx, RequestContext } from '../../common/auth/request-context';
import { ApiListQuery, ApiZodBody, ZodPipe } from '../../common/zod/zod.pipe';
import { CompaniesService, type CompanyListQuery, type SubmissionListQuery } from './companies.service';
import { CompanyPortalService } from './company-portal.service';

const fileInterceptor = FileInterceptor('file', { limits: { fileSize: UPLOAD_LIMITS.maxBytes } });

const dashboardQuery = z.object({ periodId: z.string().optional() });
const uploadMeta = z.object({ key: z.string().min(1, 'Choose the file slot') });
const companyListSchema = listQuerySchema.extend({ status: z.enum(COMPANY_SUBMISSION_STATUSES).optional(), sector: z.string().optional() });
const submissionListSchema = listQuerySchema.extend({
  status: z.enum(COMPANY_SUBMISSION_STATUSES).optional(),
  companyId: z.string().optional(),
  period: z.string().optional(),
});

/** Portfolio-company portal: every read and write is scoped to ctx.companyId (other companies' ids → 404). */
@ApiTags('Company portal')
@Controller('company-portal')
@Perms(P.PORTAL_COMPANY)
@OrgTypes('PORTFOLIO_COMPANY')
export class CompanyPortalController {
  constructor(private readonly svc: CompanyPortalService) {}

  @Get('dashboard')
  dashboard(@Ctx() ctx: RequestContext, @Query(new ZodPipe(dashboardQuery)) q: z.infer<typeof dashboardQuery>) {
    return this.svc.dashboard(ctx, q.periodId);
  }

  @Get('periods')
  periods(@Ctx() ctx: RequestContext) {
    return this.svc.periods(ctx);
  }

  @Get('periods/:id')
  period(@Ctx() ctx: RequestContext, @Param('id') id: string) {
    return this.svc.periodDetail(ctx, id);
  }

  @Put('periods/:id/values')
  @ApiZodBody(savePackValuesSchema)
  saveValues(@Ctx() ctx: RequestContext, @Param('id') id: string, @Body(new ZodPipe(savePackValuesSchema)) body: z.infer<typeof savePackValuesSchema>) {
    return this.svc.saveValues(ctx, id, body.values);
  }

  @Post('periods/:id/files')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, key: { type: 'string' } } } })
  @UseInterceptors(fileInterceptor)
  upload(
    @Ctx() ctx: RequestContext,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodPipe(uploadMeta)) body: z.infer<typeof uploadMeta>,
  ) {
    return this.svc.uploadFile(ctx, id, body.key, file);
  }

  @Post('periods/:id/submit')
  submit(@Ctx() ctx: RequestContext, @Param('id') id: string) {
    return this.svc.submit(ctx, id);
  }

  @Post('questions/:id/answer')
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({ schema: { type: 'object', properties: { answer: { type: 'string' }, file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(fileInterceptor)
  answer(
    @Ctx() ctx: RequestContext,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodPipe(answerQuestionSchema)) body: z.infer<typeof answerQuestionSchema>,
  ) {
    return this.svc.answerQuestion(ctx, id, body.answer, file);
  }
}

/** Internal register and review workspace for portfolio-company reporting. */
@ApiTags('Portfolio companies (internal)')
@Controller()
export class CompaniesController {
  constructor(private readonly svc: CompaniesService) {}

  @Get('companies')
  @Perms(P.COMPANIES_READ)
  @ApiListQuery()
  list(@Query(new ZodPipe(companyListSchema)) q: z.infer<typeof companyListSchema>) {
    return this.svc.list(q as CompanyListQuery);
  }

  @Get('companies/:id')
  @Perms(P.COMPANIES_READ)
  detail(@Param('id') id: string) {
    return this.svc.detail(id);
  }

  @Get('company-submissions')
  @Perms(P.COMPANIES_READ)
  @ApiListQuery()
  submissions(@Query(new ZodPipe(submissionListSchema)) q: z.infer<typeof submissionListSchema>) {
    return this.svc.listSubmissions(q as SubmissionListQuery);
  }

  @Get('company-submissions/options')
  @Perms(P.COMPANIES_READ)
  options() {
    return this.svc.options();
  }

  @Get('company-submissions/:id')
  @Perms(P.COMPANIES_READ)
  submission(@Param('id') id: string) {
    return this.svc.submissionDetail(id);
  }

  @Post('company-submissions/:id/questions')
  @Perms(P.COMPANIES_REVIEW)
  @ApiZodBody(raiseQuestionSchema)
  raise(@Ctx() ctx: RequestContext, @Param('id') id: string, @Body(new ZodPipe(raiseQuestionSchema)) body: z.infer<typeof raiseQuestionSchema>) {
    return this.svc.raiseQuestion(ctx, id, body);
  }

  @Post('company-submissions/:id/request-corrections')
  @Perms(P.COMPANIES_REVIEW)
  @ApiZodBody(requestCorrectionsSchema)
  corrections(@Ctx() ctx: RequestContext, @Param('id') id: string, @Body(new ZodPipe(requestCorrectionsSchema)) body: z.infer<typeof requestCorrectionsSchema>) {
    return this.svc.requestCorrections(ctx, id, body.message);
  }

  @Post('company-submissions/:id/accept')
  @Perms(P.COMPANIES_REVIEW)
  @ApiZodBody(acceptSubmissionSchema)
  accept(@Ctx() ctx: RequestContext, @Param('id') id: string, @Body(new ZodPipe(acceptSubmissionSchema)) body: z.infer<typeof acceptSubmissionSchema>) {
    return this.svc.accept(ctx, id, body.note);
  }
}
