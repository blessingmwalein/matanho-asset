'use client';

import * as React from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { COMPANY_SUBMISSION_LABELS, COMPANY_SUBMISSION_STATUSES, formatDate, formatDateTime, type CompanySubmissionStatus as SubmissionStatusType } from '@nexus/shared';
import { api, type Paged } from '@/lib/api';
import { useListState } from '@/lib/use-list-state';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { DataTable } from '@/components/nx/data-table';
import { FilterBar, FilterSelect, SearchInput } from '@/components/nx/filters';
import { DetailSection } from '@/components/nx/blocks';
import { ErrorState, InfoList, InfoRow, PanelSkeleton } from '@/components/nx/layout';
import { CompanySubmissionStatus, StatusIndicator } from '@/components/nx/status';
import { CompletionBar } from './completion-bar';
import type { CompanyDetail, CompanyRow, SubmissionListRow } from './internal-types';

interface Options {
  companies: Array<{ id: string; name: string; sector: string | null }>;
  periods: string[];
  sectors: string[];
}

export function useCompanyOptions() {
  return useQuery({ queryKey: ['company-register', 'options'], queryFn: () => api<Options>('/company-submissions/options'), staleTime: 5 * 60_000 });
}

const STATUS_OPTIONS = COMPANY_SUBMISSION_STATUSES.map((s: SubmissionStatusType) => ({ value: s, label: COMPANY_SUBMISSION_LABELS[s] }));

/** Register of portfolio companies with their current reporting period. */
export function CompanyRegister({ onOpen, activeId }: { onOpen: (c: CompanyRow) => void; activeId?: string }) {
  const list = useListState({ sort: 'name', order: 'asc', pageSize: 10 });
  const options = useCompanyOptions();
  const q = useQuery({
    queryKey: ['company-register', 'companies', list.params],
    queryFn: () => api<Paged<CompanyRow>>('/companies', { query: list.params }),
    placeholderData: keepPreviousData,
  });

  const columns = React.useMemo<ColumnDef<CompanyRow, any>[]>(
    () => [
      {
        id: 'name',
        header: 'Company',
        meta: { sortKey: 'name' },
        cell: ({ row }) => (
          <div className="min-w-[170px]">
            <div className="font-semibold">{row.original.name}</div>
            <div className="num text-[11px] text-muted-foreground">{row.original.ref}</div>
          </div>
        ),
      },
      { id: 'sector', header: 'Sector', meta: { sortKey: 'sector' }, cell: ({ row }) => <span className="whitespace-nowrap">{row.original.sector ?? '—'}</span> },
      { id: 'country', header: 'Country', cell: ({ row }) => row.original.country ?? '—' },
      { id: 'fund', header: 'Fund', cell: ({ row }) => <span className="whitespace-nowrap">{row.original.fundName ?? '—'}</span> },
      {
        id: 'period',
        header: 'Current period',
        cell: ({ row }) =>
          row.original.currentPeriod ? (
            <div>
              <div className="font-medium">{row.original.currentPeriod.label}</div>
              <div className="num text-[11px] text-muted-foreground">Due {formatDate(row.original.currentPeriod.dueDate)}</div>
            </div>
          ) : (
            '—'
          ),
      },
      { id: 'status', header: 'Status', meta: { sortKey: 'status' }, cell: ({ row }) => (row.original.submission ? <CompanySubmissionStatus status={row.original.submission.status} /> : <span className="text-muted-foreground">No period</span>) },
      { id: 'completion', header: 'Completion', meta: { sortKey: 'completion' }, cell: ({ row }) => <CompletionBar pct={row.original.submission?.completionPct ?? 0} /> },
      {
        id: 'questions',
        header: 'Open questions',
        meta: { align: 'right' },
        cell: ({ row }) => (row.original.openQuestions > 0 ? <StatusIndicator tone="warning">{row.original.openQuestions}</StatusIndicator> : <span className="text-muted-foreground">0</span>),
      },
      { id: 'last', header: 'Last submission', meta: { sortKey: 'lastSubmittedAt' }, cell: ({ row }) => <span className="num whitespace-nowrap text-[12px]">{row.original.lastSubmittedAt ? formatDateTime(row.original.lastSubmittedAt) : '—'}</span> },
    ],
    [],
  );

  return (
    <div className="min-w-0">
      <FilterBar>
        <SearchInput value={list.state.q} onChange={list.setQ} placeholder="Search company, sector, country, fund…" />
        <FilterSelect label="Sector" value={list.state.filters.sector} onChange={(v) => list.setFilter('sector', v)} options={(options.data?.sectors ?? []).map((s) => ({ value: s, label: s }))} />
        <FilterSelect label="Status" value={list.state.filters.status} onChange={(v) => list.setFilter('status', v)} options={STATUS_OPTIONS} />
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
        emptyTitle="No portfolio companies"
        emptyDescription="No companies match the current search or filters."
      />
    </div>
  );
}

/** Company detail drawer: profile and reporting history with links to each review workspace. */
export function CompanySheet({ company, onClose }: { company: CompanyRow | null; onClose: () => void }) {
  const q = useQuery({ queryKey: ['company-register', 'detail', company?.id], queryFn: () => api<CompanyDetail>(`/companies/${company!.id}`), enabled: !!company });
  const d = q.data;
  return (
    <Sheet open={!!company} onOpenChange={(o) => !o && onClose()}>
      {company && (
        <SheetContent width="md" eyebrow="Portfolio company" title={company.name} description={`${company.ref}${company.sector ? ` · ${company.sector}` : ''}`}>
          {q.isLoading && <PanelSkeleton rows={6} />}
          {q.error && <ErrorState message={(q.error as Error).message} onRetry={() => void q.refetch()} />}
          {d && (
            <>
              <DetailSection title="Profile">
                <InfoList>
                  <InfoRow label="Legal name">{d.legalName ?? d.name}</InfoRow>
                  <InfoRow label="Country">{d.country ?? '—'}</InfoRow>
                  <InfoRow label="Investing fund">{d.fundName ?? '—'}</InfoRow>
                  <InfoRow label="Contact">{d.email ?? '—'}</InfoRow>
                  <InfoRow label="About">{d.description ?? '—'}</InfoRow>
                </InfoList>
              </DetailSection>
              <DetailSection title="Reporting history" description="Open a period to review the pack, evidence and questions.">
                <ul className="grid gap-2">
                  {d.periods.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2.5">
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-semibold">
                          {p.label} <span className="num font-normal text-muted-foreground">· due {formatDate(p.dueDate)}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-3">
                          <CompanySubmissionStatus status={p.status} />
                          <CompletionBar pct={p.completionPct} className="min-w-[90px]" />
                          {p.openQuestions > 0 && <span className="text-[11.5px] text-warning">{p.openQuestions} open question{p.openQuestions > 1 ? 's' : ''}</span>}
                        </div>
                      </div>
                      {p.submissionId ? (
                        <Button asChild size="sm" variant="secondary">
                          <Link href={`/internal/companies/submissions/${p.submissionId}`}>Review</Link>
                        </Button>
                      ) : (
                        <span className="text-[11.5px] text-muted-foreground">Not started</span>
                      )}
                    </li>
                  ))}
                </ul>
              </DetailSection>
            </>
          )}
        </SheetContent>
      )}
    </Sheet>
  );
}

/** Submissions register: one row per company reporting pack. */
export function SubmissionsRegister({ onOpen }: { onOpen: (s: SubmissionListRow) => void }) {
  const list = useListState({ sort: 'submittedAt', order: 'desc', pageSize: 10 });
  const options = useCompanyOptions();
  const q = useQuery({
    queryKey: ['company-register', 'submissions', list.params],
    queryFn: () => api<Paged<SubmissionListRow>>('/company-submissions', { query: list.params }),
    placeholderData: keepPreviousData,
  });

  const columns = React.useMemo<ColumnDef<SubmissionListRow, any>[]>(
    () => [
      {
        id: 'company',
        header: 'Company',
        meta: { sortKey: 'company' },
        cell: ({ row }) => (
          <div className="min-w-[170px]">
            <div className="font-semibold">{row.original.company.name}</div>
            <div className="num text-[11px] text-muted-foreground">{row.original.ref}</div>
          </div>
        ),
      },
      {
        id: 'period',
        header: 'Period',
        meta: { sortKey: 'period' },
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.period.label}</div>
            <div className="num text-[11px] text-muted-foreground">Due {formatDate(row.original.period.dueDate)}</div>
          </div>
        ),
      },
      { id: 'status', header: 'Status', meta: { sortKey: 'status' }, cell: ({ row }) => <CompanySubmissionStatus status={row.original.status} /> },
      { id: 'completion', header: 'Completion', meta: { sortKey: 'completion' }, cell: ({ row }) => <CompletionBar pct={row.original.completionPct} /> },
      {
        id: 'submitted',
        header: 'Submitted',
        meta: { sortKey: 'submittedAt' },
        cell: ({ row }) =>
          row.original.submittedAt ? (
            <div className="whitespace-nowrap">
              <div className="num text-[12px]">{formatDateTime(row.original.submittedAt)}</div>
              <div className="text-[11px] text-muted-foreground">
                {row.original.submittedByName} · v{row.original.version}
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground">Not submitted</span>
          ),
      },
      {
        id: 'questions',
        header: 'Open questions',
        meta: { align: 'right' },
        cell: ({ row }) => (row.original.openQuestions > 0 ? <StatusIndicator tone="warning">{row.original.openQuestions}</StatusIndicator> : <span className="text-muted-foreground">{row.original.answeredQuestions > 0 ? `${row.original.answeredQuestions} answered` : '0'}</span>),
      },
    ],
    [],
  );

  return (
    <div className="min-w-0">
      <FilterBar>
        <SearchInput value={list.state.q} onChange={list.setQ} placeholder="Search company, period, reference…" />
        <FilterSelect label="Status" value={list.state.filters.status} onChange={(v) => list.setFilter('status', v)} options={STATUS_OPTIONS} />
        <FilterSelect label="Company" value={list.state.filters.companyId} onChange={(v) => list.setFilter('companyId', v)} options={(options.data?.companies ?? []).map((c) => ({ value: c.id, label: c.name }))} />
        <FilterSelect label="Period" value={list.state.filters.period} onChange={(v) => list.setFilter('period', v)} options={(options.data?.periods ?? []).map((p) => ({ value: p, label: p }))} />
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
        emptyTitle="No reporting submissions"
        emptyDescription="No packs match the current search or filters."
      />
    </div>
  );
}
