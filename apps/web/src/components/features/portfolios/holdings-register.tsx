'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ASSET_CLASSES, ASSET_CLASS_LABELS, HOLDING_STATUSES, SIMPLIFIED_VALUATION_NOTICE, formatDate, formatMoney, formatPercent, formatPrice, formatQuantity, titleCase } from '@nexus/shared';
import { api, type Paged } from '@/lib/api';
import { useListState } from '@/lib/use-list-state';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/nx/data-table';
import { FilterBar, FilterSelect, SearchInput } from '@/components/nx/filters';
import { PageHeader, Panel } from '@/components/nx/layout';
import { SimpleStatus, Tag } from '@/components/nx/status';
import type { HoldingRow, PortfolioOption } from './types';

type Row = HoldingRow;
interface HoldingsPage extends Paged<Row> {
  summary: { totalMarketValue: string; count: number };
}

export function HoldingsRegister({ initialPortfolioId }: { initialPortfolioId?: string }) {
  const router = useRouter();
  const list = useListState({ sort: 'marketValue', filters: { portfolioId: initialPortfolioId } });
  const query = useQuery({
    queryKey: ['holdings', list.params],
    queryFn: () => api<HoldingsPage>('/holdings', { query: list.params }),
    placeholderData: keepPreviousData,
  });
  const portfolios = useQuery({ queryKey: ['portfolio-options'], queryFn: () => api<PortfolioOption[]>('/portfolios/options'), staleTime: 60_000 });

  const columns = React.useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: 'ticker',
        header: 'Security',
        meta: { sortKey: 'ticker' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="font-semibold">{row.original.security.ticker}</div>
            <div className="max-w-[240px] truncate text-[11px] text-muted-foreground">{row.original.security.name}</div>
          </div>
        ),
      },
      { id: 'class', header: 'Class', meta: { sortKey: 'assetClass' }, cell: ({ row }) => <span className="text-ink-2">{ASSET_CLASS_LABELS[row.original.security.assetClass]}</span> },
      {
        id: 'portfolio',
        header: 'Portfolio',
        meta: { sortKey: 'portfolio' },
        cell: ({ row }) =>
          row.original.portfolio ? (
            <div className="min-w-0">
              <Link href={`/internal/portfolios/${row.original.portfolio.id}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:text-primary hover:underline">
                {row.original.portfolio.name}
              </Link>
              <div className="num text-[11px] text-muted-foreground">{row.original.portfolio.ref}</div>
            </div>
          ) : (
            '—'
          ),
      },
      { id: 'qty', header: 'Quantity', meta: { sortKey: 'quantity', align: 'right' }, cell: ({ row }) => formatQuantity(row.original.quantity) },
      { id: 'price', header: 'Price', meta: { sortKey: 'currentPrice', align: 'right' }, cell: ({ row }) => formatPrice(row.original.currentPrice) },
      { id: 'mv', header: 'Market value', meta: { sortKey: 'marketValue', align: 'right' }, cell: ({ row }) => <span className="font-semibold">{formatMoney(row.original.marketValue, row.original.currency)}</span> },
      { id: 'w', header: 'Portfolio weight', meta: { align: 'right' }, cell: ({ row }) => formatPercent(row.original.allocationPct, 1) },
      { id: 'vd', header: 'Valued', meta: { sortKey: 'valuationDate' }, cell: ({ row }) => <span className="num text-ink-2">{formatDate(row.original.valuationDate)}</span> },
      {
        id: 'status',
        header: 'Status',
        meta: { sortKey: 'status' },
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <SimpleStatus value={row.original.status} />
            {row.original.source === 'MANUAL' && <Tag>Manual</Tag>}
          </div>
        ),
      },
    ],
    [],
  );

  const f = list.state.filters;
  const hasFilters = !!(list.state.q || f.portfolioId || f.assetClass || f.status);

  return (
    <>
      <PageHeader eyebrow="Investments" title="Holdings" description="All positions across portfolios. Open a portfolio to add, edit or confirm draft holdings." />
      <Panel>
        <FilterBar right={hasFilters ? <Button variant="tertiary" size="sm" onClick={list.reset}>Clear filters</Button> : undefined}>
          <SearchInput value={list.state.q} onChange={list.setQ} placeholder="Search security, portfolio, investor…" />
          <FilterSelect label="Portfolio" value={f.portfolioId} onChange={(v) => list.setFilter('portfolioId', v)} options={(portfolios.data ?? []).map((p) => ({ value: p.id, label: `${p.ref} · ${p.name}` }))} />
          <FilterSelect label="Asset class" value={f.assetClass} onChange={(v) => list.setFilter('assetClass', v)} options={ASSET_CLASSES.map((a) => ({ value: a, label: ASSET_CLASS_LABELS[a] }))} />
          <FilterSelect label="Status" value={f.status} onChange={(v) => list.setFilter('status', v)} options={HOLDING_STATUSES.map((s) => ({ value: s, label: titleCase(s) }))} />
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
          onRowClick={(r) => router.push(`/internal/portfolios/${r.portfolioId}`)}
          emptyTitle="No holdings"
          emptyDescription="No holdings match the current search or filters."
          footer={
            query.data ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-2 px-3 py-2.5 text-[12px]">
                <span className="max-w-[560px] text-muted-foreground">{SIMPLIFIED_VALUATION_NOTICE}</span>
                <span className="num font-semibold">
                  {query.data.summary.count.toLocaleString('en-US')} position(s) · {formatMoney(query.data.summary.totalMarketValue, 'USD')}
                </span>
              </div>
            ) : undefined
          }
        />
      </Panel>
    </>
  );
}
