import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { KycStatus, ListQuery } from '@nexus/shared';
import { z } from 'zod';
import { INVESTOR_STATUSES, INVESTOR_TYPES, KYC_STATUSES, RISK_RATINGS } from '@nexus/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { RequestContext } from '../../common/auth/request-context';
import { D, sum } from '../../common/decimal';
import { buildOrderBy, pageArgs, paged } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';

export const investorListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  q: z.string().trim().optional(),
  sort: z.string().trim().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
  kycStatus: z.enum(KYC_STATUSES).optional(),
  status: z.enum(INVESTOR_STATUSES).optional(),
  investorType: z.enum(INVESTOR_TYPES).optional(),
  country: z.string().trim().optional(),
});
export type InvestorListQuery = z.infer<typeof investorListSchema>;

export const updateInvestorSchema = z
  .object({
    contactName: z.string().trim().min(2, 'Contact name is required').optional(),
    email: z.email('Enter a valid email address').optional(),
    phone: z.string().trim().nullable().optional(),
    relationshipManagerId: z.string().nullable().optional(),
    status: z.enum(INVESTOR_STATUSES).optional(),
    kycStatus: z.enum(KYC_STATUSES).optional(),
    riskRating: z.enum(RISK_RATINGS).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type UpdateInvestorInput = z.infer<typeof updateInvestorSchema>;

@Injectable()
export class InvestorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Sum of holdings.marketValue per portfolio id. */
  private async valueByPortfolio(portfolioIds: string[]): Promise<Map<string, Prisma.Decimal>> {
    if (!portfolioIds.length) return new Map();
    const rows = await this.prisma.holding.groupBy({
      by: ['portfolioId'],
      where: { portfolioId: { in: portfolioIds } },
      _sum: { marketValue: true },
    });
    return new Map(rows.map((r) => [r.portfolioId, D(r._sum.marketValue)]));
  }

  async list(q: InvestorListQuery) {
    const where: Prisma.InvestorWhereInput = {
      ...(q.kycStatus ? { kycStatus: q.kycStatus } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.investorType ? { investorType: q.investorType } : {}),
      ...(q.country ? { country: { equals: q.country, mode: 'insensitive' } } : {}),
      ...(q.q
        ? {
            OR: [
              { legalName: { contains: q.q, mode: 'insensitive' } },
              { ref: { contains: q.q, mode: 'insensitive' } },
              { email: { contains: q.q, mode: 'insensitive' } },
              { contactName: { contains: q.q, mode: 'insensitive' } },
              { country: { contains: q.q, mode: 'insensitive' } },
              { registrationNumber: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const orderBy = buildOrderBy<Prisma.InvestorOrderByWithRelationInput>(
      q,
      {
        legalName: (d) => ({ legalName: d }),
        ref: (d) => ({ ref: d }),
        country: (d) => ({ country: d }),
        investorType: (d) => ({ investorType: d }),
        kycStatus: (d) => ({ kycStatus: d }),
        status: (d) => ({ status: d }),
        createdAt: (d) => ({ createdAt: d }),
        portfolioCount: (d) => ({ portfolios: { _count: d } }),
        relationshipManager: (d) => ({ relationshipManager: { name: d } }),
      },
      { createdAt: 'desc' },
    );
    const [rows, total] = await Promise.all([
      this.prisma.investor.findMany({
        where,
        orderBy,
        ...pageArgs(q),
        include: {
          relationshipManager: { select: { id: true, name: true } },
          portfolios: { select: { id: true } },
        },
      }),
      this.prisma.investor.count({ where }),
    ]);
    const values = await this.valueByPortfolio(rows.flatMap((r) => r.portfolios.map((p) => p.id)));
    const data = rows.map((r) => ({
      id: r.id,
      ref: r.ref,
      legalName: r.legalName,
      investorType: r.investorType,
      country: r.country,
      email: r.email,
      contactName: r.contactName,
      kycStatus: r.kycStatus,
      riskRating: r.riskRating,
      status: r.status,
      baseCurrency: r.baseCurrency,
      portfolioCount: r.portfolios.length,
      totalPortfolioValue: sum(r.portfolios.map((p) => values.get(p.id))).toFixed(2),
      relationshipManager: r.relationshipManager?.name ?? null,
      relationshipManagerId: r.relationshipManager?.id ?? null,
      createdAt: r.createdAt,
    }));
    return paged(data, total, q as Pick<ListQuery, 'page' | 'pageSize'>);
  }

  /** Slim list for selects (investor pickers). */
  async options() {
    const rows = await this.prisma.investor.findMany({
      where: { status: { not: 'CLOSED' } },
      orderBy: { legalName: 'asc' },
      select: { id: true, ref: true, legalName: true, baseCurrency: true },
    });
    return rows.map((r) => ({ id: r.id, ref: r.ref, name: r.legalName, baseCurrency: r.baseCurrency }));
  }

  /** Internal staff users (relationship / portfolio manager pickers). */
  async staffOptions() {
    const rows = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', memberships: { some: { organisation: { type: 'ASSET_MANAGER' } } } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, memberships: { select: { role: { select: { name: true } } }, take: 1 } },
    });
    return rows.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.memberships[0]?.role.name ?? null }));
  }

  async detail(id: string) {
    const inv = await this.prisma.investor.findUnique({
      where: { id },
      include: {
        relationshipManager: { select: { id: true, name: true, email: true } },
        owners: { orderBy: { createdAt: 'asc' } },
        signatories: { orderBy: { createdAt: 'asc' } },
        declaration: true,
        accounts: { orderBy: { createdAt: 'asc' }, include: { portfolios: { select: { id: true } } } },
        portfolios: {
          orderBy: { createdAt: 'asc' },
          include: { manager: { select: { id: true, name: true } }, account: { select: { id: true, ref: true, name: true } } },
        },
        application: { select: { id: true, reference: true, submittedAt: true, decidedAt: true, riskFlags: true } },
      },
    });
    if (!inv) throw new NotFoundException('Investor not found');

    const portfolioIds = inv.portfolios.map((p) => p.id);
    const [values, documents, txns, auditRows] = await Promise.all([
      this.valueByPortfolio(portfolioIds),
      this.prisma.document.findMany({
        where: { investorId: id },
        orderBy: { createdAt: 'desc' },
        include: { versions: { orderBy: { versionNo: 'desc' }, take: 1 }, portfolio: { select: { id: true, ref: true, name: true } } },
      }),
      portfolioIds.length
        ? this.prisma.investmentTransaction.findMany({
            where: { portfolioId: { in: portfolioIds } },
            orderBy: [{ tradeDate: 'desc' }, { createdAt: 'desc' }],
            take: 10,
            include: { portfolio: { select: { ref: true, name: true } }, security: { select: { ticker: true, name: true } } },
          })
        : Promise.resolve([]),
      this.prisma.auditEvent.findMany({
        where: {
          OR: [
            { entityType: 'Investor', entityId: id },
            ...(inv.applicationId ? [{ entityType: 'InvestorApplication', entityId: inv.applicationId }] : []),
            ...(portfolioIds.length ? [{ entityType: 'Portfolio', entityId: { in: portfolioIds } }] : []),
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    const totalValue = sum(inv.portfolios.map((p) => values.get(p.id)));
    const d = inv.declaration;

    const activity = [
      ...auditRows.map((a) => ({
        id: `audit-${a.id}`,
        kind: 'AUDIT' as const,
        at: a.createdAt,
        title: humanise(a.action),
        actor: a.actorEmail,
        detail: null as string | null,
      })),
      ...txns.map((t) => ({
        id: `txn-${t.id}`,
        kind: 'TRANSACTION' as const,
        at: t.createdAt,
        title:
          t.type === 'TRADE'
            ? `${t.side === 'BUY' ? 'Bought' : 'Sold'} ${t.security?.ticker ?? ''} in ${t.portfolio.ref}`
            : `${humanise(t.type)} recorded in ${t.portfolio.ref}`,
        actor: null as string | null,
        detail: `${t.ref} · ${t.currency} ${t.amount.toFixed(2)} · ${t.status.toLowerCase()}`,
      })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 25);

    return {
      id: inv.id,
      ref: inv.ref,
      legalName: inv.legalName,
      investorType: inv.investorType,
      registrationNumber: inv.registrationNumber,
      country: inv.country,
      taxIdentificationNumber: inv.taxIdentificationNumber,
      registeredAddress: inv.registeredAddress,
      investmentObjective: inv.investmentObjective,
      classification: inv.classification,
      baseCurrency: inv.baseCurrency,
      status: inv.status,
      createdAt: inv.createdAt,
      relationshipManager: inv.relationshipManager,
      contact: { name: inv.contactName, email: inv.email, phone: inv.phone },
      bank: {
        bankName: inv.bankName,
        accountHolder: inv.bankAccountHolder,
        accountMasked: inv.bankAccountMasked,
        currency: inv.bankCurrency,
        swiftBic: inv.swiftBic,
      },
      kyc: {
        status: inv.kycStatus as KycStatus,
        riskRating: inv.riskRating,
        reviewedAt: inv.kycReviewedAt,
        nextReviewAt: inv.kycNextReviewAt,
        riskFlags: d?.riskFlags ?? inv.application?.riskFlags ?? [],
        declaration: d
          ? {
              pep: d.pep,
              sanctions: d.sanctions,
              adverseMedia: d.adverseMedia,
              highRiskJurisdiction: d.highRiskJurisdiction,
              sourceOfFunds: d.sourceOfFunds,
              sourceOfWealth: d.sourceOfWealth,
              expectedActivity: d.expectedActivity,
              transactionFrequency: d.transactionFrequency,
              taxResidency: d.taxResidency,
              fatca: d.fatca,
              crs: d.crs,
              usIndicia: d.usIndicia,
              consentGiven: d.consentGiven,
              consentAt: d.consentAt,
              signatureName: d.signatureName,
            }
          : null,
        application: inv.application,
      },
      owners: inv.owners.map((o) => ({
        id: o.id,
        fullName: o.fullName,
        ownershipPercent: o.ownershipPercent.toString(),
        nationality: o.nationality,
        idReference: o.idReference,
        email: o.email,
        isController: o.isController,
      })),
      signatories: inv.signatories.map((s) => ({ id: s.id, fullName: s.fullName, role: s.role, email: s.email, authority: s.authority })),
      accounts: inv.accounts.map((a) => ({
        id: a.id,
        ref: a.ref,
        name: a.name,
        type: a.type,
        baseCurrency: a.baseCurrency,
        status: a.status,
        portfolioCount: a.portfolios.length,
        value: sum(a.portfolios.map((p) => values.get(p.id))).toFixed(2),
      })),
      portfolios: inv.portfolios.map((p) => ({
        id: p.id,
        ref: p.ref,
        name: p.name,
        type: p.type,
        status: p.status,
        baseCurrency: p.baseCurrency,
        benchmark: p.benchmark,
        inceptionDate: p.inceptionDate,
        manager: p.manager?.name ?? null,
        account: p.account,
        currentValue: (values.get(p.id) ?? D(0)).toFixed(2),
      })),
      totalPortfolioValue: totalValue.toFixed(2),
      documents: documents.map((doc) => ({
        id: doc.id,
        ref: doc.ref,
        title: doc.title,
        category: doc.category,
        status: doc.status,
        audience: doc.audience,
        currentVersionNo: doc.currentVersionNo,
        createdAt: doc.createdAt,
        portfolio: doc.portfolio,
        file: doc.versions[0]
          ? { fileName: doc.versions[0].fileName, mimeType: doc.versions[0].mimeType, sizeBytes: doc.versions[0].sizeBytes }
          : null,
      })),
      activity,
    };
  }

  async update(ctx: RequestContext, id: string, input: UpdateInvestorInput) {
    const before = await this.prisma.investor.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Investor not found');

    if (input.relationshipManagerId) {
      const rm = await this.prisma.user.findFirst({
        where: { id: input.relationshipManagerId, status: 'ACTIVE', memberships: { some: { organisation: { type: 'ASSET_MANAGER' } } } },
        select: { id: true },
      });
      if (!rm) throw new ConflictException('Relationship manager must be an active internal user');
    }

    const data: Prisma.InvestorUncheckedUpdateInput = {};
    if (input.contactName !== undefined) data.contactName = input.contactName;
    if (input.email !== undefined) data.email = input.email;
    if (input.phone !== undefined) data.phone = input.phone || null;
    if (input.relationshipManagerId !== undefined) data.relationshipManagerId = input.relationshipManagerId;
    if (input.status !== undefined) data.status = input.status;
    if (input.riskRating !== undefined) data.riskRating = input.riskRating;
    if (input.kycStatus !== undefined && input.kycStatus !== before.kycStatus) {
      data.kycStatus = input.kycStatus;
      if (input.kycStatus === 'VERIFIED') {
        data.kycReviewedAt = new Date();
        data.kycNextReviewAt = new Date(Date.now() + 365 * 86400000);
      }
    }

    const snapshot = (i: typeof before) => ({
      contactName: i.contactName,
      email: i.email,
      phone: i.phone,
      relationshipManagerId: i.relationshipManagerId,
      status: i.status,
      kycStatus: i.kycStatus,
      riskRating: i.riskRating,
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.investor.update({ where: { id }, data });
      await this.audit.record(
        {
          ctx,
          entityType: 'Investor',
          entityId: id,
          action: input.kycStatus && input.kycStatus !== before.kycStatus ? 'INVESTOR_KYC_STATUS_CHANGED' : 'INVESTOR_UPDATED',
          before: snapshot(before),
          after: snapshot(u),
          metadata: { ref: before.ref },
        },
        tx,
      );
      return u;
    });
    return { id: updated.id, ref: updated.ref, status: updated.status, kycStatus: updated.kycStatus };
  }
}

function humanise(action: string): string {
  const s = action.replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
