'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { formatDate } from '@nexus/shared';
import { cn } from '@/lib/utils';
import { CommitmentVsCalled } from '@/components/nx/charts';
import { DataTable } from '@/components/nx/data-table';
import { EmptyState, ErrorState, InfoList, InfoRow, PageHeader, Panel, PanelBody, PanelHeader, PanelSkeleton } from '@/components/nx/layout';
import { SimpleStatus } from '@/components/nx/status';
import { usePortal } from '@/components/shell/portal-shell';
import { OpenCallCard } from '@/components/features/portal/capital-call-cards';
import { DocumentViewerDialog } from '@/components/features/portal/document-viewer';
import { FxNote } from '@/components/features/portal/fx-note';
import { useCapital, useMoney } from '@/components/features/portal/hooks';
import type { CapitalView } from '@/components/features/portal/types';

type Row = CapitalView['activity'][number];

export default function CapitalPage() {
  const q = useCapital();
  const m = useMoney();
  const { currency, fxRate } = usePortal();
  const [doc, setDoc] = React.useState<string | null>(null);
  const c = q.data;

  const columns = React.useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      { id: 'date', header: 'Date', cell: ({ row }) => <span className="num">{formatDate(row.original.date)}</span> },
      {
        id: 'fund',
        header: 'Fund',
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">{row.original.fundName}</div>
            <div className="text-[11px] text-muted-foreground">{row.original.ref}</div>
          </div>
        ),
      },
      { id: 'kind', header: 'Activity', cell: ({ row }) => (row.original.kind === 'CALL' ? 'Capital call' : 'Distribution') },
      {
        id: 'amount',
        header: 'Amount',
        meta: { align: 'right' },
        cell: ({ row }) => <span className={cn(row.original.kind === 'DISTRIBUTION' && 'text-success')}>{row.original.kind === 'DISTRIBUTION' ? '+' : '−'}{m.full(row.original.amount)}</span>,
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) =>
          row.original.status === 'ISSUED' ? (
            <span className="inline-flex flex-col">
              <SimpleStatus value="ISSUED" />
              <span className="num text-[10.5px] text-muted-foreground">Due {formatDate(row.original.dueDate)}</span>
            </span>
          ) : (
            <SimpleStatus value={row.original.status} />
          ),
      },
      { id: 'notice', header: 'Notice', cell: ({ row }) => (row.original.noticeDocumentId ? <span className="text-[12px] font-semibold text-primary">View</span> : <span className="text-[12px] text-ink-3">None</span>) },
    ],
    [m],
  );

  return (
    <div>
      <PageHeader eyebrow="Capital account" title="Capital" description="Commitments, drawdowns, distributions and funding instructions for your private-market funds." meta={c?.asOf ? <span className="text-[11.5px] text-muted-foreground">Administrator figures as at <b className="num font-semibold text-ink-2">{formatDate(c.asOf)}</b></span> : undefined} />
      <FxNote />

      {q.isError ? (
        <Panel>
          <ErrorState message={(q.error as Error).message} onRetry={() => void q.refetch()} />
        </Panel>
      ) : !c ? (
        <PanelSkeleton rows={8} />
      ) : c.commitments.length === 0 ? (
        <Panel>
          <EmptyState title="No private-market commitments" description="Capital calls, distributions and capital account figures appear here once you commit to a private fund." />
        </Panel>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="grid content-start gap-4">
              {c.openCalls.length ? (
                c.openCalls.map((call) => <OpenCallCard key={call.id} call={call} onViewNotice={setDoc} />)
              ) : (
                <Panel>
                  <EmptyState title="No open capital calls" description="When a capital call is issued it appears here with its notice, funding instructions and due date." className="py-10" />
                </Panel>
              )}
            </div>

            <Panel>
              <PanelHeader title="Private capital summary" description="Across active private funds." />
              <PanelBody>
                <InfoList>
                  <InfoRow label="Total commitment" mono>{m.full(c.summary.totalCommitment)}</InfoRow>
                  <InfoRow label="Called capital" mono>{m.full(c.summary.called)}</InfoRow>
                  <InfoRow label="Unfunded" mono>{m.full(c.summary.unfunded)}</InfoRow>
                  <InfoRow label="Distributions to date" mono>{m.full(c.summary.distributions)}</InfoRow>
                  <InfoRow label="Net asset value" mono>{m.full(c.summary.nav)}</InfoRow>
                </InfoList>
              </PanelBody>
            </Panel>
          </div>

          <Panel className="mt-4">
            <PanelHeader title="Commitment vs called" description="Called capital against remaining unfunded commitment, per fund." />
            <PanelBody>
              <CommitmentVsCalled rows={c.commitments.map((x) => ({ name: x.fundName, called: Number(x.called) * fxRate, unfunded: Number(x.unfunded) * fxRate }))} currency={currency} height={Math.max(130, c.commitments.length * 64)} />
            </PanelBody>
          </Panel>

          <Panel className="mt-4">
            <PanelHeader title="Capital activity" description="All calls and distributions with their source notices. Select a row to open the notice." />
            <DataTable
              columns={columns}
              data={c.activity}
              dense
              emptyTitle="No capital activity yet"
              onRowClick={(r) => (r.noticeDocumentId ? setDoc(r.noticeDocumentId) : toast.info('No notice document is attached to this event.'))}
            />
          </Panel>
        </>
      )}

      <DocumentViewerDialog docId={doc} onClose={() => setDoc(null)} />
    </div>
  );
}
