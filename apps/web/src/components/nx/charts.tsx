'use client';

import * as React from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCompactMoney, formatDate, formatMoney, formatPercent, PERFORMANCE_PERIODS, type PerformancePeriod } from '@nexus/shared';
import { cn } from '@/lib/utils';
import { EmptyState } from './layout';
import { Segmented } from './filters';

/* Series colours: restrained, distinguishable, fixed order so a category keeps its colour everywhere. */
export const CHART_COLORS = ['#2457d6', '#0f8b8d', '#8a6dd8', '#c98a1b', '#5f7391', '#b8c0cc'];
export const BENCHMARK_COLOR = '#a3acb9';
const GRID = '#eceae4';
const AXIS = '#8b94a1';

export const ASSET_CLASS_COLORS: Record<string, string> = {
  EQUITY: '#2457d6',
  FIXED_INCOME: '#5f7391',
  PRIVATE_EQUITY: '#8a6dd8',
  PRIVATE_CREDIT: '#0f8b8d',
  REAL_ESTATE: '#c98a1b',
  CASH: '#b8c0cc',
  OTHER: '#d7cdb8',
};

const axisProps = { tick: { fontSize: 10.5, fill: AXIS }, tickLine: false, axisLine: false } as const;

function TooltipCard({ title, rows }: { title?: string; rows: Array<{ label: string; value: string; color?: string }> }) {
  return (
    <div className="min-w-[150px] rounded-md border border-[#1c2b44] bg-foreground px-3 py-2 text-[11px] text-white shadow-[var(--shadow-pop)]">
      {title && <div className="mb-1.5 font-semibold">{title}</div>}
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-[#c6ccd5]">
            {r.color && <i className="inline-block size-2 rounded-full" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="num font-semibold">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══ Portfolio performance ═══════════════════════════════════════════════════ */
export interface PerformancePoint {
  date: string; // YYYY-MM-DD
  value: number;
  benchmark?: number | null;
}

/** Filter a time series to the selected period (relative to its last point). */
export function sliceForPeriod(points: PerformancePoint[], period: PerformancePeriod): PerformancePoint[] {
  if (!points.length || period === 'ALL') return points;
  const last = new Date(points[points.length - 1]!.date);
  const start = new Date(last);
  if (period === 'YTD') start.setUTCMonth(0, 1);
  else {
    const months = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12 }[period];
    start.setUTCMonth(start.getUTCMonth() - months);
  }
  const sliced = points.filter((p) => new Date(p.date) >= start);
  return sliced.length > 1 ? sliced : points.slice(-2);
}

export function PerformanceChart({
  points,
  currency = 'USD',
  period,
  onPeriodChange,
  height = 300,
  mode = 'value',
  showBenchmark = true,
  periods = PERFORMANCE_PERIODS as readonly PerformancePeriod[],
  fxRate = 1,
  controls = true,
  portfolioLabel = 'Portfolio',
  benchmarkLabel = 'Benchmark',
}: {
  points: PerformancePoint[] | undefined;
  currency?: string;
  period: PerformancePeriod;
  onPeriodChange?: (p: PerformancePeriod) => void;
  height?: number;
  /** 'value' = currency NAV, 'index' = rebased to 100 at period start */
  mode?: 'value' | 'index';
  showBenchmark?: boolean;
  periods?: readonly PerformancePeriod[];
  fxRate?: number;
  controls?: boolean;
  portfolioLabel?: string;
  benchmarkLabel?: string;
}) {
  const data = React.useMemo(() => {
    const sliced = sliceForPeriod(points ?? [], period);
    if (!sliced.length) return [];
    const v0 = sliced[0]!.value || 1;
    const b0 = sliced[0]!.benchmark || 1;
    return sliced.map((p) => ({
      date: p.date,
      value: mode === 'index' ? (p.value / v0) * 100 : p.value * fxRate,
      benchmark: p.benchmark == null ? null : mode === 'index' ? (p.benchmark / b0) * 100 : p.benchmark * fxRate,
    }));
  }, [points, period, mode, fxRate]);

  const first = data[0];
  const last = data[data.length - 1];
  const ret = first && last && first.value ? ((last.value - first.value) / first.value) * 100 : null;

  const fmtVal = (v: number) => (mode === 'index' ? v.toFixed(1) : formatMoney(v, currency, { decimals: 0 }));

  return (
    <div>
      {controls && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <i className="inline-block h-[3px] w-5 rounded bg-primary" />
              {portfolioLabel}
              {ret !== null && <b className={cn('num ml-1', ret >= 0 ? 'text-success' : 'text-danger')}>{formatPercent(ret, 2, { signed: true })}</b>}
            </span>
            {showBenchmark && (
              <span className="flex items-center gap-1.5">
                <i className="inline-block h-[3px] w-5 rounded" style={{ background: BENCHMARK_COLOR }} />
                {benchmarkLabel}
              </span>
            )}
          </div>
          {onPeriodChange && <Segmented value={period} onChange={onPeriodChange} options={periods.map((p) => ({ value: p, label: p }))} size="sm" />}
        </div>
      )}
      {data.length < 2 ? (
        <EmptyState title="No performance history yet" description="A valuation series appears once at least two valuation dates are recorded." className="py-16" />
      ) : (
        <div style={{ height }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="date" {...axisProps} minTickGap={48} tickFormatter={(d: string) => formatDate(d).slice(0, 6)} />
              <YAxis
                {...axisProps}
                width={mode === 'index' ? 36 : 58}
                domain={['auto', 'auto']}
                tickFormatter={(v: number) => (mode === 'index' ? v.toFixed(0) : formatCompactMoney(v, currency, { digits: 1 }).replace(/\s/g, ''))}
              />
              <Tooltip
                cursor={{ stroke: '#c9c5bb', strokeDasharray: '3 3' }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]!.payload as { value: number; benchmark: number | null };
                  return (
                    <TooltipCard
                      title={formatDate(String(label))}
                      rows={[
                        { label: portfolioLabel, value: fmtVal(row.value), color: CHART_COLORS[0] },
                        ...(showBenchmark && row.benchmark != null ? [{ label: benchmarkLabel, value: fmtVal(row.benchmark), color: BENCHMARK_COLOR }] : []),
                      ]}
                    />
                  );
                }}
              />
              <Area type="monotone" dataKey="value" stroke="none" fill={CHART_COLORS[0]} fillOpacity={0.06} isAnimationActive={false} />
              {showBenchmark && <Line type="monotone" dataKey="benchmark" stroke={BENCHMARK_COLOR} strokeWidth={1.75} dot={false} isAnimationActive={false} connectNulls />}
              <Line type="monotone" dataKey="value" stroke={CHART_COLORS[0]} strokeWidth={2.25} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/* ═══ Allocation ══════════════════════════════════════════════════════════════ */
export interface AllocationSlice {
  key: string;
  label: string;
  value: number;
  color?: string;
}

function withColors(slices: AllocationSlice[]): Array<AllocationSlice & { color: string; pct: number }> {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  return slices
    .filter((s) => s.value > 0)
    .map((s, i) => ({ ...s, color: s.color ?? ASSET_CLASS_COLORS[s.key] ?? CHART_COLORS[i % CHART_COLORS.length]!, pct: (s.value / total) * 100 }));
}

export function AllocationDonut({
  slices,
  currency = 'USD',
  centerLabel = 'Total value',
  centerValue,
  size = 168,
  showLegend = true,
  fxRate = 1,
  className,
}: {
  slices: AllocationSlice[] | undefined;
  currency?: string;
  centerLabel?: string;
  centerValue?: string;
  size?: number;
  showLegend?: boolean;
  fxRate?: number;
  className?: string;
}) {
  const data = withColors(slices ?? []);
  const total = data.reduce((a, s) => a + s.value, 0);
  if (!data.length) return <EmptyState title="No allocation yet" description="Add holdings to see the asset-class split." className="py-10" />;
  return (
    <div className={cn('flex flex-wrap items-center gap-x-6 gap-y-4', className)}>
      <div className="relative mx-auto shrink-0" style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="66%" outerRadius="100%" paddingAngle={1.5} stroke="none" isAnimationActive={false}>
              {data.map((s) => (
                <Cell key={s.key} fill={s.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const s = payload[0]!.payload as (typeof data)[number];
                return <TooltipCard title={s.label} rows={[{ label: 'Value', value: formatMoney(s.value * fxRate, currency, { decimals: 0 }), color: s.color }, { label: 'Weight', value: formatPercent(s.pct, 1) }]} />;
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="num text-[17px] font-semibold tracking-tight">{centerValue ?? formatCompactMoney(total * fxRate, currency)}</div>
            <div className="text-[10px] text-muted-foreground">{centerLabel}</div>
          </div>
        </div>
      </div>
      {showLegend && (
        <ul className="min-w-[180px] flex-1 space-y-2.5">
          {data.map((s) => (
            <li key={s.key} className="grid grid-cols-[10px_1fr_auto_auto] items-center gap-2 text-[12px]">
              <i className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
              <span className="truncate text-ink-2">{s.label}</span>
              <span className="num text-muted-foreground">{formatCompactMoney(s.value * fxRate, currency, { digits: 1 })}</span>
              <b className="num w-12 text-right font-semibold">{formatPercent(s.pct, 1)}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Horizontal allocation bars (compact alternative to the donut). */
export function AllocationBars({ slices, currency = 'USD', fxRate = 1 }: { slices: AllocationSlice[] | undefined; currency?: string; fxRate?: number }) {
  const data = withColors(slices ?? []);
  if (!data.length) return <EmptyState title="No data" className="py-8" />;
  return (
    <ul className="space-y-3">
      {data.map((s) => (
        <li key={s.key}>
          <div className="mb-1 flex items-baseline justify-between text-[12px]">
            <span className="text-ink-2">{s.label}</span>
            <span className="num">
              <b className="font-semibold">{formatPercent(s.pct, 1)}</b>
              <span className="ml-2 text-muted-foreground">{formatCompactMoney(s.value * fxRate, currency, { digits: 1 })}</span>
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
            <div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: s.color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ═══ Capital: commitment vs called ═══════════════════════════════════════════ */
export function CommitmentVsCalled({
  rows,
  currency = 'USD',
  height = 220,
}: {
  rows: Array<{ name: string; called: number; unfunded: number }>;
  currency?: string;
  height?: number;
}) {
  if (!rows.length) return <EmptyState title="No commitments" className="py-10" />;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" {...axisProps} tickFormatter={(v: number) => formatCompactMoney(v, currency, { digits: 1 }).replace(/\s/g, '')} />
          <YAxis type="category" dataKey="name" {...axisProps} width={120} />
          <Tooltip
            cursor={{ fill: '#f1f0ec' }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0]!.payload as { called: number; unfunded: number };
              return (
                <TooltipCard
                  title={String(label)}
                  rows={[
                    { label: 'Called', value: formatMoney(r.called, currency, { decimals: 0 }), color: CHART_COLORS[0] },
                    { label: 'Unfunded', value: formatMoney(r.unfunded, currency, { decimals: 0 }), color: '#cfd6e6' },
                    { label: 'Commitment', value: formatMoney(r.called + r.unfunded, currency, { decimals: 0 }) },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="called" stackId="a" fill={CHART_COLORS[0]} radius={[3, 0, 0, 3]} isAnimationActive={false} />
          <Bar dataKey="unfunded" stackId="a" fill="#cfd6e6" radius={[0, 3, 3, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ═══ Status distribution (reconciliation, reporting completion) ══════════════ */
export function StatusBars({
  items,
  height = 180,
}: {
  items: Array<{ label: string; value: number; color: string }>;
  height?: number;
}) {
  const total = items.reduce((a, i) => a + i.value, 0);
  if (!total) return <EmptyState title="No items yet" className="py-8" />;
  return (
    <div>
      <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-surface-sunken">
        {items.map((i) => (
          <div key={i.label} title={`${i.label}: ${i.value}`} style={{ width: `${(i.value / total) * 100}%`, background: i.color }} />
        ))}
      </div>
      <div style={{ minHeight: height / 3 }} className="grid gap-2">
        {items.map((i) => (
          <div key={i.label} className="flex items-center justify-between text-[12px]">
            <span className="flex items-center gap-2 text-ink-2">
              <i className="size-2.5 rounded-[3px]" style={{ background: i.color }} />
              {i.label}
            </span>
            <b className="num font-semibold">{i.value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export const ReconStatusChart = StatusBars;

/** Mini line for cards (investment drawer, fund cards). */
export function Sparkline({ values, color = CHART_COLORS[0], height = 40 }: { values: number[]; color?: string; height?: number }) {
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.75} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
