'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BriefcaseBusiness, PackageOpen, RefreshCw, SlidersHorizontal } from 'lucide-react';
import {
  COMPANY_SUBMISSION_LABELS,
  COMPANY_SUBMISSION_STATUSES,
  PERFORMANCE_PERIODS,
  SIMPLIFIED_VALUATION_NOTICE,
  formatCompactMoney,
  formatDate,
  formatMoney,
  formatPercent,
  type CompanySubmissionStatus,
  type PerformancePeriod,
} from '@nexus/shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/controls';
import { AllocationDonut, BENCHMARK_COLOR, CHART_COLORS, PerformanceChart, StatusBars, sliceForPeriod } from '@/components/nx/charts';
import { Segmented } from '@/components/nx/filters';
import { ErrorState, KpiStrip, PageHeader, Panel, PanelBody, PanelHeader } from '@/components/nx/layout';
import { NeedsAttention } from './needs-attention';
import { RecentActivity, RecentApplications, RecentCompanySubmissions, RecentCustodianSubmissions } from './recent-tables';
import type { DashboardOverview } from './types';

const PERIOD_LABEL: Record<PerformancePeriod, string> = { '1M': '1-month', '3M': '3-month', '6M': '6-month', YTD: 'Year-to-date', '1Y': '1-year', ALL: 'Since inception' };
const STATUS_COLORS: Record<CompanySubmissionStatus, string> = {
  DRAFT: '#b8c0cc',
  SUBMITTED: '#2457d6',
  QUESTIONS_OPEN: '#c98a1b',
  CORRECTIONS_REQUESTED: '#b84758',
  RESUBMITTED: '#8a6dd8',
  ACCEPTED: '#138a68',
};

function pctChange(points: Array<{ value: number | null | undefined }>): number | null {
  const first = points[0]?.value;
  const last = points[points.length - 1]?.value;
  if (first == null || last == null || first === 0 || points.length < 2) return null;
  return ((last - first) / first) * 100;
}

function PerformanceHero({ data }: { data: DashboardOverview }) {
  const [period, setPeriod] = React.useState<PerformancePeriod>('YTD');
  const sliced = React.useMemo(() => sliceForPeriod(data.performance, period), [data.performance, period]);
  const ret = pctChange(sliced);
  const benchRet = pctChange(sliced.map((p) => ({ value: p.benchmark })));
  const m = data.metrics;
  const hasBenchmark = data.performance.some((p) => p.benchmark != null);

  return (
    <Panel className="flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-4 pt-4">
        <div className="min-w-0">
          <div className="eyebrow">Assets under management</div>
          <div className="num mt-2 text-[34px] font-semibold leading-none tracking-[-0.04em]">{formatMoney(m.aum, data.currency, { decimals: 0 })}</div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
            {ret !== null ? (
              <span>
                <b className={cn('num text-[13px] font-semibold', ret >= 0 ? 'text-success' : 'text-danger')}>{formatPercent(ret, 2, { signed: true })}</b> {PERIOD_LABEL[period].toLowerCase()} return
              </span>
            ) : (
              <span>Return unavailable for this period</span>
            )}
            {ret !== null && benchRet !== null && (
              <span>
                vs benchmark <b className="num font-semibold text-foreground">{formatPercent(benchRet, 2, { signed: true })}</b>
                <span className={cn('num ml-1.5 font-semibold', ret - benchRet >= 0 ? 'text-success' : 'text-danger')}>({formatPercent(ret - benchRet, 2, { signed: true })} excess)</span>
              </span>
            )}
          </div>
        </div>
        <div className="grid gap-0.5 text-right text-[11.5px] text-muted-foreground">
          <span>
            Portfolios <b className="num font-semibold text-foreground">{formatCompactMoney(m.totalPortfolioValue, data.currency)}</b>
          </span>
          <span>
            Private fund NAV <b className="num font-semibold text-foreground">{formatCompactMoney(m.fundNav, data.currency)}</b>
          </span>
          <span className="num">As of {formatDate(data.asOf)}</span>
        </div>
      </div>
      <PanelBody className="mt-3 flex-1">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <i className="inline-block h-[3px] w-5 rounded" style={{ background: CHART_COLORS[0] }} />
              Managed portfolios
            </span>
            {hasBenchmark && (
              <span className="flex items-center gap-1.5">
                <i className="inline-block h-[3px] w-5 rounded" style={{ background: BENCHMARK_COLOR }} />
                Benchmark (rebased)
              </span>
            )}
          </div>
          <Segmented value={period} onChange={setPeriod} options={PERFORMANCE_PERIODS.map((p) => ({ value: p, label: p }))} size="sm" />
        </div>
        <PerformanceChart points={data.performance} currency={data.currency} period={period} controls={false} height={290} showBenchmark={hasBenchmark} />
        <p className="mt-2 text-[10.5px] leading-snug text-ink-3">Series sums the NAV of managed portfolios; private-fund NAV is included in AUM but not in the series. {SIMPLIFIED_VALUATION_NOTICE}</p>
      </PanelBody>
    </Panel>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,1fr)]">
        <Skeleton className="h-[460px] w-full rounded-lg" />
        <Skeleton className="h-[460px] w-full rounded-lg" />
      </div>
      <Skeleton className="h-[130px] w-full rounded-lg" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-[300px] rounded-lg" />
        <Skeleton className="h-[300px] rounded-lg" />
        <Skeleton className="h-[300px] rounded-lg" />
      </div>
    </div>
  );
}

export function DashboardView() {
  const query = useQuery({ queryKey: ['dashboard', 'overview'], queryFn: () => api<DashboardOverview>('/dashboard/overview'), refetchInterval: 60_000 });
  const d = query.data;
  const [scope, setScope] = React.useState('Whole portfolio');
  const scopes = ['Whole portfolio', 'Listed equity', 'Fixed income', 'Private markets', 'Liquidity'];

  return (
    <>
      <PageHeader
        eyebrow="Global investment office · 13 Nov 2026 · 06:06 CAT"
        title="Global Investment Office"
        description="A decision-ready view of portfolio performance, liquidity, risk and operating obligations."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary"><SlidersHorizontal /> Run scenario</Button>
            <Button variant="secondary"><BriefcaseBusiness /> My work</Button>
            <Button variant="primary"><PackageOpen /> Investment pack</Button>
          </div>
        }
      />

      {query.isLoading ? (
        <DashboardSkeleton />
      ) : query.error || !d ? (
        <Panel>
          <ErrorState message={(query.error as Error | null)?.message} onRetry={() => query.refetch()} />
        </Panel>
      ) : (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-surface p-1">
              {scopes.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setScope(item)}
                  className={cn('rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors', scope === item ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:bg-surface-sunken hover:text-foreground')}
                >
                  {item}
                </button>
              ))}
            </div>
            <Button variant="tertiary" size="sm" onClick={() => query.refetch()} loading={query.isFetching && !query.isLoading}>
              <RefreshCw /> Updated just now
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {[
              ['Assets under management', formatCompactMoney(d.metrics.aum, d.currency), '6,842 books · public + private'],
              ['Active return', formatPercent(pctChange(d.performance) ?? 0, 2, { signed: true }), 'vs composite benchmark'],
              ['One-day risk', '2.18%', '99% portfolio VaR'],
              ['Liquidity cover', '1.84×', '30-day stressed floor'],
              ['Private NAV', formatCompactMoney(d.metrics.fundNav, d.currency), 'Calls + distributions'],
              ['Approval queue', String(d.metrics.pendingApplications), 'orders · valuation · KYC'],
            ].map(([label, value, hint]) => (
              <div key={label} className="rounded-lg border border-border bg-surface px-3.5 py-3 shadow-[0_1px_2px_rgba(15,27,45,0.03)]">
                <div className="eyebrow">{label}</div>
                <div className="num mt-2 text-[19px] font-semibold tracking-[-0.03em]">{value}</div>
                <div className="mt-1 truncate text-[10.5px] text-muted-foreground">{hint}</div>
              </div>
            ))}
          </div>
          <div className="grid overflow-hidden rounded-lg border border-border bg-surface lg:grid-cols-4">
            {[
              ['Today at a glance', `${d.queue.total} decisions, liquidity and client obligations`],
              ['Under approvals', `${d.metrics.pendingApplications} items awaiting review`],
              ['New valuation', `${d.metrics.companyReporting.awaitingReview} reporting packs to inspect`],
              ['Client activation', `${d.metrics.activeInvestors} active investor relationships`],
            ].map(([label, value], index) => (
              <div key={label} className={cn('px-4 py-3', index > 0 && 'border-t border-border-soft lg:border-l lg:border-t-0')}>
                <div className="eyebrow">{label}</div>
                <div className="mt-1 text-[12px] font-semibold">{value}</div>
              </div>
            ))}
          </div>
          <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,1fr)]">
            <PerformanceHero data={d} />
            <NeedsAttention queue={d.queue} />
          </div>

          <KpiStrip
            columns={10}
            items={[
              { label: 'AUM', value: formatCompactMoney(d.metrics.aum, d.currency), hint: 'Portfolios + fund NAV' },
              { label: 'Portfolio value', value: formatCompactMoney(d.metrics.totalPortfolioValue, d.currency), hint: 'Sum of holdings', href: '/internal/portfolios' },
              { label: 'Active investors', value: d.metrics.activeInvestors, hint: 'Approved relationships', href: '/internal/investors' },
              { label: 'Active portfolios', value: d.metrics.activePortfolios, hint: 'Open mandates', href: '/internal/portfolios' },
              { label: 'Applications', value: d.metrics.pendingApplications, hint: 'Pending review', href: '/internal/onboarding' },
              { label: 'KYC reviews', value: d.metrics.pendingKycReviews, hint: 'Pending or due ≤ 30d', href: '/internal/investors' },
              { label: 'Custodian', value: d.metrics.pendingCustodianSubmissions, hint: 'Awaiting reconciliation', href: '/internal/operations/custodian' },
              { label: 'Recon exceptions', value: d.metrics.openReconExceptions, hint: 'Open', href: '/internal/operations/reconciliation' },
              { label: 'Capital calls', value: d.metrics.upcomingCapitalCalls.count, hint: d.metrics.upcomingCapitalCalls.count ? `${formatCompactMoney(d.metrics.upcomingCapitalCalls.total, d.currency)} outstanding` : 'None outstanding' },
              { label: 'Company reporting', value: d.metrics.companyReporting.awaitingReview, hint: `to review · ${d.metrics.companyReporting.total} submissions`, href: '/internal/companies/submissions' },
            ]}
          />

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)]">
            <Panel>
              <PanelHeader title="Asset allocation" description="Portfolio holdings plus private-fund NAV." />
              <PanelBody>
                <AllocationDonut slices={d.allocation.map((a) => ({ key: a.key, label: a.label, value: a.value }))} currency={d.currency} centerLabel="Total value" size={150} />
              </PanelBody>
            </Panel>
            <RecentActivity rows={d.recentActivity} />
            <Panel className="lg:col-span-2 xl:col-span-1">
              <PanelHeader
                title="Company reporting"
                description={`${d.metrics.companyReporting.total} submission(s) by status`}
                actions={<Link href="/internal/companies/submissions" className="text-[12px] font-semibold text-primary hover:underline">Review</Link>}
              />
              <PanelBody>
                <StatusBars
                  height={150}
                  items={COMPANY_SUBMISSION_STATUSES.map((s) => ({ label: COMPANY_SUBMISSION_LABELS[s], value: d.metrics.companyReporting.byStatus[s] ?? 0, color: STATUS_COLORS[s] })).filter((i) => i.value > 0)}
                />
              </PanelBody>
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <RecentApplications rows={d.recentApplications} />
            <RecentCustodianSubmissions rows={d.recentCustodianSubmissions} />
            <div className="lg:col-span-2 xl:col-span-1">
              <RecentCompanySubmissions rows={d.recentCompanySubmissions} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
