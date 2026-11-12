'use client';

import { formatMultiple, formatPercent } from '@nexus/shared';
import { cn } from '@/lib/utils';
import { StatusIndicator } from '@/components/nx/status';
import { useMoney } from './hooks';
import type { InvestmentItem } from './types';

const tone = (s: string) => (s === 'ACTIVE' ? 'success' : s === 'ON_HOLD' ? 'warning' : 'neutral') as 'success' | 'warning' | 'neutral';
const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace('_', ' ');

/** Portfolio rows show the simplified NAV change; funds show administrator-reported IRR / TVPI. */
export function useInvestmentFigures() {
  const m = useMoney();
  return (i: InvestmentItem) =>
    i.kind === 'fund'
      ? { returnLabel: 'Net IRR', returnValue: formatPercent(i.irr, 2), secondLabel: 'TVPI', secondValue: formatMultiple(i.tvpi), thirdLabel: 'Unfunded', thirdValue: m.compact(i.unfunded, 1) }
      : {
          returnLabel: 'YTD return',
          returnValue: i.ytdReturnPct == null ? '—' : formatPercent(i.ytdReturnPct, 2, { signed: true }),
          secondLabel: 'Benchmark',
          secondValue: i.benchmarkYtdPct == null ? '—' : formatPercent(i.benchmarkYtdPct, 2, { signed: true }),
          thirdLabel: 'Allocation',
          thirdValue: i.topAllocation ? `${i.topAllocation.label} ${Math.round(i.topAllocation.pct)}%` : '—',
        };
}

export function InvestmentCard({ item, onOpen, active }: { item: InvestmentItem; onOpen: (i: InvestmentItem) => void; active?: boolean }) {
  const m = useMoney();
  const f = useInvestmentFigures()(item);
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn('group flex min-w-0 flex-col rounded-lg border bg-surface p-4 text-left outline-none transition-colors hover:border-[#c4c9d4] focus-visible:ring-2 focus-visible:ring-primary/30', active ? 'border-primary' : 'border-border')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[13.5px] font-semibold">{item.name}</h3>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {item.type} · {item.ref}
          </p>
        </div>
        <StatusIndicator tone={tone(item.status)}>{label(item.status)}</StatusIndicator>
      </div>
      <div className="num mt-5 text-[22px] font-semibold tracking-tight">{m.full(item.value)}</div>
      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border-soft pt-3">
        {[
          [f.returnLabel, f.returnValue],
          [f.secondLabel, f.secondValue],
          [f.thirdLabel, f.thirdValue],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="eyebrow truncate">{k}</dt>
            <dd className="num mt-1 truncate text-[12px] font-semibold" title={v}>{v}</dd>
          </div>
        ))}
      </dl>
    </button>
  );
}
