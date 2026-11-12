import { Injectable, NotFoundException } from '@nestjs/common';
import { ASSET_CLASS_LABELS, PORTFOLIO_TYPE_LABELS, SIMPLIFIED_VALUATION_NOTICE, formatDate, formatQuantity, formatPrice } from '@nexus/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { RequestContext } from '../../common/auth/request-context';
import { D, dateOnly, sum, toISODate, todayUtc } from '../../common/decimal';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ReferenceService } from '../../common/references/reference.service';
import { DocumentsService } from '../documents/documents.service';
import { renderStatementHtml } from '../investor-portal/statement-html';

/**
 * Generates a printable investor statement from STORED portfolio records and freezes it as a
 * document version (so download/print always return exactly the approved content, RPT-009).
 * The document starts as DRAFT: an independent approver must approve it (RPT-004) before it can be
 * published to the investor.
 */
@Injectable()
export class StatementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly docs: DocumentsService,
    private readonly refs: ReferenceService,
    private readonly audit: AuditService,
  ) {}

  async generate(ctx: RequestContext, input: { portfolioId: string; asOf: string; periodStart?: string }) {
    const portfolio = await this.prisma.portfolio.findUnique({
      where: { id: input.portfolioId },
      include: {
        investor: true,
        manager: { select: { name: true } },
        holdings: { include: { security: true }, orderBy: { marketValue: 'desc' } },
      },
    });
    if (!portfolio) throw new NotFoundException('Portfolio not found');

    const asOf = dateOnly(input.asOf);
    const today = todayUtc();
    const periodStart = input.periodStart ? dateOnly(input.periodStart) : new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1));

    // Valuation points: nearest at/before the period start and the statement date.
    const [openPoint, closePoint, txns] = await Promise.all([
      this.prisma.portfolioValuation.findFirst({ where: { portfolioId: portfolio.id, asOf: { lte: periodStart } }, orderBy: { asOf: 'desc' } }),
      this.prisma.portfolioValuation.findFirst({ where: { portfolioId: portfolio.id, asOf: { lte: asOf } }, orderBy: { asOf: 'desc' } }),
      this.prisma.investmentTransaction.findMany({
        where: { portfolioId: portfolio.id, status: 'COMPLETED', tradeDate: { gte: periodStart, lte: asOf } },
        include: { security: { select: { ticker: true } } },
        orderBy: { tradeDate: 'asc' },
      }),
    ]);

    const holdingsTotal = sum(portfolio.holdings.map((h) => h.marketValue));
    // Statement date in the past → valuation series; today or later → current holdings (MVP model).
    const closing = asOf >= today || !closePoint ? holdingsTotal : closePoint.nav;
    const opening = openPoint?.nav;
    const pct = (a: ReturnType<typeof D>, b?: ReturnType<typeof D> | null) => (b && !b.isZero() ? a.sub(b).div(b).mul(100).toDecimalPlaces(2).toString() : undefined);
    const bench = openPoint?.benchmarkIndex && closePoint?.benchmarkIndex ? pct(closePoint.benchmarkIndex, openPoint.benchmarkIndex) : undefined;

    const total = holdingsTotal.isZero() ? D(1) : holdingsTotal;
    const reference = await this.refs.generic('STM', 4);
    const notes = [SIMPLIFIED_VALUATION_NOTICE];
    if (asOf < today) notes.push(`Holdings are current positions at generation time; the closing value for ${formatDate(asOf)} is taken from the stored valuation series.`);

    const html = renderStatementHtml({
      reference: `${reference}-${portfolio.ref}-${toISODate(asOf)}`,
      title: `Investor Statement: ${portfolio.name}`,
      investor: {
        name: portfolio.investor.legalName,
        ref: portfolio.investor.ref,
        registrationNumber: portfolio.investor.registrationNumber,
        contactName: portfolio.investor.contactName,
        address: portfolio.investor.registeredAddress,
      },
      reportingDate: toISODate(asOf),
      periodStart: toISODate(periodStart),
      currency: portfolio.baseCurrency,
      generatedAt: new Date(),
      preparedBy: ctx.name,
      portfolios: [
        {
          ref: portfolio.ref,
          name: portfolio.name,
          type: PORTFOLIO_TYPE_LABELS[portfolio.type],
          openingValue: opening?.toString(),
          closingValue: closing.toString(),
          periodReturnPct: opening ? pct(closing, opening) : undefined,
          benchmarkReturnPct: bench,
        },
      ],
      holdings: portfolio.holdings.map((h) => ({
        portfolio: portfolio.ref,
        ticker: h.security.ticker,
        name: h.security.name,
        assetClass: ASSET_CLASS_LABELS[h.security.assetClass],
        quantity: h.quantity.toString(),
        price: h.currentPrice.toString(),
        marketValue: h.marketValue.toString(),
        weightPct: h.marketValue.div(total).mul(100).toDecimalPlaces(2).toString(),
      })),
      activity: txns.map((t) => ({
        date: toISODate(t.tradeDate),
        portfolio: portfolio.ref,
        description:
          t.type === 'TRADE' && t.security
            ? `${t.side === 'BUY' ? 'Buy' : 'Sell'} ${formatQuantity(t.quantity.toString())} ${t.security.ticker} @ ${formatPrice(t.price.toString())} (${t.ref})`
            : `${t.type.replace('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())} (${t.ref})`,
        amount: t.amount.toString(),
      })),
      totalValue: closing.toString(),
      notes,
    });

    const buffer = Buffer.from(html, 'utf8');
    const doc = await this.docs.create(
      { buffer, originalname: `statement-${portfolio.ref}-${toISODate(asOf)}.html`, mimetype: 'text/html', size: buffer.length },
      {
        title: `Investor Statement: ${portfolio.name} (${formatDate(asOf)})`,
        category: 'STATEMENT',
        status: 'DRAFT',
        audience: 'INTERNAL',
        investorId: portfolio.investorId,
        portfolioId: portfolio.id,
        reportDate: asOf,
      },
      { ctx },
    );
    await this.audit.record({
      ctx,
      entityType: 'Document',
      entityId: doc.id,
      action: 'STATEMENT_GENERATED',
      after: { ref: doc.ref, portfolio: portfolio.ref, asOf: toISODate(asOf), closingValue: closing.toString() },
    });
    return doc;
  }
}
