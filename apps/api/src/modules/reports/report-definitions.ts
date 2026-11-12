import type { Prisma } from '@prisma/client';
import {
  APPLICATION_STATUS_LABELS,
  ASSET_CLASS_LABELS,
  COMPANY_SUBMISSION_LABELS,
  INVESTOR_TYPE_LABELS,
  KYC_STATUS_LABELS,
  PORTFOLIO_TYPE_LABELS,
  RECON_STATUS_LABELS,
  titleCase,
} from '@nexus/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { D, sum } from '../../common/decimal';

export type ColumnType = 'text' | 'money' | 'number' | 'percent' | 'date' | 'datetime';

export interface ReportColumn {
  key: string;
  label: string;
  type?: ColumnType;
}
export interface ReportResult {
  type: string;
  title: string;
  description: string;
  generatedAt: string;
  columns: ReportColumn[];
  rows: Array<Record<string, string | number | null>>;
  totals?: Record<string, string | number | null>;
  params: Record<string, string | undefined>;
}

export type ReportParams = { portfolioId?: string; investorId?: string; status?: string; from?: string; to?: string };

export interface ReportDefinition {
  type: string;
  title: string;
  description: string;
  group: 'investor' | 'portfolio';
  params?: Array<'portfolioId' | 'investorId' | 'status' | 'from' | 'to'>;
  build(prisma: PrismaService, p: ReportParams): Promise<Omit<ReportResult, 'type' | 'title' | 'description' | 'generatedAt' | 'params'>>;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const dec = (v: Prisma.Decimal | null | undefined) => (v === null || v === undefined ? null : v.toString());
const range = (p: ReportParams, field: string) => (p.from || p.to ? { [field]: { ...(p.from ? { gte: new Date(p.from) } : {}), ...(p.to ? { lte: new Date(`${p.to}T23:59:59.999Z`) } : {}) } } : {});

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    type: 'investor-register',
    title: 'Investor register',
    description: 'All investors with KYC status, portfolio count, total portfolio value and relationship manager.',
    group: 'investor',
    params: ['status'],
    async build(prisma, p) {
      const investors = await prisma.investor.findMany({
        where: p.status ? { status: p.status as never } : {},
        include: { relationshipManager: { select: { name: true } }, portfolios: { select: { holdings: { select: { marketValue: true } } } } },
        orderBy: { ref: 'asc' },
      });
      const rows = investors.map((i) => ({
        ref: i.ref,
        name: i.legalName,
        type: INVESTOR_TYPE_LABELS[i.investorType],
        country: i.country,
        email: i.email,
        kyc: KYC_STATUS_LABELS[i.kycStatus],
        portfolios: i.portfolios.length,
        value: dec(sum(i.portfolios.flatMap((pf) => pf.holdings.map((h) => h.marketValue)))),
        manager: i.relationshipManager?.name ?? null,
        status: titleCase(i.status),
      }));
      return {
        columns: [
          { key: 'ref', label: 'Reference' },
          { key: 'name', label: 'Investor' },
          { key: 'type', label: 'Type' },
          { key: 'country', label: 'Country' },
          { key: 'email', label: 'Email' },
          { key: 'kyc', label: 'KYC status' },
          { key: 'portfolios', label: 'Portfolios', type: 'number' },
          { key: 'value', label: 'Portfolio value (USD)', type: 'money' },
          { key: 'manager', label: 'Relationship manager' },
          { key: 'status', label: 'Status' },
        ],
        rows,
        totals: { name: 'Total', portfolios: rows.reduce((a, r) => a + r.portfolios, 0), value: dec(sum(rows.map((r) => r.value))) },
      };
    },
  },
  {
    type: 'onboarding-status',
    title: 'Onboarding status',
    description: 'Every investor application with its status, submission date, risk flags and decision.',
    group: 'investor',
    params: ['status', 'from', 'to'],
    async build(prisma, p) {
      const apps = await prisma.investorApplication.findMany({
        where: { ...(p.status ? { status: p.status as never } : {}), ...range(p, 'createdAt') },
        orderBy: { createdAt: 'desc' },
      });
      return {
        columns: [
          { key: 'reference', label: 'Reference' },
          { key: 'name', label: 'Applicant' },
          { key: 'type', label: 'Investor type' },
          { key: 'country', label: 'Country' },
          { key: 'status', label: 'Status' },
          { key: 'submittedAt', label: 'Submitted', type: 'datetime' },
          { key: 'flags', label: 'Risk flags', type: 'number' },
          { key: 'decidedAt', label: 'Decision date', type: 'datetime' },
          { key: 'lastSavedAt', label: 'Last activity', type: 'datetime' },
        ],
        rows: apps.map((a) => ({
          reference: a.reference,
          name: a.legalName ?? '(unnamed draft)',
          type: a.investorType ? INVESTOR_TYPE_LABELS[a.investorType] : null,
          country: a.country,
          status: APPLICATION_STATUS_LABELS[a.status],
          submittedAt: iso(a.submittedAt),
          flags: a.riskFlags.length,
          decidedAt: iso(a.decidedAt),
          lastSavedAt: iso(a.lastSavedAt),
        })),
      };
    },
  },
  {
    type: 'custodian-submissions',
    title: 'Custodian submissions',
    description: 'Executions and day-end packages submitted by custodians with their reconciliation status.',
    group: 'portfolio',
    params: ['from', 'to'],
    async build(prisma, p) {
      const [ex, de] = await Promise.all([
        prisma.custodianExecution.findMany({ where: { isCurrent: true, ...range(p, 'createdAt') }, include: { custodianAccount: { include: { custodianOrg: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' } }),
        prisma.custodianDayEndSubmission.findMany({ where: { isCurrent: true, ...range(p, 'createdAt') }, include: { custodianAccount: { include: { custodianOrg: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' } }),
      ]);
      const rows = [
        ...ex.map((e) => ({ ref: e.ref, type: 'Execution', custodian: e.custodianAccount.custodianOrg.name, account: e.custodianAccount.accountNumber, detail: `${e.side} ${e.quantity.toString()} ${e.ticker} @ ${e.price.toString()} ${e.currency} (${e.tradeReference})`, date: day(e.executedAt), version: e.version, submittedBy: e.submittedByName, recon: RECON_STATUS_LABELS[e.reconStatus], created: iso(e.createdAt) })),
        ...de.map((d) => ({ ref: d.ref, type: 'Day-end', custodian: d.custodianAccount.custodianOrg.name, account: d.custodianAccount.accountNumber, detail: `Cash ${d.closingCash.toString()} ${d.currency} · holdings ${d.holdingsMarketValue.toString()} · ${d.tradeCount} trades`, date: day(d.statementDate), version: d.version, submittedBy: d.submittedByName, recon: RECON_STATUS_LABELS[d.reconStatus], created: iso(d.createdAt) })),
      ].sort((a, b) => String(b.created).localeCompare(String(a.created)));
      return {
        columns: [
          { key: 'ref', label: 'Reference' },
          { key: 'type', label: 'Type' },
          { key: 'custodian', label: 'Custodian' },
          { key: 'account', label: 'Account' },
          { key: 'detail', label: 'Details' },
          { key: 'date', label: 'Trade / statement date', type: 'date' },
          { key: 'version', label: 'Version', type: 'number' },
          { key: 'submittedBy', label: 'Submitted by' },
          { key: 'recon', label: 'Reconciliation' },
          { key: 'created', label: 'Submitted at', type: 'datetime' },
        ],
        rows,
      };
    },
  },
  {
    type: 'reconciliation-exceptions',
    title: 'Reconciliation exceptions',
    description: 'All reconciliation exceptions with expected vs actual values and resolution details.',
    group: 'portfolio',
    params: ['status', 'from', 'to'],
    async build(prisma, p) {
      const ex = await prisma.reconciliationException.findMany({
        where: { ...(p.status ? { status: p.status as never } : {}), ...range(p, 'createdAt') },
        include: { item: { select: { tradeReference: true, ticker: true, kind: true, batch: { select: { ref: true, businessDate: true } } } } },
        orderBy: { createdAt: 'desc' },
      });
      return {
        columns: [
          { key: 'batch', label: 'Batch' },
          { key: 'businessDate', label: 'Business date', type: 'date' },
          { key: 'tradeReference', label: 'Trade reference' },
          { key: 'type', label: 'Exception' },
          { key: 'description', label: 'Description' },
          { key: 'expected', label: 'Internal / expected' },
          { key: 'actual', label: 'Custodian / actual' },
          { key: 'status', label: 'Status' },
          { key: 'resolvedBy', label: 'Resolved by' },
          { key: 'resolvedAt', label: 'Resolved at', type: 'datetime' },
          { key: 'note', label: 'Resolution note' },
        ],
        rows: ex.map((e) => ({
          batch: e.item.batch.ref,
          businessDate: day(e.item.batch.businessDate),
          tradeReference: e.item.tradeReference,
          type: titleCase(e.type),
          description: e.description,
          expected: e.expected,
          actual: e.actual,
          status: titleCase(e.status),
          resolvedBy: e.resolvedByName,
          resolvedAt: iso(e.resolvedAt),
          note: e.resolutionNote,
        })),
      };
    },
  },
  {
    type: 'company-reporting-status',
    title: 'Portfolio company reporting status',
    description: 'Reporting periods per portfolio company with completion, submission status and open questions.',
    group: 'portfolio',
    params: ['status'],
    async build(prisma, p) {
      const periods = await prisma.reportingPeriod.findMany({
        include: { company: { select: { name: true } }, submission: { include: { questions: { select: { status: true } } } } },
        orderBy: [{ dueDate: 'desc' }],
      });
      const rows = periods
        .map((r) => ({
          company: r.company.name,
          period: r.label,
          dueDate: day(r.dueDate),
          status: r.submission ? COMPANY_SUBMISSION_LABELS[r.submission.status] : 'Not started',
          statusKey: r.submission?.status ?? 'NOT_STARTED',
          completion: r.submission?.completionPct ?? 0,
          submittedAt: iso(r.submission?.submittedAt),
          openQuestions: r.submission?.questions.filter((q) => q.status === 'OPEN').length ?? 0,
        }))
        .filter((r) => !p.status || r.statusKey === p.status);
      return {
        columns: [
          { key: 'company', label: 'Company' },
          { key: 'period', label: 'Period' },
          { key: 'dueDate', label: 'Due', type: 'date' },
          { key: 'status', label: 'Status' },
          { key: 'completion', label: 'Completion', type: 'percent' },
          { key: 'submittedAt', label: 'Submitted', type: 'datetime' },
          { key: 'openQuestions', label: 'Open questions', type: 'number' },
        ],
        rows: rows.map(({ statusKey: _k, ...rest }) => rest),
      };
    },
  },
  {
    type: 'portfolio-summary',
    title: 'Portfolio summary',
    description: 'Every managed portfolio with investor, manager, benchmark and current value.',
    group: 'portfolio',
    params: ['investorId', 'status'],
    async build(prisma, p) {
      const pfs = await prisma.portfolio.findMany({
        where: { ...(p.investorId ? { investorId: p.investorId } : {}), ...(p.status ? { status: p.status as never } : {}) },
        include: { investor: { select: { legalName: true } }, manager: { select: { name: true } }, holdings: { select: { marketValue: true } } },
        orderBy: { ref: 'asc' },
      });
      const rows = pfs.map((x) => ({
        ref: x.ref,
        name: x.name,
        investor: x.investor.legalName,
        type: PORTFOLIO_TYPE_LABELS[x.type],
        currency: x.baseCurrency,
        manager: x.manager?.name ?? null,
        benchmark: x.benchmark,
        inception: day(x.inceptionDate),
        holdings: x.holdings.length,
        value: dec(sum(x.holdings.map((h) => h.marketValue))),
        status: titleCase(x.status),
      }));
      return {
        columns: [
          { key: 'ref', label: 'Reference' },
          { key: 'name', label: 'Portfolio' },
          { key: 'investor', label: 'Investor' },
          { key: 'type', label: 'Type' },
          { key: 'currency', label: 'Currency' },
          { key: 'manager', label: 'Manager' },
          { key: 'benchmark', label: 'Benchmark' },
          { key: 'inception', label: 'Inception', type: 'date' },
          { key: 'holdings', label: 'Holdings', type: 'number' },
          { key: 'value', label: 'Current value', type: 'money' },
          { key: 'status', label: 'Status' },
        ],
        rows,
        totals: { name: 'Total', holdings: rows.reduce((a, r) => a + r.holdings, 0), value: dec(sum(rows.map((r) => r.value))) },
      };
    },
  },
  {
    type: 'portfolio-holdings',
    title: 'Portfolio holdings',
    description: 'Holdings with quantity, cost, price, market value, allocation and valuation date (simplified MVP valuation).',
    group: 'portfolio',
    params: ['portfolioId', 'investorId'],
    async build(prisma, p) {
      const holdings = await prisma.holding.findMany({
        where: { ...(p.portfolioId ? { portfolioId: p.portfolioId } : {}), ...(p.investorId ? { portfolio: { investorId: p.investorId } } : {}) },
        include: { security: true, portfolio: { select: { id: true, ref: true, name: true } } },
        orderBy: [{ portfolio: { ref: 'asc' } }, { marketValue: 'desc' }],
      });
      const totals = new Map<string, ReturnType<typeof D>>();
      for (const h of holdings) totals.set(h.portfolioId, (totals.get(h.portfolioId) ?? D(0)).add(h.marketValue));
      const rows = holdings.map((h) => {
        const t = totals.get(h.portfolioId) ?? D(0);
        return {
          portfolio: h.portfolio.ref,
          security: h.security.name,
          ticker: h.security.ticker,
          assetClass: ASSET_CLASS_LABELS[h.security.assetClass],
          quantity: dec(h.quantity),
          averageCost: dec(h.averageCost),
          price: dec(h.currentPrice),
          currency: h.currency,
          marketValue: dec(h.marketValue),
          weight: t.isZero() ? null : h.marketValue.div(t).mul(100).toDecimalPlaces(2).toString(),
          valuationDate: day(h.valuationDate),
          status: titleCase(h.status),
        };
      });
      return {
        columns: [
          { key: 'portfolio', label: 'Portfolio' },
          { key: 'security', label: 'Security' },
          { key: 'ticker', label: 'Ticker' },
          { key: 'assetClass', label: 'Asset class' },
          { key: 'quantity', label: 'Quantity', type: 'number' },
          { key: 'averageCost', label: 'Avg cost', type: 'number' },
          { key: 'price', label: 'Price', type: 'number' },
          { key: 'currency', label: 'Ccy' },
          { key: 'marketValue', label: 'Market value', type: 'money' },
          { key: 'weight', label: 'Weight', type: 'percent' },
          { key: 'valuationDate', label: 'Valuation date', type: 'date' },
          { key: 'status', label: 'Status' },
        ],
        rows,
        totals: { security: 'Total market value', marketValue: dec(sum(rows.map((r) => r.marketValue))) },
      };
    },
  },
];

export const REPORT_BY_TYPE = new Map(REPORT_DEFINITIONS.map((d) => [d.type, d]));
