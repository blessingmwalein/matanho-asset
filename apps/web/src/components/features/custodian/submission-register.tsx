'use client';

import * as React from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { formatDate, formatDateTime, RECON_STATUSES, RECON_STATUS_LABELS, type ReconStatus } from '@nexus/shared';
import { api, type Paged } from '@/lib/api';
import { useListState } from '@/lib/use-list-state';
import { DataTable } from '@/components/nx/data-table';
import { FilterBar, FilterSelect, SearchInput } from '@/components/nx/filters';
import { ReconStatusLabel, StatusIndicator, Tag } from '@/components/nx/status';
import { cn } from '@/lib/utils';
import { referenceOf, summaryOf, type AccountOption, type SubmissionRow } from './types';

interface InternalOptions {
  custodians: Array<{ id: string; name: string }>;
  accounts: Array<{ id: string; accountNumber: string; name: string; custodianOrgId: string }>;
}

const KIND_OPTIONS = [
  { value: 'EXECUTION', label: 'Trade execution' },
  { value: 'DAY_END', label: 'Day-end package' },
];

const dateInput = 'h-9 rounded-md border border-input bg-surface px-2.5 text-[12.5px] outline-none hover:border-[#c9c5bb] focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/12';

/**
 * Submission register used by both portals: the custodian's own history (`custodian` mode, scoped by the API to
 * their organisation) and the internal register of every custodian (`internal` mode).
 */
export function SubmissionRegister({
  mode,
  accounts,
  onOpen,
  activeId,
  initialFilters,
  initialQuery,
  className,
}: {
  mode: 'custodian' | 'internal';
  accounts?: AccountOption[];
  onOpen: (row: SubmissionRow) => void;
  activeId?: string;
  initialFilters?: Record<string, string | undefined>;
  initialQuery?: string;
  className?: string;
}) {
  const internal = mode === 'internal';
  const list = useListState({ sort: 'createdAt', pageSize: 10, filters: initialFilters });
  const base = internal ? '/custodian-submissions' : '/custodian/submissions';
  const { setQ } = list;
  React.useEffect(() => {
    if (initialQuery) setQ(initialQuery);
  }, [initialQuery, setQ]);

  const options = useQuery({ queryKey: ['custodian', 'options'], queryFn: () => api<InternalOptions>('/custodian-submissions/options'), enabled: internal, staleTime: 5 * 60_000 });
  const q = useQuery({
    queryKey: ['custodian', mode, 'list', list.params],
    queryFn: () => api<Paged<SubmissionRow>>(base, { query: list.params }),
    placeholderData: keepPreviousData,
  });

  const accountOptions = internal
    ? (options.data?.accounts ?? []).filter((a) => !list.state.filters.custodianId || a.custodianOrgId === list.state.filters.custodianId).map((a) => ({ value: a.id, label: a.accountNumber }))
    : (accounts ?? []).map((a) => ({ value: a.id, label: a.accountNumber }));

  const columns = React.useMemo<ColumnDef<SubmissionRow, any>[]>(() => {
    const cols: ColumnDef<SubmissionRow, any>[] = [
      {
        id: 'ref',
        header: 'Reference',
        meta: { sortKey: 'ref' },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="min-w-[150px]">
              <div className="font-semibold">{referenceOf(r)}</div>
              <div className="num text-[11px] text-muted-foreground">
                {r.ref}
                {r.version > 1 && <span> · v{r.version}</span>}
              </div>
            </div>
          );
        },
      },
      {
        id: 'type',
        header: 'Type',
        cell: ({ row }) => (
          <div>
            <div>{row.original.kind === 'EXECUTION' ? 'Execution' : 'Day-end'}</div>
            <div className="max-w-[240px] truncate text-[11px] text-muted-foreground">{summaryOf(row.original)}</div>
          </div>
        ),
      },
      ...(internal
        ? ([{ id: 'custodian', header: 'Custodian', cell: ({ row }) => <span className="whitespace-nowrap">{row.original.custodian.name}</span> }] as ColumnDef<SubmissionRow, any>[])
        : []),
      {
        id: 'account',
        header: 'Account',
        meta: { sortKey: 'account' },
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.account.accountNumber}</div>
            {row.original.portfolio && <div className="max-w-[170px] truncate text-[11px] text-muted-foreground">{row.original.portfolio.name}</div>}
          </div>
        ),
      },
      {
        id: 'date',
        header: 'Date',
        meta: { sortKey: 'date' },
        cell: ({ row }) => <span className="num whitespace-nowrap">{row.original.kind === 'EXECUTION' ? formatDateTime(row.original.date) : formatDate(row.original.date)}</span>,
      },
      { id: 'submittedBy', header: 'Submitted by', meta: { sortKey: 'submittedBy' }, cell: ({ row }) => <span className="whitespace-nowrap">{row.original.submittedByName ?? '—'}</span> },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) =>
          row.original.isCurrent ? <StatusIndicator tone="info">Submitted</StatusIndicator> : <Tag>Superseded</Tag>,
      },
      { id: 'file', header: 'File', cell: ({ row }) => <span className="block max-w-[150px] truncate text-[12px] text-muted-foreground">{row.original.fileName ?? '—'}</span> },
      { id: 'recon', header: 'Reconciliation', meta: { sortKey: 'reconStatus' }, cell: ({ row }) => <ReconStatusLabel status={row.original.reconStatus} /> },
    ];
    return cols;
  }, [internal]);

  return (
    <div className={cn('min-w-0', className)}>
      <FilterBar>
        <SearchInput value={list.state.q} onChange={list.setQ} placeholder={internal ? 'Search reference, ticker, account, custodian…' : 'Search reference, ticker, account…'} />
        {internal && (
          <FilterSelect
            label="Custodian"
            value={list.state.filters.custodianId}
            onChange={(v) => {
              list.setFilter('custodianId', v);
              list.setFilter('accountId', undefined);
            }}
            options={(options.data?.custodians ?? []).map((c) => ({ value: c.id, label: c.name }))}
          />
        )}
        <FilterSelect label="Account" value={list.state.filters.accountId} onChange={(v) => list.setFilter('accountId', v)} options={accountOptions} />
        <FilterSelect label="Type" value={list.state.filters.kind} onChange={(v) => list.setFilter('kind', v)} options={KIND_OPTIONS} />
        <FilterSelect
          label="Reconciliation"
          value={list.state.filters.reconStatus}
          onChange={(v) => list.setFilter('reconStatus', v)}
          options={RECON_STATUSES.map((s: ReconStatus) => ({ value: s, label: RECON_STATUS_LABELS[s] }))}
        />
        {internal && (
          <>
            <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              From
              <input type="date" aria-label="From date" className={dateInput} value={list.state.filters.from ?? ''} onChange={(e) => list.setFilter('from', e.target.value || undefined)} />
            </label>
            <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              To
              <input type="date" aria-label="To date" className={dateInput} value={list.state.filters.to ?? ''} onChange={(e) => list.setFilter('to', e.target.value || undefined)} />
            </label>
          </>
        )}
        {(list.state.q || Object.values(list.state.filters).some(Boolean)) && (
          <button type="button" onClick={list.reset} className="text-[12px] font-semibold text-primary hover:underline">
            Clear filters
          </button>
        )}
      </FilterBar>
      <DataTable
        columns={columns}
        data={q.data?.data}
        loading={q.isFetching}
        error={q.error ? (q.error as Error).message : null}
        onRetry={() => void q.refetch()}
        meta={q.data?.meta}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        sort={list.state.sort}
        order={list.state.order}
        onSort={list.onSort}
        onRowClick={onOpen}
        activeId={activeId}
        emptyTitle={internal ? 'No custodian submissions match' : 'No submissions yet'}
        emptyDescription={internal ? 'Adjust the filters, or wait for a custodian to submit an execution or day-end package.' : 'Enter the first execution or day-end package from the other tabs.'}
      />
    </div>
  );
}
