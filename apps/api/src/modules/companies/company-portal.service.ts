import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PACK_FILE_KEYS, REPORTING_PACK, validatePackValues, type PackValues } from '@nexus/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { RequestContext } from '../../common/auth/request-context';
import { toISODate } from '../../common/decimal';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ReferenceService } from '../../common/references/reference.service';
import { DocumentsService, type IncomingFile } from '../documents/documents.service';
import { NotificationsService } from '../notifications/notifications.service';
import { analysePack, buildTasks, decodeValues, EDITABLE_STATUSES, encodeValue, FILE_BY_KEY } from './pack.util';

type Period = Prisma.ReportingPeriodGetPayload<{ include: { company: true; submission: true } }>;
type Submission = NonNullable<Period['submission']>;

const FILE_KEY_FILTER = { OR: [{ requirementKey: { in: PACK_FILE_KEYS } }, { requirementKey: { startsWith: 'question:' } }] } satisfies Prisma.DocumentWhereInput;

const DOC_SELECT = {
  id: true,
  ref: true,
  title: true,
  category: true,
  requirementKey: true,
  currentVersionNo: true,
  createdAt: true,
  versions: { orderBy: { versionNo: 'desc' as const }, select: { versionNo: true, fileName: true, mimeType: true, sizeBytes: true, sha256: true, uploadedByName: true, createdAt: true } },
} satisfies Prisma.DocumentSelect;
type DocRow = Prisma.DocumentGetPayload<{ select: typeof DOC_SELECT }>;

export function mapDoc(d: DocRow) {
  const cur = d.versions.find((v) => v.versionNo === d.currentVersionNo) ?? d.versions[0];
  return {
    id: d.id,
    ref: d.ref,
    title: d.title,
    category: d.category,
    requirementKey: d.requirementKey,
    fileName: cur?.fileName ?? null,
    mimeType: cur?.mimeType ?? null,
    sizeBytes: cur?.sizeBytes ?? null,
    sha256: cur?.sha256 ?? null,
    versionNo: d.currentVersionNo,
    uploadedAt: cur?.createdAt.toISOString() ?? d.createdAt.toISOString(),
    uploadedByName: cur?.uploadedByName ?? null,
    versions: d.versions.map((v) => ({ versionNo: v.versionNo, fileName: v.fileName, sizeBytes: v.sizeBytes, uploadedByName: v.uploadedByName, createdAt: v.createdAt.toISOString() })),
  };
}
export type DocView = ReturnType<typeof mapDoc>;

export function mapQuestion(q: { id: string; requirementKey: string | null; question: string; raisedByName: string | null; createdAt: Date; answer: string | null; answeredByName: string | null; answeredAt: Date | null; status: string; closedAt: Date | null }, attachments: DocView[] = []) {
  return {
    id: q.id,
    requirementKey: q.requirementKey,
    question: q.question,
    raisedByName: q.raisedByName,
    createdAt: q.createdAt.toISOString(),
    answer: q.answer,
    answeredByName: q.answeredByName,
    answeredAt: q.answeredAt?.toISOString() ?? null,
    status: q.status,
    closedAt: q.closedAt?.toISOString() ?? null,
    attachments,
  };
}

/** Group documents by pack file key; answer attachments by question id. */
export function groupDocs(docs: DocRow[]) {
  const files: Record<string, DocView[]> = {};
  const answerFiles: Record<string, DocView[]> = {};
  for (const d of docs) {
    const k = d.requirementKey ?? '';
    if (k.startsWith('question:')) (answerFiles[k.slice(9)] ??= []).push(mapDoc(d));
    else (files[k] ??= []).push(mapDoc(d));
  }
  return { files, answerFiles };
}

export { DOC_SELECT, FILE_KEY_FILTER };

@Injectable()
export class CompanyPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly refs: ReferenceService,
    private readonly docs: DocumentsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── scope ─────────────────────────────────────────────────────────────────
  /** Company users only ever reach periods of their own company; anything else is a 404. */
  private async ownPeriod(ctx: RequestContext, periodId: string): Promise<Period> {
    if (!ctx.companyId) throw new ForbiddenException('No portfolio company is linked to your organisation.');
    const period = await this.prisma.reportingPeriod.findFirst({ where: { id: periodId, companyId: ctx.companyId }, include: { company: true, submission: true } });
    if (!period) throw new NotFoundException('Reporting period not found');
    return period;
  }

  private async ensureRequirements(periodId: string) {
    const have = await this.prisma.reportingRequirement.count({ where: { periodId } });
    if (have >= REPORTING_PACK.length) return;
    await this.prisma.reportingRequirement.createMany({
      data: REPORTING_PACK.map((s) => ({ periodId, category: s.category, key: s.key, title: s.title, description: s.description, isRequired: true })),
      skipDuplicates: true,
    });
  }

  private async getOrCreateSubmission(period: Period): Promise<Submission> {
    if (period.submission) return period.submission;
    try {
      return await this.prisma.companyReportingSubmission.create({
        data: { ref: await this.refs.companySubmission(), periodId: period.id, companyId: period.companyId, status: 'DRAFT', version: 1, completionPct: 0 },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const again = await this.prisma.companyReportingSubmission.findUnique({ where: { periodId: period.id } });
        if (again) return again;
      }
      throw e;
    }
  }

  private assertEditable(period: Period, sub: { status: string }) {
    if (period.status === 'CLOSED') throw new ConflictException('This reporting period is closed.');
    if (!(EDITABLE_STATUSES as readonly string[]).includes(sub.status)) {
      throw new ConflictException(
        sub.status === 'ACCEPTED' ? 'This pack has been accepted and can no longer be changed.' : 'This pack has been submitted and is under review. It can be edited again only if the investment team requests corrections or raises a question.',
      );
    }
  }

  // ── read models ───────────────────────────────────────────────────────────
  /** Full period read model (values, files, questions, completion). */
  private async buildDetail(period: Period) {
    const sub = period.submission;
    const [valueRows, docRows, questionRows, requirements] = await Promise.all([
      sub ? this.prisma.companyReportingValue.findMany({ where: { submissionId: sub.id } }) : Promise.resolve([]),
      sub ? this.prisma.document.findMany({ where: { submissionId: sub.id, ...FILE_KEY_FILTER }, select: DOC_SELECT, orderBy: { createdAt: 'asc' } }) : Promise.resolve([]),
      sub ? this.prisma.companyReportingQuestion.findMany({ where: { submissionId: sub.id }, orderBy: { createdAt: 'asc' } }) : Promise.resolve([]),
      this.prisma.reportingRequirement.findMany({ where: { periodId: period.id }, orderBy: { key: 'asc' } }),
    ]);
    const values = decodeValues(valueRows);
    const { files, answerFiles } = groupDocs(docRows);
    const fileKeys = Object.keys(files).filter((k) => files[k]!.length > 0);
    const { completion, sections, certificates } = analysePack(values, fileKeys);
    const status = sub?.status ?? 'DRAFT';
    const editable = period.status === 'OPEN' && (EDITABLE_STATUSES as readonly string[]).includes(status);
    const questions = questionRows.map((q) => mapQuestion(q, answerFiles[q.id] ?? []));
    return {
      period: { id: period.id, label: period.label, periodStart: toISODate(period.periodStart), periodEnd: toISODate(period.periodEnd), dueDate: toISODate(period.dueDate), status: period.status },
      company: { id: period.company.id, name: period.company.name, ref: period.company.ref, sector: period.company.sector, fundName: period.company.fundName },
      submission: {
        id: sub?.id ?? null,
        ref: sub?.ref ?? null,
        status,
        version: sub?.version ?? 1,
        completionPct: sub ? sub.completionPct : 0,
        submittedAt: sub?.submittedAt?.toISOString() ?? null,
        submittedByName: sub?.submittedByName ?? null,
        reviewedAt: sub?.reviewedAt?.toISOString() ?? null,
        reviewedByName: sub?.reviewedByName ?? null,
        reviewNote: sub?.reviewNote ?? null,
      },
      editable,
      currency: 'USD',
      values,
      files,
      questions,
      requirements: requirements.map((r) => ({ key: r.key, category: r.category, title: r.title, status: r.status })),
      completion,
      sectionStatus: Object.fromEntries(sections.map((s) => [s.key, s.status])),
      certificates,
      tasks: buildTasks(completion, certificates, sections),
    };
  }

  async periods(ctx: RequestContext) {
    if (!ctx.companyId) throw new ForbiddenException('No portfolio company is linked to your organisation.');
    const rows = await this.prisma.reportingPeriod.findMany({
      where: { companyId: ctx.companyId },
      orderBy: { periodEnd: 'desc' },
      include: { submission: { include: { questions: { select: { status: true } } } } },
    });
    return rows.map((p) => ({
      id: p.id,
      label: p.label,
      periodStart: toISODate(p.periodStart),
      periodEnd: toISODate(p.periodEnd),
      dueDate: toISODate(p.dueDate),
      periodStatus: p.status,
      submissionId: p.submission?.id ?? null,
      status: p.submission?.status ?? 'DRAFT',
      version: p.submission?.version ?? 1,
      completionPct: p.submission?.completionPct ?? 0,
      submittedAt: p.submission?.submittedAt?.toISOString() ?? null,
      openQuestions: p.submission?.questions.filter((q) => q.status === 'OPEN').length ?? 0,
    }));
  }

  async periodDetail(ctx: RequestContext, id: string) {
    const period = await this.ownPeriod(ctx, id);
    await this.ensureRequirements(period.id);
    return this.buildDetail(period);
  }

  async dashboard(ctx: RequestContext, periodId?: string) {
    if (!ctx.companyId) throw new ForbiddenException('No portfolio company is linked to your organisation.');
    const periods = await this.periods(ctx);
    if (!periods.length) {
      const company = await this.prisma.portfolioCompany.findUnique({ where: { id: ctx.companyId } });
      return { company: company ? { id: company.id, name: company.name, sector: company.sector, fundName: company.fundName } : null, periods: [], selected: null, needsAction: [], detail: null };
    }
    let selectedId: string;
    if (periodId) {
      if (!periods.some((p) => p.id === periodId)) throw new NotFoundException('Reporting period not found');
      selectedId = periodId;
    } else {
      const actionable = periods.filter((p) => p.periodStatus === 'OPEN' && ['DRAFT', 'CORRECTIONS_REQUESTED', 'QUESTIONS_OPEN'].includes(p.status));
      selectedId = (actionable[0] ?? periods[0]!).id; // periods are ordered latest first
    }
    const period = await this.ownPeriod(ctx, selectedId);
    await this.ensureRequirements(period.id);
    const detail = await this.buildDetail(period);
    const openQuestions = detail.questions.filter((q) => q.status === 'OPEN').length;
    const cert = detail.certificates;
    return {
      company: { id: period.company.id, name: period.company.name, sector: period.company.sector, fundName: period.company.fundName },
      periods: periods.map((p) => ({ id: p.id, label: p.label, dueDate: p.dueDate, status: p.status, completionPct: p.completionPct })),
      selected: {
        id: period.id,
        label: period.label,
        periodEnd: detail.period.periodEnd,
        dueDate: detail.period.dueDate,
        status: detail.submission.status,
        version: detail.submission.version,
        editable: detail.editable,
      },
      completion: {
        percent: detail.completion.percent,
        total: detail.completion.total,
        done: detail.completion.done,
        remaining: detail.completion.total - detail.completion.done,
        complete: detail.completion.complete,
        outstanding: detail.completion.outstanding,
      },
      openQuestions,
      covenants: {
        total: cert.total,
        current: cert.current,
        expiring: cert.expiring,
        expired: cert.expired,
        hint: cert.total === 0 ? 'No certificates recorded' : cert.expired > 0 ? `${cert.expired} expired` : cert.expiring > 0 ? `${cert.expiring} expiring within 60 days` : 'Evidence current',
      },
      tasks: detail.tasks,
      needsAction: periods
        .filter((p) => p.id !== period.id && p.periodStatus === 'OPEN' && ['DRAFT', 'CORRECTIONS_REQUESTED', 'QUESTIONS_OPEN'].includes(p.status))
        .map((p) => ({ id: p.id, label: p.label, status: p.status, openQuestions: p.openQuestions, completionPct: p.completionPct })),
      reviewNote: detail.submission.reviewNote,
    };
  }

  // ── writes ────────────────────────────────────────────────────────────────
  /** Recompute completion + requirement statuses from the stored values and files, and persist them. */
  private async refreshCompletion(periodId: string, sub: { id: string; completionPct: number }, db: Prisma.TransactionClient = this.prisma) {
    const [valueRows, docRows, reqs] = await Promise.all([
      db.companyReportingValue.findMany({ where: { submissionId: sub.id } }),
      db.document.findMany({ where: { submissionId: sub.id, requirementKey: { in: PACK_FILE_KEYS } }, select: { requirementKey: true } }),
      db.reportingRequirement.findMany({ where: { periodId } }),
    ]);
    const values = decodeValues(valueRows);
    const fileKeys = [...new Set(docRows.map((d) => d.requirementKey as string))];
    const { completion, sections } = analysePack(values, fileKeys);
    if (completion.percent !== sub.completionPct) await db.companyReportingSubmission.update({ where: { id: sub.id }, data: { completionPct: completion.percent } });
    for (const s of sections) {
      const r = reqs.find((x) => x.key === s.key);
      if (r && r.status !== s.status) await db.reportingRequirement.update({ where: { id: r.id }, data: { status: s.status } });
    }
    return { completion, values, fileKeys };
  }

  /** Save draft: type-checks supplied values, upserts rows, recomputes completion. */
  async saveValues(ctx: RequestContext, periodId: string, values: PackValues) {
    const errors = validatePackValues(values);
    if (Object.keys(errors).length) throw new BadRequestException({ statusCode: 400, message: 'Some values are not valid', errors });
    const period = await this.ownPeriod(ctx, periodId);
    const sub = await this.getOrCreateSubmission(period);
    this.assertEditable(period, sub);
    await this.ensureRequirements(period.id);

    const existing = await this.prisma.companyReportingValue.findMany({ where: { submissionId: sub.id } });
    const byKey = new Map(existing.map((r) => [r.key, r]));
    const toCreate: Prisma.CompanyReportingValueCreateManyInput[] = [];
    const toUpdate: Array<{ id: string; data: Prisma.CompanyReportingValueUpdateInput }> = [];
    const toDelete: string[] = [];
    for (const [key, v] of Object.entries(values)) {
      const enc = encodeValue(key, v);
      const cur = byKey.get(key);
      if (enc.remove) {
        if (cur) toDelete.push(cur.id);
        continue;
      }
      const same =
        cur &&
        ((cur.valueNumber === null && enc.valueNumber === null) || (cur.valueNumber !== null && enc.valueNumber !== null && cur.valueNumber.equals(enc.valueNumber))) &&
        cur.valueText === enc.valueText &&
        JSON.stringify(cur.valueJson ?? null) === JSON.stringify(enc.valueJson === Prisma.DbNull ? null : enc.valueJson);
      if (same) continue;
      if (cur) toUpdate.push({ id: cur.id, data: { valueNumber: enc.valueNumber, valueText: enc.valueText, valueJson: enc.valueJson, updatedById: ctx.userId } });
      else toCreate.push({ submissionId: sub.id, key, valueNumber: enc.valueNumber, valueText: enc.valueText, valueJson: enc.valueJson === Prisma.DbNull ? undefined : enc.valueJson, updatedById: ctx.userId });
    }

    await this.prisma.$transaction(
      async (tx) => {
        if (toDelete.length) await tx.companyReportingValue.deleteMany({ where: { id: { in: toDelete } } });
        if (toCreate.length) await tx.companyReportingValue.createMany({ data: toCreate });
        for (const u of toUpdate) await tx.companyReportingValue.update({ where: { id: u.id }, data: u.data });
        const r = await this.refreshCompletion(period.id, sub, tx);
        await this.audit.record(
          {
            ctx,
            entityType: 'CompanyReportingSubmission',
            entityId: sub.id,
            action: 'COMPANY_VALUES_SAVED',
            metadata: { actorName: ctx.name, period: period.label, created: toCreate.length, updated: toUpdate.length, removed: toDelete.length, completionPct: r.completion.percent },
          },
          tx,
        );
        return r;
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
    const fresh = await this.ownPeriod(ctx, periodId);
    return this.buildDetail(fresh);
  }

  /** Upload (or replace) the file for one pack slot. Re-uploading adds a new version of the same document. */
  async uploadFile(ctx: RequestContext, periodId: string, key: string, file: IncomingFile | undefined) {
    const slot = FILE_BY_KEY.get(key);
    if (!slot) throw new BadRequestException({ statusCode: 400, message: 'Unknown file slot', errors: { key: `Unknown file slot "${key}"` } });
    if (!file) throw new BadRequestException({ statusCode: 400, message: 'A file is required', errors: { file: 'Choose a file to upload' } });
    if (file.mimetype === 'text/html' || /\.html?$/i.test(file.originalname)) {
      throw new BadRequestException({ statusCode: 400, message: 'HTML files are not accepted', errors: { file: 'Upload PDF, Excel, CSV, Word or image files' } });
    }
    const period = await this.ownPeriod(ctx, periodId);
    const sub = await this.getOrCreateSubmission(period);
    this.assertEditable(period, sub);
    await this.ensureRequirements(period.id);

    const existing = await this.prisma.document.findFirst({ where: { submissionId: sub.id, requirementKey: key }, select: { id: true } });
    let documentId: string;
    let action: string;
    if (existing) {
      await this.docs.addVersion(existing.id, file, { ctx }, `Replaced by ${ctx.name}`);
      documentId = existing.id;
      action = 'COMPANY_FILE_REPLACED';
    } else {
      const doc = await this.docs.create(
        file,
        {
          title: `${slot.label} (${period.label})`,
          category: slot.category,
          audience: 'COMPANY',
          ownerOrgId: ctx.orgId,
          companyId: period.companyId,
          submissionId: sub.id,
          requirementKey: key,
          reportDate: period.periodEnd,
        },
        { ctx },
      );
      documentId = doc.id;
      action = 'COMPANY_FILE_UPLOADED';
    }
    await this.refreshCompletion(period.id, sub);
    await this.audit.record({ ctx, entityType: 'CompanyReportingSubmission', entityId: sub.id, action, metadata: { actorName: ctx.name, period: period.label, slot: key, fileName: file.originalname, documentId } });
    const fresh = await this.ownPeriod(ctx, periodId);
    return this.buildDetail(fresh);
  }

  /** Server-side completeness gate (UAT CMP-003). Idempotent: a second submit is a no-op. */
  async submit(ctx: RequestContext, periodId: string) {
    const period = await this.ownPeriod(ctx, periodId);
    const sub = await this.getOrCreateSubmission(period);
    if (period.status === 'CLOSED' || sub.status === 'ACCEPTED') throw new ConflictException('This pack has already been accepted.');
    if (sub.status === 'SUBMITTED' || sub.status === 'RESUBMITTED') {
      return { alreadySubmitted: true, status: sub.status, version: sub.version, submittedAt: sub.submittedAt?.toISOString() ?? null };
    }

    const r = await this.refreshCompletion(period.id, sub);
    const openQuestions = await this.prisma.companyReportingQuestion.count({ where: { submissionId: sub.id, status: 'OPEN' } });
    const outstanding = [...r.completion.outstanding];
    if (openQuestions > 0) outstanding.push(`Answer the ${openQuestions} open question${openQuestions > 1 ? 's' : ''} from the investment team`);
    if (outstanding.length) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: `The reporting pack is incomplete: ${outstanding.length} required item${outstanding.length > 1 ? 's are' : ' is'} outstanding.`,
        errors: Object.fromEntries(outstanding.map((o, i) => [String(i + 1).padStart(2, '0'), o])),
      });
    }
    return this.moveToReview(ctx, period, sub, r.completion.percent);
  }

  /** DRAFT → SUBMITTED; CORRECTIONS_REQUESTED / QUESTIONS_OPEN → RESUBMITTED (version + 1). */
  private async moveToReview(ctx: RequestContext, period: Period, sub: Submission, completionPct: number) {
    const fromStatus = sub.status;
    const toStatus = fromStatus === 'DRAFT' ? 'SUBMITTED' : 'RESUBMITTED';
    const version = fromStatus === 'DRAFT' ? sub.version : sub.version + 1;
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const fresh = await tx.companyReportingSubmission.findUniqueOrThrow({ where: { id: sub.id } });
      if (fresh.status === 'SUBMITTED' || fresh.status === 'RESUBMITTED') {
        return { alreadySubmitted: true, status: fresh.status, version: fresh.version, submittedAt: fresh.submittedAt?.toISOString() ?? null };
      }
      await tx.companyReportingSubmission.update({
        where: { id: sub.id },
        data: { status: toStatus, version, completionPct, submittedAt: now, submittedById: ctx.userId, submittedByName: ctx.name, reviewNote: null },
      });
      await this.audit.record(
        {
          ctx,
          entityType: 'CompanyReportingSubmission',
          entityId: sub.id,
          action: toStatus === 'SUBMITTED' ? 'COMPANY_PACK_SUBMITTED' : 'COMPANY_PACK_RESUBMITTED',
          before: { status: fromStatus, version: sub.version },
          after: { status: toStatus, version, completionPct },
          metadata: { actorName: ctx.name, period: period.label, company: period.company.name },
        },
        tx,
      );
      await this.notifications.notifyStaff(
        {
          type: 'COMPANY_SUBMISSION',
          title: toStatus === 'SUBMITTED' ? 'Reporting pack submitted' : 'Reporting pack resubmitted',
          body: `${period.company.name} submitted the ${period.label} reporting pack (version ${version}).`,
          link: `/internal/companies/submissions/${sub.id}`,
          entityType: 'CompanyReportingSubmission',
          entityId: sub.id,
        },
        tx,
      );
      return { alreadySubmitted: false, status: toStatus, version, submittedAt: now.toISOString() };
    });
  }

  /** Answer a question raised by the investment team; the last answer returns the pack to review. */
  async answerQuestion(ctx: RequestContext, questionId: string, answer: string, file?: IncomingFile) {
    if (!ctx.companyId) throw new ForbiddenException('No portfolio company is linked to your organisation.');
    const q = await this.prisma.companyReportingQuestion.findFirst({
      where: { id: questionId, submission: { companyId: ctx.companyId } },
      include: { submission: { include: { period: { include: { company: true, submission: true } } } } },
    });
    if (!q) throw new NotFoundException('Question not found');
    if (q.status !== 'OPEN') throw new ConflictException('This question has already been answered.');
    if (file && (file.mimetype === 'text/html' || /\.html?$/i.test(file.originalname))) {
      throw new BadRequestException({ statusCode: 400, message: 'HTML files are not accepted', errors: { file: 'Upload PDF, Excel, CSV, Word or image files' } });
    }
    const period = q.submission.period;
    const sub = q.submission;

    let attachmentId: string | null = null;
    if (file) {
      const doc = await this.docs.create(
        file,
        {
          title: `Answer attachment: ${q.question.slice(0, 60)}`,
          category: 'REPORTING_SUPPORT',
          audience: 'COMPANY',
          ownerOrgId: ctx.orgId,
          companyId: period.companyId,
          submissionId: sub.id,
          requirementKey: `question:${q.id}`,
          reportDate: period.periodEnd,
        },
        { ctx },
      );
      attachmentId = doc.id;
    }

    const now = new Date();
    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.companyReportingQuestion.update({
        where: { id: q.id },
        data: { answer, status: 'ANSWERED', answeredById: ctx.userId, answeredByName: ctx.name, answeredAt: now },
      });
      const open = await tx.companyReportingQuestion.count({ where: { submissionId: sub.id, status: 'OPEN' } });
      await this.audit.record(
        {
          ctx,
          entityType: 'CompanyReportingSubmission',
          entityId: sub.id,
          action: 'COMPANY_QUESTION_ANSWERED',
          after: { questionId: q.id, openRemaining: open },
          metadata: { actorName: ctx.name, period: period.label, question: q.question, answer, attachmentId },
        },
        tx,
      );
      await this.notifications.notifyStaff(
        {
          type: 'COMPANY_QUESTION_ANSWERED',
          title: 'Question answered',
          body: `${period.company.name} answered a question on the ${period.label} pack.`,
          link: `/internal/companies/submissions/${sub.id}`,
          entityType: 'CompanyReportingSubmission',
          entityId: sub.id,
        },
        tx,
      );
      return { open };
    });

    // last open question answered while the pack is otherwise complete → back to the review queue
    let resubmitted = false;
    if (outcome.open === 0 && sub.status === 'QUESTIONS_OPEN') {
      const r = await this.refreshCompletion(period.id, sub);
      if (r.completion.complete) {
        await this.moveToReview(ctx, { ...period, submission: sub }, sub, r.completion.percent);
        resubmitted = true;
      }
    }
    return { ok: true, openQuestions: outcome.open, resubmitted };
  }
}
