import {
  Body,
  Controller,
  Get,
  Headers,
  Ip,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiHeader, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import { createDraftSchema, UPLOAD_LIMITS } from '@nexus/shared';
import { Public } from '../../common/auth/decorators';
import { ApiZodBody, ZodPipe } from '../../common/zod/zod.pipe';
import { PublicOnboardingService } from './public-onboarding.service';

const saveSchema = z.object({
  step: z.number().int().min(0).max(5).optional(),
  payload: z.record(z.string(), z.unknown()),
});

const slotSchema = z.object({ slot: z.string().trim().min(1, 'Choose a document slot') });

/** `x-resume-token` header, or `?token=` (used by the same-origin proxy and iframe previews). */
const tokenOf = (header?: string, query?: string) => header || query || undefined;

/**
 * Public investor onboarding API. Every route is @Public (no login) and rate limited; access to a
 * single application is granted only by its resume token. A wrong reference or token is always a 404.
 */
@ApiTags('Public onboarding')
@Controller('public/applications')
export class PublicOnboardingController {
  constructor(private readonly svc: PublicOnboardingService) {}

  @Post()
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiZodBody(createDraftSchema)
  create(@Body(new ZodPipe(createDraftSchema)) body: z.infer<typeof createDraftSchema>, @Ip() ip: string) {
    return this.svc.createDraft(body, ip);
  }

  @Get(':reference')
  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiHeader({ name: 'x-resume-token', required: false })
  @ApiQuery({ name: 'token', required: false })
  get(@Param('reference') reference: string, @Headers('x-resume-token') header?: string, @Query('token') token?: string) {
    return this.svc.get(reference, tokenOf(header, token));
  }

  @Patch(':reference')
  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiHeader({ name: 'x-resume-token', required: false })
  @ApiQuery({ name: 'token', required: false })
  @ApiZodBody(saveSchema)
  save(
    @Param('reference') reference: string,
    @Body(new ZodPipe(saveSchema)) body: z.infer<typeof saveSchema>,
    @Headers('x-resume-token') header?: string,
    @Query('token') token?: string,
  ) {
    return this.svc.save(reference, tokenOf(header, token), body);
  }

  @Post(':reference/documents')
  @Public()
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { slot: { type: 'string' }, file: { type: 'string', format: 'binary' } } } })
  @ApiQuery({ name: 'token', required: false })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: UPLOAD_LIMITS.maxBytes } }))
  upload(
    @Param('reference') reference: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodPipe(slotSchema)) body: z.infer<typeof slotSchema>,
    @Headers('x-resume-token') header?: string,
    @Query('token') token?: string,
  ) {
    return this.svc.uploadDocument(reference, tokenOf(header, token), body.slot, file);
  }

  /** The applicant previews their own upload inline. */
  @Get(':reference/documents/:documentId/content')
  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiQuery({ name: 'token', required: false })
  @ApiQuery({ name: 'version', required: false, type: Number })
  @ApiQuery({ name: 'disposition', required: false, enum: ['inline', 'attachment'] })
  async content(
    @Param('reference') reference: string,
    @Param('documentId') documentId: string,
    @Res({ passthrough: true }) res: Response,
    @Headers('x-resume-token') header?: string,
    @Query('token') token?: string,
    @Query('version') version?: string,
    @Query('disposition') disposition?: string,
  ) {
    const disp = disposition === 'attachment' ? 'attachment' : 'inline';
    const file = await this.svc.documentContent(reference, tokenOf(header, token), documentId, version ? Number(version) : undefined);
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `${disp}; filename="${encodeURIComponent(file.fileName)}"`,
      'Content-Length': String(file.buffer.length),
      'X-Content-Type-Options': 'nosniff',
      'X-Document-Sha256': file.sha256,
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
    });
    return new StreamableFile(file.buffer);
  }

  @Post(':reference/submit')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiHeader({ name: 'x-resume-token', required: false })
  @ApiQuery({ name: 'token', required: false })
  submit(@Param('reference') reference: string, @Headers('x-resume-token') header?: string, @Query('token') token?: string) {
    return this.svc.submit(reference, tokenOf(header, token));
  }
}
