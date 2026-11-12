import { DOCUMENT_SLOTS, formatDate, formatMoney, PORTFOLIO_TYPE_LABELS, ASSET_CLASS_LABELS, type DocumentCategory } from '@nexus/shared';
import type { Prisma } from '@prisma/client';
import type { RequestContext } from '../common/auth/request-context';
import { D, sum, toISODate } from '../common/decimal';
import { renderStatementHtml, type StatementInput } from '../modules/investor-portal/statement-html';
import { lastQuarterEnd } from './capital';
import { seedEvidenceDocuments } from './applications';
import { buildPdf } from './pdf';
import type { SeedContext } from './seed-context';

const usd = (v: Prisma.Decimal.Value | null | undefined, decimals = 0) => formatMoney(D(v).toNumber(), 'USD', { decimals });
const monthYear = (d: Date) => d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

/** A RequestContext for a seeded staff user so documents/audit rows carry the right actor. */
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

/** Frozen statement HTML built from the seeded database (same renderer the reports module uses). */
async function statementInput(ctx: SeedContext, opts: { investorKey: 'horizon' | 'cedar'; portfolioIds?: string[]; asOf: Date; periodStart: Date; reference: string; title: string; preparedBy: string; includePrivate: boolean }): Promise<StatementInput> {
  const { prisma } = ctx;
  const investor = await prisma.investor.findUniqueOrThrow({ where: { id: ctx.get(`investor.${opts.investorKey}`) } });
  const portfolios = await prisma.portfolio.findMany({
    where: { investorId: investor.id, status: { not: 'CLOSED' }, ...(opts.portfolioIds ? { id: { in: opts.portfolioIds } } : {}) },
    include: { holdings: { where: { status: 'CONFIRMED' }, include: { security: true } }, valuations: { orderBy: { asOf: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  });

  const rows: StatementInput['portfolios'] = [];
  const holdings: StatementInput['holdings'] = [];
  for (const p of portfolios) {
    const closing = p.holdings.length ? sum(p.holdings.map((h) => h.marketValue)) : D(p.valuations[p.valuations.length - 1]?.nav ?? 0);
    const open = [...p.valuations].reverse().find((v) => v.asOf.getTime() < opts.periodStart.getTime());
    const last = p.valuations[p.valuations.length - 1];
    const openNav = open ? D(open.nav) : null;
    rows.push({
      ref: p.ref,
      name: p.name,
      type: PORTFOLIO_TYPE_LABELS[p.type],
      openingValue: openNav?.toNumber(),
      closingValue: closing.toNumber(),
      periodReturnPct: openNav && !openNav.isZero() ? closing.div(openNav).minus(1).mul(100).toDecimalPlaces(2).toNumber() : null,
      benchmarkReturnPct: open?.benchmarkIndex && last?.benchmarkIndex ? D(last.benchmarkIndex).div(open.benchmarkIndex).minus(1).mul(100).toDecimalPlaces(2).toNumber() : null,
    });
    for (const h of [...p.holdings].sort((a, b) => b.marketValue.comparedTo(a.marketValue))) {
      holdings.push({
        portfolio: p.name,
        ticker: h.security.ticker,
        name: h.security.name,
        assetClass: ASSET_CLASS_LABELS[h.security.assetClass],
        quantity: h.quantity.toString(),
        price: h.currentPrice.toString(),
        marketValue: h.marketValue.toString(),
        weightPct: closing.isZero() ? 0 : D(h.marketValue).div(closing).mul(100).toDecimalPlaces(1).toNumber(),
      });
    }
  }

  const txs = await prisma.investmentTransaction.findMany({
    where: { portfolio: { investorId: investor.id, ...(opts.portfolioIds ? { id: { in: opts.portfolioIds } } : {}) }, status: 'COMPLETED', tradeDate: { gte: opts.periodStart, lte: opts.asOf } },
    include: { portfolio: { select: { name: true } }, security: { select: { ticker: true } } },
    orderBy: { tradeDate: 'desc' },
    take: 30,
  });
  const activity: StatementInput['activity'] = txs.map((t) => ({
    date: toISODate(t.tradeDate),
    portfolio: t.portfolio.name,
    description: t.type === 'TRADE' ? `${t.side === 'SELL' ? 'Sale' : 'Purchase'} of ${t.security?.ticker ?? 'security'}: ${t.quantity.toString()} @ ${t.price.toString()}` : (t.notes ?? t.type),
    amount: t.amount.toString(),
  }));

  let privateCapital: StatementInput['privateCapital'];
  let privateNav = D(0);
  if (opts.includePrivate) {
    const commitments = await prisma.commitment.findMany({ where: { investorId: investor.id }, include: { fund: true }, orderBy: { createdAt: 'asc' } });
    privateCapital = commitments.map((c) => ({
      fund: c.fund.name,
      commitment: c.amount.toString(),
      called: c.calledAmount.toString(),
      unfunded: D(c.amount).minus(c.calledAmount).toString(),
      distributed: c.distributedAmount.toString(),
      nav: c.nav.toString(),
      irr: c.irr?.toString(),
      tvpi: c.tvpi?.toString(),
      dpi: c.dpi?.toString(),
    }));
    privateNav = sum(commitments.map((c) => c.nav));
  }

  const publicTotal = sum(rows.map((r) => D(r.closingValue as number)));
  return {
    reference: opts.reference,
    title: opts.title,
    investor: { name: investor.legalName, ref: investor.ref, registrationNumber: investor.registrationNumber, address: investor.registeredAddress },
    reportingDate: toISODate(opts.asOf),
    periodStart: toISODate(opts.periodStart),
    currency: 'USD',
    generatedAt: new Date(),
    preparedBy: opts.preparedBy,
    portfolios: rows,
    holdings,
    activity,
    privateCapital,
    totalValue: publicTotal.add(privateNav).toNumber(),
    notes: ['Mandate returns are the simplified change in valuation between the opening and closing dates and include the effect of contributions and withdrawals.'],
  };
}

interface PublishArgs {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  title: string;
  category: DocumentCategory;
  investorId: string;
  portfolioId?: string | null;
  fundId?: string | null;
  capitalCallId?: string | null;
  reportDate: Date;
  /** null → leave as a DRAFT (internal) document */
  publishedAt: Date | null;
}

export async function seedDocuments(ctx: SeedContext): Promise<void> {
  const { prisma } = ctx;
  const year = ctx.today.getUTCFullYear();
  const asOf = lastQuarterEnd(ctx.today);
  const quarter = Math.floor(asOf.getUTCMonth() / 3) + 1;
  const quarterLabel = `Q${quarter} ${asOf.getUTCFullYear()}`;
  const periodStart = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - 2, 1));
  const publishQuarterAt = new Date(Math.min(addDays(asOf, 5).getTime(), addDays(ctx.today, -1).getTime()));

  const am = await actorCtx(ctx, 'user.am');
  const complianceId = ctx.get('user.compliance');
  const horizonId = ctx.get('investor.horizon');
  const cedarId = ctx.get('investor.cedar');

  const create = async (a: PublishArgs) => {
    const published = a.publishedAt !== null;
    const doc = await ctx.docs.create(
      { buffer: a.buffer, originalname: a.fileName, mimetype: a.mimeType, size: a.buffer.length },
      {
        title: a.title,
        category: a.category,
        status: published ? 'PUBLISHED' : 'DRAFT',
        audience: published ? 'INVESTOR' : 'INTERNAL',
        investorId: a.investorId,
        portfolioId: a.portfolioId ?? null,
        fundId: a.fundId ?? null,
        capitalCallId: a.capitalCallId ?? null,
        reportDate: a.reportDate,
      },
      { ctx: am },
    );
    if (published) {
      await prisma.document.update({
        where: { id: doc.id },
        data: { approvedById: complianceId, approvedAt: addDays(a.publishedAt!, -0.2), publishedById: complianceId, publishedAt: a.publishedAt, createdAt: addDays(a.publishedAt!, -1) },
      });
    }
    return doc.id;
  };

  // ── Horizon: quarterly statement (frozen HTML built from seeded data) ─────
  if (ctx.has('portfolio.bgf')) {
    const html = renderStatementHtml(
      await statementInput(ctx, { investorKey: 'horizon', asOf, periodStart, reference: `STM-HOR-${toISODate(asOf)}`, title: `Quarterly Investor Statement: ${quarterLabel}`, preparedBy: 'Matanho Investor Services', includePrivate: true }),
    );
    const buf = Buffer.from(html, 'utf8');
    const statementId = await create({ buffer: buf, fileName: `horizon-statement-${toISODate(asOf)}.html`, mimeType: 'text/html', title: `Quarterly Investor Statement ${quarterLabel}`, category: 'STATEMENT', investorId: horizonId, reportDate: asOf, publishedAt: publishQuarterAt });
    ctx.set('document.horizon-statement', statementId);

    // DRAFT statement for the maker–checker demo (created by user.am; Compliance approves, then publishes)
    const draftAsOf = ctx.businessDaysAgo(1);
    const draftHtml = renderStatementHtml(
      await statementInput(ctx, { investorKey: 'horizon', portfolioIds: [ctx.get('portfolio.bgf')], asOf: draftAsOf, periodStart: new Date(Date.UTC(draftAsOf.getUTCFullYear(), draftAsOf.getUTCMonth(), 1)), reference: `STM-BGF-${toISODate(draftAsOf)}`, title: 'Investor Statement: Balanced Growth', preparedBy: am.name, includePrivate: false }),
    );
    const draftBuf = Buffer.from(draftHtml, 'utf8');
    const draftId = await create({ buffer: draftBuf, fileName: `balanced-growth-statement-${toISODate(draftAsOf)}.html`, mimeType: 'text/html', title: `Investor Statement: Balanced Growth (${formatDate(draftAsOf)})`, category: 'STATEMENT', investorId: horizonId, portfolioId: ctx.get('portfolio.bgf'), reportDate: draftAsOf, publishedAt: null });
    ctx.set('document.bgf-draft-statement', draftId);
  } else {
    ctx.log('portfolio.bgf not registered: skipping HTML statements (run the portfolios seed first)');
  }

  // ── Horizon: private capital account statement (PDF) ─────────────────────
  const commitments = await prisma.commitment.findMany({ where: { investorId: horizonId }, include: { fund: true, events: { orderBy: { issueDate: 'desc' } } }, orderBy: { createdAt: 'asc' } });
  const events = commitments.flatMap((c) => c.events.map((e) => ({ ...e, fundName: c.fund.name }))).sort((a, b) => b.issueDate.getTime() - a.issueDate.getTime());
  const capitalAcct = await buildPdf({
    title: `Private Capital Account Statement`,
    subtitle: `Horizon Pension Fund · ${quarterLabel}`,
    reference: `CAP-ACCT-${toISODate(asOf)}`,
    meta: [['Investor', 'Horizon Pension Fund'], ['Account date', formatDate(asOf)], ['Currency', 'USD'], ['Source', 'Fund administrator (synthetic)']],
    pages: [
      {
        heading: 'Capital account summary',
        blocks: [
          { type: 'p', text: 'This statement summarises commitments, drawdowns, distributions and net asset value for the investor across active private funds. Amounts are in US dollars at the account date.' },
          { type: 'table', head: ['Fund', 'Commitment', 'Called', 'Unfunded', 'Distributed', 'NAV'], widths: [2.2, 1.2, 1.2, 1.2, 1.2, 1.2], rows: commitments.map((c) => [c.fund.name, usd(c.amount), usd(c.calledAmount), usd(D(c.amount).minus(c.calledAmount)), usd(c.distributedAmount), usd(c.nav)]) },
          { type: 'table', head: ['Fund', 'Net IRR', 'TVPI', 'DPI'], rows: commitments.map((c) => [c.fund.name, `${c.irr ?? '-'}%`, `${c.tvpi ?? '-'}x`, `${c.dpi ?? '-'}x`]) },
          { type: 'p', text: 'IRR, TVPI and DPI are administrator-reported and are not recalculated by the portal.' },
        ],
      },
      {
        heading: 'Capital activity',
        blocks: [
          { type: 'table', head: ['Date', 'Fund', 'Activity', 'Reference', 'Amount', 'Status'], widths: [1.1, 2, 1.2, 1.4, 1.2, 1], rows: events.map((e) => [formatDate(e.issueDate), e.fundName, e.kind === 'CALL' ? 'Capital call' : 'Distribution', e.ref, usd(e.amount), e.status === 'ISSUED' ? 'Awaiting funding' : e.status === 'PAID' ? 'Paid' : 'Funded']) },
          { type: 'p', text: 'An open capital call is not included in called capital until the administrator records receipt of funds. Acknowledging a notice in the portal confirms receipt of the notice only.' },
        ],
      },
      { heading: 'Notes', blocks: [{ type: 'p', text: 'This document is an authenticated investor copy of a synthetic demonstration statement. It must not be relied on for any financial decision.' }] },
    ],
  });
  const capAcctId = await create({ buffer: capitalAcct, fileName: `private-capital-account-${toISODate(asOf)}.pdf`, mimeType: 'application/pdf', title: `Private Capital Account Statement ${quarterLabel}`, category: 'STATEMENT', investorId: horizonId, reportDate: asOf, publishedAt: publishQuarterAt });

  // ── capital call notice CC-<year>-03 (PDF) ───────────────────────────────
  const cc03 = await prisma.capitalCall.findUniqueOrThrow({ where: { id: ctx.get('capitalcall.cc03') }, include: { commitment: { include: { fund: true } } } });
  const callNotice = await buildPdf({
    title: `Capital Call Notice ${cc03.ref}`,
    subtitle: `${cc03.commitment.fund.name} · Horizon Pension Fund`,
    reference: cc03.ref,
    meta: [['Investor', 'Horizon Pension Fund'], ['Fund', cc03.commitment.fund.name], ['Issued', formatDate(cc03.issueDate)], ['Due', formatDate(cc03.dueDate)], ['Amount due', usd(cc03.amount)]],
    pages: [
      {
        heading: 'Capital call notice',
        blocks: [
          { type: 'p', text: `Pursuant to the fund documents, the manager calls ${usd(cc03.amount)} of your commitment to ${cc03.commitment.fund.name}. Payment is due on ${formatDate(cc03.dueDate)}.` },
          { type: 'h', text: 'Capital account summary' },
          {
            type: 'table',
            head: ['Item', 'Amount'],
            widths: [3, 1.4],
            rows: [
              ['Total commitment', usd(cc03.commitment.amount)],
              ['Called capital before this notice', usd(cc03.commitment.calledAmount)],
              ['Current drawdown', usd(cc03.amount)],
              ['Remaining unfunded commitment after this call', usd(D(cc03.commitment.amount).minus(cc03.commitment.calledAmount).minus(cc03.amount))],
            ],
          },
          { type: 'h', text: 'Funding instructions' },
          { type: 'kv', rows: [['Beneficiary', cc03.commitment.fund.name], ['Bank', 'CBZ Bank Limited'], ['Account', '•••• 3917'], ['Reference', `Horizon Pension Fund / ${cc03.ref}`]] },
        ],
      },
      { heading: 'Important information', blocks: [{ type: 'p', text: 'Acknowledging this notice in the investor portal confirms that you have received it. It is not evidence of payment and does not change your called capital. Called capital is updated by the fund administrator when funds are received.' }, { type: 'p', text: 'Late payment may attract interest and other remedies under the limited partnership agreement.' }] },
    ],
  });
  const ccDocId = await create({ buffer: callNotice, fileName: `${cc03.ref}-notice.pdf`, mimeType: 'application/pdf', title: `Capital Call Notice ${cc03.ref}`, category: 'CAPITAL_CALL', investorId: horizonId, fundId: cc03.commitment.fundId, capitalCallId: cc03.id, reportDate: cc03.issueDate, publishedAt: addDays(cc03.issueDate, 0) });
  ctx.set('document.cc03-notice', ccDocId);

  // ── distribution notice (PDF) ────────────────────────────────────────────
  const dist02 = await prisma.capitalCall.findUniqueOrThrow({ where: { id: ctx.get('capitalcall.dist02') }, include: { commitment: { include: { fund: true } } } });
  const distNotice = await buildPdf({
    title: `Distribution Notice: ${monthYear(dist02.issueDate)}`,
    subtitle: `${dist02.commitment.fund.name} · Horizon Pension Fund`,
    reference: dist02.ref,
    meta: [['Investor', 'Horizon Pension Fund'], ['Fund', dist02.commitment.fund.name], ['Value date', formatDate(dist02.dueDate ?? dist02.issueDate)], ['Distribution', usd(dist02.amount)]],
    pages: [
      {
        heading: 'Distribution notice',
        blocks: [
          { type: 'p', text: `The fund has distributed ${usd(dist02.amount)} to Horizon Pension Fund, value date ${formatDate(dist02.dueDate ?? dist02.issueDate)}, from realised proceeds of portfolio investments.` },
          { type: 'table', head: ['Item', 'Amount'], widths: [3, 1.4], rows: [['Total commitment', usd(dist02.commitment.amount)], ['Distributions to date', usd(dist02.commitment.distributedAmount)], ['This distribution', usd(dist02.amount)]] },
          { type: 'kv', rows: [['Paid to', 'CBZ Bank · •••• 0482'], ['Reference', dist02.ref]] },
        ],
      },
      { heading: 'Notes', blocks: [{ type: 'p', text: 'Distributions are shown gross of any withholding tax. Tax treatment depends on the investor and should be confirmed with a tax adviser.' }] },
    ],
  });
  const distDocId = await create({ buffer: distNotice, fileName: `${dist02.ref}-notice.pdf`, mimeType: 'application/pdf', title: `Distribution Notice: ${monthYear(dist02.issueDate)}`, category: 'CAPITAL_CALL', investorId: horizonId, fundId: dist02.commitment.fundId, capitalCallId: dist02.id, reportDate: dist02.issueDate, publishedAt: dist02.issueDate });

  // ── Growth Fund I quarterly investor report (multi-page PDF) ─────────────
  const mgfi = commitments.find((c) => c.fund.ref === 'MGFI')!;
  const report = await buildPdf({
    title: `${mgfi.fund.name}: ${quarterLabel} Investor Report`,
    subtitle: 'Quarterly report to limited partners',
    reference: `RPT-MGFI-${toISODate(asOf)}`,
    meta: [['Fund', mgfi.fund.name], ['Reporting date', formatDate(asOf)], ['Currency', 'USD'], ['Status', 'Final (synthetic demo)']],
    pages: [
      { heading: 'Executive summary', blocks: [{ type: 'p', text: 'The fund continued to deploy capital selectively while prioritising operating performance, governance and liquidity. Portfolio valuations are based on the approved quarter-end valuation process.' }, { type: 'p', text: 'Two follow-on investments were completed in the quarter and one partial realisation returned capital to investors. Management remains focused on payments, agri-processing and logistics businesses with defensible unit economics.' }, { type: 'kv', rows: [['Net IRR', `${mgfi.irr}%`], ['TVPI', `${mgfi.tvpi}x`], ['DPI', `${mgfi.dpi}x`], ['Investor NAV', usd(mgfi.nav)]] }] },
      { heading: 'Fund performance', blocks: [{ type: 'table', head: ['Metric', 'Current', 'Prior quarter'], rows: [['Net IRR', `${mgfi.irr}%`, '17.6%'], ['TVPI', `${mgfi.tvpi}x`, '1.34x'], ['DPI', `${mgfi.dpi}x`, '0.24x'], ['Called to date', usd(mgfi.calledAmount), usd(D(mgfi.calledAmount).minus(300000))], ['Unfunded commitment', usd(D(mgfi.amount).minus(mgfi.calledAmount)), usd(D(mgfi.amount).minus(mgfi.calledAmount).add(300000))]] }, { type: 'p', text: 'Performance is reported net of management fees and fund expenses and is administrator-reported. It is not recalculated in the investor portal.' }] },
      { heading: 'Portfolio commentary', blocks: [{ type: 'h', text: 'Africa Payments Holdings' }, { type: 'p', text: 'Transaction volumes grew steadily and the business reported improved gross margin following the renegotiation of acquiring fees. Working capital is adequate and covenants were met.' }, { type: 'h', text: 'Lakeside Agri Holdings' }, { type: 'p', text: 'Harvest yields were in line with plan. Cold-chain capacity expansion is on schedule and funded from existing facilities.' }, { type: 'h', text: 'Other holdings' }, { type: 'p', text: 'Detailed company-level reporting is available in the accompanying quarterly pack.' }] },
      { heading: 'Portfolio schedule', blocks: [{ type: 'table', head: ['Company', 'Sector', 'Cost', 'Fair value', 'Multiple'], widths: [2.4, 1.6, 1.2, 1.2, 1], rows: [['Africa Payments Holdings', 'Payments', usd(4200000), usd(6100000), '1.45x'], ['Lakeside Agri Holdings', 'Agribusiness', usd(3100000), usd(3500000), '1.13x'], ['Highveld Logistics (Pty)', 'Logistics', usd(2600000), usd(3300000), '1.27x'], ['Total', '', usd(9900000), usd(12900000), '1.30x']] }, { type: 'p', text: 'Figures are fund-level, synthetic and rounded.' }] },
      { heading: 'Capital account', blocks: [{ type: 'table', head: ['Item', 'Amount'], widths: [3, 1.4], rows: [['Commitment', usd(mgfi.amount)], ['Called capital', usd(mgfi.calledAmount)], ['Distributions to date', usd(mgfi.distributedAmount)], ['Investor NAV', usd(mgfi.nav)]] }, { type: 'p', text: `A capital call of ${usd(cc03.amount)} (${cc03.ref}) was issued on ${formatDate(cc03.issueDate)} and is due on ${formatDate(cc03.dueDate)}.` }] },
      { heading: 'Outlook and disclosures', blocks: [{ type: 'p', text: 'The manager expects to complete one further investment before year end and to begin exit planning for the earliest vintage holdings.' }, { type: 'p', text: 'This report is a synthetic demonstration document produced for the Matanho Nexus MVP. It is not an offer or a recommendation and must not be relied upon.' }] },
    ],
  });
  const reportId = await create({ buffer: report, fileName: `mgfi-investor-report-${toISODate(asOf)}.pdf`, mimeType: 'application/pdf', title: `${mgfi.fund.name}: ${quarterLabel} Investor Report`, category: 'INVESTOR_REPORT', investorId: horizonId, fundId: mgfi.fundId, reportDate: asOf, publishedAt: new Date(Math.min(addDays(asOf, 20).getTime(), addDays(ctx.today, -2).getTime())) });

  // ── audited financials for the prior financial year (multi-page PDF) ─────
  const fy = year - 1;
  const fyEnd = new Date(Date.UTC(fy, 11, 31));
  const auditedPublished = new Date(Math.min(Date.UTC(year, 2, 29), addDays(ctx.today, -1).getTime()));
  const afs = await buildPdf({
    title: `Audited Fund Financial Statements FY${fy}`,
    subtitle: `${mgfi.fund.name} · year ended ${formatDate(fyEnd)}`,
    reference: `AFS-MGFI-FY${fy}`,
    meta: [['Fund', mgfi.fund.name], ['Year end', formatDate(fyEnd)], ['Auditor', 'Independent audit firm (synthetic)'], ['Opinion', 'Unmodified (synthetic)']],
    pages: [
      { heading: "Independent auditor's report", blocks: [{ type: 'p', text: 'We have audited the financial statements of the fund, which comprise the statement of net assets, the statement of operations and the statement of changes in net assets for the year then ended.' }, { type: 'p', text: 'In our opinion, the financial statements present fairly, in all material respects, the financial position of the fund in accordance with the basis of preparation described in note 1.' }, { type: 'p', text: 'These statements are an investor portal copy of the signed audited financial statements. The signed document remains the governing record.' }] },
      { heading: 'Statement of net assets', blocks: [{ type: 'table', head: ['Item', 'Amount'], widths: [3, 1.4], rows: [['Investments at fair value', usd(62400000)], ['Cash and receivables', usd(4100000)], ['Liabilities', usd(-2850000)], ['Net assets attributable to investors', usd(63650000)]] }] },
      { heading: 'Statement of operations', blocks: [{ type: 'table', head: ['Item', 'Amount'], widths: [3, 1.4], rows: [['Investment income', usd(1900000)], ['Net realised gains', usd(2400000)], ['Net change in unrealised gains', usd(5100000)], ['Management fees and expenses', usd(-1650000)], ['Net increase in net assets from operations', usd(7750000)]] }] },
      { heading: 'Statement of changes in net assets', blocks: [{ type: 'table', head: ['Item', 'Amount'], widths: [3, 1.4], rows: [['Net assets at start of year', usd(52800000)], ['Capital contributions', usd(4200000)], ['Distributions', usd(-1100000)], ['Net increase from operations', usd(7750000)], ['Net assets at end of year', usd(63650000)]] }] },
      { heading: 'Notes: basis of preparation', blocks: [{ type: 'p', text: 'Note 1. The financial statements are prepared on the fair value basis for investments. Valuations follow the fund valuation policy and are approved quarterly by the valuation committee.' }, { type: 'p', text: 'Note 2. Capital commitments, called capital and distributions are recorded by the administrator on a cash basis from the date funds are received or paid.' }] },
      { heading: 'Schedule of investments', blocks: [{ type: 'table', head: ['Company', 'Cost', 'Fair value'], rows: [['Africa Payments Holdings', usd(4200000), usd(5800000)], ['Lakeside Agri Holdings', usd(3100000), usd(3300000)], ['Highveld Logistics (Pty)', usd(2600000), usd(3100000)]] }] },
      { heading: 'Related parties and commitments', blocks: [{ type: 'p', text: 'Fees paid to the manager are disclosed in the statement of operations. There are no other material related-party balances.' }, { type: 'p', text: 'Unfunded commitments of limited partners at year end are available from the administrator on request.' }] },
      { heading: 'Subsequent events', blocks: [{ type: 'p', text: 'No events occurred after the reporting date that require adjustment of, or disclosure in, these financial statements. This is a synthetic demonstration document.' }] },
    ],
  });
  const afsId = await create({ buffer: afs, fileName: `mgfi-audited-financials-fy${fy}.pdf`, mimeType: 'application/pdf', title: `Audited Fund Financial Statements FY${fy}`, category: 'AUDITED_FINANCIALS', investorId: horizonId, fundId: mgfi.fundId, reportDate: fyEnd, publishedAt: auditedPublished });

  // link notices to the capital events so the portal's capital table opens real files
  const link = (key: string, documentId: string) => prisma.capitalCall.update({ where: { id: ctx.get(`capitalcall.${key}`) }, data: { noticeDocumentId: documentId } });
  await link('cc03', ccDocId);
  await link('dist02', distDocId);
  await link('cc01', capAcctId);
  await link('cc02', capAcctId);
  await link('dist01', reportId);
  void afsId;

  // ── Cedar: one published statement ───────────────────────────────────────
  if (ctx.has('portfolio.cedar1')) {
    const cedarHtml = renderStatementHtml(
      await statementInput(ctx, { investorKey: 'cedar', asOf, periodStart, reference: `STM-CED-${toISODate(asOf)}`, title: `Quarterly Investor Statement: ${quarterLabel}`, preparedBy: 'Matanho Investor Services', includePrivate: false }),
    );
    const buf = Buffer.from(cedarHtml, 'utf8');
    await create({ buffer: buf, fileName: `cedar-statement-${toISODate(asOf)}.html`, mimeType: 'text/html', title: `Quarterly Investor Statement ${quarterLabel}`, category: 'STATEMENT', investorId: cedarId, portfolioId: ctx.get('portfolio.cedar1'), reportDate: asOf, publishedAt: publishQuarterAt });
  }

  // ── internal evidence for the two approved investors ─────────────────────
  const required = DOCUMENT_SLOTS.filter((s) => s.required);
  for (const key of ['horizon', 'cedar'] as const) {
    const inv = await prisma.investor.findUniqueOrThrow({ where: { id: ctx.get(`investor.${key}`) }, include: { application: true } });
    await seedEvidenceDocuments(ctx, { applicationId: ctx.get(`application.${key}`), investorId: inv.id, holder: inv.legalName, applicationRef: inv.application?.reference ?? 'APP', slots: required, status: 'APPROVED', actorName: 'Applicant' });
  }

  // ── a couple of portal notifications so the bell is not empty ────────────
  await prisma.notification.createMany({
    data: [
      { organisationId: ctx.get('org.horizon'), type: 'CAPITAL_CALL_ISSUED', title: `Capital call ${cc03.ref} issued`, body: `${usd(cc03.amount)} is due on ${formatDate(cc03.dueDate)}. Review the notice and acknowledge receipt.`, link: `/portal/capital`, entityType: 'CapitalCall', entityId: cc03.id, createdAt: cc03.issueDate },
      { organisationId: ctx.get('org.horizon'), type: 'DOCUMENT_PUBLISHED', title: `New document available: ${quarterLabel} investor statement`, body: 'Your quarterly statement has been published to the portal.', link: `/portal/documents?doc=${ctx.has('document.horizon-statement') ? ctx.get('document.horizon-statement') : ccDocId}`, entityType: 'Document', entityId: ctx.has('document.horizon-statement') ? ctx.get('document.horizon-statement') : ccDocId, createdAt: publishQuarterAt },
    ],
  });

  ctx.log('Horizon: statement, capital account, CC notice, distribution notice, MGFI report, audited financials (all PUBLISHED); BGF draft statement (maker–checker); Cedar statement; evidence packs for both approved investors');
}
