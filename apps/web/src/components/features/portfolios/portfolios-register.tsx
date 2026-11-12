'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { P, PORTFOLIO_STATUSES, PORTFOLIO_TYPES, PORTFOLIO_TYPE_LABELS, formatDate, formatMoney, titleCase } from '@nexus/shared';
import { api, type Paged } from '@/lib/api';
import { useCan } from '@/lib/session';
import { useListState } from '@/lib/use-list-state';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/nx/data-table';
import { FilterBar, FilterSelect, SearchInput } from '@/components/nx/filters';
import { PageHeader, Panel } from '@/components/nx/layout';
import { SimpleStatus } from '@/components/nx/status';
import type { InvestorOption } from '@/components/features/investors/types';
import { CreatePortfolioDialog } from './create-portfolio-dialog';
import type { PortfolioRow } from './types';

export function PortfoliosRegister() {
  const router = useRouter();
  const can = useCan();
  const [creating, setCreating] = React.useState(false);
  const list = useListState({ sort: 'createdAt' });
  const query = useQuery({
    queryKey: ['portfolios', list.params],
    queryFn: () => api<Paged<PortfolioRow>>('/portfolios', { query: list.params }),
    placeholderData: keepPreviousData,
  });
  const investors = useQuery({ queryKey: ['investor-options'], queryFn: () => api<InvestorOption[]>('/investors/options'), staleTime: 60_000 });

  const columns = React.useMemo<ColumnDef<PortfolioRow>[]>(
    () => [
      {
        id: 'name',
        header: 'Portfolio',
        meta: { sortKey: 'name' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-semibold">{row.original.name}</div>
            <div className="num text-[11px] text-muted-foreground">{row.original.ref}</div>
          </div>
        ),
      },
      { id: 'investor', header: 'Investor', meta: { sortKey: 'investor' }, cell: ({ row }) => row.original.investor.legalName },
      { id: 'type', header: 'Type', meta: { sortKey: 'type' }, cell: ({ row }) => <span className="text-ink-2">{PORTFOLIO_TYPE_LABELS[row.original.type]}</span> },
      { id: 'currency', header: 'Currency', cell: ({ row }) => row.original.baseCurrency },
      { id: 'manager', header: 'Manager', cell: ({ row }) => row.original.manager ?? <span className="text-ink-3">Unassigned</span> },
      { id: 'benchmark', header: 'Benchmark', cell: ({ row }) => <span className="block max-w-[200px] truncate text-ink-2">{row.original.benchmark ?? '—'}</span> },
      { id: 'inception', header: 'Inception', meta: { sortKey: 'inceptionDate' }, cell: ({ row }) => <span className="num">{formatDate(row.original.inceptionDate)}</span> },
      { id: 'value', header: 'Current value', meta: { align: 'right' }, cell: ({ row }) => <span className="font-semibold">{formatMoney(row.original.currentValue, row.original.baseCurrency, { decimals: 0 })}</span> },
      { id: 'status', header: 'Status', meta: { sortKey: 'status' }, cell: ({ row }) => <SimpleStatus value={row.original.status} /> },
    ],
    [],
  );

  const f = list.state.filters;
  const hasFilters = !!(list.state.q || f.investorId || f.status || f.type);

  return (
    <>
      <PageHeader
        eyebrow="Investments"
        title="Portfolios"
        description="Every investor mandate with its current value, manager and benchmark. Values are the sum of holdings (simplified valuation)."
        actions={
          can(P.PORTFOLIOS_MANAGE) ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus /> Create portfolio
            </Button>
          ) : undefined
        }
      />
      <Panel>
        <FilterBar right={hasFilters ? <Button variant="tertiary" size="sm" onClick={list.reset}>Clear filters</Button> : undefined}>
          <SearchInput value={list.state.q} onChange={list.setQ} placeholder="Search portfolio, reference, investor…" />
          <FilterSelect label="Investor" value={f.investorId} onChange={(v) => list.setFilter('investorId', v)} options={(investors.data ?? []).map((i) => ({ value: i.id, label: i.name }))} />
          <FilterSelect label="Type" value={f.type} onChange={(v) => list.setFilter('type', v)} options={PORTFOLIO_TYPES.map((t) => ({ value: t, label: PORTFOLIO_TYPE_LABELS[t] }))} />
          <FilterSelect label="Status" value={f.status} onChange={(v) => list.setFilter('status', v)} options={PORTFOLIO_STATUSES.map((s) => ({ value: s, label: titleCase(s) }))} />
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
          onRowClick={(r) => router.push(`/internal/portfolios/${r.id}`)}
          emptyTitle="No portfolios"
          emptyDescription="No portfolios match the current search or filters."
        />
      </Panel>
      <CreatePortfolioDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
