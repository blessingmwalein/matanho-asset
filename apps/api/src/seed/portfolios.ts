import { Prisma } from '@prisma/client';
import type { AssetClass, PortfolioType, Side, TransactionStatus, TransactionType } from '@nexus/shared';
import { D, marketValue, money } from '../common/decimal';
import type { SeedContext } from './seed-context';

/**
 * Agent 1 seed: securities, investment accounts, portfolios (BGF-001, ARF-001, INC-001 for Horizon, CED-001 for Cedar),
 * confirmed holdings whose market values sum to the demo targets (cash is the plug), a deterministic 3-year monthly
 * PortfolioValuation series with a benchmark index, and ~30 realistic transactions.
 * Registry keys: security.<TICKER>, account.horizon-{bgf,arf,inc}, account.cedar-inc, portfolio.{bgf,arf,inc,cedar1}, tx.<tradeReference>.
 */

interface SecuritySeed {
  ticker: string;
  name: string;
  assetClass: AssetClass;
  exchange: string;
  price: string;
  isin?: string;
}

const SECURITIES: SecuritySeed[] = [
  { ticker: 'DLTA.ZW', name: 'Delta Corporation Limited', assetClass: 'EQUITY', exchange: 'ZSE', price: '0.184' },
  { ticker: 'ECO.ZW', name: 'Econet Wireless Zimbabwe Limited', assetClass: 'EQUITY', exchange: 'ZSE', price: '0.095' },
  { ticker: 'INN.ZW', name: 'Innscor Africa Limited', assetClass: 'EQUITY', exchange: 'ZSE', price: '0.412' },
  { ticker: 'OMU.ZW', name: 'Old Mutual Limited (ZSE listing)', assetClass: 'EQUITY', exchange: 'ZSE', price: '0.310' },
  { ticker: 'SEED.ZW', name: 'Seed Co Limited', assetClass: 'EQUITY', exchange: 'ZSE', price: '0.170' },
  { ticker: 'NPN.JO', name: 'Naspers Limited (USD equivalent)', assetClass: 'EQUITY', exchange: 'JSE', price: '172.35' },
  { ticker: 'ANG.JO', name: 'AngloGold Ashanti plc (USD equivalent)', assetClass: 'EQUITY', exchange: 'JSE', price: '34.80' },
  { ticker: 'VOO', name: 'Vanguard S&P 500 ETF', assetClass: 'EQUITY', exchange: 'NYSE Arca', price: '612.40', isin: 'US9229083632' },
  { ticker: 'ACWI', name: 'iShares MSCI ACWI ETF', assetClass: 'EQUITY', exchange: 'NASDAQ', price: '131.85', isin: 'US4642882579' },
  { ticker: 'ZW-TB-2027', name: 'Zimbabwe Treasury Bill 2027 (USD)', assetClass: 'FIXED_INCOME', exchange: 'OTC', price: '0.942' },
  { ticker: 'UST-2030', name: 'US Treasury 4.00% 2030', assetClass: 'FIXED_INCOME', exchange: 'OTC', price: '0.9815' },
  { ticker: 'RSA-R186', name: 'Republic of South Africa R186 (USD equivalent)', assetClass: 'FIXED_INCOME', exchange: 'JSE', price: '1.012' },
  { ticker: 'CASH-USD', name: 'US Dollar cash', assetClass: 'CASH', exchange: 'n/a', price: '1' },
];

interface PortfolioSeed {
  key: 'bgf' | 'arf' | 'inc' | 'cedar1';
  ref: string;
  name: string;
  investor: 'horizon' | 'cedar';
  accountKey: string;
  accountName: string;
  type: PortfolioType;
  target: string;
  benchmark: string;
  description: string;
  /** monthly log-return drift / volatility of the synthetic NAV walk, and trailing-YTD targets (percent) */
  drift: number;
  vol: number;
  ytd: number;
  benchYtd: number;
  holdings: Array<{ ticker: string; qty: string }>;
}

const PORTFOLIOS: PortfolioSeed[] = [
  {
    key: 'bgf',
    ref: 'BGF-001',
    name: 'Balanced Growth',
    investor: 'horizon',
    accountKey: 'account.horizon-bgf',
    accountName: 'Balanced Growth mandate',
    type: 'MANAGED_ACCOUNT',
    target: '11860000',
    benchmark: 'ZSE All Share / MSCI ACWI composite',
    description: 'Discretionary balanced mandate: regional and global equities with a fixed-income and liquidity sleeve.',
    drift: 0.0065,
    vol: 0.014,
    ytd: 12.84,
    benchYtd: 10.74,
    holdings: [
      { ticker: 'DLTA.ZW', qty: '4200000' },
      { ticker: 'ECO.ZW', qty: '9000000' },
      { ticker: 'INN.ZW', qty: '2100000' },
      { ticker: 'OMU.ZW', qty: '2800000' },
      { ticker: 'SEED.ZW', qty: '1400000' },
      { ticker: 'NPN.JO', qty: '1450' },
      { ticker: 'ANG.JO', qty: '7200' },
      { ticker: 'VOO', qty: '2450' },
      { ticker: 'ACWI', qty: '7600' },
      { ticker: 'ZW-TB-2027', qty: '1000000' },
      { ticker: 'UST-2030', qty: '1300000' },
      { ticker: 'RSA-R186', qty: '900000' },
    ],
  },
  {
    key: 'arf',
    ref: 'ARF-001',
    name: 'Absolute Return',
    investor: 'horizon',
    accountKey: 'account.horizon-arf',
    accountName: 'Absolute Return mandate',
    type: 'MANAGED_ACCOUNT',
    target: '3120000',
    benchmark: 'US T-Bill + 4%',
    description: 'Lower-volatility absolute-return mandate targeting T-Bill plus 4% over a rolling three-year period.',
    drift: 0.005,
    vol: 0.011,
    ytd: 8.92,
    benchYtd: 7.41,
    holdings: [
      { ticker: 'VOO', qty: '900' },
      { ticker: 'NPN.JO', qty: '2100' },
      { ticker: 'ANG.JO', qty: '9500' },
      { ticker: 'DLTA.ZW', qty: '1800000' },
      { ticker: 'INN.ZW', qty: '900000' },
      { ticker: 'UST-2030', qty: '600000' },
    ],
  },
  {
    key: 'inc',
    ref: 'INC-001',
    name: 'Income Mandate',
    investor: 'horizon',
    accountKey: 'account.horizon-inc',
    accountName: 'Income Mandate account',
    type: 'MANAGED_ACCOUNT',
    target: '1660000',
    benchmark: '1Y T-Bill + 2%',
    description: 'Income-focused mandate: short-duration sovereign paper and dividend-paying equities.',
    drift: 0.0042,
    vol: 0.004,
    ytd: 6.41,
    benchYtd: 5.93,
    holdings: [
      { ticker: 'ZW-TB-2027', qty: '400000' },
      { ticker: 'UST-2030', qty: '350000' },
      { ticker: 'RSA-R186', qty: '300000' },
      { ticker: 'DLTA.ZW', qty: '900000' },
      { ticker: 'OMU.ZW', qty: '600000' },
    ],
  },
  {
    key: 'cedar1',
    ref: 'CED-001',
    name: 'Cedar Income Mandate',
    investor: 'cedar',
    accountKey: 'account.cedar-inc',
    accountName: 'Segregated income mandate',
    type: 'SEGREGATED_MANDATE',
    target: '4180000',
    benchmark: 'ZSE fixed-income composite',
    description: 'Segregated income mandate for an insurer: sovereign fixed income with a liquidity buffer.',
    drift: 0.0044,
    vol: 0.0045,
    ytd: 6.05,
    benchYtd: 5.4,
    holdings: [
      { ticker: 'ZW-TB-2027', qty: '1100000' },
      { ticker: 'UST-2030', qty: '1500000' },
      { ticker: 'RSA-R186', qty: '700000' },
      { ticker: 'DLTA.ZW', qty: '1100000' },
      { ticker: 'OMU.ZW', qty: '700000' },
    ],
  },
];

interface TxnSeed {
  pf: PortfolioSeed['key'];
  type: TransactionType;
  side?: Side;
  ticker?: string;
  qty?: string;
  price?: string;
  amount?: string;
  /** business days ago for trades, calendar days ago for cash events; 0 = today */
  ago: number;
  ref?: string;
  broker?: string;
  notes?: string;
  status?: TransactionStatus;
}

const BROKERS = ['Imara Edwards Securities', 'First Equity Securities', 'Standard Bank Stockbrokers', 'Interactive Brokers', 'Morgan Stanley Wealth'];

const TXNS: TxnSeed[] = [
  // exact references used by the custodian seed (do not change)
  { pf: 'bgf', type: 'TRADE', side: 'BUY', ticker: 'DLTA.ZW', qty: '10000', price: '0.184', ago: 2, ref: 'TRD-DEMO-201', broker: 'Imara Edwards Securities', notes: 'Demo: matched custodian execution' },
  { pf: 'bgf', type: 'TRADE', side: 'SELL', ticker: 'INN.ZW', qty: '5000', price: '0.412', ago: 2, ref: 'TRD-DEMO-202', broker: 'First Equity Securities', notes: 'Demo: custodian reports a different quantity' },
  { pf: 'bgf', type: 'TRADE', side: 'BUY', ticker: 'ECO.ZW', qty: '20000', price: '0.095', ago: 2, ref: 'TRD-DEMO-203', broker: 'Imara Edwards Securities', notes: 'Demo: no custodian record (internal orphan)' },
  { pf: 'bgf', type: 'TRADE', side: 'BUY', ticker: 'DLTA.ZW', qty: '10000', price: '0.184', ago: 0, ref: 'TRD-DEMO-301', broker: 'Imara Edwards Securities', notes: 'Demo: live reconciliation flow' },
  // Balanced Growth
  { pf: 'bgf', type: 'CASH_IN', amount: '350000', ago: 78, notes: 'Member contributions: Q3 month 1' },
  { pf: 'bgf', type: 'TRADE', side: 'BUY', ticker: 'VOO', qty: '150', price: '598.20', ago: 66, ref: 'TRD-SEED-1001', broker: 'Interactive Brokers' },
  { pf: 'bgf', type: 'TRADE', side: 'SELL', ticker: 'NPN.JO', qty: '120', price: '181.10', ago: 61, ref: 'TRD-SEED-1002', broker: 'Standard Bank Stockbrokers', notes: 'Trim after strong run' },
  { pf: 'bgf', type: 'TRADE', side: 'BUY', ticker: 'DLTA.ZW', qty: '150000', price: '0.176', ago: 55, ref: 'TRD-SEED-1003', broker: 'Imara Edwards Securities' },
  { pf: 'bgf', type: 'DIVIDEND', ticker: 'DLTA.ZW', amount: '21500', ago: 49, notes: 'DLTA interim dividend' },
  { pf: 'bgf', type: 'FEE', amount: '28450', ago: 44, notes: 'Management fee: Q3' },
  { pf: 'bgf', type: 'TRADE', side: 'BUY', ticker: 'UST-2030', qty: '200000', price: '0.9790', ago: 38, ref: 'TRD-SEED-1004', broker: 'Morgan Stanley Wealth' },
  { pf: 'bgf', type: 'TRADE', side: 'SELL', ticker: 'ECO.ZW', qty: '400000', price: '0.101', ago: 30, ref: 'TRD-SEED-1005', broker: 'First Equity Securities' },
  { pf: 'bgf', type: 'CASH_IN', amount: '350000', ago: 21, notes: 'Member contributions: Q4 month 1' },
  { pf: 'bgf', type: 'TRADE', side: 'BUY', ticker: 'INN.ZW', qty: '120000', price: '0.398', ago: 12, ref: 'TRD-SEED-1006', broker: 'Imara Edwards Securities' },
  { pf: 'bgf', type: 'TRADE', side: 'BUY', ticker: 'ACWI', qty: '500', price: '131.20', ago: 1, ref: 'TRD-SEED-1007', broker: 'Interactive Brokers', status: 'PENDING', notes: 'Awaiting settlement confirmation' },
  // Absolute Return
  { pf: 'arf', type: 'CASH_IN', amount: '250000', ago: 72, notes: 'Top-up from client treasury' },
  { pf: 'arf', type: 'TRADE', side: 'BUY', ticker: 'ACWI', qty: '600', price: '128.40', ago: 58, ref: 'TRD-SEED-2001', broker: 'Interactive Brokers' },
  { pf: 'arf', type: 'TRADE', side: 'SELL', ticker: 'ANG.JO', qty: '800', price: '36.20', ago: 47, ref: 'TRD-SEED-2002', broker: 'Standard Bank Stockbrokers' },
  { pf: 'arf', type: 'TRADE', side: 'BUY', ticker: 'VOO', qty: '90', price: '603.10', ago: 33, ref: 'TRD-SEED-2003', broker: 'Interactive Brokers' },
  { pf: 'arf', type: 'DIVIDEND', ticker: 'VOO', amount: '3150', ago: 25, notes: 'VOO quarterly distribution' },
  { pf: 'arf', type: 'FEE', amount: '7800', ago: 18, notes: 'Management fee: Q3' },
  // Income Mandate
  { pf: 'inc', type: 'TRADE', side: 'BUY', ticker: 'ZW-TB-2027', qty: '100000', price: '0.939', ago: 63, ref: 'TRD-SEED-3001', broker: 'Imara Edwards Securities' },
  { pf: 'inc', type: 'TRADE', side: 'BUY', ticker: 'RSA-R186', qty: '50000', price: '1.009', ago: 40, ref: 'TRD-SEED-3002', broker: 'Standard Bank Stockbrokers' },
  { pf: 'inc', type: 'DIVIDEND', ticker: 'OMU.ZW', amount: '6200', ago: 35, notes: 'OMU final dividend' },
  { pf: 'inc', type: 'CASH_OUT', amount: '80000', ago: 20, notes: 'Benefit payments drawdown' },
  { pf: 'inc', type: 'FEE', amount: '4150', ago: 9, notes: 'Management fee: Q3' },
  // Cedar
  { pf: 'cedar1', type: 'CASH_IN', amount: '400000', ago: 82, notes: 'Premium float transfer' },
  { pf: 'cedar1', type: 'TRADE', side: 'BUY', ticker: 'UST-2030', qty: '300000', price: '0.9802', ago: 70, ref: 'TRD-SEED-4001', broker: 'Morgan Stanley Wealth' },
  { pf: 'cedar1', type: 'TRADE', side: 'SELL', ticker: 'DLTA.ZW', qty: '150000', price: '0.188', ago: 52, ref: 'TRD-SEED-4002', broker: 'Imara Edwards Securities' },
  { pf: 'cedar1', type: 'TRADE', side: 'BUY', ticker: 'ZW-TB-2027', qty: '200000', price: '0.9405', ago: 27, ref: 'TRD-SEED-4003', broker: 'First Equity Securities' },
  { pf: 'cedar1', type: 'DIVIDEND', ticker: 'OMU.ZW', amount: '5600', ago: 16, notes: 'OMU final dividend' },
  { pf: 'cedar1', type: 'FEE', amount: '10450', ago: 7, notes: 'Management fee: Q3' },
];

/** Standard-normal-ish noise from the seeded PRNG (sum of three uniforms, rescaled to unit variance). */
const noise = (rng: () => number) => (rng() + rng() + rng() - 1.5) * 2;

/** Month-end dates going back `months` months, ascending, with today appended as the final point. */
function seriesDates(today: Date, months: number): Date[] {
  const dates: Date[] = [];
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  for (let k = months; k >= 1; k--) dates.push(new Date(Date.UTC(y, m - k + 1, 0)));
  if (dates[dates.length - 1]!.getTime() !== today.getTime()) dates.push(today);
  return dates;
}

/**
 * Deterministic NAV + benchmark path ending exactly at `target`. Monthly log-returns are drift + noise; the returns in the
 * current calendar year are shifted so the YTD (Jan month-end → today) matches the demo's headline figures.
 */
function buildPath(ctx: SeedContext, p: PortfolioSeed, dates: Date[], target: Prisma.Decimal) {
  const n = dates.length;
  const jan1 = Date.UTC(ctx.today.getUTCFullYear(), 0, 1);
  const k0 = dates.findIndex((d) => d.getTime() >= jan1);
  const r: number[] = [0];
  const b: number[] = [0];
  for (let i = 1; i < n; i++) {
    const z = noise(ctx.rng);
    r.push(p.drift + p.vol * z);
    b.push(p.drift - 0.0012 + p.vol * 0.85 * (0.6 * z + 0.4 * noise(ctx.rng)));
  }
  if (k0 >= 0 && k0 < n - 1) {
    const adjust = (arr: number[], ytdPct: number) => {
      const seg = arr.slice(k0 + 1);
      const mean = seg.reduce((a, v) => a + v, 0) / seg.length;
      const want = Math.log(1 + ytdPct / 100) / seg.length;
      for (let i = k0 + 1; i < n; i++) arr[i] = arr[i]! - mean + want;
    };
    adjust(r, p.ytd);
    adjust(b, p.benchYtd);
  }
  const nav: Prisma.Decimal[] = new Array(n);
  nav[n - 1] = target;
  let level = Number(target.toString());
  for (let i = n - 1; i >= 1; i--) {
    level = level / Math.exp(r[i]!);
    nav[i - 1] = new Prisma.Decimal(level.toFixed(2));
  }
  const bench: Prisma.Decimal[] = new Array(n);
  let idx = 1000;
  bench[0] = new Prisma.Decimal(idx.toFixed(4));
  for (let i = 1; i < n; i++) {
    idx = idx * Math.exp(b[i]!);
    bench[i] = new Prisma.Decimal(idx.toFixed(4));
  }
  return { nav, bench };
}

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

export async function seedPortfolios(ctx: SeedContext): Promise<void> {
  const { prisma } = ctx;
  const managerId = ctx.get('user.am');

  // last business day (today when it is a weekday)
  let lbd = ctx.today;
  while (lbd.getUTCDay() === 0 || lbd.getUTCDay() === 6) lbd = addDays(lbd, -1);

  // ── securities ──────────────────────────────────────────────────────────────
  const secIds = new Map<string, string>();
  const secPrice = new Map<string, Prisma.Decimal>();
  for (const s of SECURITIES) {
    const row = await prisma.security.create({
      data: {
        ticker: s.ticker,
        name: s.name,
        isin: s.isin ?? null,
        assetClass: s.assetClass,
        currency: 'USD',
        exchange: s.exchange,
        lastPrice: new Prisma.Decimal(s.price),
        priceDate: lbd,
        priceSource: 'Seed (indicative closing price)',
      },
    });
    secIds.set(s.ticker, row.id);
    secPrice.set(s.ticker, new Prisma.Decimal(s.price));
    ctx.set(`security.${s.ticker}`, row.id);
  }
  ctx.log(`${SECURITIES.length} securities (ZSE, JSE, global ETFs, sovereign fixed income, cash)`);

  // ── accounts + portfolios ───────────────────────────────────────────────────
  const dates = seriesDates(ctx.today, 36);
  const portfolioIds = new Map<string, string>();
  let valuationRows = 0;

  for (const p of PORTFOLIOS) {
    const investorId = ctx.get(`investor.${p.investor}`);
    const account = await prisma.investmentAccount.create({
      data: { ref: await ctx.refs.generic('ACC', 4), investorId, name: p.accountName, type: 'MANDATE', baseCurrency: 'USD' },
    });
    ctx.set(p.accountKey, account.id);

    const portfolio = await prisma.portfolio.create({
      data: {
        ref: p.ref,
        name: p.name,
        investorId,
        accountId: account.id,
        type: p.type,
        baseCurrency: 'USD',
        managerId,
        benchmark: p.benchmark,
        inceptionDate: dates[0]!,
        status: 'ACTIVE',
        description: p.description,
      },
    });
    portfolioIds.set(p.key, portfolio.id);
    ctx.set(`portfolio.${p.key}`, portfolio.id);

    // holdings: priced positions, then cash as the plug so the portfolio totals the target exactly
    const target = new Prisma.Decimal(p.target);
    let invested = D(0);
    for (const h of p.holdings) {
      const price = secPrice.get(h.ticker)!;
      const qty = new Prisma.Decimal(h.qty);
      const mv = marketValue(qty, price);
      invested = invested.add(mv);
      const costFactor = 0.78 + ctx.rng() * 0.34; // deterministic unrealised gain / loss
      await prisma.holding.create({
        data: {
          portfolioId: portfolio.id,
          securityId: secIds.get(h.ticker)!,
          quantity: qty,
          averageCost: new Prisma.Decimal((Number(price.toString()) * costFactor).toFixed(6)),
          currentPrice: price,
          currency: 'USD',
          marketValue: mv,
          valuationDate: lbd,
          source: 'SEED',
          priceSource: 'Seed (indicative closing price)',
          status: 'CONFIRMED',
        },
      });
    }
    const cash = money(target.sub(invested));
    if (cash.lte(0)) throw new Error(`Seed: ${p.ref} holdings (${invested.toString()}) exceed the target ${p.target}; adjust quantities`);
    await prisma.holding.create({
      data: {
        portfolioId: portfolio.id,
        securityId: secIds.get('CASH-USD')!,
        quantity: cash,
        averageCost: 1,
        currentPrice: 1,
        currency: 'USD',
        marketValue: cash,
        valuationDate: lbd,
        source: 'SEED',
        priceSource: 'Custodian cash balance (seed)',
        status: 'CONFIRMED',
      },
    });

    // 3-year monthly NAV series ending exactly at the target (today's point)
    const { nav, bench } = buildPath(ctx, p, dates, target);
    await prisma.portfolioValuation.createMany({
      data: dates.map((d, i) => ({ portfolioId: portfolio.id, asOf: d, nav: nav[i]!, benchmarkIndex: bench[i]!, source: 'Seed' })),
    });
    valuationRows += dates.length;
  }
  ctx.log(`4 portfolios (BGF-001, ARF-001, INC-001, CED-001) with confirmed holdings; ${valuationRows} monthly valuation points`);

  // ── transactions (oldest first so TXN references ascend with time) ──────────
  const dated = TXNS.map((t, i) => ({ t, i, date: t.type === 'TRADE' ? ctx.businessDaysAgo(t.ago) : ctx.daysAgo(t.ago) })).sort(
    (a, b) => a.date.getTime() - b.date.getTime() || a.i - b.i,
  );
  let count = 0;
  for (const { t, i, date } of dated) {
    const isTrade = t.type === 'TRADE';
    const qty = isTrade ? new Prisma.Decimal(t.qty!) : D(0);
    const price = isTrade ? new Prisma.Decimal(t.price!) : D(0);
    const amount = isTrade ? marketValue(qty, price) : money(t.amount!);
    const row = await prisma.investmentTransaction.create({
      data: {
        ref: await ctx.refs.transaction(),
        tradeReference: t.ref ?? null,
        portfolioId: portfolioIds.get(t.pf)!,
        securityId: t.ticker ? secIds.get(t.ticker)! : null,
        type: t.type,
        side: isTrade ? t.side! : null,
        quantity: qty,
        price,
        amount,
        currency: 'USD',
        tradeDate: date,
        settlementDate: isTrade ? addDays(date, 2) : date,
        broker: isTrade ? (t.broker ?? BROKERS[i % BROKERS.length]!) : null,
        notes: t.notes ?? null,
        status: t.status ?? 'COMPLETED',
        createdById: managerId,
      },
    });
    if (t.ref) ctx.set(`tx.${t.ref}`, row.id);
    count++;
  }
  ctx.log(`${count} investment transactions (incl. TRD-DEMO-201/202/203/301)`);
}
