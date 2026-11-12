import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { P, addNoteSchema, approveApplicationSchema, rejectApplicationSchema, reopenApplicationSchema, requestInfoSchema } from '@nexus/shared';
import { Perms } from '../../common/auth/decorators';
import { Ctx, RequestContext } from '../../common/auth/request-context';
import { ApiListQuery, ApiZodBody, ZodPipe } from '../../common/zod/zod.pipe';
import { ApplicationListQuery, ApplicationsService, applicationListSchema } from './applications.service';

/** Staff onboarding review. The applicant-facing (public) API lives in the public-onboarding module. */
@ApiTags('Applications (staff review)')
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly svc: ApplicationsService) {}

  @Get()
  @Perms(P.ONBOARDING_READ)
  @ApiListQuery()
  @ApiQuery({ name: 'status', required: false })
  list(@Query(new ZodPipe(applicationListSchema)) q: ApplicationListQuery) {
    return this.svc.list(q);
  }

  @Get('summary')
  @Perms(P.ONBOARDING_READ)
  summary() {
    return this.svc.summary();
  }

  @Get(':id')
  @Perms(P.ONBOARDING_READ)
  detail(@Param('id') id: string) {
    return this.svc.detail(id);
  }

  @Post(':id/start-review')
  @Perms(P.ONBOARDING_REVIEW)
  startReview(@Ctx() ctx: RequestContext, @Param('id') id: string) {
    return this.svc.startReview(ctx, id);
  }

  @Post(':id/notes')
  @Perms(P.ONBOARDING_REVIEW)
  @ApiZodBody(addNoteSchema)
  addNote(@Ctx() ctx: RequestContext, @Param('id') id: string, @Body(new ZodPipe(addNoteSchema)) body: z.infer<typeof addNoteSchema>) {
    return this.svc.addNote(ctx, id, body);
  }

  @Post(':id/request-info')
  @Perms(P.ONBOARDING_REVIEW)
  @ApiZodBody(requestInfoSchema)
  requestInfo(@Ctx() ctx: RequestContext, @Param('id') id: string, @Body(new ZodPipe(requestInfoSchema)) body: z.infer<typeof requestInfoSchema>) {
    return this.svc.requestInfo(ctx, id, body);
  }

  @Post(':id/approve')
  @Perms(P.ONBOARDING_APPROVE)
  @ApiZodBody(approveApplicationSchema)
  approve(@Ctx() ctx: RequestContext, @Param('id') id: string, @Body(new ZodPipe(approveApplicationSchema)) body: z.infer<typeof approveApplicationSchema>) {
    return this.svc.approve(ctx, id, body);
  }

  @Post(':id/reject')
  @Perms(P.ONBOARDING_APPROVE)
  @ApiZodBody(rejectApplicationSchema)
  reject(@Ctx() ctx: RequestContext, @Param('id') id: string, @Body(new ZodPipe(rejectApplicationSchema)) body: z.infer<typeof rejectApplicationSchema>) {
    return this.svc.reject(ctx, id, body);
  }

  @Post(':id/reopen')
  @Perms(P.ONBOARDING_APPROVE)
  @ApiZodBody(reopenApplicationSchema)
  reopen(@Ctx() ctx: RequestContext, @Param('id') id: string, @Body(new ZodPipe(reopenApplicationSchema)) body: z.infer<typeof reopenApplicationSchema>) {
    return this.svc.reopen(ctx, id, body);
  }
}
