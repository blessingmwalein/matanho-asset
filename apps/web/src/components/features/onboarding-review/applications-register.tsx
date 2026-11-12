'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABELS, INVESTOR_TYPE_LABELS, formatDate, type ApplicationStatus } from '@nexus/shared';
import { api, type Paged } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useListState } from '@/lib/use-list-state';
import { DataTable } from '@/components/nx/data-table';
import { FilterBar, SearchInput } from '@/components/nx/filters';
import { KpiStrip, PageHeader, Panel } from '@/components/nx/layout';
import { ApplicationStatus as ApplicationStatusLabel, Tag } from '@/components/nx/status';
import type { ApplicationRow, ApplicationSummary } from './types';

export function ApplicationsRegister() {
  const router = useRouter();
  const list = useListState({ sort: 'lastSavedAt' });
  const status = list.state.filters.status as ApplicationStatus | undefined;

  const summary = useQuery({ queryKey: ['application-summary'], queryFn: () => api<ApplicationSummary>('/applications/summary'), refetchInterval: 30_000 });
  const query = useQuery({
    queryKey: ['applications', list.params],
    queryFn: () => api<Paged<ApplicationRow>>('/applications', { query: list.params }),
    placeholderData: keepPreviousData,
  });

  const columns = React.useMemo<ColumnDef<ApplicationRow>[]>(
    () => [
      {
        id: 'legalName',
        header: 'Applicant',
        meta: { sortKey: 'legalName' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-semibold">{row.original.legalName ?? 'Unnamed applicant'}</div>
            <div className="num text-[11px] text-muted-foreground">{row.original.reference}</div>
          </div>
        ),
      },
      { id: 'type', header: 'Type', cell: ({ row }) => <span className="text-ink-2">{row.original.investorType ? INVESTOR_TYPE_LABELS[row.original.investorType] : '—'}</span> },
      { id: 'country', header: 'Country', meta: { sortKey: 'country' }, cell: ({ row }) => row.original.country ?? '—' },
      { id: 'status', header: 'Status', meta: { sortKey: 'status' }, cell: ({ row }) => <ApplicationStatusLabel status={row.original.status} /> },
      {
        id: 'readiness',
        header: 'Readiness',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-sunken">
              <div className={cn('h-full rounded-full', row.original.missingCount === 0 ? 'bg-success' : 'bg-warning')} style={{ width: `${row.original.readinessScore}%` }} />
            </div>
            <span className="num text-[11.5px] text-muted-foreground">{row.original.missingCount === 0 ? 'Complete' : `${row.original.missingCount} open`}</span>
          </div>
        ),
      },
      {
        id: 'flags',
        header: 'Risk flags',
        cell: ({ row }) => (row.original.riskFlags.length ? <Tag tone="warning">{row.original.riskFlags.length} flag{row.original.riskFlags.length > 1 ? 's' : ''}</Tag> : <span className="text-ink-3">None</span>),
      },
      { id: 'reviewer', header: 'Reviewer', cell: ({ row }) => row.original.assignedReviewer ?? <span className="text-ink-3">Unassigned</span> },
      { id: 'submittedAt', header: 'Submitted', meta: { sortKey: 'submittedAt' }, cell: ({ row }) => <span className="num">{formatDate(row.original.submittedAt)}</span> },
    ],
    [],
  );

  const s = summary.data;
  const chips: Array<{ value: ApplicationStatus | undefined; label: string; count?: number }> = [
    { value: undefined, label: 'All', count: s?.total },
    ...APPLICATION_STATUSES.map((st) => ({ value: st, label: APPLICATION_STATUS_LABELS[st], count: s?.byStatus[st] })),
  ];

  return (
    <>
      <PageHeader eyebrow="Investors" title="Onboarding & KYC" description="Review submitted investor applications, request information and make approval decisions. Approvals are always a human decision." />
      <KpiStrip
        className="mb-4"
        items={[
          { label: 'Awaiting review', value: s ? s.byStatus.SUBMITTED + s.byStatus.RESUBMITTED : '—', hint: 'Submitted or resubmitted', loading: !s },
          { label: 'Under review', value: s?.byStatus.UNDER_REVIEW ?? '—', hint: 'Assigned to a reviewer', loading: !s },
          { label: 'Awaiting applicant', value: s?.byStatus.INFORMATION_REQUESTED ?? '—', hint: 'Information requested', loading: !s },
          { label: 'Approved', value: s?.byStatus.APPROVED ?? '—', hint: 'Investor records created', loading: !s },
          { label: 'Rejected', value: s?.byStatus.REJECTED ?? '—', hint: 'Can be reopened', loading: !s },
        ]}
      />
      <Panel>
        <FilterBar>
          <SearchInput value={list.state.q} onChange={list.setQ} placeholder="Search reference, name, email, country…" />
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by status">
            {chips.map((c) => {
              const active = status === c.value;
              return (
                <button
                  key={c.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => list.setFilter('status', c.value)}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-semibold transition-colors',
                    active ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-ink-2 hover:bg-surface-2',
                  )}
                >
                  {c.label}
                  {c.count !== undefined && <span className="num text-[11px] opacity-70">{c.count}</span>}
                </button>
              );
            })}
          </div>
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
          onRowClick={(r) => router.push(`/internal/onboarding/${r.id}`)}
          emptyTitle="No applications"
          emptyDescription="No applications match the current search or status filter."
        />
      </Panel>
    </>
  );
}
