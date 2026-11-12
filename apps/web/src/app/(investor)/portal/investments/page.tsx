'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { formatDate, formatMultiple, formatPercent } from '@nexus/shared';
import { DataTable } from '@/components/nx/data-table';
import { EmptyState, ErrorState, PageHeader, Panel, PanelHeader } from '@/components/nx/layout';
import { SimpleStatus } from '@/components/nx/status';
import { Skeleton } from '@/components/ui/controls';
import { DocumentViewerDialog } from '@/components/features/portal/document-viewer';
import { FxNote } from '@/components/features/portal/fx-note';
import { useInvestments, useMoney } from '@/components/features/portal/hooks';
import { InvestmentCard } from '@/components/features/portal/investment-cards';
import { InvestmentDrawer } from '@/components/features/portal/investment-drawer';
import type { InvestmentItem } from '@/components/features/portal/types';

export default function InvestmentsPage() {
  const q = useInvestments();
  const m = useMoney();
  const [selected, setSelected] = React.useState<InvestmentItem | null>(null);
  const [doc, setDoc] = React.useState<string | null>(null);
  const items = q.data?.items;
  const fundAsOf = (items?.find((i) => i.kind === 'fund') as Extract<InvestmentItem, { kind: 'fund' }> | undefined)?.asOf;

  const columns = React.useMemo<ColumnDef<InvestmentItem, unknown>[]>(
    () => [
      {
        id: 'name',
        header: 'Investment',
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">{row.original.name}</div>
            <div className="text-[11px] text-muted-foreground">{row.original.ref}</div>
          </div>
        ),
      },
      { id: 'type', header: 'Type', cell: ({ row }) => row.original.type },
      { id: 'value', header: 'Value', meta: { align: 'right' }, cell: ({ row }) => m.full(row.original.value) },
      {
        id: 'ret',
        header: 'Return / IRR',
        meta: { align: 'right' },
        cell: ({ row }) => {
          const i = row.original;
          if (i.kind === 'fund') return formatPercent(i.irr, 2);
          return i.ytdReturnPct == null ? '—' : <span className={i.ytdReturnPct >= 0 ? 'text-success' : 'text-danger'}>{formatPercent(i.ytdReturnPct, 2, { signed: true })}</span>;
        },
      },
      {
        id: 'bench',
        header: 'Benchmark / TVPI',
        meta: { align: 'right' },
        cell: ({ row }) => {
          const i = row.original;
          return i.kind === 'fund' ? formatMultiple(i.tvpi) : i.benchmarkYtdPct == null ? '—' : formatPercent(i.benchmarkYtdPct, 2, { signed: true });
        },
      },
      { id: 'status', header: 'Status', cell: ({ row }) => <SimpleStatus value={row.original.status} /> },
    ],
    [m],
  );

  return (
    <div>
      <PageHeader eyebrow="Mandates & funds" title="Investments" description="Public-market mandates and private funds in one concise view. Select any investment for detail." />
      <FxNote />

      {q.isError ? (
        <Panel>
          <ErrorState message={(q.error as Error).message} onRetry={() => void q.refetch()} />
        </Panel>
      ) : !items ? (
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[160px] w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Panel>
          <EmptyState title="No investments in this view" description="Choose “Consolidated relationship” in the top bar to see every mandate and fund." />
        </Panel>
      ) : (
        <>
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((i) => (
              <InvestmentCard key={`${i.kind}-${i.id}`} item={i} onOpen={setSelected} active={selected?.id === i.id} />
            ))}
          </div>

          <Panel className="mt-4">
            <PanelHeader title="Investment register" description={fundAsOf ? `Valuation, performance and commitment status. Private fund figures are administrator-reported as at ${formatDate(fundAsOf)}.` : 'Valuation, performance and commitment status.'} />
            <DataTable columns={columns} data={items} getRowId={(r) => `${r.kind}-${r.id}`} onRowClick={setSelected} activeId={selected ? `${selected.kind}-${selected.id}` : undefined} dense />
          </Panel>
        </>
      )}

      <InvestmentDrawer
        selected={selected ? { kind: selected.kind, id: selected.id, name: selected.name, type: selected.type } : null}
        onClose={() => setSelected(null)}
        onOpenDoc={setDoc}
      />
      <DocumentViewerDialog docId={doc} onClose={() => setDoc(null)} />
    </div>
  );
}
