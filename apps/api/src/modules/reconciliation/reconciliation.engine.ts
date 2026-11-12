import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, type ExceptionType } from '@prisma/client';
import { RECON_STATUS_LABELS, type ReconStatus } from '@nexus/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { RequestContext } from '../../common/auth/request-context';
import { D, dateOnly, todayUtc, toISODate } from '../../common/decimal';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ReferenceService } from '../../common/references/reference.service';

/* ──────────────────────────────────────────────────────────────────────────────
 * Reconciliation matching engine (UAT REC-003/004/007/009).
 *
 *  - Reads custodian records and the internal book; NEVER modifies internal transactions or holdings.
 *  - Custodian source values are preserved (rawPayload on the submission, sourceSnapshot on the item).
 *  - Idempotent: ReconciliationItem has unique executionId / dayEndId / transactionId, so a re-run
 *    updates items in place and cannot create duplicates or consume an internal trade twice.
 *  - A matching trade reference alone is never enough: quantity, price, currency and settlement date
 *    must agree, otherwise the item is a DIFFERENCE with one exception per differing field.
 * ────────────────────────────────────────────────────────────────────────────── */

export const PRICE_TOLERANCE = new Prisma.Decimal('0.0001');
export const CASH_TOLERANCE = new Prisma.Decimal('0.01');
export const HOLDINGS_TOLERANCE_PCT = new Prisma.Decimal('0.001'); // 0.10 %
export const DAY_END_BASIS_NOTE =
  'Internal figures are taken from current holdings (MVP simplification): they are not a historical snapshot as at the statement date.';

const OPEN_STATES: ReconStatus[] = ['NOT_STARTED', 'UNMATCHED', 'DIFFERENCE', 'PENDING_REVIEW'];

export interface Diff {
  field: string;
  label: string;
  custodian: string | null;
  internal: string | null;
  differs: boolean;
  note?: string;
}
interface Detected {
  type: ExceptionType;
  description: string;
  expected?: string | null;
  actual?: string | null;
}
type OutcomeStatus = 'MATCHED' | 'DIFFERENCE' | 'PENDING_REVIEW' | 'UNMATCHED';
interface Outcome {
  status: OutcomeStatus;
  txId: string | null;
  diffs: Diff[];
  detected: Detected[];
  internalSnapshot: Record<string, unknown>;
}
interface ItemFields {
  kind: 'EXECUTION' | 'DAY_END' | 'INTERNAL_ORPHAN';
  executionId?: string | null;
  dayEndId?: string | null;
  transactionId?: string | null;
  portfolioId?: string | null;
  tradeReference?: string | null;
  ticker?: string | null;
  quantity?: Prisma.Decimal | null;
  price?: Prisma.Decimal | null;
  currency?: string | null;
  matchKey?: string | null;
  sourceSnapshot: Prisma.InputJsonValue;
  internalSnapshot: Prisma.InputJsonValue;
  differences: Prisma.InputJsonValue;
}

const TX_INCLUDE = {
  security: { select: { ticker: true, name: true } },
  reconItem: { select: { id: true, kind: true, status: true } },
} satisfies Prisma.InvestmentTransactionInclude;
type Tx = Prisma.InvestmentTransactionGetPayload<{ include: typeof TX_INCLUDE }>;

const ITEM_WITH_EX = { exceptions: true } satisfies Prisma.ReconciliationItemInclude;
type ItemWithEx = Prisma.ReconciliationItemGetPayload<{ include: typeof ITEM_WITH_EX }>;

const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const dec = (v: Prisma.Decimal.Value | null | undefined) => D(v).toDecimalPlaces(6).toFixed();
const money = (v: Prisma.Decimal.Value) => D(v).toDecimalPlaces(2).toFixed(2);
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const fmtNum = (v: string, dp = 6) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: dp }) : v;
};

export interface RunResult {
  batch: { id: string; ref: string; businessDate: string };
  processed: number;
  matched: number;
  differences: number;
  unmatched: number;
  pendingReview: number;
  internalOrphans: number;
  openExceptions: number;
}

@Injectable()
export class ReconciliationEngine {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly refs: ReferenceService,
  ) {}

  private async ensureBatch(ctx: RequestContext, businessDate: Date) {
    const found = await this.prisma.reconciliationBatch.findUnique({ where: { businessDate } });
    if (found) return found;
    try {
      return await this.prisma.reconciliationBatch.create({
        data: { ref: await this.refs.reconBatch(), businessDate, status: 'OPEN', createdById: ctx.userId },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const again = await this.prisma.reconciliationBatch.findUnique({ where: { businessDate } });
        if (again) return again;
      }
      throw e;
    }
  }

  async run(ctx: RequestContext, businessDateStr?: string): Promise<RunResult> {
    const businessDate = businessDateStr ? dateOnly(businessDateStr) : todayUtc();
    if (Number.isNaN(businessDate.getTime())) throw new ConflictException('Invalid business date');
    const batch = await this.ensureBatch(ctx, businessDate);
    const businessDay = toISODate(businessDate);

    // ── load everything the run needs (few round trips; the rest is in-memory) ──
    const [execs, dayEnds, covered] = await Promise.all([
      this.prisma.custodianExecution.findMany({
        where: { isCurrent: true, reconStatus: { in: OPEN_STATES } },
        include: { custodianAccount: { include: { custodianOrg: { select: { name: true } } } }, reconItem: { include: ITEM_WITH_EX } },
        orderBy: [{ executedAt: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.custodianDayEndSubmission.findMany({
        where: { isCurrent: true, reconStatus: { in: OPEN_STATES } },
        include: { custodianAccount: { include: { custodianOrg: { select: { name: true } } } }, reconItem: { include: ITEM_WITH_EX } },
        orderBy: [{ statementDate: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.custodianAccount.findMany({ where: { portfolioId: { not: null } }, select: { portfolioId: true } }),
    ]);

    const coveredIds = new Set(covered.map((c) => c.portfolioId as string));
    const portfolioIds = new Set<string>(coveredIds);
    for (const e of execs) if (e.custodianAccount.portfolioId) portfolioIds.add(e.custodianAccount.portfolioId);
    for (const d of dayEnds) if (d.custodianAccount.portfolioId) portfolioIds.add(d.custodianAccount.portfolioId);

    const tradeDates = new Set<string>([businessDay]);
    for (const e of execs) tradeDates.add(toISODate(utcDay(e.executedAt)));
    for (const d of dayEnds) tradeDates.add(toISODate(d.statementDate));

    const [portfolios, txs, holdings] = await Promise.all([
      this.prisma.portfolio.findMany({ where: { id: { in: [...portfolioIds] } }, select: { id: true, ref: true, name: true, baseCurrency: true } }),
      this.prisma.investmentTransaction.findMany({
        where: {
          portfolioId: { in: [...portfolioIds] },
          type: 'TRADE',
          status: 'COMPLETED',
          OR: [{ tradeReference: { in: execs.map((e) => e.tradeReference) } }, { tradeDate: { in: [...tradeDates].map(dateOnly) } }],
        },
        include: TX_INCLUDE,
      }),
      dayEnds.length
        ? this.prisma.holding.findMany({
            where: { portfolioId: { in: dayEnds.map((d) => d.custodianAccount.portfolioId).filter((x): x is string => !!x) } },
            include: { security: { select: { assetClass: true } } },
          })
        : Promise.resolve([]),
    ]);
    const portfolioById = new Map(portfolios.map((p) => [p.id, p]));

    // ── execution matching ────────────────────────────────────────────────────
    const claimed = new Map<string, string>(); // internal transaction id → custodian execution id
    const available = (tx: Tx, ownItemId?: string) =>
      !claimed.has(tx.id) && (!tx.reconItem || tx.reconItem.id === ownItemId || (tx.reconItem.kind === 'INTERNAL_ORPHAN' && tx.reconItem.status !== 'RESOLVED'));

    const outcomes = new Map<string, Outcome>();
    const keyOf = (e: (typeof execs)[number]) => `${e.custodianAccount.accountNumber}|${e.tradeReference}|${e.ticker}|${toISODate(utcDay(e.executedAt))}`;

    // pass 1: key matches (account → portfolio, tradeReference, security, trade date, side)
    for (const e of execs) {
      const pid = e.custodianAccount.portfolioId;
      if (!pid) continue;
      const day = toISODate(utcDay(e.executedAt));
      const tx = txs.find(
        (t) => t.portfolioId === pid && t.tradeReference === e.tradeReference && t.security?.ticker === e.ticker && toISODate(t.tradeDate) === day && t.side === e.side && available(t, e.reconItem?.id),
      );
      if (!tx) continue;
      claimed.set(tx.id, e.id);
      const { diffs, detected } = this.compareExecution(e, tx);
      outcomes.set(e.id, { status: detected.length ? 'DIFFERENCE' : 'MATCHED', txId: tx.id, diffs, detected, internalSnapshot: this.txSnapshot(tx, portfolioById.get(pid)?.ref) });
    }

    // pass 2: probable matches and no-match
    for (const e of execs) {
      if (outcomes.has(e.id)) continue;
      const pid = e.custodianAccount.portfolioId;
      const portfolio = pid ? portfolioById.get(pid) : undefined;
      if (!pid) {
        outcomes.set(e.id, {
          status: 'UNMATCHED',
          txId: null,
          diffs: [],
          detected: [{ type: 'NO_INTERNAL_MATCH', description: `Custodian account ${e.custodianAccount.accountNumber} is not linked to a portfolio, so no internal trade can be matched.` }],
          internalSnapshot: { note: 'Custodian account is not linked to an internal portfolio.' },
        });
        continue;
      }
      const day = toISODate(utcDay(e.executedAt));
      const cands = txs.filter((t) => t.portfolioId === pid && available(t, e.reconItem?.id));
      const byRef = cands.find((t) => t.tradeReference === e.tradeReference);
      const sameDay = cands.filter((t) => t.security?.ticker === e.ticker && t.side === e.side && toISODate(t.tradeDate) === day);
      const pick = byRef ?? sameDay.find((t) => D(t.quantity).equals(e.quantity)) ?? sameDay[0];
      if (pick) {
        claimed.set(pick.id, e.id);
        const { diffs } = this.compareExecution(e, pick);
        const differing = diffs.filter((d) => d.differs).map((d) => d.label.toLowerCase());
        const why = byRef
          ? `Trade reference ${e.tradeReference} matches internal trade ${pick.ref}, but ${differing.join(', ') || 'other fields'} differ.`
          : `Internal trade ${pick.ref} (${pick.tradeReference ?? 'no reference'}) is a probable match: same portfolio, security, side and trade date, but a different trade reference.`;
        outcomes.set(e.id, {
          status: 'PENDING_REVIEW',
          txId: pick.id,
          diffs,
          detected: [{ type: 'PROBABLE_MATCH', description: `${why} Review and confirm before resolving.`, expected: pick.tradeReference ?? pick.ref, actual: e.tradeReference }],
          internalSnapshot: this.txSnapshot(pick, portfolio?.ref),
        });
      } else {
        outcomes.set(e.id, {
          status: 'UNMATCHED',
          txId: null,
          diffs: [],
          detected: [
            {
              type: 'NO_INTERNAL_MATCH',
              description: `No internal trade found for ${e.custodianAccount.accountNumber} on ${day} matching ${e.tradeReference} (${e.side} ${e.ticker}).`,
              expected: null,
              actual: e.tradeReference,
            },
          ],
          internalSnapshot: { note: 'No matching internal transaction exists for this custodian record.' },
        });
      }
    }

    // ── day-end checks ────────────────────────────────────────────────────────
    const deOutcomes = new Map<string, Outcome>();
    for (const d of dayEnds) {
      const pid = d.custodianAccount.portfolioId;
      const portfolio = pid ? portfolioById.get(pid) : undefined;
      if (!pid || !portfolio) {
        deOutcomes.set(d.id, {
          status: 'UNMATCHED',
          txId: null,
          diffs: [],
          detected: [{ type: 'NO_INTERNAL_MATCH', description: `Custodian account ${d.custodianAccount.accountNumber} is not linked to a portfolio, so the day-end book cannot be compared.` }],
          internalSnapshot: { note: 'Custodian account is not linked to an internal portfolio.' },
        });
        continue;
      }
      const pHoldings = holdings.filter((h) => h.portfolioId === pid);
      const intCash = pHoldings.filter((h) => h.security.assetClass === 'CASH').reduce((a, h) => a.add(h.marketValue), D(0));
      const intHold = pHoldings.filter((h) => h.security.assetClass !== 'CASH').reduce((a, h) => a.add(h.marketValue), D(0));
      const day = toISODate(d.statementDate);
      const intTrades = txs.filter((t) => t.portfolioId === pid && toISODate(t.tradeDate) === day).length;

      const cashDiff = D(d.closingCash).minus(intCash);
      const holdDiff = D(d.holdingsMarketValue).minus(intHold);
      const holdTol = intHold.isZero() ? CASH_TOLERANCE : intHold.abs().mul(HOLDINGS_TOLERANCE_PCT);
      const cashBad = cashDiff.abs().gt(CASH_TOLERANCE);
      const holdBad = holdDiff.abs().gt(holdTol);
      const tradesBad = d.tradeCount !== intTrades;
      const curBad = d.currency !== portfolio.baseCurrency;

      const diffs: Diff[] = [
        { field: 'closingCash', label: 'Closing cash', custodian: money(d.closingCash), internal: money(intCash), differs: cashBad, note: `Difference ${money(cashDiff)}` },
        {
          field: 'holdingsMarketValue',
          label: 'Holdings market value',
          custodian: money(d.holdingsMarketValue),
          internal: money(intHold),
          differs: holdBad,
          note: `Difference ${money(holdDiff)} (${intHold.isZero() ? 'n/a' : holdDiff.div(intHold).mul(100).toDecimalPlaces(3).toFixed()}%); tolerance 0.10%`,
        },
        { field: 'tradeCount', label: 'Trades in day-end book', custodian: String(d.tradeCount), internal: String(intTrades), differs: tradesBad },
        { field: 'currency', label: 'Currency', custodian: d.currency, internal: portfolio.baseCurrency, differs: curBad },
      ];
      const detected: Detected[] = [];
      if (cashBad) detected.push({ type: 'CASH_DIFFERENCE', description: `Closing cash differs by ${money(cashDiff)}: custodian ${d.currency} ${fmtNum(money(d.closingCash), 2)} vs internal ${fmtNum(money(intCash), 2)}.`, expected: money(intCash), actual: money(d.closingCash) });
      if (holdBad) detected.push({ type: 'HOLDINGS_VALUE_DIFFERENCE', description: `Holdings market value differs by ${money(holdDiff)} (outside the 0.10% tolerance): custodian ${fmtNum(money(d.holdingsMarketValue), 2)} vs internal ${fmtNum(money(intHold), 2)}.`, expected: money(intHold), actual: money(d.holdingsMarketValue) });
      if (tradesBad) detected.push({ type: 'TRADE_COUNT_DIFFERENCE', description: `Trade count differs: custodian book ${d.tradeCount} vs internal ${intTrades} completed trade(s) on ${day}.`, expected: String(intTrades), actual: String(d.tradeCount) });
      if (curBad) detected.push({ type: 'CURRENCY_DIFFERENCE', description: `Currency differs: custodian ${d.currency} vs portfolio base currency ${portfolio.baseCurrency}.`, expected: portfolio.baseCurrency, actual: d.currency });

      deOutcomes.set(d.id, {
        status: detected.length ? 'DIFFERENCE' : 'MATCHED',
        txId: null,
        diffs,
        detected,
        internalSnapshot: {
          portfolio: portfolio.ref,
          closingCash: money(intCash),
          holdingsMarketValue: money(intHold),
          tradeCount: intTrades,
          currency: portfolio.baseCurrency,
          basis: DAY_END_BASIS_NOTE,
          tolerances: { cash: '0.01', holdingsPct: '0.10%' },
        },
      });
    }

    // ── internal orphans (internal completed trades with no custodian record) ──
    const orphans = txs.filter((t) => coveredIds.has(t.portfolioId) && toISODate(t.tradeDate) === businessDay && !claimed.has(t.id) && !t.reconItem);
    const orphansToDelete = [...new Set([...claimed.keys()].map((id) => txs.find((t) => t.id === id)?.reconItem).filter((i): i is NonNullable<Tx['reconItem']> => !!i && i.kind === 'INTERNAL_ORPHAN' && i.status !== 'RESOLVED').map((i) => i.id))];

    // ── persist (one transaction; in-place updates; audit per status change) ──
    await this.prisma.$transaction(
      async (tx) => {
        for (const id of orphansToDelete) {
          await tx.reconciliationItem.delete({ where: { id } }); // exceptions cascade; the orphan was an engine artefact
          await this.audit.record({ ctx, entityType: 'ReconciliationItem', entityId: id, action: 'RECON_ORPHAN_CLEARED', metadata: { actorName: ctx.name, reason: 'A custodian record now covers this internal trade', batchRef: batch.ref } }, tx);
        }

        for (const e of execs) {
          const o = outcomes.get(e.id)!;
          const pid = e.custodianAccount.portfolioId;
          const fields: ItemFields = {
            kind: 'EXECUTION',
            executionId: e.id,
            dayEndId: null,
            transactionId: o.txId,
            portfolioId: pid,
            tradeReference: e.tradeReference,
            ticker: e.ticker,
            quantity: e.quantity,
            price: e.price,
            currency: e.currency,
            matchKey: keyOf(e),
            sourceSnapshot: json({
              submissionRef: e.ref,
              version: e.version,
              custodian: e.custodianAccount.custodianOrg.name,
              account: e.custodianAccount.accountNumber,
              tradeReference: e.tradeReference,
              ticker: e.ticker,
              side: e.side,
              quantity: dec(e.quantity),
              price: dec(e.price),
              currency: e.currency,
              tradeDate: toISODate(utcDay(e.executedAt)),
              executedAt: e.executedAt.toISOString(),
              settlementDate: toISODate(e.settlementDate),
              broker: e.broker,
              note: e.note,
              submittedBy: e.submittedByName,
              submittedAt: e.createdAt.toISOString(),
            }),
            internalSnapshot: json(o.internalSnapshot),
            differences: json(o.diffs),
          };
          await this.writeItem(tx, ctx, batch, { existing: e.reconItem, fields, outcome: o, submission: { kind: 'EXECUTION', id: e.id }, label: e.tradeReference });
        }

        for (const d of dayEnds) {
          const o = deOutcomes.get(d.id)!;
          const fields: ItemFields = {
            kind: 'DAY_END',
            executionId: null,
            dayEndId: d.id,
            transactionId: null,
            portfolioId: d.custodianAccount.portfolioId,
            tradeReference: null,
            ticker: null,
            quantity: null,
            price: null,
            currency: d.currency,
            matchKey: `${d.custodianAccount.accountNumber}|${toISODate(d.statementDate)}`,
            sourceSnapshot: json({
              submissionRef: d.ref,
              version: d.version,
              custodian: d.custodianAccount.custodianOrg.name,
              account: d.custodianAccount.accountNumber,
              statementDate: toISODate(d.statementDate),
              closingCash: money(d.closingCash),
              holdingsMarketValue: money(d.holdingsMarketValue),
              tradeCount: d.tradeCount,
              currency: d.currency,
              fileName: d.fileName,
              fileSha256: d.fileSha256,
              controlNote: d.controlNote,
              submittedBy: d.submittedByName,
              submittedAt: d.createdAt.toISOString(),
            }),
            internalSnapshot: json(o.internalSnapshot),
            differences: json(o.diffs),
          };
          await this.writeItem(tx, ctx, batch, { existing: d.reconItem, fields, outcome: o, submission: { kind: 'DAY_END', id: d.id }, label: `Day-end ${toISODate(d.statementDate)}` });
        }

        for (const t of orphans) {
          const portfolio = portfolioById.get(t.portfolioId);
          const created = await tx.reconciliationItem.create({
            data: {
              batchId: batch.id,
              kind: 'INTERNAL_ORPHAN',
              status: 'UNMATCHED',
              transactionId: t.id,
              portfolioId: t.portfolioId,
              tradeReference: t.tradeReference,
              ticker: t.security?.ticker ?? null,
              quantity: t.quantity,
              price: t.price,
              currency: t.currency,
              matchKey: `${portfolio?.ref ?? t.portfolioId}|${t.tradeReference ?? t.ref}|${t.security?.ticker ?? ''}|${toISODate(t.tradeDate)}`,
              sourceSnapshot: json({ note: 'No custodian record has been received for this internal trade.' }),
              internalSnapshot: json(this.txSnapshot(t, portfolio?.ref)),
              differences: json([]),
              exceptions: {
                create: [
                  {
                    type: 'NO_CUSTODIAN_RECORD',
                    description: `Internal trade ${t.ref} (${t.tradeReference ?? 'no reference'}: ${t.side} ${t.security?.ticker ?? ''} ${fmtNum(dec(t.quantity))}) on ${toISODate(t.tradeDate)} has no custodian execution record.`,
                    expected: t.tradeReference ?? t.ref,
                    actual: null,
                  },
                ],
              },
            },
          });
          await this.audit.record(
            { ctx, entityType: 'ReconciliationItem', entityId: created.id, action: 'RECON_ITEM_UPDATED', before: { status: 'NOT_STARTED' }, after: { status: 'UNMATCHED' }, metadata: { actorName: ctx.name, batchRef: batch.ref, kind: 'INTERNAL_ORPHAN', tradeReference: t.tradeReference, summary: 'Internal trade with no custodian record' } },
            tx,
          );
        }
      },
      { timeout: 120_000, maxWait: 15_000 },
    );

    // ── batch summary + audit ─────────────────────────────────────────────────
    const [grouped, openExceptions] = await Promise.all([
      this.prisma.reconciliationItem.groupBy({ by: ['status'], where: { batchId: batch.id }, _count: { _all: true } }),
      this.prisma.reconciliationException.count({ where: { status: 'OPEN', item: { batchId: batch.id } } }),
    ]);
    const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count._all])) as Record<string, number>;
    const outstanding = (counts.UNMATCHED ?? 0) + (counts.DIFFERENCE ?? 0) + (counts.PENDING_REVIEW ?? 0);
    const prevRuns = Number((batch.summary as { runs?: number } | null)?.runs ?? 0);
    const summary = { counts, openExceptions, runs: prevRuns + 1, lastRunAt: new Date().toISOString() };
    await this.prisma.reconciliationBatch.update({
      where: { id: batch.id },
      data: { summary: summary as Prisma.InputJsonValue, status: outstanding === 0 ? 'COMPLETED' : 'OPEN', completedAt: outstanding === 0 ? new Date() : null },
    });

    const all = [...outcomes.values(), ...deOutcomes.values()];
    const result: RunResult = {
      batch: { id: batch.id, ref: batch.ref, businessDate: businessDay },
      processed: execs.length + dayEnds.length,
      matched: all.filter((o) => o.status === 'MATCHED').length,
      differences: all.filter((o) => o.status === 'DIFFERENCE').length,
      unmatched: all.filter((o) => o.status === 'UNMATCHED').length,
      pendingReview: all.filter((o) => o.status === 'PENDING_REVIEW').length,
      internalOrphans: orphans.length,
      openExceptions,
    };
    await this.audit.record({
      ctx,
      entityType: 'ReconciliationBatch',
      entityId: batch.id,
      action: 'RECONCILIATION_RUN',
      after: summary,
      metadata: { actorName: ctx.name, batchRef: batch.ref, businessDate: businessDay, ...result, internalFiguresBasis: 'current holdings (MVP simplification)' },
    });
    return result;
  }

  // ── helpers ─────────────────────────────────────────────────────────────────
  private compareExecution(e: { ref?: string; tradeReference: string; ticker: string; side: string; quantity: Prisma.Decimal; price: Prisma.Decimal; currency: string; executedAt: Date; settlementDate: Date; broker: string }, tx: Tx) {
    const day = toISODate(utcDay(e.executedAt));
    const intDay = toISODate(tx.tradeDate);
    const qtyBad = !D(e.quantity).equals(D(tx.quantity));
    const priceBad = D(e.price).minus(D(tx.price)).abs().gt(PRICE_TOLERANCE);
    const curBad = e.currency !== tx.currency;
    const intSettle = tx.settlementDate ? toISODate(tx.settlementDate) : null;
    const custSettle = toISODate(e.settlementDate);
    const settleBad = intSettle !== null && intSettle !== custSettle;

    const diffs: Diff[] = [
      { field: 'tradeReference', label: 'Trade reference', custodian: e.tradeReference, internal: tx.tradeReference, differs: (tx.tradeReference ?? null) !== e.tradeReference },
      { field: 'ticker', label: 'Security', custodian: e.ticker, internal: tx.security?.ticker ?? null, differs: (tx.security?.ticker ?? null) !== e.ticker },
      { field: 'side', label: 'Side', custodian: e.side, internal: tx.side, differs: tx.side !== e.side },
      { field: 'tradeDate', label: 'Trade date', custodian: day, internal: intDay, differs: day !== intDay },
      { field: 'quantity', label: 'Quantity', custodian: dec(e.quantity), internal: dec(tx.quantity), differs: qtyBad, note: 'Exact match required' },
      { field: 'price', label: 'Price', custodian: dec(e.price), internal: dec(tx.price), differs: priceBad, note: 'Tolerance 0.0001' },
      { field: 'currency', label: 'Currency', custodian: e.currency, internal: tx.currency, differs: curBad },
      {
        field: 'settlementDate',
        label: 'Settlement date',
        custodian: custSettle,
        internal: intSettle,
        differs: settleBad,
        note: intSettle === null ? 'Internal settlement date not recorded; not compared' : undefined,
      },
      { field: 'broker', label: 'Broker', custodian: e.broker, internal: tx.broker ?? null, differs: false, note: 'Informational; not part of the match' },
    ];

    const detected: Detected[] = [];
    if (qtyBad) detected.push({ type: 'QUANTITY_DIFFERENCE', description: `Quantity differs: custodian ${fmtNum(dec(e.quantity))} vs internal ${fmtNum(dec(tx.quantity))}.`, expected: dec(tx.quantity), actual: dec(e.quantity) });
    if (priceBad) detected.push({ type: 'PRICE_DIFFERENCE', description: `Price differs beyond the 0.0001 tolerance: custodian ${fmtNum(dec(e.price))} vs internal ${fmtNum(dec(tx.price))}.`, expected: dec(tx.price), actual: dec(e.price) });
    if (curBad) detected.push({ type: 'CURRENCY_DIFFERENCE', description: `Currency differs: custodian ${e.currency} vs internal ${tx.currency}.`, expected: tx.currency, actual: e.currency });
    if (settleBad) detected.push({ type: 'SETTLEMENT_DATE_DIFFERENCE', description: `Settlement date differs: custodian ${custSettle} vs internal ${intSettle}.`, expected: intSettle, actual: custSettle });
    return { diffs, detected };
  }

  private txSnapshot(t: Tx, portfolioRef?: string) {
    return {
      transactionRef: t.ref,
      tradeReference: t.tradeReference,
      portfolio: portfolioRef ?? null,
      ticker: t.security?.ticker ?? null,
      security: t.security?.name ?? null,
      side: t.side,
      quantity: dec(t.quantity),
      price: dec(t.price),
      amount: money(t.amount),
      currency: t.currency,
      tradeDate: toISODate(t.tradeDate),
      settlementDate: t.settlementDate ? toISODate(t.settlementDate) : null,
      broker: t.broker,
      status: t.status,
    };
  }

  /** Upsert one item and synchronise its exceptions. Resolved exceptions are never re-opened or duplicated. */
  private async writeItem(
    db: Prisma.TransactionClient,
    ctx: RequestContext,
    batch: { id: string; ref: string },
    a: { existing: ItemWithEx | null; fields: ItemFields; outcome: Outcome; submission: { kind: 'EXECUTION' | 'DAY_END'; id: string }; label: string },
  ) {
    const { existing, fields, outcome } = a;
    const byType = new Map((existing?.exceptions ?? []).map((x) => [x.type, x]));
    const detectedTypes = new Set(outcome.detected.map((x) => x.type));
    const allResolved = outcome.detected.length > 0 && outcome.detected.every((x) => byType.get(x.type)?.status === 'RESOLVED');
    const status: ReconStatus = outcome.status === 'MATCHED' ? 'MATCHED' : allResolved ? 'RESOLVED' : outcome.status;

    const data = {
      kind: fields.kind,
      executionId: fields.executionId ?? null,
      dayEndId: fields.dayEndId ?? null,
      transactionId: fields.transactionId ?? null,
      portfolioId: fields.portfolioId ?? null,
      tradeReference: fields.tradeReference ?? null,
      ticker: fields.ticker ?? null,
      quantity: fields.quantity ?? null,
      price: fields.price ?? null,
      currency: fields.currency ?? null,
      matchKey: fields.matchKey ?? null,
      sourceSnapshot: fields.sourceSnapshot,
      internalSnapshot: fields.internalSnapshot,
      differences: fields.differences,
      batchId: batch.id,
      status,
    };

    let itemId: string;
    if (existing) {
      await db.reconciliationItem.update({ where: { id: existing.id }, data });
      itemId = existing.id;
    } else {
      itemId = (await db.reconciliationItem.create({ data })).id;
    }

    const toCreate = outcome.detected.filter((x) => !byType.has(x.type));
    if (toCreate.length) {
      await db.reconciliationException.createMany({
        data: toCreate.map((x) => ({ itemId, type: x.type, description: x.description, expected: x.expected ?? null, actual: x.actual ?? null })),
      });
    }
    for (const x of outcome.detected) {
      const ex = byType.get(x.type);
      if (ex && ex.status === 'OPEN') {
        await db.reconciliationException.update({ where: { id: ex.id }, data: { description: x.description, expected: x.expected ?? null, actual: x.actual ?? null } });
      }
    }
    const cleared = (existing?.exceptions ?? []).filter((x) => x.status === 'OPEN' && !detectedTypes.has(x.type)).map((x) => x.id);
    if (cleared.length) {
      await db.reconciliationException.updateMany({
        where: { id: { in: cleared } },
        data: { status: 'RESOLVED', resolutionNote: 'Cleared automatically: the difference is no longer present after re-running reconciliation.', resolvedByName: 'System (re-run)', resolvedAt: new Date() },
      });
    }

    // keep the submission's reconciliation status in step with its item (source values untouched)
    if (a.submission.kind === 'EXECUTION') await db.custodianExecution.update({ where: { id: a.submission.id }, data: { reconStatus: status } });
    else await db.custodianDayEndSubmission.update({ where: { id: a.submission.id }, data: { reconStatus: status } });

    const before = existing?.status ?? 'NOT_STARTED';
    if (before !== status) {
      await this.audit.record(
        {
          ctx,
          entityType: 'ReconciliationItem',
          entityId: itemId,
          action: 'RECON_ITEM_UPDATED',
          before: { status: before },
          after: { status },
          metadata: {
            actorName: ctx.name,
            batchRef: batch.ref,
            kind: fields.kind,
            label: a.label,
            summary: outcome.detected.map((x) => x.description).join(' ') || 'All compared fields agree',
            statusLabel: RECON_STATUS_LABELS[status],
          },
        },
        db,
      );
    }
  }
}
