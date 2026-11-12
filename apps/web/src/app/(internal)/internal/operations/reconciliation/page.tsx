'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Play } from 'lucide-react';
import { formatDate, formatDateTime, formatPrice, formatQuantity, P, RECON_STATUS_LABELS, type ReconStatus } from '@nexus/shared';
import { api, type Paged } from '@/lib/api';
import { useCan } from '@/lib/session';
import { useListState } from '@/lib/use-list-state';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/nx/data-table';
import { FilterBar, FilterSelect, SearchInput } from '@/components/nx/filters';
import { KpiStrip, PageHeader, Panel, PanelBody, PanelHeader } from '@/components/nx/layout';
import { ReconStatusChart } from '@/components/nx/charts';
import { ReconStatusLabel, StatusIndicator } from '@/components/nx/status';
import { ReconItemSheet } from '@/components/features/reconciliation/item-sheet';
import { ITEM_KIND_LABELS, type ReconRow, type ReconSummary } from '@/components/features/reconciliation/types';

interface RunResult {
  batch: { id: string; ref: string; businessDate: string };
  processed: number;
  matched: number;
  differences: number;
  unmatched: number;
  pendingReview: number;
  internalOrphans: number;
  openExceptions: number;
}

const ITEM_STATUSES: ReconStatus[] = ['MATCHED', 'DIFFERENCE', 'UNMATCHED', 'PENDING_REVIEW', 'RESOLVED'];
const STATUS_COLORS: Record<string, string> = { MATCHED: '#138a68', RESOLVED: '#8ec5b0', DIFFERENCE: '#c98a1b', PENDING_REVIEW: '#2457d6', UNMATCHED: '#b84758' };
const dateInput = 'h-9 rounded-md border border-input bg-surface px-2.5 text-[12.5px] outline-none hover:border-[#c9c5bb] focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/12';

function Workspace() {
  const qc = useQueryClient();
  const can = useCan();
  const params = useSearchParams();
  const list = useListState({ sort: 'updatedAt', pageSize: 10 });
  const [openId, setOpenId] = React.useState<string | null>(params.get('item'));
  const [businessDate, setBusinessDate] = React.useState(() => new Date().toISOString().slice(0, 10));

  const summary = useQuery({ queryKey: ['recon', 'summary'], queryFn: () => api<ReconSummary>('/reconciliation/summary'), refetchInterval: 30_000 });
  const items = useQuery({
    queryKey: ['recon', 'items', list.params],
    queryFn: () => api<Paged<ReconRow>>('/reconciliation/items', { query: list.params }),
    placeholderData: keepPreviousData,
  });

  const run = useMutation({
    // a fresh key per click: running again is deliberate (the engine itself is idempotent)
    mutationFn: () => api<RunResult>('/reconciliation/run', { method: 'POST', body: { businessDate }, idempotencyKey: crypto.randomUUID() }),
    onSuccess: (r) => {
      toast.success(`Reconciliation ${r.batch.ref} complete`, {
        description: `${r.processed} record${r.processed === 1 ? '' : 's'} processed · ${r.matched} matched · ${r.differences} difference · ${r.unmatched} unmatched · ${r.pendingReview} pending review · ${r.internalOrphans} internal-only`,
      });
      void qc.invalidateQueries({ queryKey: ['recon'] });
      void qc.invalidateQueries({ queryKey: ['custodian'] });
      void qc.invalidateQueries({ queryKey: ['nav-counts'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Reconciliation failed'),
  });

  const s = summary.data;
  const needsAttention = s ? s.counts.UNMATCHED + s.counts.DIFFERENCE + s.counts.PENDING_REVIEW : undefined;

  const columns = React.useMemo<ColumnDef<ReconRow, any>[]>(
    () => [
      { id: 'kind', header: 'Type', meta: { sortKey: 'kind' }, cell: ({ row }) => <span className="whitespace-nowrap">{ITEM_KIND_LABELS[row.original.kind]}</span> },
      {
        id: 'ref',
        header: 'Reference',
        meta: { sortKey: 'tradeReference' },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="min-w-[130px]">
              <div className="font-semibold">{r.kind === 'DAY_END' ? `Day-end ${formatDate(r.date)}` : (r.tradeReference ?? r.transactionRef ?? '—')}</div>
              <div className="num text-[11px] text-muted-foreground">{r.custodianRef ?? r.transactionRef ?? r.batch.ref}</div>
            </div>
          );
        },
      },
      {
        id: 'portfolio',
        header: 'Portfolio',
        meta: { sortKey: 'portfolio' },
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.portfolio?.ref ?? '—'}</div>
            <div className="max-w-[160px] truncate text-[11px] text-muted-foreground">{row.original.custodian ?? 'Internal book'}</div>
          </div>
        ),
      },
      { id: 'ticker', header: 'Security', meta: { sortKey: 'ticker' }, cell: ({ row }) => <span>{row.original.ticker ?? '—'}</span> },
      { id: 'qty', header: 'Quantity', meta: { align: 'right' }, cell: ({ row }) => (row.original.quantity ? formatQuantity(row.original.quantity) : '—') },
      { id: 'price', header: 'Price', meta: { align: 'right' }, cell: ({ row }) => (row.original.price ? `${formatPrice(row.original.price)}` : '—') },
      { id: 'status', header: 'Status', meta: { sortKey: 'status' }, cell: ({ row }) => <ReconStatusLabel status={row.original.status} /> },
      {
        id: 'exceptions',
        header: 'Exceptions',
        cell: ({ row }) =>
          row.original.exceptionCount === 0 ? (
            <span className="text-muted-foreground">None</span>
          ) : row.original.openExceptions > 0 ? (
            <StatusIndicator tone="warning">{row.original.openExceptions} open</StatusIndicator>
          ) : (
            <StatusIndicator tone="success">All resolved</StatusIndicator>
          ),
      },
      { id: 'updated', header: 'Updated', meta: { sortKey: 'updatedAt' }, cell: ({ row }) => <span className="num whitespace-nowrap text-[12px]">{formatDateTime(row.original.updatedAt)}</span> },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Reconciliation"
        description="Match custodian executions and day-end books against Matanho's internal book. Differences become exceptions that are resolved with a note; source values are never overwritten."
        actions={
          can(P.RECON_RUN) ? (
            <>
              <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                Business date
                <input type="date" className={dateInput} value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} aria-label="Business date" />
              </label>
              <Button variant="primary" loading={run.isPending} onClick={() => run.mutate()} disabled={!businessDate}>
                <Play /> Run reconciliation
              </Button>
            </>
          ) : undefined
        }
      />

      <KpiStrip
        className="mb-4"
        items={[
          { label: 'Items reconciled', value: s?.totalItems ?? '–', loading: summary.isLoading, hint: 'Live custodian records and internal-only trades' },
          { label: 'Matched', value: s?.counts.MATCHED ?? '–', loading: summary.isLoading, hint: `${s?.counts.RESOLVED ?? 0} resolved` },
          { label: 'Needs attention', value: needsAttention ?? '–', loading: summary.isLoading, hint: 'Differences, unmatched, pending review' },
          { label: 'Open exceptions', value: s?.openExceptions ?? '–', loading: summary.isLoading, hint: 'Awaiting a resolution note' },
          {
            label: 'Not yet reconciled',
            value: s?.unreconciledSubmissions.total ?? '–',
            loading: summary.isLoading,
            hint: s ? `${s.unreconciledSubmissions.executions} execution · ${s.unreconciledSubmissions.dayEnds} day-end` : undefined,
            href: '/internal/operations/custodian',
          },
          { label: 'Last run', value: s?.lastRun ? formatDateTime(s.lastRun.at).slice(0, 12) : 'Never', loading: summary.isLoading, hint: s?.lastRun ? `${s.lastRun.batchRef ?? ''}${s.lastRun.by ? ` · ${s.lastRun.by}` : ''}` : 'Run reconciliation to start' },
        ]}
      />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Panel>
          <FilterBar>
            <SearchInput value={list.state.q} onChange={list.setQ} placeholder="Search reference, security, portfolio…" />
            <FilterSelect label="Status" value={list.state.filters.status} onChange={(v) => list.setFilter('status', v)} options={ITEM_STATUSES.map((x) => ({ value: x, label: RECON_STATUS_LABELS[x] }))} />
            <FilterSelect
              label="Type"
              value={list.state.filters.kind}
              onChange={(v) => list.setFilter('kind', v)}
              options={[
                { value: 'EXECUTION', label: 'Execution' },
                { value: 'DAY_END', label: 'Day-end' },
                { value: 'INTERNAL_ORPHAN', label: 'Internal only' },
              ]}
            />
            <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              Business date
              <input type="date" className={dateInput} value={list.state.filters.date ?? ''} onChange={(e) => list.setFilter('date', e.target.value || undefined)} aria-label="Filter by business date" />
            </label>
            {(list.state.q || Object.values(list.state.filters).some(Boolean)) && (
              <button type="button" onClick={list.reset} className="text-[12px] font-semibold text-primary hover:underline">
                Clear filters
              </button>
            )}
          </FilterBar>
          <DataTable
            columns={columns}
            data={items.data?.data}
            loading={items.isFetching}
            error={items.error ? (items.error as Error).message : null}
            onRetry={() => void items.refetch()}
            meta={items.data?.meta}
            onPageChange={list.setPage}
            onPageSizeChange={list.setPageSize}
            sort={list.state.sort}
            order={list.state.order}
            onSort={list.onSort}
            onRowClick={(r) => setOpenId(r.id)}
            activeId={openId ?? undefined}
            emptyTitle="No reconciliation items"
            emptyDescription={Object.values(list.state.filters).some(Boolean) || list.state.q ? 'No items match the current filters.' : 'Run reconciliation to match custodian submissions against the internal book.'}
          />
        </Panel>

        <div className="grid gap-4">
          <Panel>
            <PanelHeader title="Status distribution" description="Live items across all batches" />
            <PanelBody>
              <ReconStatusChart items={ITEM_STATUSES.map((x) => ({ label: RECON_STATUS_LABELS[x], value: s?.counts[x] ?? 0, color: STATUS_COLORS[x]! }))} />
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="How matching works" />
            <PanelBody>
              <ul className="grid gap-2.5 text-[12px] leading-relaxed text-ink-2">
                <li>A trade reference alone is not a match: quantity, price (±0.0001), currency and settlement date must also agree.</li>
                <li>Each internal trade is matched to one custodian record. Trades with no custodian record surface as internal-only items.</li>
                <li>Day-end cash and holdings value (±0.10%) and trade count are compared with current holdings, not a historical snapshot.</li>
                <li>Re-running is safe: items update in place and are never duplicated. Internal data is never changed.</li>
              </ul>
            </PanelBody>
          </Panel>
        </div>
      </div>

      <ReconItemSheet id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

export default function ReconciliationPage() {
  return (
    <React.Suspense fallback={null}>
      <Workspace />
    </React.Suspense>
  );
}
