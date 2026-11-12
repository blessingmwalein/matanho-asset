'use client';

import * as React from 'react';
import { formatDate, formatPercent, SIMPLIFIED_VALUATION_NOTICE, type PerformancePeriod } from '@nexus/shared';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { AllocationDonut, PerformanceChart } from '@/components/nx/charts';
import { ErrorState, KpiStrip, PageHeader, Panel, PanelBody, PanelHeader, PanelSkeleton } from '@/components/nx/layout';
import { usePortal } from '@/components/shell/portal-shell';
import { ActivityList } from '@/components/features/portal/activity-list';
import { NextActionCard } from '@/components/features/portal/capital-call-cards';
import { DocumentViewerDialog } from '@/components/features/portal/document-viewer';
import { FxNote } from '@/components/features/portal/fx-note';
import { useMoney, useOverview } from '@/components/features/portal/hooks';

const PERIODS: readonly PerformancePeriod[] = ['1M', '3M', '6M', 'YTD', '1Y', 'ALL'];

export default function OverviewPage() {
  const { data: session } = useSession();
  const { currency, fxRate } = usePortal();
  const m = useMoney();
  const q = useOverview();
  const [period, setPeriod] = React.useState<PerformancePeriod>('YTD');
  const [doc, setDoc] = React.useState<string | null>(null);
  const o = q.data;
  const ytd = o?.ytdReturnPct;

  return (
    <div>
      <PageHeader
        eyebrow="Investor relationship"
        title={o?.account?.name ?? session?.organisation.name ?? 'Overview'}
        description={o?.account ? 'Filtered to the selected account. Choose “Consolidated relationship” in the top bar for the full view.' : 'Consolidated view across public-market mandates and private-market commitments.'}
        meta={o?.asOf ? <span className="text-[11.5px] text-muted-foreground">Data as of <b className="num font-semibold text-ink-2">{formatDate(o.asOf)}</b></span> : undefined}
      />
      <FxNote />

      {q.isError ? (
        <Panel>
          <ErrorState message={(q.error as Error).message} onRetry={() => void q.refetch()} />
        </Panel>
      ) : (
        <>
          <KpiStrip
            className="mb-4"
            items={[
              { label: 'Net asset value', value: o ? m.compact(o.nav) : '', hint: o?.asOf ? `As at ${formatDate(o.asOf)}` : 'Mandates + private funds', loading: !o },
              {
                label: 'YTD return',
                value: o ? <span className={cn(ytd == null ? '' : ytd >= 0 ? 'text-success' : 'text-danger')}>{ytd == null ? '—' : formatPercent(ytd, 2, { signed: true })}</span> : '',
                hint: o?.benchmarkYtdPct != null ? `Benchmark ${formatPercent(o.benchmarkYtdPct, 2, { signed: true })} · simplified NAV change` : 'Simplified NAV change, public mandates',
                loading: !o,
              },
              { label: 'Unfunded commitments', value: o ? m.compact(o.unfundedCommitments) : '', hint: 'Private capital account', loading: !o },
              { label: 'Distributions YTD', value: o ? m.compact(o.distributionsYtd) : '', hint: o ? `${m.compact(o.distributionsToDate)} to date` : undefined, loading: !o },
            ]}
          />

          <div className="grid gap-4 lg:grid-cols-12">
            <Panel className="lg:col-span-8">
              <PanelHeader title="Portfolio value & performance" description="Public-market mandates, rebased to 100 at the start of the period, against the composite benchmark." />
              <PanelBody>
                {!o ? (
                  <PanelSkeleton rows={6} />
                ) : (
                  <PerformanceChart points={o.series} period={period} onPeriodChange={setPeriod} periods={PERIODS} mode="index" height={300} currency={currency} fxRate={fxRate} portfolioLabel="Portfolio" benchmarkLabel="Composite benchmark" />
                )}
                <p className="mt-2 text-[10.5px] leading-snug text-ink-3">Source: internal valuation series and approved benchmark series. {SIMPLIFIED_VALUATION_NOTICE}</p>
              </PanelBody>
            </Panel>

            <NextActionCard call={o?.nextCall} onReview={setDoc} className="lg:col-span-4" />

            <Panel className="lg:col-span-7">
              <PanelHeader title="Asset allocation" description="Look-through exposure by asset class, including private funds at net asset value." />
              <PanelBody>
                {!o ? <PanelSkeleton rows={5} /> : <AllocationDonut slices={o.allocation} currency={currency} fxRate={fxRate} centerLabel="Net asset value" size={176} />}
              </PanelBody>
            </Panel>

            <Panel className="lg:col-span-5">
              <PanelHeader title="Recent activity" description="Latest investor-facing events." />
              <PanelBody>{!o ? <PanelSkeleton rows={5} /> : <ActivityList items={o.activity} onOpenDocument={setDoc} />}</PanelBody>
            </Panel>
          </div>
        </>
      )}

      <DocumentViewerDialog docId={doc} onClose={() => setDoc(null)} />
    </div>
  );
}
