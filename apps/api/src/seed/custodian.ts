import { createHash } from 'crypto';
import { Prisma, type Side } from '@prisma/client';
import type { RequestContext } from '../common/auth/request-context';
import { money, sum, toISODate } from '../common/decimal';
import { ReconciliationEngine } from '../modules/reconciliation/reconciliation.engine';
import { ReconciliationService } from '../modules/reconciliation/reconciliation.service';
import { buildPdf } from './pdf';
import type { SeedContext } from './seed-context';

/**
 * Custodian accounts, executions, day-end packages and a real reconciliation batch.
 *
 * The batch is produced by running the REAL matching engine over the seeded records (same code path as the
 * "Run reconciliation" button), so seeded items, differences and exceptions are consistent with the rules.
 * Contract (docs/CONVENTIONS.md §5): TRD-DEMO-201 MATCHED, 202 DIFFERENCE (qty 4500 vs 5000), 299 UNMATCHED
 * (custodian only), 203 has no custodian record (internal orphan), one exception RESOLVED with note + user,
 * plus one fresh NOT_STARTED execution and one NOT_STARTED day-end awaiting reconciliation.
 */

const at = (d: Date, h: number, m: number) => new Date(d.getTime() + (h * 60 + m) * 60000);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

async function actorCtx(ctx: SeedContext, userKey: string): Promise<RequestContext> {
  const userId = ctx.get(userKey);
  const m = await ctx.prisma.organisationMembership.findFirstOrThrow({ where: { userId }, include: { user: true, role: true, organisation: true } });
  return {
    userId,
    email: m.user.email,
    name: m.user.name,
    orgId: m.organisationId,
    orgType: m.organisation.type,
    orgName: m.organisation.name,
    roleKey: m.role.key,
    roleName: m.role.name,
    permissions: m.role.permissions,
  };
}

async function internalFigures(ctx: SeedContext, portfolioId: string, day: Date) {
  const holdings = await ctx.prisma.holding.findMany({ where: { portfolioId }, include: { security: { select: { ticker: true, assetClass: true } } } });
  const cash = sum(holdings.filter((h) => h.security.assetClass === 'CASH').map((h) => h.marketValue));
  const invested = holdings.filter((h) => h.security.assetClass !== 'CASH');
  const trades = await ctx.prisma.investmentTransaction.count({ where: { portfolioId, type: 'TRADE', status: 'COMPLETED', tradeDate: day } });
  return { cash, holdings: sum(invested.map((h) => h.marketValue)), invested, trades };
}

export async function seedCustodian(ctx: SeedContext): Promise<void> {
  const { prisma } = ctx;
  const D2 = ctx.businessDaysAgo(2);
  const D1 = ctx.businessDaysAgo(1);

  // ── custodian accounts (custodian A: Horizon mandates, custodian B: Cedar) ──────────────────────
  const accountDefs = [
    { key: 'bgf', org: 'custodianA', number: 'BGF-001', name: 'Horizon Balanced Growth: segregated custody' },
    { key: 'arf', org: 'custodianA', number: 'ARF-001', name: 'Horizon Absolute Return: segregated custody' },
    { key: 'inc', org: 'custodianA', number: 'INC-001', name: 'Horizon Income Mandate: segregated custody' },
    { key: 'cedar1', org: 'custodianB', number: 'CED-001', name: 'Cedar Assurance Income: segregated custody' },
  ] as const;
  const acct: Record<string, { id: string; org: string; number: string; portfolioId: string }> = {};
  for (const a of accountDefs) {
    const portfolioId = ctx.get(`portfolio.${a.key}`);
    const row = await prisma.custodianAccount.create({
      data: { custodianOrgId: ctx.get(`org.${a.org}`), accountNumber: a.number, name: a.name, portfolioId, currency: 'USD', status: 'ACTIVE' },
    });
    ctx.set(`custacct.${a.key}`, row.id);
    acct[a.key] = { id: row.id, org: a.org, number: a.number, portfolioId };
  }
  ctx.log('4 custodian accounts (3 at Zambezi Custody, 1 at Limpopo Trust) linked to portfolios');

  const userA = await prisma.user.findUniqueOrThrow({ where: { id: ctx.get('user.custodianA') } });
  const userB = await prisma.user.findUniqueOrThrow({ where: { id: ctx.get('user.custodianB') } });
  const submitter = (org: string) => (org === 'custodianA' ? userA : userB);

  const seedAudit = (a: { org: string; entityType: string; entityId: string; action: string; after?: unknown; before?: unknown; createdAt: Date; metadata?: Record<string, unknown> }) => {
    const u = submitter(a.org);
    return prisma.auditEvent.create({
      data: {
        actorId: u.id,
        actorEmail: u.email,
        actorRole: 'CUSTODIAN_USER',
        orgId: ctx.get(`org.${a.org}`),
        entityType: a.entityType,
        entityId: a.entityId,
        action: a.action,
        before: a.before === undefined ? undefined : (JSON.parse(JSON.stringify(a.before)) as Prisma.InputJsonValue),
        after: a.after === undefined ? undefined : (JSON.parse(JSON.stringify(a.after)) as Prisma.InputJsonValue),
        metadata: { actorName: u.name, seeded: true, ...(a.metadata ?? {}) } as Prisma.InputJsonValue,
        createdAt: a.createdAt,
      },
    });
  };

  // ── executions ───────────────────────────────────────────────────────────────────────────────────
  interface ExecSeed {
    acct: keyof typeof acct;
    tradeReference: string;
    ticker: string;
    side: Side;
    qty: string;
    price: string;
    executedAt: Date;
    settlementDate: Date;
    broker: string;
    note?: string;
    version?: number;
    isCurrent?: boolean;
    supersedesId?: string;
    correctionReason?: string;
    createdAt?: Date;
  }
  const createExec = async (e: ExecSeed) => {
    const a = acct[e.acct]!;
    const u = submitter(a.org);
    const sec = await prisma.security.findUnique({ where: { ticker: e.ticker }, select: { id: true } });
    const createdAt = e.createdAt ?? new Date(e.executedAt.getTime() + 25 * 60000);
    const row = await prisma.custodianExecution.create({
      data: {
        ref: await ctx.refs.execution(),
        custodianAccountId: a.id,
        tradeReference: e.tradeReference,
        version: e.version ?? 1,
        isCurrent: e.isCurrent ?? true,
        supersedesId: e.supersedesId ?? null,
        correctionReason: e.correctionReason ?? null,
        executedAt: e.executedAt,
        ticker: e.ticker,
        securityId: sec?.id ?? null,
        side: e.side,
        quantity: new Prisma.Decimal(e.qty),
        price: new Prisma.Decimal(e.price),
        currency: 'USD',
        settlementDate: e.settlementDate,
        broker: e.broker,
        note: e.note ?? null,
        reconStatus: 'NOT_STARTED',
        rawPayload: {
          tradeReference: e.tradeReference,
          executedAt: e.executedAt.toISOString(),
          custodianAccountId: a.id,
          ticker: e.ticker,
          side: e.side,
          quantity: Number(e.qty),
          price: Number(e.price),
          currency: 'USD',
          settlementDate: toISODate(e.settlementDate),
          broker: e.broker,
          note: e.note ?? null,
          correctionReason: e.correctionReason ?? null,
          source: 'CUSTODIAN_PORTAL',
          submittedAt: createdAt.toISOString(),
        } as Prisma.InputJsonValue,
        submittedById: u.id,
        submittedByName: u.name,
        createdAt,
      },
    });
    await seedAudit({
      org: a.org,
      entityType: 'CustodianExecution',
      entityId: row.id,
      action: e.supersedesId ? 'CUSTODIAN_EXECUTION_CORRECTED' : 'CUSTODIAN_EXECUTION_SUBMITTED',
      after: { ref: row.ref, tradeReference: e.tradeReference, version: row.version, quantity: e.qty, price: e.price },
      createdAt,
      metadata: e.supersedesId ? { supersedes: 'previous version', correctionReason: e.correctionReason } : undefined,
    });
    ctx.set(`custexec.${e.tradeReference}${e.version && e.version > 1 ? `.v${e.version}` : ''}`, row.id);
    return row;
  };

  const brokerImara = 'Imara Edwards Securities';
  await createExec({ acct: 'bgf', tradeReference: 'TRD-DEMO-201', ticker: 'DLTA.ZW', side: 'BUY', qty: '10000', price: '0.184', executedAt: at(D2, 9, 42), settlementDate: addDays(D2, 2), broker: brokerImara, note: 'Executed on the ZSE electronic order book.' });
  await createExec({ acct: 'bgf', tradeReference: 'TRD-DEMO-202', ticker: 'INN.ZW', side: 'SELL', qty: '4500', price: '0.412', executedAt: at(D2, 11, 15), settlementDate: addDays(D2, 2), broker: 'First Equity Securities', note: 'Partial fill reported by the broker.' });
  // custodian-only trade with a correction chain (v1 superseded by v2: the original is retained)
  const v1 = await createExec({ acct: 'bgf', tradeReference: 'TRD-DEMO-299', ticker: 'OMU.ZW', side: 'BUY', qty: '9000', price: '0.268', executedAt: at(D2, 14, 5), settlementDate: addDays(D2, 2), broker: 'Standard Bank Stockbrokers', isCurrent: false });
  await createExec({
    acct: 'bgf',
    tradeReference: 'TRD-DEMO-299',
    ticker: 'OMU.ZW',
    side: 'BUY',
    qty: '8000',
    price: '0.268',
    executedAt: at(D2, 14, 5),
    settlementDate: addDays(D2, 2),
    broker: 'Standard Bank Stockbrokers',
    version: 2,
    supersedesId: v1.id,
    correctionReason: 'Quantity keyed incorrectly; corrected to the broker contract note (8,000).',
    createdAt: at(D2, 16, 40),
  });
  ctx.log('executions: TRD-DEMO-201 (will match), 202 (qty difference), 299 (custodian only, with a corrected version)');

  // ── day-end packages for the business date D2 ────────────────────────────────────────────────────
  const csvFor = (number: string, day: Date, cash: Prisma.Decimal, hold: Prisma.Decimal, trades: number, invested: Array<{ security: { ticker: string }; quantity: Prisma.Decimal; currentPrice: Prisma.Decimal; marketValue: Prisma.Decimal }>) =>
    [
      'account,statement_date,currency,closing_cash,holdings_market_value,trade_count',
      `${number},${toISODate(day)},USD,${money(cash).toFixed(2)},${money(hold).toFixed(2)},${trades}`,
      '',
      'ticker,quantity,price,market_value',
      ...invested.map((h) => `${h.security.ticker},${h.quantity.toDecimalPlaces(2).toFixed()},${h.currentPrice.toDecimalPlaces(6).toFixed()},${money(h.marketValue).toFixed(2)}`),
      '',
    ].join('\n');

  const createDayEnd = async (opts: { acct: keyof typeof acct; day: Date; cash: Prisma.Decimal; hold: Prisma.Decimal; trades: number; note: string; format: 'csv' | 'pdf'; invested: Parameters<typeof csvFor>[5]; createdAt: Date }) => {
    const a = acct[opts.acct]!;
    const u = submitter(a.org);
    const baseName = `${a.number}-daybook-${toISODate(opts.day)}`;
    let buffer: Buffer;
    let originalname: string;
    let mimetype: string;
    if (opts.format === 'pdf') {
      buffer = await buildPdf({
        title: 'Custodian day-end statement',
        subtitle: `${a.number} · ${toISODate(opts.day)}`,
        reference: `${baseName}`,
        meta: [
          ['Account', a.number],
          ['Statement date', toISODate(opts.day)],
          ['Closing cash (USD)', money(opts.cash).toFixed(2)],
          ['Holdings market value (USD)', money(opts.hold).toFixed(2)],
          ['Trades in day-end book', String(opts.trades)],
        ],
        pages: [
          {
            heading: 'Holdings at close',
            blocks: [
              { type: 'p', text: 'Official day-end book prepared by the custodian. Synthetic demonstration data.' },
              { type: 'table', head: ['Security', 'Quantity', 'Price', 'Market value'], rows: opts.invested.map((h) => [h.security.ticker, h.quantity.toDecimalPlaces(0).toFixed(), h.currentPrice.toDecimalPlaces(4).toFixed(), money(h.marketValue).toFixed(2)]), widths: [2, 1.4, 1.2, 1.6] },
            ],
          },
        ],
      });
      originalname = `${baseName}.pdf`;
      mimetype = 'application/pdf';
    } else {
      buffer = Buffer.from(csvFor(a.number, opts.day, opts.cash, opts.hold, opts.trades, opts.invested), 'utf8');
      originalname = `${baseName}.csv`;
      mimetype = 'text/csv';
    }
    const doc = await ctx.docs.create(
      { buffer, originalname, mimetype, size: buffer.length },
      { title: `Day-end file ${a.number} ${toISODate(opts.day)}`, category: 'DAY_END_FILE', audience: 'CUSTODIAN', ownerOrgId: ctx.get(`org.${a.org}`), portfolioId: a.portfolioId, reportDate: opts.day },
      { name: u.name },
    );
    const sha = createHash('sha256').update(buffer).digest('hex');
    const row = await prisma.custodianDayEndSubmission.create({
      data: {
        ref: await ctx.refs.dayEnd(),
        custodianAccountId: a.id,
        statementDate: opts.day,
        version: 1,
        isCurrent: true,
        closingCash: money(opts.cash),
        currency: 'USD',
        holdingsMarketValue: money(opts.hold),
        tradeCount: opts.trades,
        documentId: doc.id,
        fileName: originalname,
        fileSha256: sha,
        controlNote: opts.note,
        reconStatus: 'NOT_STARTED',
        rawPayload: {
          statementDate: toISODate(opts.day),
          custodianAccountId: a.id,
          accountNumber: a.number,
          closingCash: money(opts.cash).toNumber(),
          currency: 'USD',
          holdingsMarketValue: money(opts.hold).toNumber(),
          tradeCount: opts.trades,
          controlNote: opts.note,
          fileName: originalname,
          fileSha256: sha,
          source: 'CUSTODIAN_PORTAL',
          submittedAt: opts.createdAt.toISOString(),
        } as Prisma.InputJsonValue,
        submittedById: u.id,
        submittedByName: u.name,
        createdAt: opts.createdAt,
      },
    });
    await seedAudit({ org: a.org, entityType: 'CustodianDayEnd', entityId: row.id, action: 'CUSTODIAN_DAY_END_SUBMITTED', after: { ref: row.ref, statementDate: toISODate(opts.day), fileName: originalname, fileSha256: sha }, createdAt: opts.createdAt });
    ctx.set(`custdayend.${a.number}.${toISODate(opts.day)}`, row.id);
    return row;
  };

  for (const key of ['bgf', 'arf', 'inc', 'cedar1'] as const) {
    const a = acct[key]!;
    const f = await internalFigures(ctx, a.portfolioId, D2);
    // BGF: holdings market value 0.40% above the internal book (outside the 0.10% tolerance) → HOLDINGS_VALUE_DIFFERENCE
    const hold = key === 'bgf' ? f.holdings.mul('1.004') : f.holdings;
    await createDayEnd({
      acct: key,
      day: D2,
      cash: f.cash,
      hold,
      trades: f.trades,
      note: key === 'bgf' ? 'Official day-end balances approved for reconciliation. Prices as at 17:00 close.' : 'Official day-end balances approved for reconciliation.',
      format: key === 'bgf' ? 'pdf' : 'csv',
      invested: f.invested,
      createdAt: at(addDays(D2, 1), 6, 30),
    });
  }
  ctx.log('day-end packages for 4 accounts (BGF-001 carries a holdings-value difference)');

  // ── run the real matching engine for D2, then resolve one exception ─────────────────────────────────
  const ops = await actorCtx(ctx, 'user.ops');
  const engine = ctx.app.get(ReconciliationEngine, { strict: false });
  const recon = ctx.app.get(ReconciliationService, { strict: false });
  const result = await engine.run(ops, toISODate(D2));
  ctx.set('recon.batch', result.batch.id);

  const toResolve = await prisma.reconciliationException.findFirst({
    where: { type: 'HOLDINGS_VALUE_DIFFERENCE', status: 'OPEN', item: { dayEnd: { custodianAccount: { accountNumber: 'BGF-001' } } } },
  });
  if (toResolve) {
    await recon.resolveException(
      ops,
      toResolve.id,
      'Custodian valued two positions at the 17:00 close while the internal book uses the prior close. Timing difference only; no action required on either record.',
    );
  }
  ctx.log(`reconciliation batch ${result.batch.ref}: ${result.matched} matched, ${result.differences} difference, ${result.unmatched} unmatched, ${result.internalOrphans} internal-only; 1 exception resolved`);

  // ── fresh records awaiting reconciliation (NOT_STARTED) ────────────────────────────────────────────
  const late = await prisma.investmentTransaction.findFirst({ where: { tradeReference: 'TRD-SEED-1006', portfolioId: acct.bgf!.portfolioId }, include: { security: { select: { ticker: true } } } });
  const now = new Date();
  if (late && late.security && late.side) {
    await createExec({
      acct: 'bgf',
      tradeReference: late.tradeReference!,
      ticker: late.security.ticker,
      side: late.side,
      qty: late.quantity.toFixed(),
      price: late.price.toFixed(),
      executedAt: at(late.tradeDate, 10, 30),
      settlementDate: late.settlementDate ?? addDays(late.tradeDate, 2),
      broker: late.broker ?? brokerImara,
      note: 'Late submission: execution confirmed by the broker after the day-end cut-off.',
      createdAt: now,
    });
  } else {
    await createExec({ acct: 'arf', tradeReference: 'TRD-DEMO-250', ticker: 'OMU.ZW', side: 'BUY', qty: '2000', price: '0.31', executedAt: at(D1, 10, 10), settlementDate: addDays(D1, 2), broker: brokerImara, createdAt: now });
  }

  const f1 = await internalFigures(ctx, acct.bgf!.portfolioId, D1);
  await createDayEnd({
    acct: 'bgf',
    day: D1,
    cash: f1.cash.add('4250'),
    hold: f1.holdings,
    trades: f1.trades,
    note: 'Official day-end balances approved for reconciliation.',
    format: 'csv',
    invested: f1.invested,
    createdAt: now,
  });

  await prisma.notification.create({
    data: {
      organisationId: ctx.get('org.am'),
      type: 'CUSTODIAN_SUBMISSION',
      title: 'Custodian submission received',
      body: 'Zambezi Custody Services submitted a day-end package and a late execution that are awaiting reconciliation.',
      link: '/internal/operations/reconciliation',
    },
  });
  ctx.log('1 execution + 1 day-end package left NOT_STARTED (awaiting reconciliation)');
}
