import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { COMPANY_SUBMISSION_STATUSES, P, formatDate, titleCase, type CompanySubmissionStatus } from '@nexus/shared';
import { isStaff, type RequestContext } from '../../common/auth/request-context';
import { D, money, sum, todayUtc, toISODate } from '../../common/decimal';
import { PrismaService } from '../../common/prisma/prisma.service';
import { aggregateSeries, buildAllocation, buildSeries } from '../portfolios/valuation';

type Priority = 'high' | 'medium' | 'low';
export type TaskKind = 'APPLICATION' | 'KYC_REVIEW' | 'RECON_EXCEPTION' | 'CUSTODIAN_SUBMISSION' | 'COMPANY_PACK' | 'CAPITAL_CALL';

export interface DashboardTask {
  id: string;
  kind: TaskKind;
  priority: Priority;
  title: string;
  detail: string;
  href: string;
  at: Date | null;
  dueInDays: number | null;
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
const KIND_LABEL: Record<TaskKind, string> = {
  APPLICATION: 'Applications to review',
  KYC_REVIEW: 'KYC reviews',
  RECON_EXCEPTION: 'Reconciliation exceptions',
  CUSTODIAN_SUBMISSION: 'Custodian submissions to reconcile',
  COMPANY_PACK: 'Company packs to review',
  CAPITAL_CALL: 'Capital calls due',
};
const KIND_HREF: Record<TaskKind, string> = {
  APPLICATION: '/internal/onboarding',
  KYC_REVIEW: '/internal/investors?kycStatus=IN_REVIEW',
  RECON_EXCEPTION: '/internal/operations/reconciliation',
  CUSTODIAN_SUBMISSION: '/internal/operations/custodian',
  COMPANY_PACK: '/internal/companies/submissions',
  CAPITAL_CALL: '/internal/investors',
};

const daysBetween = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86400000);

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  // ── sidebar badges ────────────────────────────────────────────────────────
  async navCounts() {
    const [applications, executions, dayEnds, exceptions, reporting] = await Promise.all([
      this.prisma.investorApplication.count({ where: { status: { in: ['SUBMITTED', 'RESUBMITTED', 'UNDER_REVIEW'] } } }),
      this.prisma.custodianExecution.count({ where: { isCurrent: true, reconStatus: 'NOT_STARTED' } }),
      this.prisma.custodianDayEndSubmission.count({ where: { isCurrent: true, reconStatus: 'NOT_STARTED' } }),
      this.prisma.reconciliationException.count({ where: { status: 'OPEN' } }),
      this.prisma.companyReportingSubmission.count({ where: { status: { in: ['SUBMITTED', 'RESUBMITTED'] } } }),
    ]);
    return { applications, submissions: executions + dayEnds, exceptions, reporting };
  }

  // ── command-centre overview ───────────────────────────────────────────────
  async overview() {
    const today = todayUtc();
    const in14 = new Date(today.getTime() + 14 * 86400000);
    const in30 = new Date(today.getTime() + 30 * 86400000);
    const kycPending: Prisma.InvestorWhereInput = {
      status: 'ACTIVE',
      OR: [{ kycStatus: { in: ['PENDING', 'IN_REVIEW', 'EXPIRED'] } }, { kycNextReviewAt: { lte: in30 } }],
    };
    const callsOpen: Prisma.CapitalCallWhereInput = { kind: 'CALL', status: { in: ['ISSUED', 'OVERDUE'] } };
    const pendingApps: Prisma.InvestorApplicationWhereInput = { status: { in: ['SUBMITTED', 'RESUBMITTED', 'UNDER_REVIEW'] } };

    const [
      holdingsAgg,
      fundNavAgg,
      activeInvestors,
      activePortfolios,
      pendingApplications,
      pendingKycReviews,
      pendingExecutions,
      pendingDayEnds,
      openExceptions,
      callsAgg,
      subsByStatus,
      valuations,
      allocationHoldings,
      commitments,
      recentTxns,
      appTasks,
      kycTasks,
      excTasks,
      execTasks,
      dayEndTasks,
      packTasks,
      callTasks,
      recentApps,
      recentExecs,
      recentDayEnds,
      recentSubs,
    ] = await Promise.all([
      this.prisma.holding.aggregate({ where: { portfolio: { status: { not: 'CLOSED' } } }, _sum: { marketValue: true } }),
      this.prisma.commitment.aggregate({ _sum: { nav: true } }),
      this.prisma.investor.count({ where: { status: 'ACTIVE' } }),
      this.prisma.portfolio.count({ where: { status: 'ACTIVE' } }),
      this.prisma.investorApplication.count({ where: pendingApps }),
      this.prisma.investor.count({ where: kycPending }),
      this.prisma.custodianExecution.count({ where: { isCurrent: true, reconStatus: 'NOT_STARTED' } }),
      this.prisma.custodianDayEndSubmission.count({ where: { isCurrent: true, reconStatus: 'NOT_STARTED' } }),
      this.prisma.reconciliationException.count({ where: { status: 'OPEN' } }),
      this.prisma.capitalCall.aggregate({ where: callsOpen, _count: { _all: true }, _sum: { amount: true } }),
      this.prisma.companyReportingSubmission.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.portfolioValuation.findMany({ where: { portfolio: { status: { not: 'CLOSED' } } }, orderBy: { asOf: 'asc' }, select: { portfolioId: true, asOf: true, nav: true, benchmarkIndex: true } }),
      this.prisma.holding.findMany({ where: { portfolio: { status: { not: 'CLOSED' } } }, select: { marketValue: true, security: { select: { assetClass: true } } } }),
      this.prisma.commitment.findMany({ select: { nav: true, fund: { select: { type: true } } } }),
      this.prisma.investmentTransaction.findMany({
        orderBy: [{ tradeDate: 'desc' }, { createdAt: 'desc' }],
        take: 8,
        include: { portfolio: { select: { id: true, ref: true, name: true } }, security: { select: { ticker: true, name: true } } },
      }),
      this.prisma.investorApplication.findMany({ where: pendingApps, orderBy: { submittedAt: 'asc' }, take: 6, select: { id: true, reference: true, legalName: true, status: true, submittedAt: true } }),
      this.prisma.investor.findMany({ where: kycPending, orderBy: { kycNextReviewAt: 'asc' }, take: 4, select: { id: true, ref: true, legalName: true, kycStatus: true, kycNextReviewAt: true } }),
      this.prisma.reconciliationException.findMany({
        where: { status: 'OPEN' },
        orderBy: { createdAt: 'asc' },
        take: 5,
        select: { id: true, type: true, description: true, createdAt: true, item: { select: { tradeReference: true, ticker: true } } },
      }),
      this.prisma.custodianExecution.findMany({
        where: { isCurrent: true, reconStatus: 'NOT_STARTED' },
        orderBy: { createdAt: 'asc' },
        take: 4,
        select: { id: true, tradeReference: true, ticker: true, createdAt: true, custodianAccount: { select: { accountNumber: true } } },
      }),
      this.prisma.custodianDayEndSubmission.findMany({
        where: { isCurrent: true, reconStatus: 'NOT_STARTED' },
        orderBy: { createdAt: 'asc' },
        take: 3,
        select: { id: true, statementDate: true, createdAt: true, custodianAccount: { select: { accountNumber: true } } },
      }),
      this.prisma.companyReportingSubmission.findMany({
        where: { status: { in: ['SUBMITTED', 'RESUBMITTED'] } },
        orderBy: { submittedAt: 'asc' },
        take: 4,
        select: { id: true, ref: true, status: true, submittedAt: true, company: { select: { name: true } }, period: { select: { label: true } } },
      }),
      this.prisma.capitalCall.findMany({
        where: { ...callsOpen, dueDate: { lte: in14 } },
        orderBy: { dueDate: 'asc' },
        take: 4,
        select: { id: true, ref: true, amount: true, dueDate: true, commitment: { select: { investorId: true, investor: { select: { legalName: true } }, fund: { select: { name: true } } } } },
      }),
      this.prisma.investorApplication.findMany({
        where: { status: { not: 'DRAFT' } },
        orderBy: [{ submittedAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
        take: 5,
        select: { id: true, reference: true, legalName: true, investorType: true, country: true, status: true, submittedAt: true },
      }),
      this.prisma.custodianExecution.findMany({
        where: { isCurrent: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, ref: true, tradeReference: true, ticker: true, side: true, quantity: true, reconStatus: true, createdAt: true, custodianAccount: { select: { accountNumber: true, custodianOrg: { select: { name: true } } } } },
      }),
      this.prisma.custodianDayEndSubmission.findMany({
        where: { isCurrent: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, ref: true, statementDate: true, tradeCount: true, reconStatus: true, createdAt: true, custodianAccount: { select: { accountNumber: true, custodianOrg: { select: { name: true } } } } },
      }),
      this.prisma.companyReportingSubmission.findMany({
        where: { submittedAt: { not: null } },
        orderBy: { submittedAt: 'desc' },
        take: 5,
        select: { id: true, ref: true, status: true, completionPct: true, submittedAt: true, company: { select: { id: true, name: true } }, period: { select: { label: true } } },
      }),
    ]);

    // ── metrics ─────────────────────────────────────────────────────────────
    const totalPortfolioValue = D(holdingsAgg._sum.marketValue);
    const fundNav = D(fundNavAgg._sum.nav);
    const byStatus = Object.fromEntries(COMPANY_SUBMISSION_STATUSES.map((s) => [s, 0])) as Record<CompanySubmissionStatus, number>;
    for (const r of subsByStatus) byStatus[r.status as CompanySubmissionStatus] = r._count._all;
    const pendingCustodianSubmissions = pendingExecutions + pendingDayEnds;

    // ── performance (summed across portfolios; the UI slices by period) ─────
    const grouped = new Map<string, typeof valuations>();
    for (const v of valuations) grouped.set(v.portfolioId, [...(grouped.get(v.portfolioId) ?? []), v]);
    const series = aggregateSeries(Array.from(grouped.values()).map((rows) => buildSeries(rows)));

    // ── allocation (fund NAV counts as private equity / private credit) ─────
    const allocation = buildAllocation([
      ...allocationHoldings.map((h) => ({ assetClass: h.security.assetClass, value: h.marketValue })),
      ...commitments.filter((c) => D(c.nav).gt(0)).map((c) => ({ assetClass: c.fund.type, value: c.nav })),
    ]);

    // ── work queue ──────────────────────────────────────────────────────────
    const tasks: DashboardTask[] = [];
    for (const a of appTasks) {
      const age = a.submittedAt ? daysBetween(today, a.submittedAt) : 0;
      tasks.push({
        id: `app-${a.id}`,
        kind: 'APPLICATION',
        priority: a.status === 'UNDER_REVIEW' ? 'low' : age >= 3 ? 'high' : 'medium',
        title: a.status === 'UNDER_REVIEW' ? `Complete review: ${a.legalName ?? a.reference}` : `Review application: ${a.legalName ?? a.reference}`,
        detail: `${a.reference} · ${titleCase(a.status)}${a.submittedAt ? ` · submitted ${formatDate(a.submittedAt)}` : ''}`,
        href: `/internal/onboarding/${a.id}`,
        at: a.submittedAt,
        dueInDays: null,
      });
    }
    for (const k of kycTasks) {
      const due = k.kycNextReviewAt ? daysBetween(k.kycNextReviewAt, today) : null;
      tasks.push({
        id: `kyc-${k.id}`,
        kind: 'KYC_REVIEW',
        priority: k.kycStatus === 'EXPIRED' || (due !== null && due < 0) ? 'high' : 'medium',
        title: `KYC review: ${k.legalName}`,
        detail: `${k.ref} · ${titleCase(k.kycStatus)}${k.kycNextReviewAt ? ` · next review ${formatDate(k.kycNextReviewAt)}` : ''}`,
        href: `/internal/investors/${k.id}`,
        at: k.kycNextReviewAt,
        dueInDays: due,
      });
    }
    for (const e of excTasks) {
      tasks.push({
        id: `exc-${e.id}`,
        kind: 'RECON_EXCEPTION',
        priority: 'high',
        title: `Resolve exception: ${titleCase(e.type)}`,
        detail: [e.item.tradeReference, e.item.ticker].filter(Boolean).join(' · ') || e.description,
        href: KIND_HREF.RECON_EXCEPTION,
        at: e.createdAt,
        dueInDays: null,
      });
    }
    for (const x of execTasks) {
      tasks.push({
        id: `exec-${x.id}`,
        kind: 'CUSTODIAN_SUBMISSION',
        priority: 'medium',
        title: `Reconcile execution ${x.tradeReference}`,
        detail: `${x.custodianAccount.accountNumber} · ${x.ticker}`,
        href: KIND_HREF.CUSTODIAN_SUBMISSION,
        at: x.createdAt,
        dueInDays: null,
      });
    }
    for (const d of dayEndTasks) {
      tasks.push({
        id: `de-${d.id}`,
        kind: 'CUSTODIAN_SUBMISSION',
        priority: 'medium',
        title: `Reconcile day-end ${formatDate(d.statementDate)}`,
        detail: `${d.custodianAccount.accountNumber} · day-end submission`,
        href: KIND_HREF.CUSTODIAN_SUBMISSION,
        at: d.createdAt,
        dueInDays: null,
      });
    }
    for (const p of packTasks) {
      tasks.push({
        id: `pack-${p.id}`,
        kind: 'COMPANY_PACK',
        priority: 'medium',
        title: `Review reporting pack: ${p.company.name}`,
        detail: `${p.ref} · ${p.period.label} · ${titleCase(p.status)}`,
        href: KIND_HREF.COMPANY_PACK,
        at: p.submittedAt,
        dueInDays: null,
      });
    }
    for (const c of callTasks) {
      const due = c.dueDate ? daysBetween(c.dueDate, today) : null;
      tasks.push({
        id: `call-${c.id}`,
        kind: 'CAPITAL_CALL',
        priority: due !== null && due <= 3 ? 'high' : 'medium',
        title: `Capital call ${c.ref}: ${c.commitment.investor.legalName}`,
        detail: `${c.commitment.fund.name} · US$ ${money(c.amount).toFixed(0)} · ${due === null ? 'no due date' : due < 0 ? `${Math.abs(due)}d overdue` : due === 0 ? 'due today' : `due in ${due}d`}`,
        href: `/internal/investors/${c.commitment.investorId}`,
        at: c.dueDate,
        dueInDays: due,
      });
    }
    tasks.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0));

    const callsDueCount = await this.prisma.capitalCall.count({ where: { ...callsOpen, dueDate: { lte: in14 } } });
    const queueCounts: Array<{ kind: TaskKind; label: string; count: number; href: string }> = [
      { kind: 'APPLICATION', label: KIND_LABEL.APPLICATION, count: pendingApplications, href: KIND_HREF.APPLICATION },
      { kind: 'KYC_REVIEW', label: KIND_LABEL.KYC_REVIEW, count: pendingKycReviews, href: KIND_HREF.KYC_REVIEW },
      { kind: 'RECON_EXCEPTION', label: KIND_LABEL.RECON_EXCEPTION, count: openExceptions, href: KIND_HREF.RECON_EXCEPTION },
      { kind: 'CUSTODIAN_SUBMISSION', label: KIND_LABEL.CUSTODIAN_SUBMISSION, count: pendingCustodianSubmissions, href: KIND_HREF.CUSTODIAN_SUBMISSION },
      { kind: 'COMPANY_PACK', label: KIND_LABEL.COMPANY_PACK, count: byStatus.SUBMITTED + byStatus.RESUBMITTED, href: KIND_HREF.COMPANY_PACK },
      { kind: 'CAPITAL_CALL', label: KIND_LABEL.CAPITAL_CALL, count: callsDueCount, href: KIND_HREF.CAPITAL_CALL },
    ];

    return {
      asOf: toISODate(today),
      currency: 'USD',
      metrics: {
        aum: totalPortfolioValue.add(fundNav).toFixed(2),
        totalPortfolioValue: totalPortfolioValue.toFixed(2),
        fundNav: fundNav.toFixed(2),
        activeInvestors,
        activePortfolios,
        pendingApplications,
        pendingKycReviews,
        pendingCustodianSubmissions,
        openReconExceptions: openExceptions,
        upcomingCapitalCalls: { count: callsAgg._count._all, total: D(callsAgg._sum.amount).toFixed(2) },
        companyReporting: { byStatus, total: sum(Object.values(byStatus)).toNumber(), awaitingReview: byStatus.SUBMITTED + byStatus.RESUBMITTED },
      },
      /** Chart series: plain numbers, summed across portfolios. The UI slices by period with sliceForPeriod. */
      performance: series,
      allocation,
      recentActivity: recentTxns.map((t) => ({
        id: t.id,
        ref: t.ref,
        tradeReference: t.tradeReference,
        type: t.type,
        side: t.side,
        security: t.security,
        portfolio: t.portfolio,
        quantity: t.quantity.toString(),
        price: t.price.toString(),
        amount: t.amount.toFixed(2),
        currency: t.currency,
        tradeDate: t.tradeDate,
        status: t.status,
      })),
      queue: { counts: queueCounts, tasks: tasks.slice(0, 12), total: queueCounts.reduce((a, c) => a + c.count, 0) },
      recentApplications: recentApps,
      recentCustodianSubmissions: [
        ...recentExecs.map((e) => ({
          id: e.id,
          ref: e.ref,
          kind: 'EXECUTION' as const,
          account: e.custodianAccount.accountNumber,
          custodian: e.custodianAccount.custodianOrg.name,
          summary: `${e.side} ${e.quantity.toString()} ${e.ticker} · ${e.tradeReference}`,
          reconStatus: e.reconStatus,
          createdAt: e.createdAt,
        })),
        ...recentDayEnds.map((d) => ({
          id: d.id,
          ref: d.ref,
          kind: 'DAY_END' as const,
          account: d.custodianAccount.accountNumber,
          custodian: d.custodianAccount.custodianOrg.name,
          summary: `Day-end ${formatDate(d.statementDate)} · ${d.tradeCount} trades`,
          reconStatus: d.reconStatus,
          createdAt: d.createdAt,
        })),
      ]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 5),
      recentCompanySubmissions: recentSubs.map((s) => ({
        id: s.id,
        ref: s.ref,
        company: s.company,
        period: s.period.label,
        status: s.status,
        completionPct: s.completionPct,
        submittedAt: s.submittedAt,
      })),
    };
  }

  // ── global search (staff) ─────────────────────────────────────────────────
  async search(ctx: RequestContext, raw: string | undefined) {
    if (!isStaff(ctx)) throw new ForbiddenException('Search is available to internal staff only');
    const q = (raw ?? '').trim();
    const empty = { investors: [], portfolios: [], applications: [], companies: [], documents: [] };
    if (q.length < 2) return empty;
    const has = (p: string) => ctx.permissions.includes(p);
    const c = { contains: q, mode: 'insensitive' as const };

    const [investors, portfolios, applications, companies, documents] = await Promise.all([
      has(P.INVESTORS_READ)
        ? this.prisma.investor.findMany({ where: { OR: [{ legalName: c }, { ref: c }, { email: c }] }, take: 5, orderBy: { legalName: 'asc' }, select: { id: true, ref: true, legalName: true } })
        : [],
      has(P.PORTFOLIOS_READ)
        ? this.prisma.portfolio.findMany({ where: { OR: [{ name: c }, { ref: c }] }, take: 5, orderBy: { name: 'asc' }, select: { id: true, ref: true, name: true } })
        : [],
      has(P.ONBOARDING_READ)
        ? this.prisma.investorApplication.findMany({ where: { OR: [{ reference: c }, { legalName: c }, { contactEmail: c }] }, take: 5, orderBy: { updatedAt: 'desc' }, select: { id: true, reference: true, legalName: true } })
        : [],
      has(P.COMPANIES_READ)
        ? this.prisma.portfolioCompany.findMany({ where: { OR: [{ name: c }, { ref: c }] }, take: 5, orderBy: { name: 'asc' }, select: { id: true, name: true } })
        : [],
      has(P.DOCUMENTS_READ)
        ? this.prisma.document.findMany({ where: { OR: [{ title: c }, { ref: c }] }, take: 5, orderBy: { createdAt: 'desc' }, select: { id: true, ref: true, title: true } })
        : [],
    ]);
    return {
      investors: investors.map((i) => ({ id: i.id, ref: i.ref, name: i.legalName })),
      portfolios: portfolios.map((p) => ({ id: p.id, ref: p.ref, name: p.name })),
      applications: applications.map((a) => ({ id: a.id, reference: a.reference, name: a.legalName ?? a.reference })),
      companies,
      documents: documents.map((d) => ({ id: d.id, ref: d.ref, title: d.title })),
    };
  }
}
