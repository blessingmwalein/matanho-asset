import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { COMPANY_SUBMISSION_LABELS, REPORTING_PACK, type CompanySubmissionStatus, type ListQuery } from '@nexus/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { RequestContext } from '../../common/auth/request-context';
import { toISODate } from '../../common/decimal';
import { buildOrderBy, pageArgs, paged } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DOC_SELECT, FILE_KEY_FILTER, groupDocs, mapQuestion } from './company-portal.service';
import { analysePack, decodeValues, REVIEWABLE_STATUSES, SECTION_KEYS } from './pack.util';

export interface CompanyListQuery extends ListQuery {
  status?: CompanySubmissionStatus;
  sector?: string;
}
export interface SubmissionListQuery extends ListQuery {
  status?: CompanySubmissionStatus;
  companyId?: string;
  period?: string;
}

const TIMELINE: Record<string, { title: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }> = {
  COMPANY_PACK_SUBMITTED: { title: 'Pack submitted by the company', tone: 'info' },
  COMPANY_PACK_RESUBMITTED: { title: 'Pack resubmitted by the company', tone: 'info' },
  COMPANY_QUESTION_RAISED: { title: 'Question raised', tone: 'warning' },
  COMPANY_QUESTION_ANSWERED: { title: 'Question answered by the company', tone: 'info' },
  COMPANY_CORRECTIONS_REQUESTED: { title: 'Corrections requested', tone: 'warning' },
  COMPANY_PACK_ACCEPTED: { title: 'Pack accepted', tone: 'success' },
  COMPANY_FILE_UPLOADED: { title: 'File uploaded', tone: 'neutral' },
  COMPANY_FILE_REPLACED: { title: 'File replaced (new version)', tone: 'neutral' },
};

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── company register ──────────────────────────────────────────────────────
  /** Register of portfolio companies with their current (latest) reporting period. Companies are few, so this is composed in memory. */
  async list(q: CompanyListQuery) {
    const search = q.q?.trim();
    const companies = await this.prisma.portfolioCompany.findMany({
      where: {
        ...(q.sector ? { sector: q.sector } : {}),
        ...(search
          ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { ref: { contains: search, mode: 'insensitive' } }, { sector: { contains: search, mode: 'insensitive' } }, { country: { contains: search, mode: 'insensitive' } }, { fundName: { contains: search, mode: 'insensitive' } }] }
          : {}),
      },
      include: {
        periods: { orderBy: { periodEnd: 'desc' }, include: { submission: { include: { questions: { select: { status: true } } } } } },
      },
    });

    let rows = companies.map((c) => {
      const current = c.periods[0] ?? null;
      const sub = current?.submission ?? null;
      const lastSubmitted = c.periods
        .map((p) => p.submission)
        .filter((s): s is NonNullable<typeof s> => !!s && !!s.submittedAt)
        .sort((a, b) => (b.submittedAt!.getTime() - a.submittedAt!.getTime()))[0];
      return {
        id: c.id,
        ref: c.ref,
        name: c.name,
        sector: c.sector,
        country: c.country,
        fundName: c.fundName,
        status: c.status,
        currentPeriod: current ? { id: current.id, label: current.label, dueDate: toISODate(current.dueDate) } : null,
        submission: current ? { id: sub?.id ?? null, status: (sub?.status ?? 'DRAFT') as CompanySubmissionStatus, completionPct: sub?.completionPct ?? 0, version: sub?.version ?? 1 } : null,
        openQuestions: sub?.questions.filter((x) => x.status === 'OPEN').length ?? 0,
        lastSubmittedAt: lastSubmitted?.submittedAt?.toISOString() ?? null,
        periodsCount: c.periods.length,
      };
    });
    if (q.status) rows = rows.filter((r) => r.submission?.status === q.status);

    const dir = q.order === 'asc' ? 1 : -1;
    const key = q.sort ?? 'name';
    rows.sort((a, b) => {
      const av = key === 'completion' ? (a.submission?.completionPct ?? 0) : key === 'status' ? (a.submission?.status ?? '') : key === 'lastSubmittedAt' ? (a.lastSubmittedAt ?? '') : key === 'sector' ? (a.sector ?? '') : a.name.toLowerCase();
      const bv = key === 'completion' ? (b.submission?.completionPct ?? 0) : key === 'status' ? (b.submission?.status ?? '') : key === 'lastSubmittedAt' ? (b.lastSubmittedAt ?? '') : key === 'sector' ? (b.sector ?? '') : b.name.toLowerCase();
      return av < bv ? -dir : av > bv ? dir : 0;
    });
    const total = rows.length;
    const { skip, take } = pageArgs(q);
    return paged(rows.slice(skip, skip + take), total, q);
  }

  async detail(id: string) {
    const c = await this.prisma.portfolioCompany.findUnique({
      where: { id },
      include: {
        organisation: { select: { email: true, legalName: true } },
        periods: { orderBy: { periodEnd: 'desc' }, include: { submission: { include: { questions: { select: { status: true } } } } } },
      },
    });
    if (!c) throw new NotFoundException('Company not found');
    return {
      id: c.id,
      ref: c.ref,
      name: c.name,
      legalName: c.organisation.legalName,
      email: c.organisation.email,
      sector: c.sector,
      country: c.country,
      fundName: c.fundName,
      description: c.description,
      status: c.status,
      periods: c.periods.map((p) => ({
        id: p.id,
        label: p.label,
        periodEnd: toISODate(p.periodEnd),
        dueDate: toISODate(p.dueDate),
        periodStatus: p.status,
        submissionId: p.submission?.id ?? null,
        status: (p.submission?.status ?? 'DRAFT') as CompanySubmissionStatus,
        version: p.submission?.version ?? 1,
        completionPct: p.submission?.completionPct ?? 0,
        submittedAt: p.submission?.submittedAt?.toISOString() ?? null,
        openQuestions: p.submission?.questions.filter((x) => x.status === 'OPEN').length ?? 0,
      })),
    };
  }

  async options() {
    const [companies, periods] = await Promise.all([
      this.prisma.portfolioCompany.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, sector: true } }),
      this.prisma.reportingPeriod.findMany({ orderBy: { periodEnd: 'desc' }, select: { label: true, periodEnd: true } }),
    ]);
    return { companies, periods: [...new Set(periods.map((p) => p.label))], sectors: [...new Set(companies.map((c) => c.sector).filter((s): s is string => !!s))] };
  }

  // ── submissions register ──────────────────────────────────────────────────
  async listSubmissions(q: SubmissionListQuery) {
    const search = q.q?.trim();
    const where: Prisma.CompanyReportingSubmissionWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.companyId ? { companyId: q.companyId } : {}),
      ...(q.period ? { period: { label: { equals: q.period, mode: 'insensitive' } } } : {}),
      ...(search
        ? { OR: [{ ref: { contains: search, mode: 'insensitive' } }, { company: { name: { contains: search, mode: 'insensitive' } } }, { period: { label: { contains: search, mode: 'insensitive' } } }, { submittedByName: { contains: search, mode: 'insensitive' } }] }
        : {}),
    };
    const orderBy = buildOrderBy<Prisma.CompanyReportingSubmissionOrderByWithRelationInput>(
      q,
      {
        submittedAt: (d) => ({ submittedAt: { sort: d, nulls: 'last' } }),
        completion: (d) => ({ completionPct: d }),
        status: (d) => ({ status: d }),
        company: (d) => ({ company: { name: d } }),
        period: (d) => ({ period: { periodEnd: d } }),
        ref: (d) => ({ ref: d }),
      },
      { submittedAt: { sort: 'desc', nulls: 'last' } },
    );
    const [rows, total] = await Promise.all([
      this.prisma.companyReportingSubmission.findMany({
        where,
        orderBy,
        ...pageArgs(q),
        include: { company: { select: { id: true, name: true } }, period: { select: { id: true, label: true, dueDate: true, periodEnd: true } }, questions: { select: { status: true } } },
      }),
      this.prisma.companyReportingSubmission.count({ where }),
    ]);
    return paged(
      rows.map((s) => ({
        id: s.id,
        ref: s.ref,
        company: s.company,
        period: { id: s.period.id, label: s.period.label, dueDate: toISODate(s.period.dueDate) },
        status: s.status,
        version: s.version,
        completionPct: s.completionPct,
        submittedAt: s.submittedAt?.toISOString() ?? null,
        submittedByName: s.submittedByName,
        reviewedAt: s.reviewedAt?.toISOString() ?? null,
        openQuestions: s.questions.filter((x) => x.status === 'OPEN').length,
        answeredQuestions: s.questions.filter((x) => x.status === 'ANSWERED').length,
      })),
      total,
      q,
    );
  }

  /** Review workspace read model: values grouped by REPORTING_PACK section, evidence, questions, timeline. */
  async submissionDetail(id: string) {
    const sub = await this.prisma.companyReportingSubmission.findUnique({
      where: { id },
      include: { company: true, period: { include: { requirements: true } } },
    });
    if (!sub) throw new NotFoundException('Submission not found');

    const [valueRows, docRows, questionRows, events] = await Promise.all([
      this.prisma.companyReportingValue.findMany({ where: { submissionId: id } }),
      this.prisma.document.findMany({ where: { submissionId: id, ...FILE_KEY_FILTER }, select: DOC_SELECT, orderBy: { createdAt: 'asc' } }),
      this.prisma.companyReportingQuestion.findMany({ where: { submissionId: id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.auditEvent.findMany({ where: { entityType: 'CompanyReportingSubmission', entityId: id, action: { in: Object.keys(TIMELINE) } }, orderBy: { createdAt: 'asc' }, take: 200 }),
    ]);
    const values = decodeValues(valueRows);
    const { files, answerFiles } = groupDocs(docRows);
    const fileKeys = Object.keys(files).filter((k) => files[k]!.length > 0);
    const { completion, sections: sectionStates, certificates } = analysePack(values, fileKeys);
    const reqByKey = new Map(sub.period.requirements.map((r) => [r.key, r]));

    const sections = REPORTING_PACK.map((s) => {
      const c = completion.sections.find((x) => x.key === s.key)!;
      return {
        key: s.key,
        category: s.category,
        title: s.title,
        description: s.description,
        status: reqByKey.get(s.key)?.status ?? sectionStates.find((x) => x.key === s.key)!.status,
        complete: c.complete,
        missing: c.missing,
        fields: s.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, group: f.group ?? null, required: f.required, value: values[f.key] ?? null })),
        repeaters: s.repeaters.map((r) => ({
          key: r.key,
          label: r.label,
          columns: r.columns.map((col) => ({ key: col.key, label: col.label, type: col.type })),
          rows: Array.isArray(values[r.key]) ? (values[r.key] as unknown[]) : [],
        })),
        files: s.files.map((f) => ({ key: f.key, label: f.label, required: f.required, documents: files[f.key] ?? [] })),
      };
    });

    const questions = questionRows.map((q) => mapQuestion(q, answerFiles[q.id] ?? []));
    const open = questions.filter((q) => q.status === 'OPEN').length;
    const reviewable = (REVIEWABLE_STATUSES as readonly string[]).includes(sub.status);
    return {
      id: sub.id,
      ref: sub.ref,
      status: sub.status,
      version: sub.version,
      completionPct: sub.completionPct,
      completion: { percent: completion.percent, total: completion.total, done: completion.done, complete: completion.complete, outstanding: completion.outstanding },
      submittedAt: sub.submittedAt?.toISOString() ?? null,
      submittedByName: sub.submittedByName,
      reviewedAt: sub.reviewedAt?.toISOString() ?? null,
      reviewedByName: sub.reviewedByName,
      reviewNote: sub.reviewNote,
      company: { id: sub.company.id, ref: sub.company.ref, name: sub.company.name, sector: sub.company.sector, country: sub.company.country, fundName: sub.company.fundName },
      period: { id: sub.period.id, label: sub.period.label, periodStart: toISODate(sub.period.periodStart), periodEnd: toISODate(sub.period.periodEnd), dueDate: toISODate(sub.period.dueDate), status: sub.period.status },
      currency: 'USD',
      sections,
      certificates,
      questions,
      openQuestions: open,
      canReview: reviewable,
      canAccept: reviewable && open === 0,
      timeline: events.map((ev) => {
        const meta = (ev.metadata ?? {}) as Record<string, unknown>;
        const t = TIMELINE[ev.action]!;
        let body: string | undefined;
        if (ev.action === 'COMPANY_QUESTION_RAISED') body = typeof meta.question === 'string' ? meta.question : undefined;
        else if (ev.action === 'COMPANY_QUESTION_ANSWERED') body = typeof meta.answer === 'string' ? meta.answer : undefined;
        else if (ev.action === 'COMPANY_CORRECTIONS_REQUESTED') body = typeof meta.message === 'string' ? meta.message : undefined;
        else if (ev.action === 'COMPANY_PACK_ACCEPTED') body = typeof meta.note === 'string' && meta.note ? meta.note : undefined;
        else if (typeof meta.fileName === 'string') body = meta.fileName;
        return { id: ev.id, title: t.title, tone: t.tone, body, at: ev.createdAt.toISOString(), actor: (meta.actorName as string) ?? ev.actorEmail ?? null };
      }),
    };
  }

  // ── review actions ────────────────────────────────────────────────────────
  private async loadForReview(id: string) {
    const sub = await this.prisma.companyReportingSubmission.findUnique({ where: { id }, include: { company: true, period: true } });
    if (!sub) throw new NotFoundException('Submission not found');
    return sub;
  }

  private assertReviewable(status: string, action: string) {
    if (!(REVIEWABLE_STATUSES as readonly string[]).includes(status)) {
      throw new ConflictException(
        status === 'ACCEPTED'
          ? `This pack is already accepted; you cannot ${action}.`
          : status === 'DRAFT'
            ? `The company has not submitted this pack yet; you cannot ${action}.`
            : `The pack is waiting on the company (${COMPANY_SUBMISSION_LABELS[status as CompanySubmissionStatus]}); you cannot ${action} until it is resubmitted.`,
      );
    }
  }

  async raiseQuestion(ctx: RequestContext, id: string, body: { question: string; requirementKey?: string }) {
    const sub = await this.loadForReview(id);
    this.assertReviewable(sub.status, 'raise a question');
    if (body.requirementKey && !SECTION_KEYS.has(body.requirementKey)) {
      throw new BadRequestException({ statusCode: 400, message: 'Validation failed', errors: { requirementKey: 'Unknown reporting section' } });
    }
    return this.prisma.$transaction(async (tx) => {
      const q = await tx.companyReportingQuestion.create({
        data: { submissionId: id, requirementKey: body.requirementKey ?? null, question: body.question, raisedById: ctx.userId, raisedByName: ctx.name },
      });
      await tx.companyReportingSubmission.update({ where: { id }, data: { status: 'QUESTIONS_OPEN', reviewedById: ctx.userId, reviewedByName: ctx.name, reviewedAt: new Date() } });
      await this.audit.record(
        { ctx, entityType: 'CompanyReportingSubmission', entityId: id, action: 'COMPANY_QUESTION_RAISED', before: { status: sub.status }, after: { status: 'QUESTIONS_OPEN', questionId: q.id }, metadata: { actorName: ctx.name, period: sub.period.label, question: body.question, requirementKey: body.requirementKey ?? null } },
        tx,
      );
      await this.notifications.notify(
        {
          organisationId: sub.company.organisationId,
          type: 'COMPANY_QUESTION',
          title: `New question on your ${sub.period.label} reporting pack`,
          body: body.question,
          link: '/company',
          entityType: 'CompanyReportingSubmission',
          entityId: id,
        },
        tx,
      );
      return { question: mapQuestion(q), status: 'QUESTIONS_OPEN' as const };
    });
  }

  async requestCorrections(ctx: RequestContext, id: string, message: string) {
    const sub = await this.loadForReview(id);
    this.assertReviewable(sub.status, 'request corrections');
    return this.prisma.$transaction(async (tx) => {
      await tx.companyReportingSubmission.update({ where: { id }, data: { status: 'CORRECTIONS_REQUESTED', reviewNote: message, reviewedById: ctx.userId, reviewedByName: ctx.name, reviewedAt: new Date() } });
      await this.audit.record(
        { ctx, entityType: 'CompanyReportingSubmission', entityId: id, action: 'COMPANY_CORRECTIONS_REQUESTED', before: { status: sub.status }, after: { status: 'CORRECTIONS_REQUESTED', reviewNote: message }, metadata: { actorName: ctx.name, period: sub.period.label, message } },
        tx,
      );
      await this.notifications.notify(
        { organisationId: sub.company.organisationId, type: 'COMPANY_CORRECTIONS', title: `Corrections requested on your ${sub.period.label} pack`, body: message, link: '/company', entityType: 'CompanyReportingSubmission', entityId: id },
        tx,
      );
      return { status: 'CORRECTIONS_REQUESTED' as const };
    });
  }

  async accept(ctx: RequestContext, id: string, note?: string) {
    const sub = await this.loadForReview(id);
    this.assertReviewable(sub.status, 'accept it');
    const open = await this.prisma.companyReportingQuestion.count({ where: { submissionId: id, status: 'OPEN' } });
    if (open > 0) {
      throw new ConflictException(`${open} question${open > 1 ? 's are' : ' is'} still open. Wait for the company's answer (or request corrections) before accepting.`);
    }
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await tx.companyReportingSubmission.update({ where: { id }, data: { status: 'ACCEPTED', reviewNote: note || null, reviewedById: ctx.userId, reviewedByName: ctx.name, reviewedAt: now } });
      await tx.companyReportingQuestion.updateMany({ where: { submissionId: id, status: 'ANSWERED' }, data: { status: 'CLOSED', closedAt: now } });
      await tx.reportingPeriod.update({ where: { id: sub.periodId }, data: { status: 'CLOSED' } });
      await this.audit.record(
        { ctx, entityType: 'CompanyReportingSubmission', entityId: id, action: 'COMPANY_PACK_ACCEPTED', before: { status: sub.status }, after: { status: 'ACCEPTED', reviewedBy: ctx.name }, metadata: { actorName: ctx.name, period: sub.period.label, note: note ?? null } },
        tx,
      );
      await this.notifications.notify(
        { organisationId: sub.company.organisationId, type: 'COMPANY_ACCEPTED', title: `${sub.period.label} reporting pack accepted`, body: note || 'The investment team has accepted your reporting pack. Thank you.', link: '/company', entityType: 'CompanyReportingSubmission', entityId: id },
        tx,
      );
      return { status: 'ACCEPTED' as const, reviewedAt: now.toISOString() };
    });
  }
}
