import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  ASSET_CLASSES,
  PORTFOLIO_STATUSES,
  PORTFOLIO_TYPES,
  listQuerySchema,
  type CreatePortfolioInput,
  type CreateSecurityInput,
  type UpdatePortfolioInput,
} from '@nexus/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { RequestContext } from '../../common/auth/request-context';
import { D, dateOnly, sum } from '../../common/decimal';
import { buildOrderBy, pageArgs, paged } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ReferenceService } from '../../common/references/reference.service';
import { buildAllocation, buildSeries } from './valuation';

export const portfolioListSchema = listQuerySchema.extend({
  investorId: z.string().optional(),
  status: z.enum(PORTFOLIO_STATUSES).optional(),
  type: z.enum(PORTFOLIO_TYPES).optional(),
});
export type PortfolioListQuery = z.infer<typeof portfolioListSchema>;

export const securityListSchema = z.object({
  q: z.string().trim().optional(),
  assetClass: z.enum(ASSET_CLASSES).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type SecurityListQuery = z.infer<typeof securityListSchema>;

/** Row shape shared by the holdings register and the portfolio detail page. */
type HoldingWithSecurity = Prisma.HoldingGetPayload<{ include: { security: true } }> & { portfolio?: { id: string; ref: string; name: string } | null };

export function mapHolding(h: HoldingWithSecurity, portfolioTotal: Prisma.Decimal) {
  return {
    id: h.id,
    portfolioId: h.portfolioId,
    portfolio: h.portfolio ?? null,
    security: { id: h.security.id, ticker: h.security.ticker, name: h.security.name, assetClass: h.security.assetClass, exchange: h.security.exchange },
    quantity: h.quantity.toString(),
    averageCost: h.averageCost.toString(),
    currentPrice: h.currentPrice.toString(),
    currency: h.currency,
    marketValue: h.marketValue.toFixed(2),
    allocationPct: portfolioTotal.isZero() ? '0.00' : h.marketValue.div(portfolioTotal).mul(100).toFixed(2),
    valuationDate: h.valuationDate,
    source: h.source,
    priceSource: h.priceSource,
    status: h.status,
    updatedAt: h.updatedAt,
  };
}

const slugPrefix = (name: string): string => {
  const words = name.replace(/[^A-Za-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  let letters = words
    .slice(0, 3)
    .map((w) => w[0]!)
    .join('')
    .toUpperCase();
  const head = (words[0] ?? 'PFL').toUpperCase();
  let i = 1;
  while (letters.length < 3 && i < head.length) letters += head[i++];
  return (letters || 'PFL').padEnd(3, 'X');
};

@Injectable()
export class PortfoliosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly refs: ReferenceService,
  ) {}

  /** Sum of holdings.marketValue per portfolio id. */
  async valueByPortfolio(portfolioIds?: string[]): Promise<Map<string, Prisma.Decimal>> {
    const rows = await this.prisma.holding.groupBy({
      by: ['portfolioId'],
      ...(portfolioIds ? { where: { portfolioId: { in: portfolioIds } } } : {}),
      _sum: { marketValue: true },
    });
    return new Map(rows.map((r) => [r.portfolioId, D(r._sum.marketValue)]));
  }

  async list(q: PortfolioListQuery) {
    const where: Prisma.PortfolioWhereInput = {
      ...(q.investorId ? { investorId: q.investorId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' } },
              { ref: { contains: q.q, mode: 'insensitive' } },
              { benchmark: { contains: q.q, mode: 'insensitive' } },
              { investor: { legalName: { contains: q.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const orderBy = buildOrderBy<Prisma.PortfolioOrderByWithRelationInput>(
      q,
      {
        name: (d) => ({ name: d }),
        ref: (d) => ({ ref: d }),
        investor: (d) => ({ investor: { legalName: d } }),
        type: (d) => ({ type: d }),
        inceptionDate: (d) => ({ inceptionDate: d }),
        status: (d) => ({ status: d }),
        createdAt: (d) => ({ createdAt: d }),
      },
      { createdAt: 'desc' },
    );
    const [rows, total] = await Promise.all([
      this.prisma.portfolio.findMany({
        where,
        orderBy,
        ...pageArgs(q),
        include: { investor: { select: { id: true, ref: true, legalName: true } }, manager: { select: { id: true, name: true } } },
      }),
      this.prisma.portfolio.count({ where }),
    ]);
    const values = await this.valueByPortfolio(rows.map((r) => r.id));
    const data = rows.map((p) => ({
      id: p.id,
      ref: p.ref,
      name: p.name,
      investor: p.investor,
      type: p.type,
      baseCurrency: p.baseCurrency,
      manager: p.manager?.name ?? null,
      benchmark: p.benchmark,
      inceptionDate: p.inceptionDate,
      status: p.status,
      currentValue: (values.get(p.id) ?? D(0)).toFixed(2),
    }));
    return paged(data, total, q);
  }

  /** Slim list for portfolio pickers. */
  async options() {
    const rows = await this.prisma.portfolio.findMany({
      where: { status: { not: 'CLOSED' } },
      orderBy: { ref: 'asc' },
      select: { id: true, ref: true, name: true, baseCurrency: true, status: true, investor: { select: { id: true, legalName: true } } },
    });
    return rows.map((r) => ({ id: r.id, ref: r.ref, name: r.name, baseCurrency: r.baseCurrency, status: r.status, investorId: r.investor.id, investorName: r.investor.legalName }));
  }

  async detail(id: string) {
    const p = await this.prisma.portfolio.findUnique({
      where: { id },
      include: {
        investor: { select: { id: true, ref: true, legalName: true } },
        manager: { select: { id: true, name: true } },
        account: { select: { id: true, ref: true, name: true } },
      },
    });
    if (!p) throw new NotFoundException('Portfolio not found');

    const [holdings, valuations, txns, docs] = await Promise.all([
      this.prisma.holding.findMany({ where: { portfolioId: id }, include: { security: true }, orderBy: { marketValue: 'desc' } }),
      this.prisma.portfolioValuation.findMany({ where: { portfolioId: id }, orderBy: { asOf: 'asc' } }),
      this.prisma.investmentTransaction.findMany({
        where: { portfolioId: id },
        orderBy: [{ tradeDate: 'desc' }, { createdAt: 'desc' }],
        take: 10,
        include: { security: { select: { id: true, ticker: true, name: true } } },
      }),
      this.prisma.document.findMany({
        where: { portfolioId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { versions: { orderBy: { versionNo: 'desc' }, take: 1 } },
      }),
    ]);

    const total = sum(holdings.map((h) => h.marketValue));
    const latestValuation = holdings.reduce<Date | null>((a, h) => (!a || h.valuationDate > a ? h.valuationDate : a), null);

    return {
      id: p.id,
      ref: p.ref,
      name: p.name,
      description: p.description,
      investor: p.investor,
      account: p.account,
      manager: p.manager,
      type: p.type,
      baseCurrency: p.baseCurrency,
      benchmark: p.benchmark,
      inceptionDate: p.inceptionDate,
      status: p.status,
      createdAt: p.createdAt,
      currentValue: total.toFixed(2),
      holdingsCount: holdings.length,
      valuationDate: latestValuation,
      draftHoldings: holdings.filter((h) => h.status === 'DRAFT').length,
      performance: buildSeries(valuations),
      allocation: buildAllocation(holdings.map((h) => ({ assetClass: h.security.assetClass, value: h.marketValue }))),
      holdings: holdings.map((h) => mapHolding(h, total)),
      recentTransactions: txns.map((t) => ({
        id: t.id,
        ref: t.ref,
        tradeReference: t.tradeReference,
        type: t.type,
        side: t.side,
        security: t.security,
        quantity: t.quantity.toString(),
        price: t.price.toString(),
        amount: t.amount.toFixed(2),
        currency: t.currency,
        tradeDate: t.tradeDate,
        status: t.status,
        notes: t.notes,
      })),
      documents: docs.map((d) => ({
        id: d.id,
        ref: d.ref,
        title: d.title,
        category: d.category,
        status: d.status,
        audience: d.audience,
        reportDate: d.reportDate,
        createdAt: d.createdAt,
        file: d.versions[0] ? { fileName: d.versions[0].fileName, mimeType: d.versions[0].mimeType, sizeBytes: d.versions[0].sizeBytes } : null,
      })),
    };
  }

  private async assertManager(managerId: string | undefined | null) {
    if (!managerId) return;
    const m = await this.prisma.user.findFirst({
      where: { id: managerId, status: 'ACTIVE', memberships: { some: { organisation: { type: 'ASSET_MANAGER' } } } },
      select: { id: true },
    });
    if (!m) throw new UnprocessableEntityException({ message: 'Portfolio manager must be an active internal user', errors: { managerId: 'Select an active internal user' } });
  }

  async create(ctx: RequestContext, input: CreatePortfolioInput) {
    const investor = await this.prisma.investor.findUnique({ where: { id: input.investorId } });
    if (!investor) throw new UnprocessableEntityException({ message: 'Investor not found', errors: { investorId: 'Select an investor' } });
    if (investor.status === 'CLOSED') throw new ConflictException('This investor relationship is closed.');
    await this.assertManager(input.managerId);

    return this.prisma.$transaction(
      async (tx) => {
        let accountId = input.accountId ?? null;
        if (accountId) {
          const acct = await tx.investmentAccount.findUnique({ where: { id: accountId } });
          if (!acct || acct.investorId !== investor.id) throw new UnprocessableEntityException({ message: 'Account does not belong to this investor', errors: { accountId: 'Select one of the investor’s accounts' } });
        } else {
          const existing = await tx.investmentAccount.findFirst({ where: { investorId: investor.id, type: 'MANDATE', status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
          if (existing) accountId = existing.id;
          else {
            const created = await tx.investmentAccount.create({
              data: { ref: await this.refs.generic('ACC', 4, tx), investorId: investor.id, name: 'Main investment account', type: 'MANDATE', baseCurrency: input.baseCurrency, createdById: ctx.userId },
            });
            accountId = created.id;
          }
        }

        const prefix = slugPrefix(input.name);
        let ref = '';
        for (let i = 0; i < 50; i++) {
          ref = await this.refs.generic(prefix, 3, tx);
          if (!(await tx.portfolio.findUnique({ where: { ref }, select: { id: true } }))) break;
        }

        const portfolio = await tx.portfolio.create({
          data: {
            ref,
            name: input.name,
            investorId: investor.id,
            accountId,
            type: input.type,
            baseCurrency: input.baseCurrency,
            managerId: input.managerId ?? null,
            benchmark: input.benchmark || null,
            inceptionDate: dateOnly(input.inceptionDate),
            description: input.description || null,
            status: 'ACTIVE',
            createdById: ctx.userId,
          },
        });
        await this.audit.record(
          {
            ctx,
            entityType: 'Portfolio',
            entityId: portfolio.id,
            action: 'PORTFOLIO_CREATED',
            after: { ref: portfolio.ref, name: portfolio.name, investorId: investor.id, type: portfolio.type, baseCurrency: portfolio.baseCurrency, accountId },
          },
          tx,
        );
        return { id: portfolio.id, ref: portfolio.ref, name: portfolio.name };
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
  }

  async update(ctx: RequestContext, id: string, input: UpdatePortfolioInput) {
    const before = await this.prisma.portfolio.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Portfolio not found');
    if (input.managerId !== undefined) await this.assertManager(input.managerId);
    const snap = (p: typeof before) => ({ name: p.name, managerId: p.managerId, benchmark: p.benchmark, description: p.description, status: p.status });
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.portfolio.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.managerId !== undefined ? { managerId: input.managerId || null } : {}),
          ...(input.benchmark !== undefined ? { benchmark: input.benchmark || null } : {}),
          ...(input.description !== undefined ? { description: input.description || null } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      });
      await this.audit.record(
        {
          ctx,
          entityType: 'Portfolio',
          entityId: id,
          action: input.status && input.status !== before.status ? 'PORTFOLIO_STATUS_CHANGED' : 'PORTFOLIO_UPDATED',
          before: snap(before),
          after: snap(u),
          metadata: { ref: before.ref },
        },
        tx,
      );
      return { id: u.id, ref: u.ref, name: u.name, status: u.status };
    });
  }

  // ── securities ────────────────────────────────────────────────────────────
  async listSecurities(q: SecurityListQuery) {
    const rows = await this.prisma.security.findMany({
      where: {
        isActive: true,
        ...(q.assetClass ? { assetClass: q.assetClass } : {}),
        ...(q.q ? { OR: [{ ticker: { contains: q.q, mode: 'insensitive' } }, { name: { contains: q.q, mode: 'insensitive' } }, { isin: { contains: q.q, mode: 'insensitive' } }] } : {}),
      },
      orderBy: [{ assetClass: 'asc' }, { ticker: 'asc' }],
      take: q.limit,
    });
    return rows.map((s) => ({
      id: s.id,
      ticker: s.ticker,
      name: s.name,
      isin: s.isin,
      assetClass: s.assetClass,
      currency: s.currency,
      exchange: s.exchange,
      lastPrice: s.lastPrice.toString(),
      priceDate: s.priceDate,
    }));
  }

  async createSecurity(ctx: RequestContext, input: CreateSecurityInput) {
    const dup = await this.prisma.security.findUnique({ where: { ticker: input.ticker }, select: { id: true } });
    if (dup) throw new ConflictException(`A security with ticker ${input.ticker} already exists.`);
    const s = await this.prisma.$transaction(async (tx) => {
      const created = await tx.security.create({
        data: {
          ticker: input.ticker,
          name: input.name,
          assetClass: input.assetClass,
          currency: input.currency,
          lastPrice: input.lastPrice,
          isin: input.isin || null,
          exchange: input.exchange || null,
          priceSource: 'Manual entry',
        },
      });
      await this.audit.record(
        { ctx, entityType: 'Security', entityId: created.id, action: 'SECURITY_CREATED', after: { ticker: created.ticker, name: created.name, assetClass: created.assetClass, currency: created.currency } },
        tx,
      );
      return created;
    });
    return {
      id: s.id,
      ticker: s.ticker,
      name: s.name,
      isin: s.isin,
      assetClass: s.assetClass,
      currency: s.currency,
      exchange: s.exchange,
      lastPrice: s.lastPrice.toString(),
      priceDate: s.priceDate,
    };
  }
}
