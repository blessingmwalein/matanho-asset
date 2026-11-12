'use client';

import * as React from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { Check, FilePlus2 } from 'lucide-react';
import { toast } from 'sonner';
import { P, formatDate } from '@nexus/shared';
import { api, type Paged } from '@/lib/api';
import { useCan } from '@/lib/session';
import { useListState } from '@/lib/use-list-state';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable } from '@/components/nx/data-table';
import { PageHeader, Panel, PanelHeader, PanelSkeleton } from '@/components/nx/layout';
import { DocumentSheet, type DocRow } from '@/components/features/documents/document-sheet';
import { ReportRunner, type ReportCatalogueItem } from '@/components/features/reports/report-runner';
import { SearchableSelect } from '@/components/features/reports/searchable';

interface Options {
  portfolios: Array<{ id: string; ref: string; name: string; investorName: string }>;
}

/** Statement lifecycle shown as three steps: Generated → Approved (independent checker) → Published to investor. */
function Lifecycle({ status }: { status: DocRow['status'] }) {
  const steps = [
    { key: 'DRAFT', label: 'Generated' },
    { key: 'APPROVED', label: 'Approved' },
    { key: 'PUBLISHED', label: 'Published' },
  ];
  const idx = Math.max(0, steps.findIndex((s) => s.key === status));
  return (
    <ol className="flex items-center gap-1.5">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className={cn('flex items-center gap-1 text-[11px] font-semibold', i <= idx ? 'text-foreground' : 'text-ink-3')}>
            <span className={cn('grid size-4 place-items-center rounded-full text-[9px]', i < idx || status === 'PUBLISHED' ? 'bg-success text-white' : i === idx ? 'bg-primary text-white' : 'bg-surface-sunken text-ink-3')}>
              {i < idx || status === 'PUBLISHED' ? <Check className="size-2.5" strokeWidth={3} /> : i + 1}
            </span>
            {s.label}
          </span>
          {i < steps.length - 1 && <span className="h-px w-3 bg-border" />}
        </li>
      ))}
    </ol>
  );
}

function StatementsPanel() {
  const qc = useQueryClient();
  const can = useCan();
  const list = useListState({ pageSize: 10, sort: 'createdAt', order: 'desc', filters: { category: 'STATEMENT' } });
  const [portfolioId, setPortfolioId] = React.useState<string | undefined>();
  const [asOf, setAsOf] = React.useState(new Date().toISOString().slice(0, 10));
  const [openId, setOpenId] = React.useState<string | null>(null);

  const options = useQuery({ queryKey: ['report-options'], queryFn: () => api<Options>('/reports/options') });
  const statements = useQuery({
    queryKey: ['statements', list.params],
    queryFn: () => api<Paged<DocRow>>('/documents', { query: list.params }),
    placeholderData: keepPreviousData,
  });

  const generate = useMutation({
    mutationFn: () => api<DocRow>('/reports/investor-statements', { method: 'POST', body: { portfolioId, asOf } }),
    onSuccess: (doc) => {
      toast.success('Statement generated', { description: 'Review it, then have an independent approver approve it before publishing.' });
      void qc.invalidateQueries({ queryKey: ['statements'] });
      void qc.invalidateQueries({ queryKey: ['documents'] });
      setOpenId(doc.id);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const columns = React.useMemo<ColumnDef<DocRow>[]>(
    () => [
      { id: 'title', header: 'Statement', cell: ({ row: { original: d } }) => (
        <div className="min-w-0">
          <div className="truncate font-semibold">{d.title}</div>
          <div className="num text-[11px] text-muted-foreground">{d.ref}</div>
        </div>
      ) },
      { id: 'investor', header: 'Investor', cell: ({ row }) => row.original.investor?.legalName ?? '—' },
      { id: 'asof', header: 'As of', cell: ({ row }) => <span className="num">{formatDate(row.original.reportDate)}</span> },
      { id: 'status', header: 'Workflow', cell: ({ row }) => <Lifecycle status={row.original.status} /> },
    ],
    [],
  );

  return (
    <Panel className="mb-6">
      <PanelHeader title="Investor statements" description="Generate a statement from stored portfolio records, have it approved by an independent checker, then publish it to the investor portal." />
      {can(P.REPORTS_GENERATE) && (
        <div className="flex flex-wrap items-end gap-3 border-y border-border-soft bg-surface-2 px-4 py-3">
          <label className="grid gap-1 text-[11px] font-semibold text-ink-2">Portfolio
            <SearchableSelect value={portfolioId} onChange={setPortfolioId} placeholder="Select portfolio" className="min-w-[300px]" options={(options.data?.portfolios ?? []).map((p) => ({ value: p.id, label: `${p.name} · ${p.investorName}`, hint: p.ref }))} />
          </label>
          <label className="grid gap-1 text-[11px] font-semibold text-ink-2">Statement date
            <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="w-[160px]" />
          </label>
          <Button variant="primary" disabled={!portfolioId || !asOf} loading={generate.isPending} onClick={() => generate.mutate()}>
            <FilePlus2 /> Generate statement
          </Button>
        </div>
      )}
      <DataTable
        columns={columns}
        data={statements.data?.data}
        loading={statements.isFetching}
        meta={statements.data?.meta}
        onPageChange={list.setPage}
        onRowClick={(d) => setOpenId(d.id)}
        activeId={openId ?? undefined}
        emptyTitle="No statements generated yet"
        emptyDescription="Select a portfolio and statement date to generate the first one."
      />
      <DocumentSheet docId={openId} onClose={() => setOpenId(null)} />
    </Panel>
  );
}

export default function InvestorReportsPage() {
  const catalogue = useQuery({ queryKey: ['report-catalogue'], queryFn: () => api<ReportCatalogueItem[]>('/reports') });
  const reports = (catalogue.data ?? []).filter((r) => r.group === 'investor');
  return (
    <>
      <PageHeader eyebrow="Reports" title="Investor Reports" description="Investor statements with maker–checker publication, plus the investor register and onboarding status reports." />
      <StatementsPanel />
      {catalogue.isLoading ? <PanelSkeleton rows={5} /> : <ReportRunner reports={reports} />}
    </>
  );
}
