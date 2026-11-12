'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDate, formatMultiple, formatPercent, formatPrice, formatQuantity, SIMPLIFIED_VALUATION_NOTICE, type PerformancePeriod } from '@nexus/shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/controls';
import { CommitmentVsCalled, PerformanceChart } from '@/components/nx/charts';
import { DetailKpis, DetailSection } from '@/components/nx/blocks';
import { ErrorState, InfoList, InfoRow } from '@/components/nx/layout';
import { SimpleStatus } from '@/components/nx/status';
import { usePortal } from '@/components/shell/portal-shell';
import { useMoney } from './hooks';
import type { DocRef, FundDetail, PortfolioDetail } from './types';

const PERIODS: readonly PerformancePeriod[] = ['3M', '6M', 'YTD', '1Y', 'ALL'];

function Docs({ docs, onOpen }: { docs: DocRef[]; onOpen: (id: string) => void }) {
  if (!docs.length) return <p className="text-[12px] text-muted-foreground">No published documents for this investment yet.</p>;
  return (
    <ul>
      {docs.map((d) => (
        <li key={d.id} className="border-t border-border-soft first:border-t-0">
          <button type="button" onClick={() => onOpen(d.id)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:bg-surface-2">
            <span className="min-w-0 truncate text-[12.5px] font-medium">{d.title}</span>
            <span className="num shrink-0 text-[11.5px] text-muted-foreground">{formatDate(d.date)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function PortfolioBody({ d, onOpenDoc }: { d: PortfolioDetail; onOpenDoc: (id: string) => void }) {
  const m = useMoney();
  const { currency, fxRate } = usePortal();
  const [period, setPeriod] = React.useState<PerformancePeriod>('1Y');
  const ret = d.returns.ytd;
  return (
    <>
      <div className="px-5 pt-4">
        <DetailKpis
          items={[
            { label: 'Current value', value: m.full(d.value) },
            { label: 'YTD return', value: <span className={cn(ret == null ? '' : ret >= 0 ? 'text-success' : 'text-danger')}>{ret == null ? '—' : formatPercent(ret, 2, { signed: true })}</span> },
            { label: 'Benchmark YTD', value: d.returns.bench == null ? '—' : formatPercent(d.returns.bench, 2, { signed: true }) },
          ]}
        />
      </div>
      <DetailSection title="Performance" description="Rebased to 100 at the start of the period, against the mandate benchmark.">
        <PerformanceChart points={d.series} period={period} onPeriodChange={setPeriod} periods={PERIODS} mode="index" height={210} currency={currency} fxRate={fxRate} benchmarkLabel={d.benchmark ?? 'Benchmark'} />
        <p className="mt-2 text-[10.5px] leading-snug text-ink-3">{SIMPLIFIED_VALUATION_NOTICE}</p>
      </DetailSection>
      <DetailSection title="Mandate context">
        <InfoList>
          <InfoRow label="Type">{d.type}</InfoRow>
          <InfoRow label="Benchmark">{d.benchmark}</InfoRow>
          <InfoRow label="Inception">{formatDate(d.inceptionDate)}</InfoRow>
          <InfoRow label="Portfolio manager">{d.manager}</InfoRow>
          <InfoRow label="1Y change">{d.returns.oneYear == null ? '—' : formatPercent(d.returns.oneYear, 2, { signed: true })}</InfoRow>
          <InfoRow label="Valuation source">Matanho valuation series (simplified model)</InfoRow>
        </InfoList>
      </DetailSection>
      <DetailSection title="Holdings" description={`${d.holdings.length} position${d.holdings.length === 1 ? '' : 's'} at the latest valuation date`}>
        <div className="nx-scroll -mx-1 overflow-x-auto">
          <table className="w-full min-w-[420px] text-[12px]">
            <thead>
              <tr className="text-left">
                <th className="eyebrow pb-1.5 pr-2 font-bold">Security</th>
                <th className="eyebrow pb-1.5 pr-2 text-right font-bold">Quantity</th>
                <th className="eyebrow pb-1.5 pr-2 text-right font-bold">Price</th>
                <th className="eyebrow pb-1.5 pr-2 text-right font-bold">Value</th>
                <th className="eyebrow pb-1.5 text-right font-bold">Weight</th>
              </tr>
            </thead>
            <tbody>
              {d.holdings.map((h) => (
                <tr key={h.ticker} className="border-t border-border-soft">
                  <td className="py-2 pr-2">
                    <div className="font-semibold">{h.ticker}</div>
                    <div className="truncate text-[10.5px] text-muted-foreground">{h.name}</div>
                  </td>
                  <td className="num py-2 pr-2 text-right">{formatQuantity(h.quantity as string)}</td>
                  <td className="num py-2 pr-2 text-right">{formatPrice(h.price as string)}</td>
                  <td className="num py-2 pr-2 text-right font-medium">{m.full(h.marketValue)}</td>
                  <td className="num py-2 text-right">{formatPercent(h.weightPct, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DetailSection>
      <DetailSection title="Latest investor documents">
        <Docs docs={d.documents} onOpen={onOpenDoc} />
      </DetailSection>
    </>
  );
}

function FundBody({ d, onOpenDoc }: { d: FundDetail; onOpenDoc: (id: string) => void }) {
  const m = useMoney();
  const { currency, fxRate } = usePortal();
  return (
    <>
      <div className="px-5 pt-4">
        <DetailKpis items={[{ label: 'Current NAV', value: m.full(d.value) }, { label: 'Net IRR', value: formatPercent(d.irr, 2) }, { label: 'TVPI', value: formatMultiple(d.tvpi) }]} />
      </div>
      <DetailSection title="Capital account" description={`Administrator-reported as at ${formatDate(d.asOf)}`}>
        <CommitmentVsCalled rows={[{ name: d.name, called: Number(d.called) * fxRate, unfunded: Number(d.unfunded) * fxRate }]} currency={currency} height={96} />
        <InfoList className="mt-2">
          <InfoRow label="Commitment" mono>{m.full(d.commitment)}</InfoRow>
          <InfoRow label="Called" mono>{m.full(d.called)}</InfoRow>
          <InfoRow label="Unfunded" mono>{m.full(d.unfunded)}</InfoRow>
          <InfoRow label="Distributed" mono>{m.full(d.distributed)}</InfoRow>
          <InfoRow label="DPI" mono>{formatMultiple(d.dpi)}</InfoRow>
          <InfoRow label="Fund">{d.type}{d.vintage ? ` · vintage ${d.vintage}` : ''}</InfoRow>
        </InfoList>
        <p className="mt-2 text-[10.5px] leading-snug text-ink-3">IRR, TVPI and DPI are administrator-reported and are not recalculated by the portal.</p>
      </DetailSection>
      <DetailSection title="Capital activity">
        {d.events.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">No capital events yet.</p>
        ) : (
          <ul>
            {d.events.map((e) => {
              const row = (
                <>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-medium">{e.kind === 'CALL' ? 'Capital call' : 'Distribution'} · {e.ref}</span>
                    <span className="num block text-[11px] text-muted-foreground">{formatDate(e.issueDate)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className={cn('num text-[12.5px] font-semibold', e.kind === 'DISTRIBUTION' && 'text-success')}>{e.kind === 'DISTRIBUTION' ? '+' : '−'}{m.full(e.amount)}</span>
                    <SimpleStatus value={e.status} />
                  </span>
                </>
              );
              return (
                <li key={e.id} className="border-t border-border-soft first:border-t-0">
                  {e.noticeDocumentId ? (
                    <button type="button" onClick={() => onOpenDoc(e.noticeDocumentId!)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:bg-surface-2">
                      {row}
                    </button>
                  ) : (
                    <div className="flex items-center justify-between gap-3 py-2.5">{row}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DetailSection>
      <DetailSection title="Latest investor documents">
        <Docs docs={d.documents} onOpen={onOpenDoc} />
      </DetailSection>
    </>
  );
}

/** Right-hand drawer with KPIs, performance or capital account, and the latest documents. */
export function InvestmentDrawer({ selected, onClose, onOpenDoc }: { selected: { kind: 'portfolio' | 'fund'; id: string; name: string; type: string } | null; onClose: () => void; onOpenDoc: (id: string) => void }) {
  const q = useQuery({
    queryKey: ['portal', 'investment', selected?.kind, selected?.id],
    enabled: !!selected,
    queryFn: () => api<PortfolioDetail | FundDetail>(`/investor-portal/investments/${selected!.kind}/${selected!.id}`),
    retry: false,
  });
  const d = q.data;
  return (
    <Sheet open={!!selected} onOpenChange={(o) => !o && onClose()}>
      <SheetContent eyebrow="Investment detail" title={selected?.name ?? 'Investment'} description={d ? <span className="inline-flex items-center gap-2">{d.type} <SimpleStatus value={d.status} /></span> : selected?.type} width="md">
        {q.isLoading && (
          <div className="space-y-3 p-5">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}
        {q.isError && <ErrorState message={(q.error as Error).message} onRetry={() => void q.refetch()} />}
        {d?.kind === 'portfolio' && <PortfolioBody d={d} onOpenDoc={onOpenDoc} />}
        {d?.kind === 'fund' && <FundBody d={d} onOpenDoc={onOpenDoc} />}
      </SheetContent>
    </Sheet>
  );
}
