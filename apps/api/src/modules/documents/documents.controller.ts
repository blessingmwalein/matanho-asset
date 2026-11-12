import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { DOCUMENT_CATEGORIES, DOCUMENT_STATUSES, UPLOAD_LIMITS, approveDocumentSchema, listQuerySchema, P } from '@nexus/shared';
import { AuditService } from '../../common/audit/audit.service';
import { Authenticated, Perms } from '../../common/auth/decorators';
import { Ctx, RequestContext } from '../../common/auth/request-context';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ApiListQuery, ZodPipe } from '../../common/zod/zod.pipe';
import { NotificationsService } from '../notifications/notifications.service';
import { DocumentsService } from './documents.service';

const listSchema = listQuerySchema.extend({
  category: z.enum(DOCUMENT_CATEGORIES).optional(),
  status: z.enum(DOCUMENT_STATUSES).optional(),
  investorId: z.string().optional(),
  portfolioId: z.string().optional(),
  companyId: z.string().optional(),
});

const uploadMetaSchema = z.object({
  title: z.string().trim().min(2, 'Title is required'),
  category: z.enum(DOCUMENT_CATEGORIES),
  investorId: z.string().optional(),
  portfolioId: z.string().optional(),
  companyId: z.string().optional(),
  note: z.string().optional(),
});

const fileInterceptor = FileInterceptor('file', { limits: { fileSize: UPLOAD_LIMITS.maxBytes } });

@ApiTags('Documents')
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly docs: DocumentsService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  @Perms(P.DOCUMENTS_READ)
  @ApiListQuery()
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'status', required: false })
  list(@Query(new ZodPipe(listSchema)) q: z.infer<typeof listSchema>) {
    return this.docs.list(q);
  }

  @Get(':id')
  @Authenticated()
  detail(@Ctx() ctx: RequestContext, @Param('id') id: string) {
    return this.docs.getDetail(id, ctx);
  }

  /** Secure download / inline preview. Access is checked per request; bytes are never publicly addressable. */
  @Get(':id/content')
  @Authenticated()
  @ApiQuery({ name: 'version', required: false, type: Number })
  @ApiQuery({ name: 'disposition', required: false, enum: ['inline', 'attachment'] })
  async content(
    @Ctx() ctx: RequestContext,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
    @Query('version') version?: string,
    @Query('disposition') disposition?: string,
  ) {
    const disp = disposition === 'inline' ? 'inline' : 'attachment';
    const file = await this.docs.getContent(id, ctx, version ? Number(version) : undefined, disp);
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `${disp}; filename="${encodeURIComponent(file.fileName)}"`,
      'Content-Length': String(file.buffer.length),
      'X-Content-Type-Options': 'nosniff',
      'X-Document-Sha256': file.sha256,
      'Cache-Control': 'private, no-store',
      // generated HTML (statements) must never run scripts when previewed
      ...(file.mimeType === 'text/html' ? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox" } : {}),
    });
    return new StreamableFile(file.buffer);
  }

  @Post()
  @Perms(P.DOCUMENTS_MANAGE)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, title: { type: 'string' }, category: { type: 'string' }, investorId: { type: 'string' }, portfolioId: { type: 'string' }, companyId: { type: 'string' } } } })
  @UseInterceptors(fileInterceptor)
  async upload(@Ctx() ctx: RequestContext, @UploadedFile() file: Express.Multer.File, @Body(new ZodPipe(uploadMetaSchema)) meta: z.infer<typeof uploadMetaSchema>) {
    if (file?.mimetype === 'text/html') throw new BadRequestException('HTML uploads are not accepted');
    return this.docs.create(
      file,
      {
        title: meta.title,
        category: meta.category,
        investorId: meta.investorId,
        portfolioId: meta.portfolioId,
        companyId: meta.companyId,
        audience: 'INTERNAL',
      },
      { ctx },
    );
  }

  /** DOC-002: replacing a file keeps every earlier version. */
  @Post(':id/versions')
  @Authenticated()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(fileInterceptor)
  addVersion(@Ctx() ctx: RequestContext, @Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Body('note') note?: string) {
    if (file?.mimetype === 'text/html') throw new BadRequestException('HTML uploads are not accepted');
    return this.docs.addVersion(id, file, { ctx }, note);
  }

  /**
   * Maker–checker (UAT RPT-004 / IAM-004): the approver must be a different user than the
   * document's creator. Publication is only possible after approval.
   */
  @Post(':id/approve')
  @Perms(P.REPORTS_APPROVE)
  async approve(@Ctx() ctx: RequestContext, @Param('id') id: string, @Body(new ZodPipe(approveDocumentSchema)) body: z.infer<typeof approveDocumentSchema>) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new BadRequestException('Document not found');
    if (doc.status !== 'DRAFT' && doc.status !== 'UNDER_REVIEW') throw new ConflictException(`Only draft documents can be approved (current status: ${doc.status})`);
    if (doc.createdById && doc.createdById === ctx.userId) {
      throw new ForbiddenException('Independent approval required: you generated this document and cannot approve it.');
    }
    const updated = await this.prisma.document.update({ where: { id }, data: { status: 'APPROVED', approvedById: ctx.userId, approvedAt: new Date() } });
    await this.audit.record({ ctx, entityType: 'Document', entityId: id, action: 'DOCUMENT_APPROVED', before: { status: doc.status }, after: { status: 'APPROVED', ref: doc.ref }, metadata: { note: body.note } });
    return updated;
  }

  @Post(':id/publish')
  @Perms(P.REPORTS_PUBLISH)
  async publish(@Ctx() ctx: RequestContext, @Param('id') id: string) {
    const doc = await this.prisma.document.findUnique({ where: { id }, include: { investor: true } });
    if (!doc) throw new BadRequestException('Document not found');
    if (doc.status !== 'APPROVED') throw new ConflictException('A document must be approved by a checker before it can be published.');
    if (!doc.investorId || !doc.investor) throw new BadRequestException('Only investor-linked documents can be published to the investor portal');
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.document.update({
        where: { id },
        data: { status: 'PUBLISHED', audience: 'INVESTOR', publishedAt: new Date(), publishedById: ctx.userId },
      });
      await this.notifications.notify(
        {
          organisationId: doc.investor!.organisationId,
          type: 'DOCUMENT_PUBLISHED',
          title: `New document available: ${doc.title}`,
          body: `${doc.ref} has been published to your investor portal.`,
          link: `/portal/documents?doc=${doc.id}`,
          entityType: 'Document',
          entityId: doc.id,
        },
        tx,
      );
      await this.audit.record(
        { ctx, entityType: 'Document', entityId: id, action: 'DOCUMENT_PUBLISHED', before: { status: doc.status }, after: { status: 'PUBLISHED', investorId: doc.investorId, ref: doc.ref } },
        tx,
      );
      return u;
    });
    return updated;
  }
}
