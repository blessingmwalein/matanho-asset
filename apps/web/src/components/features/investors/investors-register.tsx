'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { INVESTOR_STATUSES, INVESTOR_TYPES, INVESTOR_TYPE_LABELS, KYC_STATUSES, KYC_STATUS_LABELS, formatCompactMoney, titleCase } from '@nexus/shared';
import { api, type Paged } from '@/lib/api';
import { useListState } from '@/lib/use-list-state';
import { FilterBar, FilterSelect, SearchInput } from '@/components/nx/filters';
import { DataTable } from '@/components/nx/data-table';
import { PageHeader, Panel } from '@/components/nx/layout';
import { KycStatus, SimpleStatus } from '@/components/nx/status';
import { Button } from '@/components/ui/button';
import type { InvestorRow } from './types';

const COUNTRIES = ['Zimbabwe', 'South Africa', 'Zambia', 'Botswana', 'Mauritius', 'Kenya', 'United Kingdom', 'United States'];

export function InvestorsRegister({ initialKyc }: { initialKyc?: string }) {
  const router = useRouter();
  const list = useListState({ sort: 'createdAt', filters: { kycStatus: initialKyc } });
  const query = useQuery({
    queryKey: ['investors', list.params],
    queryFn: () => api<Paged<InvestorRow>>('/investors', { query: list.params }),
    placeholderData: keepPreviousData,
  });

  const columns = React.useMemo<ColumnDef<InvestorRow>[]>(
    () => [
      {
        id: 'legalName',
        header: 'Investor',
        meta: { sortKey: 'legalName' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-semibold">{row.original.legalName}</div>
            <div className="num text-[11px] text-muted-foreground">{row.original.ref}</div>
          </div>
        ),
      },
      { id: 'investorType', header: 'Type', meta: { sortKey: 'investorType' }, cell: ({ row }) => <span className="text-ink-2">{INVESTOR_TYPE_LABELS[row.original.investorType]}</span> },
      { id: 'country', header: 'Country', meta: { sortKey: 'country' }, cell: ({ row }) => row.original.country },
      { id: 'kycStatus', header: 'KYC', meta: { sortKey: 'kycStatus' }, cell: ({ row }) => <KycStatus status={row.original.kycStatus} /> },
      { id: 'portfolioCount', header: 'Portfolios', meta: { sortKey: 'portfolioCount', align: 'right' }, cell: ({ row }) => row.original.portfolioCount },
      {
        id: 'totalPortfolioValue',
        header: 'Portfolio value',
        meta: { align: 'right' },
        cell: ({ row }) => <span className="font-semibold">{formatCompactMoney(row.original.totalPortfolioValue, row.original.baseCurrency)}</span>,
      },
      { id: 'relationshipManager', header: 'Relationship manager', meta: { sortKey: 'relationshipManager' }, cell: ({ row }) => row.original.relationshipManager ?? <span className="text-ink-3">Unassigned</span> },
      { id: 'status', header: 'Status', meta: { sortKey: 'status' }, cell: ({ row }) => <SimpleStatus value={row.original.status} /> },
    ],
    [],
  );

  const f = list.state.filters;
  const hasFilters = !!(list.state.q || f.kycStatus || f.status || f.investorType || f.country);

  return (
    <>
      <PageHeader
        eyebrow="Investors"
        title="Investor Register"
        description="Approved investor relationships with KYC status, mandates and relationship ownership."
        actions={
          <Button variant="secondary" onClick={() => router.push('/internal/onboarding')}>
            Onboarding queue
          </Button>
        }
      />
      <Panel>
        <FilterBar right={hasFilters ? <Button variant="tertiary" size="sm" onClick={list.reset}>Clear filters</Button> : undefined}>
          <SearchInput value={list.state.q} onChange={list.setQ} placeholder="Search name, reference, email, country…" />
          <FilterSelect label="KYC" value={f.kycStatus} onChange={(v) => list.setFilter('kycStatus', v)} options={KYC_STATUSES.map((s) => ({ value: s, label: KYC_STATUS_LABELS[s] }))} />
          <FilterSelect label="Status" value={f.status} onChange={(v) => list.setFilter('status', v)} options={INVESTOR_STATUSES.map((s) => ({ value: s, label: titleCase(s) }))} />
          <FilterSelect label="Type" value={f.investorType} onChange={(v) => list.setFilter('investorType', v)} options={INVESTOR_TYPES.map((s) => ({ value: s, label: INVESTOR_TYPE_LABELS[s] }))} />
          <FilterSelect label="Country" value={f.country} onChange={(v) => list.setFilter('country', v)} options={COUNTRIES.map((c) => ({ value: c, label: c }))} />
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
          onRowClick={(r) => router.push(`/internal/investors/${r.id}`)}
          emptyTitle="No investors found"
          emptyDescription="No investors match the current search or filters. Approved onboarding applications appear here."
        />
      </Panel>
    </>
  );
}
