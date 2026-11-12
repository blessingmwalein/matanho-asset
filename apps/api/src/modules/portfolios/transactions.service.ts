import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { SIDES, TRANSACTION_STATUSES, TRANSACTION_TYPES, formatMoney, listQuerySchema, type RecordTransactionInput } from '@nexus/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { RequestContext } from '../../common/auth/request-context';
import { D, dateOnly, marketValue, money, todayUtc } from '../../common/decimal';
import { buildOrderBy, pageArgs, paged } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ReferenceService } from '../../common/references/reference.service';
import { syncValuation } from './valuation';

export const transactionListSchema = listQuerySchema.extend({
  portfolioId: z.string().optional(),
  securityId: z.string().optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
  side: z.enum(SIDES).optional(),
  status: z.enum(TRANSACTION_STATUSES).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type TransactionListQuery = z.infer<typeof transactionListSchema>;

const TXN_INCLUDE = {
  portfolio: { select: { id: true, ref: true, name: true, baseCurrency: true } },
  security: { select: { id: true, ticker: true, name: true, assetClass: true } },
} satisfies Prisma.InvestmentTransactionInclude;

type TxnRow = Prisma.InvestmentTransactionGetPayload<{ include: typeof TXN_INCLUDE }>;

const mapTxn = (t: TxnRow) => ({
  id: t.id,
  ref: t.ref,
  tradeReference: t.tradeReference,
  portfolio: t.portfolio,
  security: t.security,
  type: t.type,
  side: t.side,
  quantity: t.quantity.toString(),
  price: t.price.toString(),
  amount: t.amount.toFixed(2),
  currency: t.currency,
  tradeDate: t.tradeDate,
  settlementDate: t.settlementDate,
  broker: t.broker,
  notes: t.notes,
  status: t.status,
  createdAt: t.createdAt,
});

const fail = (message: string, errors?: Record<string, string>) => new UnprocessableEntityException({ message, ...(errors ? { errors } : {}) });

interface HoldingChange {
  ticker: string;
  before: string;
  after: string;
}

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly refs: ReferenceService,
  ) {}

  async list(q: TransactionListQuery) {
    const where: Prisma.InvestmentTransactionWhereInput = {
      ...(q.portfolioId ? { portfolioId: q.portfolioId } : {}),
      ...(q.securityId ? { securityId: q.securityId } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.side ? { side: q.side } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.from || q.to ? { tradeDate: { ...(q.from ? { gte: dateOnly(q.from) } : {}), ...(q.to ? { lte: dateOnly(q.to) } : {}) } } : {}),
      ...(q.q
        ? {
            OR: [
              { ref: { contains: q.q, mode: 'insensitive' } },
              { tradeReference: { contains: q.q, mode: 'insensitive' } },
              { notes: { contains: q.q, mode: 'insensitive' } },
              { broker: { contains: q.q, mode: 'insensitive' } },
              { security: { ticker: { contains: q.q, mode: 'insensitive' } } },
              { security: { name: { contains: q.q, mode: 'insensitive' } } },
              { portfolio: { name: { contains: q.q, mode: 'insensitive' } } },
              { portfolio: { ref: { contains: q.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const orderBy = buildOrderBy<Prisma.InvestmentTransactionOrderByWithRelationInput[]>(
      q,
      {
        tradeDate: (d) => [{ tradeDate: d }, { createdAt: d }],
        ref: (d) => [{ ref: d }],
        tradeReference: (d) => [{ tradeReference: d }],
        portfolio: (d) => [{ portfolio: { ref: d } }],
        security: (d) => [{ security: { ticker: d } }],
        type: (d) => [{ type: d }],
        side: (d) => [{ side: d }],
        quantity: (d) => [{ quantity: d }],
        price: (d) => [{ price: d }],
        amount: (d) => [{ amount: d }],
        status: (d) => [{ status: d }],
      },
      [{ tradeDate: 'desc' }, { createdAt: 'desc' }],
    );
    const [rows, total] = await Promise.all([
      this.prisma.investmentTransaction.findMany({ where, orderBy, ...pageArgs(q), include: TXN_INCLUDE }),
      this.prisma.investmentTransaction.count({ where }),
    ]);
    return paged(rows.map(mapTxn), total, q);
  }

  async detail(id: string) {
    const t = await this.prisma.investmentTransaction.findUnique({ where: { id }, include: TXN_INCLUDE });
    if (!t) throw new NotFoundException('Transaction not found');
    const events = await this.prisma.auditEvent.findMany({ where: { entityType: 'InvestmentTransaction', entityId: id }, orderBy: { createdAt: 'desc' }, take: 20 });
    return { ...mapTxn(t), createdById: t.createdById, audit: events.map((e) => ({ id: e.id, action: e.action, actor: e.actorEmail, at: e.createdAt, after: e.after })) };
  }

  /**
   * Record an investment transaction. COMPLETED trades and cash events move holdings (simplified MVP model):
   *   BUY  → holding quantity up with a weighted-average cost; cash down by quantity × price (rejected if cash would go negative)
   *   SELL → holding quantity down (overselling rejected); cash up by quantity × price
   *   CASH_IN / DIVIDEND → cash up · CASH_OUT / FEE → cash down (rejected if cash would go negative)
   * then today's PortfolioValuation point is upserted. Everything happens in one DB transaction with the portfolio row locked.
   */
  async record(ctx: RequestContext, input: RecordTransactionInput) {
    const portfolio = await this.prisma.portfolio.findUnique({ where: { id: input.portfolioId } });
    if (!portfolio) throw fail('Portfolio not found', { portfolioId: 'Select a portfolio' });
    if (portfolio.status !== 'ACTIVE') throw new ConflictException(`${portfolio.ref} is ${portfolio.status.toLowerCase().replace('_', ' ')}; transactions can only be recorded on active portfolios.`);
    if (input.currency !== portfolio.baseCurrency) {
      throw fail(`${portfolio.ref} is held in ${portfolio.baseCurrency}. Record transactions in the portfolio currency; FX translation is outside the MVP valuation model.`, {
        currency: `Must be ${portfolio.baseCurrency} for this portfolio`,
      });
    }
    const tradeReference = input.tradeReference?.trim() || null;
    if (tradeReference) {
      const dup = await this.prisma.investmentTransaction.findUnique({ where: { portfolioId_tradeReference: { portfolioId: portfolio.id, tradeReference } }, select: { ref: true } });
      if (dup) throw new ConflictException(`Trade reference ${tradeReference} has already been recorded for ${portfolio.ref} (${dup.ref}).`);
    }

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          // serialise concurrent postings against the same portfolio (cash / oversell checks must see committed state)
          await tx.$queryRaw`SELECT id FROM "Portfolio" WHERE id = ${portfolio.id} FOR UPDATE`;

          const isTrade = input.type === 'TRADE';
          const security = input.securityId ? await tx.security.findUnique({ where: { id: input.securityId } }) : null;
          if (isTrade) {
            if (!security) throw fail('Security not found', { securityId: 'Select a security' });
            if (security.assetClass === 'CASH') throw fail('Cash lines are not traded. Record a cash event instead.', { securityId: 'Select a non-cash security' });
            if (security.currency !== portfolio.baseCurrency) {
              throw fail(`${security.ticker} is priced in ${security.currency}; ${portfolio.ref} is in ${portfolio.baseCurrency}. FX translation is outside the MVP valuation model.`, { securityId: `Security currency (${security.currency}) differs from the portfolio` });
            }
          }

          const quantity = isTrade ? D(input.quantity) : D(0);
          const price = isTrade ? D(input.price) : D(0);
          const amount = isTrade ? money(quantity.mul(price)) : money(D(input.amount));
          const tradeDate = dateOnly(input.tradeDate);

          const ref = await this.refs.transaction(tx);
          const txn = await tx.investmentTransaction.create({
            data: {
              ref,
              tradeReference,
              portfolioId: portfolio.id,
              securityId: security?.id ?? null,
              type: input.type,
              side: isTrade ? input.side : null,
              quantity,
              price,
              amount,
              currency: input.currency,
              tradeDate,
              settlementDate: input.settlementDate ? dateOnly(input.settlementDate) : null,
              broker: input.broker || null,
              notes: input.notes || null,
              status: input.status,
              createdById: ctx.userId,
            },
            include: TXN_INCLUDE,
          });

          const changes: HoldingChange[] = [];
          if (input.status === 'COMPLETED') {
            if (isTrade && security) {
              if (input.side === 'BUY') {
                await this.moveCash(tx, portfolio, amount.neg(), changes);
                await this.applyBuy(tx, portfolio.id, security, quantity, price, tradeDate, ref, changes);
              } else {
                await this.applySell(tx, portfolio.id, security, quantity, price, tradeDate, ref, changes);
                await this.moveCash(tx, portfolio, amount, changes);
              }
            } else if (input.type === 'CASH_IN' || input.type === 'DIVIDEND') {
              await this.moveCash(tx, portfolio, amount, changes);
            } else {
              await this.moveCash(tx, portfolio, amount.neg(), changes);
            }
            await syncValuation(tx, portfolio.id, 'Transaction');
          }

          await this.audit.record(
            {
              ctx,
              entityType: 'InvestmentTransaction',
              entityId: txn.id,
              action: 'TRANSACTION_RECORDED',
              after: {
                ref,
                portfolio: portfolio.ref,
                type: input.type,
                side: txn.side,
                ticker: security?.ticker ?? null,
                quantity: quantity.toString(),
                price: price.toString(),
                amount: amount.toString(),
                currency: input.currency,
                status: input.status,
                tradeReference,
              },
              metadata: { holdingChanges: changes },
            },
            tx,
          );
          return { ...mapTxn(txn), holdingChanges: changes };
        },
        { maxWait: 10_000, timeout: 30_000 },
      );
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Trade reference ${tradeReference ?? ''} has already been recorded for ${portfolio.ref}.`.replace('  ', ' '));
      }
      throw e;
    }
  }

  // ── holding mechanics (all Decimal) ─────────────────────────────────────────
  private async cashSecurity(tx: Prisma.TransactionClient, currency: string) {
    const ticker = `CASH-${currency}`;
    const found = await tx.security.findUnique({ where: { ticker } });
    if (found) return found;
    return tx.security.create({
      data: { ticker, name: `${currency} cash`, assetClass: 'CASH', currency, lastPrice: 1, priceSource: 'System' },
    });
  }

  /** Move the portfolio's cash line by `delta` (negative = pay out). Rejects if it would go negative. */
  private async moveCash(tx: Prisma.TransactionClient, portfolio: { id: string; ref: string; baseCurrency: string }, delta: Prisma.Decimal, changes: HoldingChange[]) {
    const cash = await this.cashSecurity(tx, portfolio.baseCurrency);
    const holding = await tx.holding.findUnique({ where: { portfolioId_securityId: { portfolioId: portfolio.id, securityId: cash.id } } });
    const available = D(holding?.quantity);
    const next = available.add(delta);
    if (next.isNegative()) {
      throw fail(
        `Insufficient cash in ${portfolio.ref}: ${formatMoney(available.toFixed(2), portfolio.baseCurrency)} available, ${formatMoney(delta.abs().toFixed(2), portfolio.baseCurrency)} required.`,
        { amount: 'Exceeds available cash in the portfolio' },
      );
    }
    const today = todayUtc();
    if (holding) {
      await tx.holding.update({
        where: { id: holding.id },
        data: { quantity: next, averageCost: 1, currentPrice: 1, marketValue: money(next), valuationDate: today, status: 'CONFIRMED', source: 'TRANSACTION', priceSource: 'Cash movement' },
      });
    } else {
      await tx.holding.create({
        data: { portfolioId: portfolio.id, securityId: cash.id, quantity: next, averageCost: 1, currentPrice: 1, currency: portfolio.baseCurrency, marketValue: money(next), valuationDate: today, source: 'TRANSACTION', priceSource: 'Cash movement', status: 'CONFIRMED' },
      });
    }
    changes.push({ ticker: cash.ticker, before: available.toString(), after: next.toString() });
  }

  private async applyBuy(
    tx: Prisma.TransactionClient,
    portfolioId: string,
    security: { id: string; ticker: string; currency: string },
    quantity: Prisma.Decimal,
    price: Prisma.Decimal,
    tradeDate: Date,
    ref: string,
    changes: HoldingChange[],
  ) {
    const existing = await tx.holding.findUnique({ where: { portfolioId_securityId: { portfolioId, securityId: security.id } } });
    if (!existing) {
      await tx.holding.create({
        data: {
          portfolioId,
          securityId: security.id,
          quantity,
          averageCost: price,
          currentPrice: price,
          currency: security.currency,
          marketValue: marketValue(quantity, price),
          valuationDate: tradeDate,
          source: 'TRANSACTION',
          priceSource: `Trade ${ref}`,
          status: 'CONFIRMED',
        },
      });
      changes.push({ ticker: security.ticker, before: '0', after: quantity.toString() });
      return;
    }
    const newQty = existing.quantity.add(quantity);
    // weighted-average cost: (old qty × old cost + new qty × price) / total qty
    const avg = existing.quantity.mul(existing.averageCost).add(quantity.mul(price)).div(newQty).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
    const useTradePrice = tradeDate >= existing.valuationDate;
    const currentPrice = useTradePrice ? price : existing.currentPrice;
    await tx.holding.update({
      where: { id: existing.id },
      data: {
        quantity: newQty,
        averageCost: avg,
        currentPrice,
        marketValue: marketValue(newQty, currentPrice),
        valuationDate: useTradePrice ? tradeDate : existing.valuationDate,
        priceSource: useTradePrice ? `Trade ${ref}` : existing.priceSource,
        status: 'CONFIRMED',
        source: 'TRANSACTION',
      },
    });
    changes.push({ ticker: security.ticker, before: existing.quantity.toString(), after: newQty.toString() });
  }

  private async applySell(
    tx: Prisma.TransactionClient,
    portfolioId: string,
    security: { id: string; ticker: string },
    quantity: Prisma.Decimal,
    price: Prisma.Decimal,
    tradeDate: Date,
    ref: string,
    changes: HoldingChange[],
  ) {
    const existing = await tx.holding.findUnique({ where: { portfolioId_securityId: { portfolioId, securityId: security.id } } });
    const held = D(existing?.quantity);
    if (!existing || held.lt(quantity)) {
      throw fail(`Cannot sell ${quantity.toString()} ${security.ticker}: ${held.isZero() ? 'none' : held.toString()} held in this portfolio.`, {
        quantity: `Exceeds the ${held.toString()} held`,
      });
    }
    const newQty = held.sub(quantity);
    if (newQty.isZero()) {
      await tx.holding.delete({ where: { id: existing.id } });
    } else {
      const useTradePrice = tradeDate >= existing.valuationDate;
      const currentPrice = useTradePrice ? price : existing.currentPrice;
      await tx.holding.update({
        where: { id: existing.id },
        data: {
          quantity: newQty,
          currentPrice,
          marketValue: marketValue(newQty, currentPrice),
          valuationDate: useTradePrice ? tradeDate : existing.valuationDate,
          priceSource: useTradePrice ? `Trade ${ref}` : existing.priceSource,
          status: 'CONFIRMED',
          source: 'TRANSACTION',
        },
      });
    }
    changes.push({ ticker: security.ticker, before: held.toString(), after: newQty.toString() });
  }
}
