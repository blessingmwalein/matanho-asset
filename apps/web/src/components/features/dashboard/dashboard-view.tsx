'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
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

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Investment operations"
        description="Assets, work queue and reporting status across investors, custodians and portfolio companies."
        actions={
          <Button variant="secondary" onClick={() => query.refetch()} loading={query.isFetching && !query.isLoading}>
            <RefreshCw /> Refresh
          </Button>
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
