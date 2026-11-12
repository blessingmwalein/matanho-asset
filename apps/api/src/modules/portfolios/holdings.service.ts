import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ASSET_CLASSES, HOLDING_STATUSES, listQuerySchema, type CreateHoldingInput, type UpdateHoldingInput } from '@nexus/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { RequestContext } from '../../common/auth/request-context';
import { D, dateOnly, marketValue } from '../../common/decimal';
import { buildOrderBy, pageArgs, paged } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { mapHolding } from './portfolios.service';
import { syncValuation } from './valuation';

export const holdingListSchema = listQuerySchema.extend({
  portfolioId: z.string().optional(),
  assetClass: z.enum(ASSET_CLASSES).optional(),
  status: z.enum(HOLDING_STATUSES).optional(),
});
export type HoldingListQuery = z.infer<typeof holdingListSchema>;

const snap = (h: { quantity: Prisma.Decimal; averageCost: Prisma.Decimal; currentPrice: Prisma.Decimal; marketValue: Prisma.Decimal; valuationDate: Date; priceSource: string | null; status: string }) => ({
  quantity: h.quantity.toString(),
  averageCost: h.averageCost.toString(),
  currentPrice: h.currentPrice.toString(),
  marketValue: h.marketValue.toString(),
  valuationDate: h.valuationDate,
  priceSource: h.priceSource,
  status: h.status,
});

@Injectable()
export class HoldingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Global holdings register with allocation % inside each holding's own portfolio. */
  async list(q: HoldingListQuery) {
    const where: Prisma.HoldingWhereInput = {
      ...(q.portfolioId ? { portfolioId: q.portfolioId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.assetClass ? { security: { assetClass: q.assetClass } } : {}),
      ...(q.q
        ? {
            OR: [
              { security: { ticker: { contains: q.q, mode: 'insensitive' } } },
              { security: { name: { contains: q.q, mode: 'insensitive' } } },
              { portfolio: { name: { contains: q.q, mode: 'insensitive' } } },
              { portfolio: { ref: { contains: q.q, mode: 'insensitive' } } },
              { portfolio: { investor: { legalName: { contains: q.q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const orderBy = buildOrderBy<Prisma.HoldingOrderByWithRelationInput>(
      q,
      {
        ticker: (d) => ({ security: { ticker: d } }),
        name: (d) => ({ security: { name: d } }),
        assetClass: (d) => ({ security: { assetClass: d } }),
        portfolio: (d) => ({ portfolio: { ref: d } }),
        quantity: (d) => ({ quantity: d }),
        currentPrice: (d) => ({ currentPrice: d }),
        marketValue: (d) => ({ marketValue: d }),
        valuationDate: (d) => ({ valuationDate: d }),
        status: (d) => ({ status: d }),
      },
      { marketValue: 'desc' },
    );
    const [rows, total, agg] = await Promise.all([
      this.prisma.holding.findMany({
        where,
        orderBy,
        ...pageArgs(q),
        include: { security: true, portfolio: { select: { id: true, ref: true, name: true, investor: { select: { legalName: true } } } } },
      }),
      this.prisma.holding.count({ where }),
      this.prisma.holding.aggregate({ where, _sum: { marketValue: true } }),
    ]);
    const totals = await this.prisma.holding.groupBy({
      by: ['portfolioId'],
      where: { portfolioId: { in: Array.from(new Set(rows.map((r) => r.portfolioId))) } },
      _sum: { marketValue: true },
    });
    const totalMap = new Map(totals.map((t) => [t.portfolioId, D(t._sum.marketValue)]));
    const data = rows.map((r) => ({
      ...mapHolding(r, totalMap.get(r.portfolioId) ?? D(0)),
      investorName: r.portfolio.investor.legalName,
    }));
    return { ...paged(data, total, q), summary: { totalMarketValue: D(agg._sum.marketValue).toFixed(2), count: total } };
  }

  private async loadPortfolio(portfolioId: string) {
    const p = await this.prisma.portfolio.findUnique({ where: { id: portfolioId } });
    if (!p) throw new NotFoundException('Portfolio not found');
    if (p.status === 'CLOSED') throw new ConflictException('This portfolio is closed; holdings cannot be changed.');
    return p;
  }

  /** Manual holdings are created as DRAFT (source MANUAL) and stay editable until confirmed. */
  async create(ctx: RequestContext, portfolioId: string, input: CreateHoldingInput) {
    const portfolio = await this.loadPortfolio(portfolioId);
    if (!input.securityId && !input.newSecurity) {
      throw new UnprocessableEntityException({ message: 'Select a security', errors: { securityId: 'Select a security or create a new one' } });
    }
    return this.prisma.$transaction(
      async (tx) => {
        let security = input.securityId ? await tx.security.findUnique({ where: { id: input.securityId } }) : null;
        if (input.securityId && !security) throw new UnprocessableEntityException({ message: 'Security not found', errors: { securityId: 'Select a valid security' } });
        if (!security && input.newSecurity) {
          const ns = input.newSecurity;
          const dup = await tx.security.findUnique({ where: { ticker: ns.ticker } });
          if (dup) throw new ConflictException(`A security with ticker ${ns.ticker} already exists. Select it instead.`);
          security = await tx.security.create({
            data: {
              ticker: ns.ticker,
              name: ns.name,
              assetClass: ns.assetClass,
              currency: ns.currency,
              lastPrice: ns.lastPrice || input.currentPrice,
              isin: ns.isin || null,
              exchange: ns.exchange || null,
              priceSource: input.priceSource,
            },
          });
          await this.audit.record({ ctx, entityType: 'Security', entityId: security.id, action: 'SECURITY_CREATED', after: { ticker: security.ticker, name: security.name, assetClass: security.assetClass } }, tx);
        }
        const sec = security!;
        if (sec.currency !== portfolio.baseCurrency) {
          throw new UnprocessableEntityException({
            message: `${sec.ticker} is priced in ${sec.currency}; this portfolio is in ${portfolio.baseCurrency}. FX translation is outside the MVP valuation model.`,
            errors: { securityId: `Security currency (${sec.currency}) differs from the portfolio currency` },
          });
        }
        const dup = await tx.holding.findUnique({ where: { portfolioId_securityId: { portfolioId, securityId: sec.id } } });
        if (dup) throw new ConflictException(`${portfolio.ref} already holds ${sec.ticker}. Edit the existing holding instead.`);

        const mv = marketValue(input.quantity, input.currentPrice);
        const holding = await tx.holding.create({
          data: {
            portfolioId,
            securityId: sec.id,
            quantity: D(input.quantity),
            averageCost: D(input.averageCost),
            currentPrice: D(input.currentPrice),
            currency: sec.currency,
            marketValue: mv,
            valuationDate: dateOnly(input.valuationDate),
            source: 'MANUAL',
            priceSource: input.priceSource,
            status: 'DRAFT',
            createdById: ctx.userId,
          },
        });
        await syncValuation(tx, portfolioId, 'Manual holding');
        await this.audit.record(
          {
            ctx,
            entityType: 'Holding',
            entityId: holding.id,
            action: 'HOLDING_CREATED',
            after: { portfolio: portfolio.ref, ticker: sec.ticker, ...snap(holding) },
            metadata: { portfolioId },
          },
          tx,
        );
        return { id: holding.id, portfolioId, ticker: sec.ticker, marketValue: holding.marketValue.toFixed(2), status: holding.status };
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
  }

  private async loadDraft(id: string) {
    const h = await this.prisma.holding.findUnique({ where: { id }, include: { security: true, portfolio: { select: { ref: true } } } });
    if (!h) throw new NotFoundException('Holding not found');
    if (h.status !== 'DRAFT') {
      throw new ConflictException('Only draft holdings can be edited or removed. Confirmed holdings change through recorded transactions.');
    }
    return h;
  }

  async update(ctx: RequestContext, id: string, input: UpdateHoldingInput) {
    const before = await this.loadDraft(id);
    const quantity = input.quantity !== undefined ? D(input.quantity) : before.quantity;
    const currentPrice = input.currentPrice !== undefined ? D(input.currentPrice) : before.currentPrice;
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.holding.update({
        where: { id },
        data: {
          quantity,
          currentPrice,
          marketValue: marketValue(quantity, currentPrice),
          ...(input.averageCost !== undefined ? { averageCost: D(input.averageCost) } : {}),
          ...(input.valuationDate ? { valuationDate: dateOnly(input.valuationDate) } : {}),
          ...(input.priceSource ? { priceSource: input.priceSource } : {}),
        },
      });
      await syncValuation(tx, before.portfolioId, 'Manual holding');
      await this.audit.record(
        { ctx, entityType: 'Holding', entityId: id, action: 'HOLDING_UPDATED', before: snap(before), after: snap(u), metadata: { portfolio: before.portfolio.ref, ticker: before.security.ticker } },
        tx,
      );
      return { id: u.id, marketValue: u.marketValue.toFixed(2), status: u.status };
    });
  }

  async remove(ctx: RequestContext, id: string) {
    const before = await this.loadDraft(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.holding.delete({ where: { id } });
      await syncValuation(tx, before.portfolioId, 'Manual holding');
      await this.audit.record(
        { ctx, entityType: 'Holding', entityId: id, action: 'HOLDING_REMOVED', before: snap(before), metadata: { portfolio: before.portfolio.ref, ticker: before.security.ticker } },
        tx,
      );
    });
    return { ok: true };
  }

  async confirm(ctx: RequestContext, id: string) {
    const before = await this.loadDraft(id);
    const res = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.holding.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'CONFIRMED' } });
      if (claimed.count === 0) throw new ConflictException('This holding was already confirmed.');
      const after = await tx.holding.findUniqueOrThrow({ where: { id } });
      await this.audit.record(
        { ctx, entityType: 'Holding', entityId: id, action: 'HOLDING_CONFIRMED', before: snap(before), after: snap(after), metadata: { portfolio: before.portfolio.ref, ticker: before.security.ticker } },
        tx,
      );
      return after;
    });
    return { id: res.id, status: res.status, marketValue: res.marketValue.toFixed(2) };
  }
}
