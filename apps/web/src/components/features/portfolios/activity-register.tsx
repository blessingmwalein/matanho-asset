'use client';

import * as React from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeftRight } from 'lucide-react';
import {
  P,
  SIDES,
  SIMPLIFIED_VALUATION_NOTICE,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
  formatDate,
  formatDateTime,
  formatMoney,
  formatPrice,
  formatQuantity,
  titleCase,
} from '@nexus/shared';
import { api, type Paged } from '@/lib/api';
import { useCan } from '@/lib/session';
import { useListState } from '@/lib/use-list-state';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { inputBase } from '@/components/ui/input';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { ActivityTimeline, DetailSection } from '@/components/nx/blocks';
import { DataTable } from '@/components/nx/data-table';
import { FilterBar, FilterSelect, SearchInput } from '@/components/nx/filters';
import { InfoList, InfoRow, PageHeader, Panel, PanelSkeleton } from '@/components/nx/layout';
import { StatusIndicator, TransactionStatus } from '@/components/nx/status';
import { TransactionDialog } from './transaction-dialog';
import type { PortfolioOption, TxnRow } from './types';

interface TxnDetail extends TxnRow {
  audit: Array<{ id: string; action: string; actor: string | null; at: string }>;
}

function DateFilter({ label, value, onChange }: { label: string; value: string | undefined; onChange: (v: string | undefined) => void }) {
  return (
    <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
      {label}:
      <input type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} aria-label={label} className={cn(inputBase, 'num h-9 w-[150px] px-2.5 text-[12.5px] text-foreground')} />
    </label>
  );
}

export function ActivityRegister({ initialPortfolioId }: { initialPortfolioId?: string }) {
  const can = useCan();
  const [recording, setRecording] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const list = useListState({ sort: 'tradeDate', filters: { portfolioId: initialPortfolioId } });
  const query = useQuery({
    queryKey: ['transactions', list.params],
    queryFn: () => api<Paged<TxnRow>>('/transactions', { query: list.params }),
    placeholderData: keepPreviousData,
  });
  const portfolios = useQuery({ queryKey: ['portfolio-options'], queryFn: () => api<PortfolioOption[]>('/portfolios/options'), staleTime: 60_000 });

  const columns = React.useMemo<ColumnDef<TxnRow>[]>(
    () => [
      {
        id: 'ref',
        header: 'Reference',
        meta: { sortKey: 'tradeReference' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="num font-semibold">{row.original.tradeReference ?? row.original.ref}</div>
            {row.original.tradeReference && <div className="num text-[11px] text-muted-foreground">{row.original.ref}</div>}
          </div>
        ),
      },
      {
        id: 'portfolio',
        header: 'Portfolio',
        meta: { sortKey: 'portfolio' },
        cell: ({ row }) => (
          <Link href={`/internal/portfolios/${row.original.portfolio.id}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:text-primary hover:underline">
            {row.original.portfolio.ref}
          </Link>
        ),
      },
      {
        id: 'security',
        header: 'Security',
        meta: { sortKey: 'security' },
        cell: ({ row }) => (row.original.security ? <span className="font-semibold">{row.original.security.ticker}</span> : <span className="text-ink-3">Cash</span>),
      },
      { id: 'type', header: 'Type', meta: { sortKey: 'type' }, cell: ({ row }) => <span className="text-ink-2">{TRANSACTION_TYPE_LABELS[row.original.type]}</span> },
      {
        id: 'side',
        header: 'Side',
        meta: { sortKey: 'side' },
        cell: ({ row }) => (row.original.side ? <StatusIndicator tone={row.original.side === 'BUY' ? 'info' : 'warning'}>{titleCase(row.original.side)}</StatusIndicator> : <span className="text-ink-3">—</span>),
      },
      { id: 'qty', header: 'Quantity', meta: { sortKey: 'quantity', align: 'right' }, cell: ({ row }) => (row.original.type === 'TRADE' ? formatQuantity(row.original.quantity) : '—') },
      { id: 'price', header: 'Price', meta: { sortKey: 'price', align: 'right' }, cell: ({ row }) => (row.original.type === 'TRADE' ? formatPrice(row.original.price) : '—') },
      { id: 'amount', header: 'Amount', meta: { sortKey: 'amount', align: 'right' }, cell: ({ row }) => <span className="font-semibold">{formatMoney(row.original.amount, row.original.currency)}</span> },
      { id: 'date', header: 'Trade date', meta: { sortKey: 'tradeDate' }, cell: ({ row }) => <span className="num">{formatDate(row.original.tradeDate)}</span> },
      { id: 'notes', header: 'Notes', cell: ({ row }) => <span className="block max-w-[200px] truncate text-muted-foreground" title={row.original.notes ?? undefined}>{row.original.notes ?? '—'}</span> },
      { id: 'status', header: 'Status', meta: { sortKey: 'status' }, cell: ({ row }) => <TransactionStatus status={row.original.status} /> },
    ],
    [],
  );

  const f = list.state.filters;
  const hasFilters = !!(list.state.q || f.portfolioId || f.type || f.side || f.status || f.from || f.to);

  return (
    <>
      <PageHeader
        eyebrow="Investments"
        title="Investment Activity"
        description="Trades and cash events across all portfolios. Completed transactions update holdings and the portfolio valuation."
        actions={
          can(P.TRANSACTIONS_RECORD) ? (
            <Button variant="primary" onClick={() => setRecording(true)}>
              <ArrowLeftRight /> Record transaction
            </Button>
          ) : undefined
        }
      />
      <Panel>
        <FilterBar right={hasFilters ? <Button variant="tertiary" size="sm" onClick={list.reset}>Clear filters</Button> : undefined}>
          <SearchInput value={list.state.q} onChange={list.setQ} placeholder="Search reference, security, portfolio, broker…" />
          <FilterSelect label="Portfolio" value={f.portfolioId} onChange={(v) => list.setFilter('portfolioId', v)} options={(portfolios.data ?? []).map((p) => ({ value: p.id, label: `${p.ref} · ${p.name}` }))} />
          <FilterSelect label="Type" value={f.type} onChange={(v) => list.setFilter('type', v)} options={TRANSACTION_TYPES.map((t) => ({ value: t, label: TRANSACTION_TYPE_LABELS[t] }))} />
          <FilterSelect label="Side" value={f.side} onChange={(v) => list.setFilter('side', v)} options={SIDES.map((s) => ({ value: s, label: titleCase(s) }))} />
          <FilterSelect label="Status" value={f.status} onChange={(v) => list.setFilter('status', v)} options={TRANSACTION_STATUSES.map((s) => ({ value: s, label: titleCase(s) }))} />
          <DateFilter label="From" value={f.from} onChange={(v) => list.setFilter('from', v)} />
          <DateFilter label="To" value={f.to} onChange={(v) => list.setFilter('to', v)} />
        </FilterBar>
        <DataTable
          columns={columns}
          data={query.data?.data}
          loading={query.isFetching}
          error={query.error ? (query.error as Error).message : null}
          onRetry={() => query.refetch()}
          meta={query.data?.meta}
          onPageChange={list.setPage}
          onPageSizeChange={list.setPageSize}
          sort={list.state.sort}
          order={list.state.order}
          onSort={list.onSort}
          onRowClick={(r) => setOpenId(r.id)}
          activeId={openId ?? undefined}
          emptyTitle="No transactions"
          emptyDescription="No transactions match the current search or filters."
          emptyAction={can(P.TRANSACTIONS_RECORD) ? <Button variant="secondary" size="sm" onClick={() => setRecording(true)}>Record transaction</Button> : undefined}
          footer={<div className="border-t border-border bg-surface-2 px-3 py-2.5 text-[11.5px] text-muted-foreground">{SIMPLIFIED_VALUATION_NOTICE}</div>}
        />
      </Panel>
      <TransactionDialog open={recording} onOpenChange={setRecording} />
      <TransactionSheet id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function TransactionSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useQuery({ queryKey: ['transaction', id], queryFn: () => api<TxnDetail>(`/transactions/${id}`), enabled: !!id });
  const t = q.data;
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      {id && (
        <SheetContent eyebrow="Investment transaction" title={t ? t.tradeReference ?? t.ref : 'Transaction'} description={t ? `${t.ref} · ${TRANSACTION_TYPE_LABELS[t.type]}` : undefined}>
          {!t ? (
            <PanelSkeleton rows={6} />
          ) : (
            <>
              <DetailSection title="Details">
                <InfoList>
                  <InfoRow label="Portfolio">
                    <Link href={`/internal/portfolios/${t.portfolio.id}`} className="text-primary hover:underline">
                      {t.portfolio.ref} · {t.portfolio.name}
                    </Link>
                  </InfoRow>
                  <InfoRow label="Security">{t.security ? `${t.security.ticker} · ${t.security.name}` : 'Cash'}</InfoRow>
                  <InfoRow label="Type">{TRANSACTION_TYPE_LABELS[t.type]}{t.side ? ` · ${titleCase(t.side)}` : ''}</InfoRow>
                  {t.type === 'TRADE' && <InfoRow label="Quantity" mono>{formatQuantity(t.quantity)}</InfoRow>}
                  {t.type === 'TRADE' && <InfoRow label="Price" mono>{formatPrice(t.price)}</InfoRow>}
                  <InfoRow label="Amount" mono>{formatMoney(t.amount, t.currency)}</InfoRow>
                  <InfoRow label="Trade date" mono>{formatDate(t.tradeDate)}</InfoRow>
                  <InfoRow label="Settlement" mono>{formatDate(t.settlementDate)}</InfoRow>
                  <InfoRow label="Broker">{t.broker}</InfoRow>
                  <InfoRow label="Status"><TransactionStatus status={t.status} /></InfoRow>
                  <InfoRow label="Notes">{t.notes}</InfoRow>
                </InfoList>
              </DetailSection>
              <DetailSection title="Audit trail" description="Recorded changes for this transaction.">
                <ActivityTimeline items={t.audit.map((a) => ({ id: a.id, title: titleCase(a.action), at: a.at, actor: a.actor }))} empty="No audit events." />
              </DetailSection>
            </>
          )}
        </SheetContent>
      )}
    </Sheet>
  );
}
