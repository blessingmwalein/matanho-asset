import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ASSET_CLASS_LABELS, PORTFOLIO_TYPE_LABELS, type DocumentCategory } from '@nexus/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { RequestContext } from '../../common/auth/request-context';
import { D, sum, toISODate } from '../../common/decimal';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

type Dec = Prisma.Decimal;

/** Portal document type filter → document categories (CONVENTIONS: category mapping). */
export const DOCUMENT_TYPE_CATEGORIES: Record<string, DocumentCategory[]> = {
  Statement: ['STATEMENT'],
  Capital: ['CAPITAL_CALL'],
  Report: ['INVESTOR_REPORT'],
  Financials: ['AUDITED_FINANCIALS'],
  Notice: ['NOTICE'],
};
const typeOfCategory = (c: string): string => Object.entries(DOCUMENT_TYPE_CATEGORIES).find(([, cats]) => (cats as string[]).includes(c))?.[0] ?? 'Other';

const FUND_TYPE_LABELS: Record<string, string> = { PRIVATE_EQUITY: 'Private equity fund', PRIVATE_CREDIT: 'Private credit fund' };

interface SeriesPoint {
  date: Date;
  value: Dec;
  bench: Dec | null;
}

const round2 = (d: Dec) => d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

/** % change as a display number (not money). */
function pctChange(from: Dec | null | undefined, to: Dec | null | undefined): number | null {
  if (!from || !to || from.isZero()) return null;
  return round2(to.div(from).minus(1).mul(100)).toNumber();
}

/** YTD / 1Y / since-inception change of a NAV + benchmark series (simplified MVP model, not time-weighted). */
function seriesReturns(points: SeriesPoint[]) {
  if (points.length < 2) return { ytd: null as number | null, bench: null as number | null, oneYear: null as number | null, sinceInception: null as number | null };
  const last = points[points.length - 1]!;
  const yearStart = Date.UTC(last.date.getUTCFullYear(), 0, 1);
  const base = [...points].reverse().find((p) => p.date.getTime() < yearStart) ?? points[0]!;
  const yearAgo = new Date(last.date);
  yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
  const oneYearBase = [...points].reverse().find((p) => p.date.getTime() <= yearAgo.getTime());
  const first = points[0]!;
  return {
    ytd: pctChange(base.value, last.value),
    bench: base.bench && last.bench ? pctChange(base.bench, last.bench) : null,
    oneYear: oneYearBase ? pctChange(oneYearBase.value, last.value) : null,
    sinceInception: pctChange(first.value, last.value),
  };
}

@Injectable()
export class InvestorPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── scoping ─────────────────────────────────────────────────────────────
  private investorOf(ctx: RequestContext): string {
    if (!ctx.investorId) throw new ForbiddenException('Your organisation is not linked to an investor record');
    return ctx.investorId;
  }

  /** `all`/empty → null (consolidated). Otherwise the account must belong to the caller's investor, else 404. */
  private async resolveAccount(investorId: string, accountId?: string) {
    if (!accountId || accountId === 'all') return null;
    const account = await this.prisma.investmentAccount.findFirst({ where: { id: accountId, investorId } });
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }

  private async loadScope(investorId: string, accountId: string | null) {
    const [portfolios, commitments] = await Promise.all([
      this.prisma.portfolio.findMany({
        where: { investorId, status: { not: 'CLOSED' }, ...(accountId ? { accountId } : {}) },
        include: {
          holdings: { where: { status: 'CONFIRMED' }, include: { security: true } },
          valuations: { orderBy: { asOf: 'asc' } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.commitment.findMany({
        where: { investorId, ...(accountId ? { accountId } : {}) },
        include: { fund: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return { portfolios, commitments };
  }

  private portfolioValue(p: { holdings: Array<{ marketValue: Dec }>; valuations: Array<{ nav: Dec }> }): Dec {
    if (p.holdings.length) return sum(p.holdings.map((h) => h.marketValue));
    const last = p.valuations[p.valuations.length - 1];
    return last ? D(last.nav) : D(0);
  }

  private docScopeWhere(portfolioIds: string[], fundIds: string[], scoped: boolean): Prisma.DocumentWhereInput {
    if (!scoped) return {};
    return { OR: [{ portfolioId: { in: portfolioIds } }, { fundId: { in: fundIds } }, { portfolioId: null, fundId: null }] };
  }

  /** The only way document rows leave this service: investor-visible = own + PUBLISHED + INVESTOR audience. */
  private visibleDocWhere(investorId: string): Prisma.DocumentWhereInput {
    return { investorId, status: 'PUBLISHED', audience: 'INVESTOR' };
  }

  private async visibleDocIds(investorId: string, ids: Array<string | null | undefined>): Promise<Set<string>> {
    const wanted = ids.filter((i): i is string => !!i);
    if (!wanted.length) return new Set();
    const rows = await this.prisma.document.findMany({ where: { id: { in: wanted }, ...this.visibleDocWhere(investorId) }, select: { id: true } });
    return new Set(rows.map((r) => r.id));
  }

  /** Consolidated NAV + rebased-benchmark series across portfolios (carry-forward between valuation dates). */
  private consolidatedSeries(portfolios: Array<{ valuations: Array<{ asOf: Date; nav: Dec; benchmarkIndex: Dec | null }> }>): SeriesPoint[] {
    const dates = [...new Set(portfolios.flatMap((p) => p.valuations.map((v) => v.asOf.getTime())))].sort((a, b) => a - b);
    const prepared = portfolios
      .filter((p) => p.valuations.length)
      .map((p) => {
        const firstBench = p.valuations.find((v) => v.benchmarkIndex)?.benchmarkIndex ?? null;
        const baseNav = D(p.valuations[0]!.nav);
        return { vals: p.valuations, firstBench, baseNav, idx: -1 };
      });
    const out: SeriesPoint[] = [];
    for (const t of dates) {
      let value = D(0);
      let bench = D(0);
      let anyBench = false;
      let any = false;
      for (const p of prepared) {
        while (p.idx + 1 < p.vals.length && p.vals[p.idx + 1]!.asOf.getTime() <= t) p.idx++;
        if (p.idx < 0) continue;
        const v = p.vals[p.idx]!;
        any = true;
        value = value.add(v.nav);
        if (v.benchmarkIndex && p.firstBench && !p.firstBench.isZero()) {
          anyBench = true;
          bench = bench.add(p.baseNav.mul(v.benchmarkIndex).div(p.firstBench));
        } else {
          bench = bench.add(v.nav);
        }
      }
      if (any) out.push({ date: new Date(t), value: round2(value), bench: anyBench ? round2(bench) : null });
    }
    return out;
  }

  private seriesDto(points: SeriesPoint[]) {
    return points.map((p) => ({ date: toISODate(p.date), value: p.value.toNumber(), benchmark: p.bench ? p.bench.toNumber() : null }));
  }

  private callDto(
    c: Prisma.CapitalCallGetPayload<{ include: { commitment: { include: { fund: true } }; acknowledgements: { include: { user: { select: { name: true } } } } } }>,
    visible: Set<string>,
    userId: string,
  ) {
    const ack = c.acknowledgements[0];
    const commitment = D(c.commitment.amount);
    const called = D(c.commitment.calledAmount);
    return {
      id: c.id,
      ref: c.ref,
      kind: c.kind,
      fundId: c.commitment.fundId,
      fundName: c.commitment.fund.name,
      commitmentId: c.commitmentId,
      amount: c.amount,
      issueDate: c.issueDate,
      dueDate: c.dueDate,
      status: c.status,
      fundingAccountMasked: c.fundingAccountMasked,
      noticeDocumentId: c.noticeDocumentId && visible.has(c.noticeDocumentId) ? c.noticeDocumentId : null,
      acknowledged: c.acknowledgements.length > 0,
      acknowledgedAt: ack?.acknowledgedAt ?? null,
      acknowledgedBy: ack?.user.name ?? null,
      acknowledgedByMe: c.acknowledgements.some((a) => a.userId === userId),
      commitment,
      calledToDate: called,
      afterCall: c.kind === 'CALL' ? called.add(c.amount) : called,
      remaining: c.kind === 'CALL' ? commitment.minus(called).minus(c.amount) : commitment.minus(called),
    };
  }

  private readonly callInclude = {
    commitment: { include: { fund: true } },
    acknowledgements: { include: { user: { select: { name: true } } }, orderBy: { acknowledgedAt: 'asc' as const } },
  } satisfies Prisma.CapitalCallInclude;

  // ── accounts ────────────────────────────────────────────────────────────
  async accounts(ctx: RequestContext) {
    const investorId = this.investorOf(ctx);
    const rows = await this.prisma.investmentAccount.findMany({
      where: { investorId, status: 'ACTIVE' },
      orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, ref: true, type: true },
    });
    return rows;
  }

  // ── overview ────────────────────────────────────────────────────────────
  async overview(ctx: RequestContext, accountIdParam?: string) {
    const investorId = this.investorOf(ctx);
    const account = await this.resolveAccount(investorId, accountIdParam);
    const { portfolios, commitments } = await this.loadScope(investorId, account?.id ?? null);

    const portfolioIds = portfolios.map((p) => p.id);
    const fundIds = commitments.map((c) => c.fundId);
    const scoped = !!account;
    const capitalWhere: Prisma.CapitalCallWhereInput = { commitment: { investorId, ...(account ? { accountId: account.id } : {}) } };

    const publicValue = sum(portfolios.map((p) => this.portfolioValue(p)));
    const privateValue = sum(commitments.map((c) => c.nav));
    const nav = publicValue.add(privateValue);
    const unfunded = sum(commitments.map((c) => D(c.amount).minus(c.calledAmount)));
    const distributionsToDate = sum(commitments.map((c) => c.distributedAmount));

    const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
    const [ytdDistributions, nextCall, recentTx, recentCapital, recentDocs] = await Promise.all([
      this.prisma.capitalCall.findMany({ where: { ...capitalWhere, kind: 'DISTRIBUTION', status: 'PAID', issueDate: { gte: yearStart } }, select: { amount: true } }),
      this.prisma.capitalCall.findFirst({
        where: { ...capitalWhere, kind: 'CALL', status: { in: ['ISSUED', 'OVERDUE'] } },
        orderBy: [{ dueDate: 'asc' }, { issueDate: 'asc' }],
        include: this.callInclude,
      }),
      this.prisma.investmentTransaction.findMany({
        where: { portfolio: { investorId, ...(account ? { accountId: account.id } : {}) }, status: 'COMPLETED' },
        include: { portfolio: { select: { name: true } }, security: { select: { ticker: true } } },
        orderBy: [{ tradeDate: 'desc' }, { createdAt: 'desc' }],
        take: 4,
      }),
      this.prisma.capitalCall.findMany({ where: { ...capitalWhere, status: { not: 'CANCELLED' } }, include: { commitment: { include: { fund: true } } }, orderBy: { issueDate: 'desc' }, take: 4 }),
      this.prisma.document.findMany({
        where: { ...this.visibleDocWhere(investorId), ...this.docScopeWhere(portfolioIds, fundIds, scoped), publishedAt: { not: null } },
        orderBy: { publishedAt: 'desc' },
        take: 4,
        select: { id: true, title: true, category: true, publishedAt: true },
      }),
    ]);

    const visible = await this.visibleDocIds(investorId, [nextCall?.noticeDocumentId]);

    const series = this.consolidatedSeries(portfolios);
    const returns = seriesReturns(series);

    // allocation by asset class (holdings) + private funds (commitment NAV)
    const alloc = new Map<string, Dec>();
    for (const p of portfolios) for (const h of p.holdings) alloc.set(h.security.assetClass, (alloc.get(h.security.assetClass) ?? D(0)).add(h.marketValue));
    for (const c of commitments) alloc.set(c.fund.type, (alloc.get(c.fund.type) ?? D(0)).add(c.nav));
    const total = [...alloc.values()].reduce((a, v) => a.add(v), D(0));
    const allocation = [...alloc.entries()]
      .map(([key, value]) => ({ key, label: ASSET_CLASS_LABELS[key as keyof typeof ASSET_CLASS_LABELS] ?? key, value: value.toNumber(), pct: total.isZero() ? 0 : round2(value.div(total).mul(100)).toNumber() }))
      .sort((a, b) => b.value - a.value);

    const activity = [
      ...recentTx.map((t) => ({
        id: `tx-${t.id}`,
        kind: 'TRANSACTION' as const,
        title: t.type === 'TRADE' ? `${t.side === 'SELL' ? 'Sale' : 'Purchase'} executed` : t.type === 'DIVIDEND' ? 'Dividend received' : 'Account activity',
        detail: `${t.security?.ticker ? `${t.security.ticker} · ` : ''}${t.portfolio.name}`,
        date: t.tradeDate,
        documentId: null as string | null,
      })),
      ...recentCapital.map((c) => ({
        id: `cap-${c.id}`,
        kind: 'CAPITAL' as const,
        title: c.kind === 'CALL' ? (c.status === 'FUNDED' ? 'Capital call funded' : 'Capital call issued') : 'Distribution paid',
        detail: `${c.commitment.fund.name} · ${c.ref}`,
        amount: c.amount,
        date: c.issueDate,
        documentId: null as string | null,
      })),
      ...recentDocs.map((d) => ({
        id: `doc-${d.id}`,
        kind: 'DOCUMENT' as const,
        title: 'Document published',
        detail: d.title,
        date: d.publishedAt as Date,
        documentId: d.id as string | null,
      })),
    ]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 8);

    const lastHoldingDate = portfolios.flatMap((p) => p.holdings.map((h) => h.valuationDate.getTime()));
    const lastSeries = series[series.length - 1]?.date.getTime();
    const publicAsOf = Math.max(0, ...lastHoldingDate, lastSeries ?? 0);
    const privateAsOf = Math.max(0, ...commitments.map((c) => c.asOf.getTime()));

    return {
      account: account ? { id: account.id, name: account.name, ref: account.ref, type: account.type } : null,
      currency: 'USD',
      asOf: publicAsOf ? new Date(publicAsOf) : privateAsOf ? new Date(privateAsOf) : null,
      privateAsOf: privateAsOf ? new Date(privateAsOf) : null,
      nav,
      publicValue,
      privateValue,
      ytdReturnPct: returns.ytd,
      benchmarkYtdPct: returns.bench,
      oneYearReturnPct: returns.oneYear,
      unfundedCommitments: unfunded,
      distributionsYtd: sum(ytdDistributions.map((d) => d.amount)),
      distributionsToDate,
      series: this.seriesDto(series),
      allocation,
      activity,
      nextCall: nextCall ? this.callDto(nextCall, visible, ctx.userId) : null,
    };
  }

  // ── investments ─────────────────────────────────────────────────────────
  async investments(ctx: RequestContext, accountIdParam?: string) {
    const investorId = this.investorOf(ctx);
    const account = await this.resolveAccount(investorId, accountIdParam);
    const { portfolios, commitments } = await this.loadScope(investorId, account?.id ?? null);

    const mandates = portfolios.map((p) => {
      const value = this.portfolioValue(p);
      const byClass = new Map<string, Dec>();
      for (const h of p.holdings) byClass.set(h.security.assetClass, (byClass.get(h.security.assetClass) ?? D(0)).add(h.marketValue));
      const top = [...byClass.entries()].sort((a, b) => b[1].comparedTo(a[1]))[0];
      const returns = seriesReturns(p.valuations.map((v) => ({ date: v.asOf, value: D(v.nav), bench: v.benchmarkIndex ? D(v.benchmarkIndex) : null })));
      return {
        kind: 'portfolio' as const,
        id: p.id,
        accountId: p.accountId,
        ref: p.ref,
        name: p.name,
        type: PORTFOLIO_TYPE_LABELS[p.type],
        status: p.status,
        value,
        ytdReturnPct: returns.ytd,
        benchmarkYtdPct: returns.bench,
        topAllocation: top && !value.isZero() ? { label: ASSET_CLASS_LABELS[top[0] as keyof typeof ASSET_CLASS_LABELS] ?? top[0], pct: round2(top[1].div(value).mul(100)).toNumber() } : null,
        benchmark: p.benchmark,
        inceptionDate: p.inceptionDate,
      };
    });

    const funds = commitments.map((c) => ({
      kind: 'fund' as const,
      id: c.id,
      fundId: c.fundId,
      accountId: c.accountId,
      ref: c.fund.ref,
      name: c.fund.name,
      type: FUND_TYPE_LABELS[c.fund.type] ?? c.fund.type,
      fundType: c.fund.type,
      status: c.status,
      value: c.nav,
      irr: c.irr,
      tvpi: c.tvpi,
      dpi: c.dpi,
      commitment: c.amount,
      called: c.calledAmount,
      unfunded: D(c.amount).minus(c.calledAmount),
      distributed: c.distributedAmount,
      asOf: c.asOf,
    }));

    return { items: [...mandates, ...funds] };
  }

  async investmentDetail(ctx: RequestContext, kind: string, id: string) {
    const investorId = this.investorOf(ctx);
    if (kind === 'portfolio') {
      const p = await this.prisma.portfolio.findFirst({
        where: { id, investorId },
        include: {
          holdings: { where: { status: 'CONFIRMED' }, include: { security: true } },
          valuations: { orderBy: { asOf: 'asc' } },
          manager: { select: { name: true } },
        },
      });
      if (!p) throw new NotFoundException('Investment not found');
      const value = this.portfolioValue(p);
      const points: SeriesPoint[] = p.valuations.map((v) => ({ date: v.asOf, value: D(v.nav), bench: v.benchmarkIndex ? D(v.benchmarkIndex) : null }));
      const returns = seriesReturns(points);
      const holdings = [...p.holdings]
        .sort((a, b) => b.marketValue.comparedTo(a.marketValue))
        .map((h) => ({
          ticker: h.security.ticker,
          name: h.security.name,
          assetClass: h.security.assetClass,
          assetClassLabel: ASSET_CLASS_LABELS[h.security.assetClass],
          quantity: h.quantity,
          price: h.currentPrice,
          marketValue: h.marketValue,
          weightPct: value.isZero() ? 0 : round2(D(h.marketValue).div(value).mul(100)).toNumber(),
          valuationDate: h.valuationDate,
        }));
      const documents = await this.latestDocuments(investorId, { OR: [{ portfolioId: p.id }, { portfolioId: null, fundId: null, category: 'STATEMENT' }] });
      return {
        kind: 'portfolio' as const,
        id: p.id,
        ref: p.ref,
        name: p.name,
        type: PORTFOLIO_TYPE_LABELS[p.type],
        status: p.status,
        currency: p.baseCurrency,
        benchmark: p.benchmark,
        inceptionDate: p.inceptionDate,
        manager: p.manager?.name ?? null,
        description: p.description,
        value,
        returns,
        series: this.seriesDto(points),
        holdings,
        documents,
      };
    }
    if (kind === 'fund') {
      const c = await this.prisma.commitment.findFirst({
        where: { investorId, OR: [{ id }, { fundId: id }] },
        include: { fund: true, events: { orderBy: { issueDate: 'desc' }, take: 12 } },
      });
      if (!c) throw new NotFoundException('Investment not found');
      const visible = await this.visibleDocIds(investorId, c.events.map((e) => e.noticeDocumentId));
      const documents = await this.latestDocuments(investorId, { fundId: c.fundId });
      return {
        kind: 'fund' as const,
        id: c.id,
        fundId: c.fundId,
        ref: c.fund.ref,
        name: c.fund.name,
        type: FUND_TYPE_LABELS[c.fund.type] ?? c.fund.type,
        fundType: c.fund.type,
        status: c.status,
        currency: c.fund.currency,
        vintage: c.fund.vintage,
        description: c.fund.description,
        asOf: c.asOf,
        value: c.nav,
        irr: c.irr,
        tvpi: c.tvpi,
        dpi: c.dpi,
        commitment: c.amount,
        called: c.calledAmount,
        unfunded: D(c.amount).minus(c.calledAmount),
        distributed: c.distributedAmount,
        events: c.events.map((e) => ({ id: e.id, ref: e.ref, kind: e.kind, amount: e.amount, issueDate: e.issueDate, dueDate: e.dueDate, status: e.status, noticeDocumentId: e.noticeDocumentId && visible.has(e.noticeDocumentId) ? e.noticeDocumentId : null })),
        documents,
      };
    }
    throw new NotFoundException('Investment not found');
  }

  private async latestDocuments(investorId: string, where: Prisma.DocumentWhereInput) {
    const rows = await this.prisma.document.findMany({
      where: { AND: [this.visibleDocWhere(investorId), where] },
      orderBy: [{ reportDate: 'desc' }, { publishedAt: 'desc' }],
      take: 3,
      select: { id: true, title: true, category: true, reportDate: true, publishedAt: true },
    });
    return rows.map((d) => ({ id: d.id, title: d.title, type: typeOfCategory(d.category), date: d.reportDate ?? d.publishedAt }));
  }

  // ── capital ─────────────────────────────────────────────────────────────
  async capital(ctx: RequestContext, accountIdParam?: string) {
    const investorId = this.investorOf(ctx);
    const account = await this.resolveAccount(investorId, accountIdParam);
    const { commitments } = await this.loadScope(investorId, account?.id ?? null);
    const where: Prisma.CapitalCallWhereInput = { commitment: { investorId, ...(account ? { accountId: account.id } : {}) } };

    const events = await this.prisma.capitalCall.findMany({ where, include: this.callInclude, orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }], take: 100 });
    const visible = await this.visibleDocIds(investorId, events.map((e) => e.noticeDocumentId));
    const dtos = events.map((e) => this.callDto(e, visible, ctx.userId));

    return {
      account: account ? { id: account.id, name: account.name } : null,
      currency: 'USD',
      asOf: commitments.length ? new Date(Math.max(...commitments.map((c) => c.asOf.getTime()))) : null,
      summary: {
        totalCommitment: sum(commitments.map((c) => c.amount)),
        called: sum(commitments.map((c) => c.calledAmount)),
        unfunded: sum(commitments.map((c) => D(c.amount).minus(c.calledAmount))),
        distributions: sum(commitments.map((c) => c.distributedAmount)),
        nav: sum(commitments.map((c) => c.nav)),
      },
      commitments: commitments.map((c) => ({
        id: c.id,
        fundId: c.fundId,
        fundName: c.fund.name,
        fundType: c.fund.type,
        commitment: c.amount,
        called: c.calledAmount,
        unfunded: D(c.amount).minus(c.calledAmount),
        distributed: c.distributedAmount,
        nav: c.nav,
        irr: c.irr,
        tvpi: c.tvpi,
        dpi: c.dpi,
        asOf: c.asOf,
        status: c.status,
      })),
      openCalls: dtos.filter((d) => d.kind === 'CALL' && (d.status === 'ISSUED' || d.status === 'OVERDUE')),
      activity: dtos.map((d) => ({
        id: d.id,
        ref: d.ref,
        kind: d.kind,
        date: d.issueDate,
        dueDate: d.dueDate,
        fundId: d.fundId,
        fundName: d.fundName,
        amount: d.amount,
        status: d.status,
        noticeDocumentId: d.noticeDocumentId,
        acknowledged: d.acknowledged,
      })),
    };
  }

  /** Idempotent per call + user. An acknowledgement is receipt of the notice, NOT payment: Commitment.calledAmount is never modified. */
  async acknowledge(ctx: RequestContext, callId: string, note?: string) {
    const investorId = this.investorOf(ctx);
    const call = await this.prisma.capitalCall.findFirst({
      where: { id: callId, commitment: { investorId } },
      include: { commitment: { include: { fund: true, investor: { select: { legalName: true } } } } },
    });
    if (!call) throw new NotFoundException('Capital call not found');

    const existing = await this.prisma.capitalCallAcknowledgement.findUnique({ where: { capitalCallId_userId: { capitalCallId: call.id, userId: ctx.userId } } });
    if (existing) return { ok: true, acknowledged: true, alreadyAcknowledged: true, acknowledgedAt: existing.acknowledgedAt };

    if (call.kind !== 'CALL' || !['ISSUED', 'OVERDUE'].includes(call.status)) {
      throw new ConflictException('This capital call is no longer open for acknowledgement.');
    }

    try {
      const ack = await this.prisma.$transaction(async (tx) => {
        const created = await tx.capitalCallAcknowledgement.create({ data: { capitalCallId: call.id, userId: ctx.userId, note: note || null } });
        await this.audit.record(
          {
            ctx,
            entityType: 'CapitalCall',
            entityId: call.id,
            action: 'CAPITAL_CALL_ACKNOWLEDGED',
            after: { ref: call.ref, fund: call.commitment.fund.name, note: note ?? null, calledAmountChanged: false },
          },
          tx,
        );
        await this.notifications.notifyStaff(
          {
            type: 'CAPITAL_CALL_ACKNOWLEDGED',
            title: 'Capital call acknowledged',
            body: `${call.commitment.investor.legalName} acknowledged ${call.ref} (${call.commitment.fund.name}). Acknowledgement is receipt only, not payment.`,
            link: `/internal/investors/${investorId}`,
            entityType: 'CapitalCall',
            entityId: call.id,
          },
          tx,
        );
        return created;
      });
      return { ok: true, acknowledged: true, alreadyAcknowledged: false, acknowledgedAt: ack.acknowledgedAt };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const again = await this.prisma.capitalCallAcknowledgement.findUnique({ where: { capitalCallId_userId: { capitalCallId: call.id, userId: ctx.userId } } });
        return { ok: true, acknowledged: true, alreadyAcknowledged: true, acknowledgedAt: again?.acknowledgedAt ?? new Date() };
      }
      throw err;
    }
  }

  // ── documents ───────────────────────────────────────────────────────────
  async documents(ctx: RequestContext, query: { q?: string; type?: string; accountId?: string }) {
    const investorId = this.investorOf(ctx);
    const account = await this.resolveAccount(investorId, query.accountId);

    const and: Prisma.DocumentWhereInput[] = [this.visibleDocWhere(investorId)];
    const knownCategories = Object.values(DOCUMENT_TYPE_CATEGORIES).flat();
    const wanted = query.type && DOCUMENT_TYPE_CATEGORIES[query.type] ? DOCUMENT_TYPE_CATEGORIES[query.type]! : null;
    and.push({ category: { in: wanted ?? [...knownCategories, 'OTHER' as DocumentCategory] } });
    if (query.type && !wanted) and.push({ id: '__none__' });
    if (account) {
      const { portfolios, commitments } = await this.loadScope(investorId, account.id);
      and.push(this.docScopeWhere(portfolios.map((p) => p.id), commitments.map((c) => c.fundId), true));
    }
    const q = query.q?.trim();
    if (q) {
      and.push({
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { ref: { contains: q, mode: 'insensitive' } },
          { fund: { name: { contains: q, mode: 'insensitive' } } },
          { portfolio: { name: { contains: q, mode: 'insensitive' } } },
        ],
      });
    }

    const rows = await this.prisma.document.findMany({
      where: { AND: and },
      include: {
        fund: { select: { name: true } },
        portfolio: { select: { name: true } },
        versions: { orderBy: { versionNo: 'desc' }, take: 1 },
      },
      take: 300,
    });

    return rows
      .map((d) => {
        const v = d.versions[0];
        const date = d.reportDate ?? d.publishedAt ?? d.createdAt;
        return {
          id: d.id,
          ref: d.ref,
          title: d.title,
          type: typeOfCategory(d.category),
          category: d.category,
          scope: d.fund?.name ?? d.portfolio?.name ?? 'Consolidated relationship',
          date,
          publishedAt: d.publishedAt,
          fileName: v?.fileName ?? null,
          mimeType: v?.mimeType ?? null,
          sizeBytes: v?.sizeBytes ?? null,
          versionNo: v?.versionNo ?? d.currentVersionNo,
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  // ── profile ─────────────────────────────────────────────────────────────
  async profile(ctx: RequestContext) {
    const investorId = this.investorOf(ctx);
    const inv = await this.prisma.investor.findUnique({
      where: { id: investorId },
      include: { relationshipManager: { select: { name: true, email: true } }, organisation: { select: { name: true, slug: true } } },
    });
    if (!inv) throw new NotFoundException('Investor not found');

    const [owners, evidenceCount, members, accounts] = await Promise.all([
      this.prisma.beneficialOwner.count({ where: { investorId } }),
      inv.applicationId ? this.prisma.document.count({ where: { applicationId: inv.applicationId } }) : Promise.resolve(0),
      this.prisma.organisationMembership.findMany({
        where: { organisationId: ctx.orgId },
        include: { user: { select: { id: true, name: true, email: true, status: true, lastLoginAt: true } }, role: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.investmentAccount.findMany({ where: { investorId, status: 'ACTIVE' }, select: { id: true, name: true, ref: true, type: true }, orderBy: [{ type: 'asc' }, { createdAt: 'asc' }] }),
    ]);

    const verified = inv.kycStatus === 'VERIFIED';
    const activeUsers = members.filter((m) => m.user.status === 'ACTIVE').length;
    const kycState = (ok: boolean) => (ok ? 'current' : 'attention');
    const last4 = (s?: string | null) => (s ? `•••• ${s.slice(-4)}` : null);

    return {
      organisation: {
        ref: inv.ref,
        legalName: inv.legalName,
        investorType: inv.investorType,
        registrationNumber: inv.registrationNumber,
        country: inv.country,
        registeredAddress: inv.registeredAddress,
        contactName: inv.contactName,
        email: inv.email,
        phone: inv.phone,
        taxIdentificationNumber: last4(inv.taxIdentificationNumber),
        baseCurrency: inv.baseCurrency,
        classification: inv.classification,
        investmentObjective: inv.investmentObjective,
        status: inv.status,
        since: inv.createdAt,
      },
      kyc: {
        status: inv.kycStatus,
        reviewedAt: inv.kycReviewedAt,
        nextReviewAt: inv.kycNextReviewAt,
        items: [
          { key: 'identity', label: 'Legal identity', detail: evidenceCount ? `Approved evidence on file (${evidenceCount} documents)` : 'Approved on onboarding', value: verified ? 'Current' : inv.kycStatus, state: kycState(verified) },
          { key: 'ownership', label: 'Beneficial ownership', detail: `${owners} owner${owners === 1 ? '' : 's'} / controller${owners === 1 ? '' : 's'} recorded`, value: verified ? 'Current' : 'Review', state: kycState(verified) },
          { key: 'declarations', label: 'KYC / AML declarations', detail: inv.kycReviewedAt ? `Reviewed ${toISODate(inv.kycReviewedAt)}${inv.kycNextReviewAt ? ` · next review ${toISODate(inv.kycNextReviewAt)}` : ''}` : 'Awaiting review', value: verified ? 'Verified' : 'Pending', state: kycState(verified) },
          { key: 'bank', label: 'Bank instructions', detail: inv.bankAccountMasked ? `${inv.bankName ?? 'Bank'} · ${inv.bankAccountMasked}` : 'No instruction on file', value: inv.bankAccountMasked ? 'On file' : 'Missing', state: kycState(!!inv.bankAccountMasked) },
          { key: 'access', label: 'Portal access', detail: `${activeUsers} authorised user${activeUsers === 1 ? '' : 's'}`, value: activeUsers ? 'Active' : 'None', state: kycState(activeUsers > 0) },
        ],
      },
      bank: {
        bankName: inv.bankName,
        accountHolder: inv.bankAccountHolder,
        accountMasked: inv.bankAccountMasked,
        currency: inv.bankCurrency,
        swiftBic: inv.swiftBic,
      },
      relationshipManager: inv.relationshipManager,
      users: members.map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email, role: m.role.name, status: m.user.status, lastLoginAt: m.user.lastLoginAt, isYou: m.user.id === ctx.userId })),
      accounts,
    };
  }

  // ── service request (Contact IR) ────────────────────────────────────────
  async serviceRequest(ctx: RequestContext, input: { subject: string; message: string }) {
    const investorId = this.investorOf(ctx);
    await this.prisma.$transaction(async (tx) => {
      const n = await this.notifications.notifyStaff(
        {
          type: 'SERVICE_REQUEST',
          title: `Service request: ${input.subject}`,
          body: `${ctx.name} (${ctx.orgName}): ${input.message}`.slice(0, 1500),
          link: `/internal/investors/${investorId}`,
          entityType: 'Investor',
          entityId: investorId,
        },
        tx,
      );
      await this.audit.record(
        { ctx, entityType: 'Investor', entityId: investorId, action: 'SERVICE_REQUEST_SUBMITTED', after: { subject: input.subject, notificationId: n?.id ?? null } },
        tx,
      );
    });
    return { ok: true };
  }
}
