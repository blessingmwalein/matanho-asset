import { BadRequestException, ForbiddenException, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import {
  UPLOAD_LIMITS,
  type DocumentAudience,
  type DocumentCategory,
  type DocumentStatus,
  type ListQuery,
} from '@nexus/shared';
import { AuditService } from '../../common/audit/audit.service';
import { RequestContext, isStaff } from '../../common/auth/request-context';
import { buildOrderBy, pageArgs, paged } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ReferenceService } from '../../common/references/reference.service';
import { StorageService } from '../../common/storage/storage.service';

export interface IncomingFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface DocumentMeta {
  title: string;
  category: DocumentCategory;
  status?: DocumentStatus;
  audience?: DocumentAudience;
  ownerOrgId?: string | null;
  investorId?: string | null;
  portfolioId?: string | null;
  companyId?: string | null;
  applicationId?: string | null;
  submissionId?: string | null;
  fundId?: string | null;
  capitalCallId?: string | null;
  requirementKey?: string | null;
  reportDate?: Date | null;
}

/** Actor for writes. `ctx` is null for public applicants / seed (use `name`). */
export interface Actor {
  ctx?: RequestContext | null;
  name?: string;
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  csv: 'text/csv',
  txt: 'text/plain',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  html: 'text/html',
};

const DOC_INCLUDE = {
  versions: { orderBy: { versionNo: 'desc' as const } },
  investor: { select: { id: true, ref: true, legalName: true } },
  portfolio: { select: { id: true, ref: true, name: true } },
  company: { select: { id: true, name: true } },
} satisfies Prisma.DocumentInclude;

/**
 * Shared document service for ALL portals. Stores real bytes (never just a filename),
 * keeps every version, records SHA-256, and enforces access in one place (`canAccess`).
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly refs: ReferenceService,
    private readonly audit: AuditService,
  ) {}

  // ── validation ────────────────────────────────────────────────────────────
  validateFile(file: IncomingFile | undefined): IncomingFile {
    if (!file || !file.buffer?.length) throw new BadRequestException('A file is required');
    if (file.size > UPLOAD_LIMITS.maxBytes) {
      throw new PayloadTooLargeException(`File exceeds the ${(UPLOAD_LIMITS.maxBytes / 1024 / 1024).toFixed(0)} MB limit`);
    }
    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    const mime = (UPLOAD_LIMITS.allowedMime as readonly string[]).includes(file.mimetype) ? file.mimetype : MIME_BY_EXT[ext];
    if (!mime || !(UPLOAD_LIMITS.allowedMime as readonly string[]).includes(mime)) {
      throw new BadRequestException('Unsupported file type. Upload PDF, image, CSV, Excel, Word or text files.');
    }
    // magic-byte sanity check for the two types most often spoofed
    const head = file.buffer.subarray(0, 5).toString('latin1');
    if (mime === 'application/pdf' && !head.startsWith('%PDF')) throw new BadRequestException('File content is not a valid PDF');
    if (mime === 'image/png' && file.buffer[0] !== 0x89) throw new BadRequestException('File content is not a valid PNG');
    return { ...file, mimetype: mime };
  }

  // ── writes ────────────────────────────────────────────────────────────────
  /** Create a document with its first version. */
  async create(file: IncomingFile, meta: DocumentMeta, actor: Actor = {}) {
    const f = this.validateFile(file);
    const ref = await this.refs.document();
    const doc = await this.prisma.document.create({
      data: {
        ref,
        title: meta.title,
        category: meta.category,
        status: meta.status ?? 'UPLOADED',
        audience: meta.audience ?? 'INTERNAL',
        ownerOrgId: meta.ownerOrgId ?? null,
        investorId: meta.investorId ?? null,
        portfolioId: meta.portfolioId ?? null,
        companyId: meta.companyId ?? null,
        applicationId: meta.applicationId ?? null,
        submissionId: meta.submissionId ?? null,
        fundId: meta.fundId ?? null,
        capitalCallId: meta.capitalCallId ?? null,
        requirementKey: meta.requirementKey ?? null,
        reportDate: meta.reportDate ?? null,
        createdById: actor.ctx?.userId ?? null,
        currentVersionNo: 0,
      },
    });
    await this.writeVersion(doc.id, f, actor, 'Initial upload');
    await this.audit.record({
      ctx: actor.ctx,
      entityType: 'Document',
      entityId: doc.id,
      action: 'DOCUMENT_UPLOADED',
      after: { ref, title: meta.title, category: meta.category, fileName: f.originalname },
    });
    return this.prisma.document.findUniqueOrThrow({ where: { id: doc.id }, include: DOC_INCLUDE });
  }

  /** Add a new version (UAT DOC-002: replacement preserves history). */
  async addVersion(documentId: string, file: IncomingFile, actor: Actor, note?: string) {
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException('Document not found');
    if (actor.ctx && !this.canWrite(actor.ctx, doc)) throw new ForbiddenException('You cannot replace this document');
    const f = this.validateFile(file);
    const version = await this.writeVersion(documentId, f, actor, note);
    await this.audit.record({
      ctx: actor.ctx,
      entityType: 'Document',
      entityId: documentId,
      action: 'DOCUMENT_VERSION_ADDED',
      after: { ref: doc.ref, versionNo: version.versionNo, fileName: f.originalname, sha256: version.sha256 },
    });
    return this.getDetail(documentId);
  }

  /** Persist bytes via the active adapter and record the version row. */
  async writeVersion(documentId: string, file: IncomingFile, actor: Actor, note?: string) {
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const last = await this.prisma.documentVersion.findFirst({ where: { documentId }, orderBy: { versionNo: 'desc' } });
    const versionNo = (last?.versionNo ?? 0) + 1;
    const safeName = file.originalname.replace(/[^\w.\-]+/g, '_').slice(-120);
    const storageKey = `${documentId}/v${versionNo}-${randomUUID()}-${safeName}`;

    // 1) commit the version row (unique on documentId+versionNo guards concurrent writers)
    const version = await this.prisma.documentVersion.create({
      data: {
        documentId,
        versionNo,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        sha256,
        storageDriver: this.storage.activeDriver,
        storageKey,
        note: note ?? null,
        uploadedById: actor.ctx?.userId ?? null,
        uploadedByName: actor.ctx?.name ?? actor.name ?? null,
      },
    });
    // 2) store the bytes; if that fails, remove the row so no version ever points at missing bytes
    try {
      await this.storage.active.put(storageKey, file.buffer, file.mimetype, version.id);
    } catch (e) {
      await this.prisma.documentVersion.delete({ where: { id: version.id } }).catch(() => undefined);
      throw e;
    }
    // 3) only now make it the current version
    await this.prisma.document.update({ where: { id: documentId }, data: { currentVersionNo: versionNo } });
    return version;
  }

  // ── reads ─────────────────────────────────────────────────────────────────
  async getDetail(id: string, ctx?: RequestContext) {
    const doc = await this.prisma.document.findUnique({ where: { id }, include: DOC_INCLUDE });
    if (!doc || (ctx && !this.canAccess(ctx, doc))) throw new NotFoundException('Document not found');
    return doc;
  }

  /** Streams bytes after access check; records an access audit event. */
  async getContent(id: string, ctx: RequestContext, versionNo?: number, disposition: 'inline' | 'attachment' = 'attachment') {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc || !this.canAccess(ctx, doc)) throw new NotFoundException('Document not found');
    const version = await this.prisma.documentVersion.findUnique({
      where: { documentId_versionNo: { documentId: id, versionNo: versionNo ?? doc.currentVersionNo } },
    });
    if (!version) throw new NotFoundException('Document version not found');
    const buffer = await this.storage.adapterFor(version.storageDriver as 'local' | 's3' | 'db').get(version.storageKey, version.id);
    await this.audit.record({
      ctx,
      entityType: 'Document',
      entityId: id,
      action: disposition === 'inline' ? 'DOCUMENT_VIEWED' : 'DOCUMENT_DOWNLOADED',
      metadata: { ref: doc.ref, versionNo: version.versionNo, sha256: version.sha256 },
    });
    return { buffer, fileName: version.fileName, mimeType: version.mimeType, sha256: version.sha256 };
  }

  /** Internal register (staff). */
  async list(
    q: ListQuery & { category?: string; status?: string; investorId?: string; portfolioId?: string; companyId?: string; audience?: string },
  ) {
    const where: Prisma.DocumentWhereInput = {
      ...(q.category ? { category: q.category as DocumentCategory } : {}),
      ...(q.status ? { status: q.status as DocumentStatus } : {}),
      ...(q.audience ? { audience: q.audience as DocumentAudience } : {}),
      ...(q.investorId ? { investorId: q.investorId } : {}),
      ...(q.portfolioId ? { portfolioId: q.portfolioId } : {}),
      ...(q.companyId ? { companyId: q.companyId } : {}),
      ...(q.q
        ? {
            OR: [
              { title: { contains: q.q, mode: 'insensitive' } },
              { ref: { contains: q.q, mode: 'insensitive' } },
              { investor: { legalName: { contains: q.q, mode: 'insensitive' } } },
              { company: { name: { contains: q.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const orderBy = buildOrderBy<Prisma.DocumentOrderByWithRelationInput>(
      q,
      {
        title: (d) => ({ title: d }),
        category: (d) => ({ category: d }),
        status: (d) => ({ status: d }),
        createdAt: (d) => ({ createdAt: d }),
      },
      { createdAt: 'desc' },
    );
    const [rows, total] = await Promise.all([
      this.prisma.document.findMany({ where, orderBy, ...pageArgs(q), include: DOC_INCLUDE }),
      this.prisma.document.count({ where }),
    ]);
    return paged(rows, total, q);
  }

  // ── access control (single source of truth) ───────────────────────────────
  canAccess(ctx: RequestContext, doc: { investorId: string | null; audience: string; status: string; ownerOrgId: string | null }): boolean {
    if (isStaff(ctx)) return ctx.permissions.includes('documents.read');
    if (ctx.orgType === 'INVESTOR') {
      // investors only ever see PUBLISHED, investor-audience documents of their own organisation
      return !!ctx.investorId && doc.investorId === ctx.investorId && doc.audience === 'INVESTOR' && doc.status === 'PUBLISHED';
    }
    // custodian / portfolio company: documents their own organisation owns
    return doc.ownerOrgId === ctx.orgId;
  }

  canWrite(ctx: RequestContext, doc: { ownerOrgId: string | null; status: string }): boolean {
    if (isStaff(ctx)) return ctx.permissions.includes('documents.manage');
    if (ctx.orgType === 'INVESTOR') return false;
    return doc.ownerOrgId === ctx.orgId && ['UPLOADED', 'DRAFT'].includes(doc.status);
  }
}
