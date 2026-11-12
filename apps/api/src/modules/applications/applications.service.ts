import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  APPLICATION_STATUSES,
  DOCUMENT_SLOTS,
  computeReadiness,
  deriveRiskFlags,
  type ApplicationPayload,
  type ApplicationStatus,
  type ReadinessResult,
} from '@nexus/shared';
import type {
  addNoteSchema,
  approveApplicationSchema,
  rejectApplicationSchema,
  reopenApplicationSchema,
  requestInfoSchema,
} from '@nexus/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { RequestContext } from '../../common/auth/request-context';
import { buildOrderBy, pageArgs, paged } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ReferenceService } from '../../common/references/reference.service';

export const applicationListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  q: z.string().trim().optional(),
  sort: z.string().trim().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
  status: z.enum(APPLICATION_STATUSES).optional(),
});
export type ApplicationListQuery = z.infer<typeof applicationListSchema>;

type FullApplication = Prisma.InvestorApplicationGetPayload<{
  include: { owners: true; signatories: true; declaration: true; documents: { select: { requirementKey: true; status: true } } };
}>;

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'investor';

/**
 * Build the payload the readiness / approval gates evaluate: the draft JSON payload, completed
 * from the normalised rows when the JSON lacks them (owners, signatories, consent, signature).
 */
function effectivePayload(app: FullApplication): Partial<ApplicationPayload> {
  const base = ((app.payload as unknown as Partial<ApplicationPayload>) ?? {}) as Partial<ApplicationPayload>;
  const p: Partial<ApplicationPayload> = { ...base };
  if ((!p.owners || p.owners.length === 0) && app.owners.length) {
    p.owners = app.owners.map((o) => ({
      fullName: o.fullName,
      ownershipPercent: Number(o.ownershipPercent),
      nationality: o.nationality,
      idReference: o.idReference,
      email: o.email ?? '',
      phone: o.phone ?? '',
      isController: o.isController,
    }));
  }
  if ((!p.signatories || p.signatories.length === 0) && app.signatories.length) {
    p.signatories = app.signatories.map((s) => ({ fullName: s.fullName, role: s.role, email: s.email, authority: s.authority ?? '' }));
  }
  if (p.consent === undefined && app.consentAt) p.consent = true;
  if (!p.signatureName && app.signatureName) p.signatureName = app.signatureName;
  if (!p.investorType && app.investorType) p.investorType = app.investorType;
  if (!p.legalName && app.legalName) p.legalName = app.legalName;
  if (!p.country && app.country) p.country = app.country;
  if (!p.contactName && app.contactName) p.contactName = app.contactName;
  if (!p.email && app.contactEmail) p.email = app.contactEmail;
  return p;
}

const uploadedSlots = (docs: Array<{ requirementKey: string | null; status: string }>) =>
  Array.from(new Set(docs.filter((d) => d.requirementKey && d.status !== 'REJECTED').map((d) => d.requirementKey as string)));

function allowedActions(status: ApplicationStatus) {
  return {
    startReview: status === 'SUBMITTED' || status === 'RESUBMITTED',
    note: true,
    requestInfo: status === 'SUBMITTED' || status === 'RESUBMITTED' || status === 'UNDER_REVIEW',
    approve: status === 'UNDER_REVIEW',
    reject: status === 'UNDER_REVIEW' || status === 'INFORMATION_REQUESTED',
    reopen: status === 'REJECTED',
  };
}

const snapshot = (a: { status: string; assignedReviewerId: string | null; decidedById: string | null; decidedAt: Date | null; decisionReason: string | null }) => ({
  status: a.status,
  assignedReviewerId: a.assignedReviewerId,
  decidedById: a.decidedById,
  decidedAt: a.decidedAt,
  decisionReason: a.decisionReason,
});

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly refs: ReferenceService,
  ) {}

  // ── reads ─────────────────────────────────────────────────────────────────
  async list(q: ApplicationListQuery) {
    const where: Prisma.InvestorApplicationWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.q
        ? {
            OR: [
              { reference: { contains: q.q, mode: 'insensitive' } },
              { legalName: { contains: q.q, mode: 'insensitive' } },
              { contactEmail: { contains: q.q, mode: 'insensitive' } },
              { country: { contains: q.q, mode: 'insensitive' } },
              { contactName: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const orderBy = buildOrderBy<Prisma.InvestorApplicationOrderByWithRelationInput>(
      q,
      {
        reference: (d) => ({ reference: d }),
        legalName: (d) => ({ legalName: d }),
        country: (d) => ({ country: d }),
        status: (d) => ({ status: d }),
        submittedAt: (d) => ({ submittedAt: { sort: d, nulls: 'last' } }),
        lastSavedAt: (d) => ({ lastSavedAt: d }),
      },
      { lastSavedAt: 'desc' },
    );
    const [rows, total] = await Promise.all([
      this.prisma.investorApplication.findMany({
        where,
        orderBy,
        ...pageArgs(q),
        include: { owners: true, signatories: true, declaration: true, documents: { select: { requirementKey: true, status: true } } },
      }),
      this.prisma.investorApplication.count({ where }),
    ]);
    const reviewers = await this.userNames(rows.map((r) => r.assignedReviewerId));
    const data = rows.map((r) => {
      const readiness = computeReadiness(effectivePayload(r), uploadedSlots(r.documents));
      return {
        id: r.id,
        reference: r.reference,
        status: r.status,
        legalName: r.legalName,
        investorType: r.investorType,
        country: r.country,
        contactName: r.contactName,
        contactEmail: r.contactEmail,
        riskFlags: r.riskFlags,
        submittedAt: r.submittedAt,
        lastSavedAt: r.lastSavedAt,
        assignedReviewer: r.assignedReviewerId ? (reviewers.get(r.assignedReviewerId) ?? null) : null,
        readinessScore: readiness.score,
        missingCount: readiness.missing.length,
      };
    });
    return paged(data, total, q);
  }

  /** Counts per status for the register's KPI strip / filter chips. */
  async summary() {
    const rows = await this.prisma.investorApplication.groupBy({ by: ['status'], _count: { _all: true } });
    const byStatus = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0])) as Record<ApplicationStatus, number>;
    for (const r of rows) byStatus[r.status as ApplicationStatus] = r._count._all;
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const pending = byStatus.SUBMITTED + byStatus.RESUBMITTED + byStatus.UNDER_REVIEW;
    return { total, pending, byStatus };
  }

  async detail(id: string) {
    const app = await this.prisma.investorApplication.findUnique({
      where: { id },
      include: {
        owners: { orderBy: { createdAt: 'asc' } },
        signatories: { orderBy: { createdAt: 'asc' } },
        declaration: true,
        documents: {
          orderBy: { createdAt: 'asc' },
          include: { versions: { orderBy: { versionNo: 'desc' } } },
        },
        notes: { orderBy: { createdAt: 'desc' } },
        investor: { select: { id: true, ref: true, legalName: true } },
      },
    });
    if (!app) throw new NotFoundException('Application not found');

    const history = await this.prisma.auditEvent.findMany({
      where: { entityType: 'InvestorApplication', entityId: id },
      orderBy: { createdAt: 'desc' },
      take: 60,
    });
    const names = await this.userNames([app.assignedReviewerId, app.decidedById]);

    const payload = effectivePayload(app as unknown as FullApplication);
    const readiness: ReadinessResult = computeReadiness(payload, uploadedSlots(app.documents));
    const flags = Array.from(new Set([...(app.riskFlags ?? []), ...deriveRiskFlags(payload)]));
    const slotTitle = new Map(DOCUMENT_SLOTS.map((s) => [s.id, s]));

    return {
      id: app.id,
      reference: app.reference,
      status: app.status as ApplicationStatus,
      step: app.step,
      version: app.version,
      submittedAt: app.submittedAt,
      lastSavedAt: app.lastSavedAt,
      createdAt: app.createdAt,
      consentAt: app.consentAt,
      signatureName: app.signatureName,
      decisionReason: app.decisionReason,
      decidedAt: app.decidedAt,
      decidedBy: app.decidedById ? (names.get(app.decidedById) ?? null) : null,
      assignedReviewer: app.assignedReviewerId ? { id: app.assignedReviewerId, name: names.get(app.assignedReviewerId) ?? null } : null,
      investor: app.investor,
      payload,
      owners: app.owners.map((o) => ({
        id: o.id,
        fullName: o.fullName,
        ownershipPercent: o.ownershipPercent.toString(),
        nationality: o.nationality,
        idReference: o.idReference,
        email: o.email,
        phone: o.phone,
        isController: o.isController,
      })),
      signatories: app.signatories.map((s) => ({ id: s.id, fullName: s.fullName, role: s.role, email: s.email, authority: s.authority })),
      declaration: app.declaration
        ? {
            pep: app.declaration.pep,
            sanctions: app.declaration.sanctions,
            adverseMedia: app.declaration.adverseMedia,
            highRiskJurisdiction: app.declaration.highRiskJurisdiction,
            sourceOfFunds: app.declaration.sourceOfFunds,
            sourceOfWealth: app.declaration.sourceOfWealth,
            expectedActivity: app.declaration.expectedActivity,
            transactionFrequency: app.declaration.transactionFrequency,
            riskNarrative: app.declaration.riskNarrative,
            taxResidency: app.declaration.taxResidency,
            fatca: app.declaration.fatca,
            crs: app.declaration.crs,
            usIndicia: app.declaration.usIndicia,
            bankName: app.declaration.bankName,
            bankAccountHolder: app.declaration.bankAccountHolder,
            bankAccountMasked: `•••• ${app.declaration.bankAccountNumber.slice(-4)}`,
            bankCurrency: app.declaration.bankCurrency,
            swiftBic: app.declaration.swiftBic,
            consentGiven: app.declaration.consentGiven,
            consentAt: app.declaration.consentAt,
            signatureName: app.declaration.signatureName,
          }
        : null,
      riskFlags: flags,
      documents: app.documents.map((d) => {
        const slot = d.requirementKey ? slotTitle.get(d.requirementKey) : undefined;
        return {
          id: d.id,
          ref: d.ref,
          title: d.title,
          category: d.category,
          status: d.status,
          requirementKey: d.requirementKey,
          slotTitle: slot?.title ?? null,
          required: slot?.required ?? false,
          currentVersionNo: d.currentVersionNo,
          createdAt: d.createdAt,
          versions: d.versions.map((v) => ({
            versionNo: v.versionNo,
            fileName: v.fileName,
            mimeType: v.mimeType,
            sizeBytes: v.sizeBytes,
            sha256: v.sha256,
            note: v.note,
            uploadedByName: v.uploadedByName,
            createdAt: v.createdAt,
          })),
        };
      }),
      notes: app.notes.map((n) => ({ id: n.id, kind: n.kind, body: n.body, authorName: n.authorName, createdAt: n.createdAt })),
      history: history.map((h) => ({
        id: h.id,
        action: h.action,
        actor: h.actorEmail,
        at: h.createdAt,
        before: h.before,
        after: h.after,
        metadata: h.metadata,
      })),
      readiness,
      actions: allowedActions(app.status as ApplicationStatus),
    };
  }

  private async userNames(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
    const uniq = Array.from(new Set(ids.filter((i): i is string => !!i)));
    if (!uniq.length) return new Map();
    const users = await this.prisma.user.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true } });
    return new Map(users.map((u) => [u.id, u.name]));
  }

  // ── workflow ──────────────────────────────────────────────────────────────
  /**
   * Guarded status transition inside one transaction: the UPDATE only matches while the application is
   * still in an allowed `from` status, so concurrent / repeated requests cannot double-apply.
   */
  private async transition(
    ctx: RequestContext,
    id: string,
    opts: {
      from: ApplicationStatus[];
      to: ApplicationStatus;
      action: string;
      data?: Prisma.InvestorApplicationUncheckedUpdateManyInput;
      note?: { kind: 'NOTE' | 'INFO_REQUEST' | 'DECISION'; body: string };
      metadata?: Record<string, unknown>;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.investorApplication.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Application not found');
      if (!opts.from.includes(before.status as ApplicationStatus)) {
        throw new ConflictException(`This application is ${before.status.toLowerCase().replace(/_/g, ' ')} and cannot be moved to ${opts.to.toLowerCase().replace(/_/g, ' ')}.`);
      }
      const claimed = await tx.investorApplication.updateMany({
        where: { id, status: { in: opts.from } },
        data: { status: opts.to, ...(opts.data ?? {}) },
      });
      if (claimed.count === 0) throw new ConflictException('The application was updated by someone else. Refresh and try again.');
      if (opts.note) {
        await tx.applicationNote.create({
          data: { applicationId: id, authorId: ctx.userId, authorName: ctx.name, kind: opts.note.kind, body: opts.note.body },
        });
      }
      const after = await tx.investorApplication.findUniqueOrThrow({ where: { id } });
      await this.audit.record(
        {
          ctx,
          entityType: 'InvestorApplication',
          entityId: id,
          action: opts.action,
          before: snapshot(before),
          after: snapshot(after),
          metadata: { reference: before.reference, ...opts.metadata },
        },
        tx,
      );
      return { id: after.id, reference: after.reference, status: after.status };
    });
  }

  startReview(ctx: RequestContext, id: string) {
    return this.transition(ctx, id, {
      from: ['SUBMITTED', 'RESUBMITTED'],
      to: 'UNDER_REVIEW',
      action: 'APPLICATION_REVIEW_STARTED',
      data: { assignedReviewerId: ctx.userId },
    });
  }

  async addNote(ctx: RequestContext, id: string, body: z.infer<typeof addNoteSchema>) {
    const app = await this.prisma.investorApplication.findUnique({ where: { id }, select: { id: true, reference: true } });
    if (!app) throw new NotFoundException('Application not found');
    const note = await this.prisma.applicationNote.create({
      data: { applicationId: id, authorId: ctx.userId, authorName: ctx.name, kind: 'NOTE', body: body.body },
    });
    await this.audit.record({
      ctx,
      entityType: 'InvestorApplication',
      entityId: id,
      action: 'APPLICATION_NOTE_ADDED',
      after: { noteId: note.id, kind: 'NOTE' },
      metadata: { reference: app.reference },
    });
    return { id: note.id, kind: note.kind, body: note.body, authorName: note.authorName, createdAt: note.createdAt };
  }

  requestInfo(ctx: RequestContext, id: string, body: z.infer<typeof requestInfoSchema>) {
    return this.transition(ctx, id, {
      from: ['SUBMITTED', 'RESUBMITTED', 'UNDER_REVIEW'],
      to: 'INFORMATION_REQUESTED',
      action: 'APPLICATION_INFO_REQUESTED',
      note: { kind: 'INFO_REQUEST', body: body.message },
      metadata: { step: body.step ?? null },
    });
  }

  reject(ctx: RequestContext, id: string, body: z.infer<typeof rejectApplicationSchema>) {
    return this.transition(ctx, id, {
      from: ['UNDER_REVIEW', 'INFORMATION_REQUESTED'],
      to: 'REJECTED',
      action: 'APPLICATION_REJECTED',
      data: { decidedById: ctx.userId, decidedAt: new Date(), decisionReason: body.reason },
      note: { kind: 'DECISION', body: `Rejected: ${body.reason}` },
    });
  }

  reopen(ctx: RequestContext, id: string, body: z.infer<typeof reopenApplicationSchema>) {
    return this.transition(ctx, id, {
      from: ['REJECTED'],
      to: 'UNDER_REVIEW',
      action: 'APPLICATION_REOPENED',
      data: { decidedById: null, decidedAt: null, decisionReason: null, assignedReviewerId: ctx.userId },
      note: { kind: 'DECISION', body: `Reopened for review: ${body.reason}` },
    });
  }

  /**
   * Approval is a human decision (never automatic). One transaction:
   *   gate (documents, 100% ownership for entities, consent) → Organisation(INVESTOR) → Investor →
   *   default InvestmentAccount → link owners / signatories / declaration / documents → status APPROVED → audit.
   * Idempotent: `Investor.applicationId` is unique and the status flip is claim-guarded, so a retry or a
   * double click returns the existing investor and never creates a second one.
   */
  async approve(ctx: RequestContext, id: string, body: z.infer<typeof approveApplicationSchema>) {
    const existing = await this.prisma.investor.findUnique({ where: { applicationId: id }, select: { id: true, ref: true, legalName: true } });
    if (existing) return { alreadyApproved: true, application: { id, status: 'APPROVED' as const }, investor: existing };

    const app = await this.prisma.investorApplication.findUnique({
      where: { id },
      include: { owners: true, signatories: true, declaration: true, documents: { select: { requirementKey: true, status: true } } },
    });
    if (!app) throw new NotFoundException('Application not found');
    if (app.status !== 'UNDER_REVIEW') {
      throw new ConflictException(
        app.status === 'APPROVED'
          ? 'This application is already approved.'
          : `Only applications under review can be approved (current status: ${app.status.toLowerCase().replace(/_/g, ' ')}).`,
      );
    }

    const payload = effectivePayload(app);
    const readiness = computeReadiness(payload, uploadedSlots(app.documents));
    if (!readiness.canSubmit) {
      throw new UnprocessableEntityException({
        message: `Approval blocked: ${readiness.missing.map((m) => m.label).join('; ')} not complete.`,
        errors: Object.fromEntries(readiness.missing.map((m) => [m.key, m.detail])),
      });
    }
    if (body.relationshipManagerId) {
      const rm = await this.prisma.user.findFirst({
        where: { id: body.relationshipManagerId, status: 'ACTIVE', memberships: { some: { organisation: { type: 'ASSET_MANAGER' } } } },
        select: { id: true },
      });
      if (!rm) throw new UnprocessableEntityException({ message: 'Relationship manager must be an active internal user', errors: { relationshipManagerId: 'Select an active internal user' } });
    }

    const p = payload as ApplicationPayload;
    const now = new Date();

    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          const claimed = await tx.investorApplication.updateMany({
            where: { id, status: 'UNDER_REVIEW' },
            data: { status: 'APPROVED', decidedById: ctx.userId, decidedAt: now, decisionReason: body.note ?? 'Approved after document and declaration review.' },
          });
          if (claimed.count === 0) throw new ConflictException('The application was already decided by someone else.');

          const ref = await this.refs.investor(tx);
          const org = await tx.organisation.create({
            data: {
              type: 'INVESTOR',
              name: p.legalName,
              legalName: p.legalName,
              slug: `${slugify(p.legalName)}-${ref.toLowerCase()}`,
              country: p.country,
              email: p.email,
            },
          });
          const acct = p.bankAccountNumber ?? app.declaration?.bankAccountNumber ?? '';
          const investor = await tx.investor.create({
            data: {
              ref,
              organisationId: org.id,
              applicationId: id,
              legalName: p.legalName,
              investorType: p.investorType,
              registrationNumber: p.registrationNumber,
              country: p.country,
              taxIdentificationNumber: p.taxIdentificationNumber,
              registeredAddress: p.registeredAddress,
              contactName: p.contactName,
              email: p.email,
              phone: p.telephone,
              investmentObjective: p.investmentObjective,
              classification: p.investorClassification,
              baseCurrency: p.baseCurrency ?? 'USD',
              kycStatus: 'VERIFIED',
              riskRating: body.riskRating,
              kycReviewedAt: now,
              kycNextReviewAt: new Date(now.getTime() + 365 * 86400000),
              relationshipManagerId: body.relationshipManagerId ?? null,
              status: 'ACTIVE',
              bankName: p.bankName,
              bankAccountHolder: p.bankAccountHolder,
              bankAccountMasked: acct ? `•••• ${acct.slice(-4)}` : null,
              bankCurrency: p.bankCurrency,
              swiftBic: p.swiftBic,
              createdById: ctx.userId,
            },
          });
          const accountRef = await this.refs.generic('ACC', 4, tx);
          const account = await tx.investmentAccount.create({
            data: { ref: accountRef, investorId: investor.id, name: 'Main investment account', type: 'MANDATE', baseCurrency: investor.baseCurrency, createdById: ctx.userId },
          });

          // link the application's normalised rows (create them from the payload if the public flow only stored JSON)
          const ownersLinked = await tx.beneficialOwner.updateMany({ where: { applicationId: id }, data: { investorId: investor.id } });
          if (ownersLinked.count === 0 && p.owners?.length) {
            await tx.beneficialOwner.createMany({
              data: p.owners.map((o) => ({
                applicationId: id,
                investorId: investor.id,
                fullName: o.fullName,
                ownershipPercent: o.ownershipPercent,
                nationality: o.nationality,
                idReference: o.idReference,
                email: o.email || null,
                phone: o.phone || null,
                isController: o.isController ?? false,
              })),
            });
          }
          const sigLinked = await tx.authorisedSignatory.updateMany({ where: { applicationId: id }, data: { investorId: investor.id } });
          if (sigLinked.count === 0 && p.signatories?.length) {
            await tx.authorisedSignatory.createMany({
              data: p.signatories.map((s) => ({ applicationId: id, investorId: investor.id, fullName: s.fullName, role: s.role, email: s.email, authority: s.authority || null })),
            });
          }
          const declLinked = await tx.investorDeclaration.updateMany({ where: { applicationId: id }, data: { investorId: investor.id } });
          if (declLinked.count === 0) {
            await tx.investorDeclaration.create({
              data: {
                applicationId: id,
                investorId: investor.id,
                pep: p.pep,
                sanctions: p.sanctions,
                adverseMedia: p.adverseMedia,
                highRiskJurisdiction: p.highRiskJurisdiction,
                sourceOfFunds: p.sourceOfFunds,
                sourceOfWealth: p.sourceOfWealth,
                expectedActivity: p.expectedActivity,
                transactionFrequency: p.transactionFrequency,
                riskNarrative: p.riskNarrative || null,
                taxResidency: p.taxResidency,
                fatca: p.fatca,
                crs: p.crs,
                usIndicia: p.usIndicia ?? false,
                bankName: p.bankName,
                bankAccountHolder: p.bankAccountHolder,
                bankAccountNumber: p.bankAccountNumber,
                bankCurrency: p.bankCurrency,
                swiftBic: p.swiftBic,
                consentGiven: true,
                consentAt: app.consentAt ?? now,
                signatureName: p.signatureName ?? app.signatureName ?? '',
                riskFlags: deriveRiskFlags(p),
              },
            });
          }
          // onboarding evidence becomes part of the investor's document file (still internal-only)
          await tx.document.updateMany({ where: { applicationId: id, investorId: null }, data: { investorId: investor.id } });

          await tx.applicationNote.create({
            data: {
              applicationId: id,
              authorId: ctx.userId,
              authorName: ctx.name,
              kind: 'DECISION',
              body: `Approved. Investor ${investor.ref} created (risk rating ${body.riskRating.toLowerCase()}).${body.note ? ` ${body.note}` : ''}`,
            },
          });

          const after = await tx.investorApplication.findUniqueOrThrow({ where: { id } });
          await this.audit.record(
            {
              ctx,
              entityType: 'InvestorApplication',
              entityId: id,
              action: 'APPLICATION_APPROVED',
              before: snapshot(app),
              after: { ...snapshot(after), investorId: investor.id, investorRef: investor.ref, accountId: account.id, riskRating: body.riskRating },
              metadata: { reference: app.reference },
            },
            tx,
          );
          await this.audit.record(
            {
              ctx,
              entityType: 'Investor',
              entityId: investor.id,
              action: 'INVESTOR_CREATED',
              after: { ref: investor.ref, legalName: investor.legalName, kycStatus: investor.kycStatus, riskRating: investor.riskRating, applicationId: id },
              metadata: { source: 'onboarding approval', accountRef: account.ref },
            },
            tx,
          );
          return { alreadyApproved: false, application: { id, status: after.status }, investor: { id: investor.id, ref: investor.ref, legalName: investor.legalName } };
        },
        { maxWait: 10_000, timeout: 30_000 },
      );
      return result;
    } catch (e) {
      // a concurrent / retried approval: return the investor the first request created
      const isRace = e instanceof ConflictException || (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002');
      if (isRace) {
        const inv = await this.prisma.investor.findUnique({ where: { applicationId: id }, select: { id: true, ref: true, legalName: true } });
        if (inv) return { alreadyApproved: true, application: { id, status: 'APPROVED' as const }, investor: inv };
      }
      throw e;
    }
  }
}

