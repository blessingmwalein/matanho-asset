import { Prisma } from '@prisma/client';
import { ASSET_CLASS_LABELS, type AssetClass } from '@nexus/shared';
import { D, money, sum, todayUtc, toISODate } from '../../common/decimal';

/**
 * MVP valuation helpers. A portfolio's value is the sum of its holdings' market values
 * (quantity × current price, no accruals / FX / fees). PortfolioValuation rows are the NAV time series
 * that feed the performance charts.
 */

export interface SeriesPoint {
  date: string;
  value: number;
  benchmark: number | null;
}

/** Sum of holdings.marketValue for one portfolio. */
export async function portfolioNav(tx: Prisma.TransactionClient, portfolioId: string): Promise<Prisma.Decimal> {
  const agg = await tx.holding.aggregate({ where: { portfolioId }, _sum: { marketValue: true } });
  return D(agg._sum.marketValue);
}

/**
 * Upsert TODAY's valuation point with the current sum of holdings. The benchmark index is carried over
 * from today's existing point or the latest earlier one so the benchmark line stays continuous.
 */
export async function syncValuation(tx: Prisma.TransactionClient, portfolioId: string, source = 'Holdings update'): Promise<Prisma.Decimal> {
  const asOf = todayUtc();
  const nav = money(await portfolioNav(tx, portfolioId));
  const existing = await tx.portfolioValuation.findUnique({ where: { portfolioId_asOf: { portfolioId, asOf } } });
  let benchmarkIndex: Prisma.Decimal | null = existing?.benchmarkIndex ?? null;
  if (!existing) {
    const last = await tx.portfolioValuation.findFirst({ where: { portfolioId, asOf: { lt: asOf } }, orderBy: { asOf: 'desc' } });
    benchmarkIndex = last?.benchmarkIndex ?? null;
  }
  await tx.portfolioValuation.upsert({
    where: { portfolioId_asOf: { portfolioId, asOf } },
    create: { portfolioId, asOf, nav, benchmarkIndex, source },
    update: { nav, source },
  });
  return nav;
}

interface ValuationRow {
  asOf: Date;
  nav: Prisma.Decimal;
  benchmarkIndex: Prisma.Decimal | null;
}

/**
 * Chart series for one portfolio. The benchmark index is rebased to the portfolio's first NAV so both
 * lines start at the same level. Values are plain numbers for charting only (all maths is Decimal).
 */
export function buildSeries(rows: ValuationRow[]): SeriesPoint[] {
  if (!rows.length) return [];
  const first = rows[0]!;
  const firstBench = rows.find((r) => r.benchmarkIndex !== null && !D(r.benchmarkIndex).isZero())?.benchmarkIndex ?? null;
  return rows.map((r) => ({
    date: toISODate(r.asOf),
    value: money(r.nav).toNumber(),
    benchmark: r.benchmarkIndex && firstBench ? money(D(r.benchmarkIndex).mul(D(first.nav)).div(D(firstBench))).toNumber() : null,
  }));
}

/** Sum several portfolios' series by date (forward-filling a portfolio between its own points). */
export function aggregateSeries(perPortfolio: SeriesPoint[][]): SeriesPoint[] {
  const dates = Array.from(new Set(perPortfolio.flatMap((s) => s.map((p) => p.date)))).sort();
  const cursors = perPortfolio.map(() => 0);
  const lastSeen: Array<SeriesPoint | null> = perPortfolio.map(() => null);
  const out: SeriesPoint[] = [];
  for (const date of dates) {
    let value = D(0);
    let bench = D(0);
    let benchAny = false;
    perPortfolio.forEach((series, i) => {
      while (cursors[i]! < series.length && series[cursors[i]!]!.date <= date) {
        lastSeen[i] = series[cursors[i]!]!;
        cursors[i]!++;
      }
      const p = lastSeen[i];
      if (!p) return;
      value = value.add(p.value);
      // a portfolio without a benchmark contributes its own NAV so the aggregate benchmark stays comparable
      bench = bench.add(p.benchmark ?? p.value);
      if (p.benchmark !== null) benchAny = true;
    });
    out.push({ date, value: money(value).toNumber(), benchmark: benchAny ? money(bench).toNumber() : null });
  }
  return out;
}

export interface AllocationSlice {
  key: string;
  label: string;
  value: number;
  pct: number;
}

export function buildAllocation(items: Array<{ assetClass: string; value: Prisma.Decimal.Value }>): AllocationSlice[] {
  const by = new Map<string, Prisma.Decimal>();
  for (const i of items) by.set(i.assetClass, (by.get(i.assetClass) ?? D(0)).add(D(i.value)));
  const total = sum(Array.from(by.values()));
  return Array.from(by.entries())
    .filter(([, v]) => v.gt(0))
    .map(([key, v]) => ({
      key,
      label: ASSET_CLASS_LABELS[key as AssetClass] ?? key,
      value: money(v).toNumber(),
      pct: total.isZero() ? 0 : v.div(total).mul(100).toDecimalPlaces(2).toNumber(),
    }))
    .sort((a, b) => b.value - a.value);
}
