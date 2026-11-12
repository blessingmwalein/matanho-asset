'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { Download, Play, Printer } from 'lucide-react';
import { formatDate, formatDateTime, formatMoney, formatNumber, formatPercent } from '@nexus/shared';
import { api, buildQuery } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/nx/data-table';
import { Panel, PanelHeader } from '@/components/nx/layout';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from './searchable';

export interface ReportCatalogueItem {
  type: string;
  title: string;
  description: string;
  group: 'investor' | 'portfolio';
  params: Array<'portfolioId' | 'investorId' | 'status' | 'from' | 'to'>;
}
interface ReportColumn { key: string; label: string; type?: 'text' | 'money' | 'number' | 'percent' | 'date' | 'datetime' }
interface ReportResult {
  title: string;
  generatedAt: string;
  columns: ReportColumn[];
  rows: Array<Record<string, string | number | null>>;
  totals?: Record<string, string | number | null>;
}
interface Options {
  investors: Array<{ id: string; ref: string; name: string }>;
  portfolios: Array<{ id: string; ref: string; name: string; investorName: string }>;
}

function fmt(c: ReportColumn, v: string | number | null | undefined): React.ReactNode {
  if (v === null || v === undefined || v === '') return <span className="text-ink-3">—</span>;
  switch (c.type) {
    case 'money': return formatMoney(v as string, 'USD');
    case 'number': return formatNumber(v as string, Number(v) % 1 ? 2 : 0);
    case 'percent': return formatPercent(v as string, 2);
    case 'date': return formatDate(v as string);
    case 'datetime': return formatDateTime(v as string);
    default: return String(v);
  }
}

const STATUS_PARAM_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  'investor-register': [{ value: 'ACTIVE', label: 'Active' }, { value: 'SUSPENDED', label: 'Suspended' }, { value: 'CLOSED', label: 'Closed' }],
  'onboarding-status': ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'INFORMATION_REQUESTED', 'RESUBMITTED', 'APPROVED', 'REJECTED'].map((s) => ({ value: s, label: s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) })),
  'reconciliation-exceptions': [{ value: 'OPEN', label: 'Open' }, { value: 'RESOLVED', label: 'Resolved' }],
  'company-reporting-status': ['NOT_STARTED', 'DRAFT', 'SUBMITTED', 'QUESTIONS_OPEN', 'CORRECTIONS_REQUESTED', 'RESUBMITTED', 'ACCEPTED'].map((s) => ({ value: s, label: s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) })),
  'portfolio-summary': [{ value: 'ACTIVE', label: 'Active' }, { value: 'ON_HOLD', label: 'On hold' }, { value: 'CLOSED', label: 'Closed' }],
};

/** Runs any report from the catalogue: parameters, live preview, CSV export, printable view. */
export function ReportRunner({ reports, initial }: { reports: ReportCatalogueItem[]; initial?: string }) {
  const [type, setType] = React.useState(initial ?? reports[0]?.type ?? '');
  const [params, setParams] = React.useState<Record<string, string | undefined>>({});
  const [ran, setRan] = React.useState<{ type: string; params: Record<string, string | undefined> } | null>(null);
  const def = reports.find((r) => r.type === type);
  const options = useQuery({ queryKey: ['report-options'], queryFn: () => api<Options>('/reports/options'), enabled: !!def?.params.some((p) => p === 'portfolioId' || p === 'investorId') });

  React.useEffect(() => { setParams({}); setRan(null); }, [type]);

  const result = useQuery({
    queryKey: ['report', ran],
    queryFn: () => api<ReportResult>(`/reports/${ran!.type}`, { query: { ...ran!.params, format: 'json' } }),
    enabled: !!ran,
  });

  const columns = React.useMemo<ColumnDef<Record<string, string | number | null>>[]>(
    () => (result.data?.columns ?? []).map((c) => ({
      id: c.key,
      header: c.label,
      accessorFn: (r) => r[c.key],
      meta: { align: c.type === 'money' || c.type === 'number' || c.type === 'percent' ? ('right' as const) : undefined },
      cell: ({ row }) => fmt(c, row.original[c.key]),
    })),
    [result.data],
  );

  if (!def) return null;
  const qs = buildQuery({ ...params });
  const csvHref = `/api/reports/${def.type}${qs ? `${qs}&` : '?'}format=csv`;
  const htmlHref = `/api/reports/${def.type}${qs ? `${qs}&` : '?'}format=html`;

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <Panel className="self-start">
        <PanelHeader title="Reports" />
        <ul className="px-2 pb-2">
          {reports.map((r) => (
            <li key={r.type}>
              <button onClick={() => setType(r.type)} className={cn('w-full rounded-md px-2.5 py-2 text-left text-[12.5px] transition-colors', r.type === type ? 'bg-primary-soft font-semibold text-foreground' : 'text-ink-2 hover:bg-surface-2')}>
                {r.title}
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel>
        <PanelHeader
          title={def.title}
          description={def.description}
          actions={
            <>
              <Button variant="secondary" size="sm" asChild>
                <a href={csvHref}><Download /> CSV</a>
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <a href={htmlHref} target="_blank" rel="noreferrer"><Printer /> Print view</a>
              </Button>
            </>
          }
        />
        <div className="flex flex-wrap items-end gap-3 border-y border-border-soft bg-surface-2 px-4 py-3">
          {def.params.includes('status') && STATUS_PARAM_OPTIONS[def.type] && (
            <label className="grid gap-1 text-[11px] font-semibold text-ink-2">Status
              <select value={params.status ?? ''} onChange={(e) => setParams((p) => ({ ...p, status: e.target.value || undefined }))} className="h-9 rounded-md border border-input bg-surface px-2.5 text-[12.5px]">
                <option value="">All</option>
                {STATUS_PARAM_OPTIONS[def.type]!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          )}
          {def.params.includes('investorId') && (
            <label className="grid gap-1 text-[11px] font-semibold text-ink-2">Investor
              <SearchableSelect value={params.investorId} onChange={(v) => setParams((p) => ({ ...p, investorId: v }))} placeholder="All investors" options={(options.data?.investors ?? []).map((i) => ({ value: i.id, label: i.name, hint: i.ref }))} />
            </label>
          )}
          {def.params.includes('portfolioId') && (
            <label className="grid gap-1 text-[11px] font-semibold text-ink-2">Portfolio
              <SearchableSelect value={params.portfolioId} onChange={(v) => setParams((p) => ({ ...p, portfolioId: v }))} placeholder="All portfolios" options={(options.data?.portfolios ?? []).map((p) => ({ value: p.id, label: p.name, hint: p.ref }))} />
            </label>
          )}
          {def.params.includes('from') && (
            <label className="grid gap-1 text-[11px] font-semibold text-ink-2">From
              <Input type="date" value={params.from ?? ''} onChange={(e) => setParams((p) => ({ ...p, from: e.target.value || undefined }))} className="w-[150px]" />
            </label>
          )}
          {def.params.includes('to') && (
            <label className="grid gap-1 text-[11px] font-semibold text-ink-2">To
              <Input type="date" value={params.to ?? ''} onChange={(e) => setParams((p) => ({ ...p, to: e.target.value || undefined }))} className="w-[150px]" />
            </label>
          )}
          <Button variant="primary" onClick={() => setRan({ type: def.type, params: { ...params } })} loading={result.isFetching}>
            <Play /> Run report
          </Button>
        </div>

        {!ran ? (
          <p className="px-4 py-12 text-center text-[12.5px] text-muted-foreground">Choose parameters (optional) and run the report. Data is read live from the database.</p>
        ) : (
          <>
            <DataTable
              columns={columns}
              data={result.data?.rows}
              loading={result.isFetching}
              error={result.error ? (result.error as Error).message : null}
              onRetry={() => void result.refetch()}
              maxHeight="560px"
              dense
              emptyTitle="No rows for these parameters"
              footer={
                result.data?.totals ? (
                  <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border bg-surface-2 px-4 py-2.5 text-[12.5px] font-semibold">
                    {result.data.columns.filter((c) => result.data!.totals![c.key] !== undefined && result.data!.totals![c.key] !== null && c.type !== undefined && c.type !== 'text').map((c) => (
                      <span key={c.key}><span className="mr-1.5 font-normal text-muted-foreground">{c.label}:</span><span className="num">{fmt(c, result.data!.totals![c.key]!)}</span></span>
                    ))}
                  </div>
                ) : undefined
              }
            />
            {result.data && <div className="num border-t border-border-soft px-4 py-2 text-[11px] text-muted-foreground">{result.data.rows.length} row(s) · generated {formatDateTime(result.data.generatedAt)} UTC</div>}
          </>
        )}
      </Panel>
    </div>
  );
}
