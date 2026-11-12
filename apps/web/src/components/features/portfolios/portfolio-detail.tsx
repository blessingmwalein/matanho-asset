'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { ArrowLeftRight, CheckCheck, Eye, FilePlus2, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  ASSET_CLASS_LABELS,
  DOCUMENT_CATEGORY_LABELS,
  P,
  PORTFOLIO_TYPE_LABELS,
  SIMPLIFIED_VALUATION_NOTICE,
  TRANSACTION_TYPE_LABELS,
  formatBytes,
  formatDate,
  formatMoney,
  formatPercent,
  formatPrice,
  formatQuantity,
  type PerformancePeriod,
} from '@nexus/shared';
import { ApiError, api } from '@/lib/api';
import { useCan } from '@/lib/session';
import { useCrumbs } from '@/components/shell/crumbs';
import { Button, IconButton } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { AllocationDonut, PerformanceChart } from '@/components/nx/charts';
import { DataTable, type RowAction } from '@/components/nx/data-table';
import { ErrorState, InfoList, InfoRow, KpiStrip, PageHeader, Panel, PanelBody, PanelHeader, PanelSkeleton } from '@/components/nx/layout';
import { DocumentStatus, SimpleStatus, StatusIndicator, Tag, TransactionStatus } from '@/components/nx/status';
import { DocumentPreviewSheet, type PreviewTarget } from '@/components/features/investors/document-preview-sheet';
import { HoldingDialog } from './holding-dialog';
import { TransactionDialog } from './transaction-dialog';
import { PORTFOLIO_QUERY_KEYS, type HoldingRow, type PortfolioDetail } from './types';

type Txn = PortfolioDetail['recentTransactions'][number];
type Doc = PortfolioDetail['documents'][number];

export function PortfolioDetailView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const can = useCan();
  const [period, setPeriod] = React.useState<PerformancePeriod>('1Y');
  const [holdingDialog, setHoldingDialog] = React.useState<{ open: boolean; holding: HoldingRow | null }>({ open: false, holding: null });
  const [txnOpen, setTxnOpen] = React.useState(false);
  const [removing, setRemoving] = React.useState<HoldingRow | null>(null);
  const [confirming, setConfirming] = React.useState<HoldingRow | null>(null);
  const [preview, setPreview] = React.useState<PreviewTarget | null>(null);

  const query = useQuery({ queryKey: ['portfolio', id], queryFn: () => api<PortfolioDetail>(`/portfolios/${id}`), enabled: !!id });
  const p = query.data;
  useCrumbs(p ? [{ label: p.name }] : null);

  const invalidate = () => {
    for (const k of PORTFOLIO_QUERY_KEYS) void qc.invalidateQueries({ queryKey: k });
  };

  const remove = useMutation({
    mutationFn: (h: HoldingRow) => api(`/holdings/${h.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Draft holding removed');
      setRemoving(null);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not remove the holding'),
  });
  const confirm = useMutation({
    mutationFn: (h: HoldingRow) => api(`/holdings/${h.id}/confirm`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Holding confirmed');
      setConfirming(null);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not confirm the holding'),
  });
  const statement = useMutation({
    mutationFn: () => api<{ id?: string; ref?: string }>('/reports/investor-statements', { method: 'POST', body: { portfolioId: id, asOf: new Date().toISOString().slice(0, 10) } }),
    onSuccess: (d) => {
      toast.success(d?.ref ? `Statement ${d.ref} generated as a draft` : 'Statement generated as a draft', { description: 'It needs independent approval before it can be published to the investor.' });
      void qc.invalidateQueries({ queryKey: ['portfolio', id] });
      void qc.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: (e) => {
      if (e instanceof ApiError && (e.status === 404 || e.status === 501)) toast.info('Statement generation is not available yet', { description: 'The reporting service is not enabled in this environment.' });
      else toast.error(e instanceof ApiError ? e.message : 'Could not generate the statement');
    },
  });

  const holdingColumns = React.useMemo<ColumnDef<HoldingRow>[]>(
    () => [
      {
        id: 'security',
        header: 'Security',
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="font-semibold">{row.original.security.ticker}</div>
            <div className="max-w-[220px] truncate text-[11px] text-muted-foreground">{row.original.security.name}</div>
          </div>
        ),
      },
      { id: 'class', header: 'Class', cell: ({ row }) => <span className="text-ink-2">{ASSET_CLASS_LABELS[row.original.security.assetClass]}</span> },
      { id: 'qty', header: 'Quantity', meta: { align: 'right' }, cell: ({ row }) => formatQuantity(row.original.quantity) },
      { id: 'cost', header: 'Avg cost', meta: { align: 'right' }, cell: ({ row }) => formatPrice(row.original.averageCost) },
      { id: 'price', header: 'Price', meta: { align: 'right' }, cell: ({ row }) => formatPrice(row.original.currentPrice) },
      { id: 'mv', header: 'Market value', meta: { align: 'right' }, cell: ({ row }) => <span className="font-semibold">{formatMoney(row.original.marketValue, row.original.currency, { decimals: 2 })}</span> },
      { id: 'w', header: 'Weight', meta: { align: 'right' }, cell: ({ row }) => formatPercent(row.original.allocationPct, 1) },
      { id: 'vd', header: 'Valued', cell: ({ row }) => <span className="num text-ink-2">{formatDate(row.original.valuationDate)}</span> },
      {
        id: 'status',
        header: 'Status',
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

  const rowActions = React.useMemo<RowAction<HoldingRow>[]>(
    () => [
      { label: 'Edit draft', icon: <Pencil />, onSelect: (h) => setHoldingDialog({ open: true, holding: h }), hidden: (h) => h.status !== 'DRAFT' },
      { label: 'Confirm holding', icon: <CheckCheck />, onSelect: (h) => setConfirming(h), hidden: (h) => h.status !== 'DRAFT' },
      { label: 'Remove draft', icon: <Trash2 />, tone: 'danger', separatorBefore: true, onSelect: (h) => setRemoving(h), hidden: (h) => h.status !== 'DRAFT' },
    ],
    [],
  );

  if (query.isLoading) {
    return (
      <>
        <PageHeader eyebrow="Portfolio" title="Loading…" />
        <Panel>
          <PanelSkeleton rows={8} />
        </Panel>
      </>
    );
  }
  if (query.error || !p) {
    return (
      <Panel>
        <ErrorState message={(query.error as Error | null)?.message ?? 'Portfolio not found'} onRetry={() => query.refetch()} />
      </Panel>
    );
  }

  const canManageHoldings = can(P.HOLDINGS_MANAGE);
  const canRecord = can(P.TRANSACTIONS_RECORD);
  const hasDraftActions = canManageHoldings && p.holdings.some((h) => h.status === 'DRAFT');

  const txnColumns: ColumnDef<Txn>[] = [
    { id: 'date', header: 'Date', cell: ({ row }) => <span className="num">{formatDate(row.original.tradeDate)}</span> },
    {
      id: 'activity',
      header: 'Activity',
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="font-semibold">
            {row.original.type === 'TRADE' ? `${row.original.side === 'BUY' ? 'Buy' : 'Sell'} ${row.original.security?.ticker ?? ''}` : TRANSACTION_TYPE_LABELS[row.original.type]}
          </div>
          <div className="num text-[11px] text-muted-foreground">{row.original.tradeReference ?? row.original.ref}</div>
        </div>
      ),
    },
    { id: 'qty', header: 'Quantity', meta: { align: 'right' }, cell: ({ row }) => (row.original.type === 'TRADE' ? formatQuantity(row.original.quantity) : '—') },
    { id: 'price', header: 'Price', meta: { align: 'right' }, cell: ({ row }) => (row.original.type === 'TRADE' ? formatPrice(row.original.price) : '—') },
    { id: 'amount', header: 'Amount', meta: { align: 'right' }, cell: ({ row }) => <span className="font-semibold">{formatMoney(row.original.amount, row.original.currency)}</span> },
    { id: 'status', header: 'Status', cell: ({ row }) => <TransactionStatus status={row.original.status} /> },
  ];

  const docColumns: ColumnDef<Doc>[] = [
    {
      id: 'title',
      header: 'Document',
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-semibold">{row.original.title}</div>
          <div className="num text-[11px] text-muted-foreground">{row.original.ref}{row.original.file ? ` · ${formatBytes(row.original.file.sizeBytes)}` : ''}</div>
        </div>
      ),
    },
    { id: 'cat', header: 'Category', cell: ({ row }) => <span className="text-ink-2">{DOCUMENT_CATEGORY_LABELS[row.original.category]}</span> },
    { id: 'status', header: 'Status', cell: ({ row }) => <DocumentStatus status={row.original.status} /> },
    { id: 'date', header: 'As of', cell: ({ row }) => <span className="num">{formatDate(row.original.reportDate ?? row.original.createdAt)}</span> },
    {
      id: 'view',
      header: '',
      meta: { width: '48px', align: 'right' },
      cell: ({ row }) => (
        <IconButton
          label="Preview document"
          size="icon-sm"
          onClick={() => setPreview({ id: row.original.id, title: row.original.title, mimeType: row.original.file?.mimeType, fileName: row.original.file?.fileName, subtitle: `${row.original.ref} · ${DOCUMENT_CATEGORY_LABELS[row.original.category]}` })}
        >
          <Eye />
        </IconButton>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={`Portfolio · ${p.ref}`}
        title={p.name}
        description={
          <>
            <Link href={`/internal/investors/${p.investor.id}`} className="font-medium text-primary hover:underline">
              {p.investor.legalName}
            </Link>
            {' · '}
            {PORTFOLIO_TYPE_LABELS[p.type]}
            {p.benchmark ? ` · Benchmark: ${p.benchmark}` : ''}
          </>
        }
        meta={<SimpleStatus value={p.status} />}
        actions={
          <>
            {canManageHoldings && (
              <Button variant="secondary" onClick={() => setHoldingDialog({ open: true, holding: null })}>
                <Plus /> Add holding
              </Button>
            )}
            {canRecord && (
              <Button variant="primary" onClick={() => setTxnOpen(true)} disabled={p.status !== 'ACTIVE'}>
                <ArrowLeftRight /> Record transaction
              </Button>
            )}
          </>
        }
      />

      <KpiStrip
        className="mb-4"
        items={[
          { label: 'Current value', value: formatMoney(p.currentValue, p.baseCurrency, { decimals: 0 }), hint: p.valuationDate ? `Valued ${formatDate(p.valuationDate)}` : 'No holdings yet' },
          { label: 'Holdings', value: p.holdingsCount, hint: p.draftHoldings ? `${p.draftHoldings} draft` : 'All confirmed' },
          { label: 'Manager', value: <span className="text-[15px]">{p.manager?.name ?? 'Unassigned'}</span>, hint: p.account ? `${p.account.name} · ${p.account.ref}` : undefined },
          { label: 'Inception', value: <span className="text-[15px]">{formatDate(p.inceptionDate)}</span>, hint: `${p.baseCurrency} base currency` },
        ]}
      />

      <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
        <Panel>
          <PanelHeader title="Performance" description="Portfolio NAV against its benchmark, rebased to the same starting value." />
          <PanelBody>
            <PerformanceChart points={p.performance} currency={p.baseCurrency} period={period} onPeriodChange={setPeriod} portfolioLabel={p.name} benchmarkLabel={p.benchmark ?? 'Benchmark'} showBenchmark={p.performance.some((x) => x.benchmark != null)} />
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Asset allocation" />
          <PanelBody>
            <AllocationDonut slices={p.allocation.map((a) => ({ key: a.key, label: a.label, value: a.value }))} currency={p.baseCurrency} centerLabel="Portfolio value" />
          </PanelBody>
        </Panel>
      </div>

      <Panel className="mb-4">
        <PanelHeader title="Holdings" description={`${p.holdingsCount} position(s). Draft holdings are manual entries that can be edited, confirmed or removed.`} />
        <DataTable<HoldingRow>
          columns={holdingColumns}
          data={p.holdings}
          rowActions={hasDraftActions ? rowActions : undefined}
          emptyTitle="No holdings"
          emptyDescription="Add a holding or record a transaction to build the portfolio."
          emptyAction={canManageHoldings ? <Button variant="secondary" size="sm" onClick={() => setHoldingDialog({ open: true, holding: null })}><Plus /> Add holding</Button> : undefined}
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-2 px-3 py-2.5 text-[12px]">
              <span className="max-w-[560px] text-muted-foreground">{SIMPLIFIED_VALUATION_NOTICE}</span>
              <span className="num font-semibold">Total {formatMoney(p.currentValue, p.baseCurrency)}</span>
            </div>
          }
        />
      </Panel>

      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Recent investment activity"
            actions={
              <Button variant="tertiary" size="sm" onClick={() => router.push(`/internal/activity?portfolioId=${p.id}`)}>
                View all
              </Button>
            }
          />
          <DataTable<Txn> columns={txnColumns} data={p.recentTransactions} dense emptyTitle="No transactions yet" emptyDescription="Recorded trades and cash events appear here." />
        </Panel>
        <Panel>
          <PanelHeader
            title="Related documents"
            actions={
              can(P.REPORTS_GENERATE) ? (
                <Button variant="secondary" size="sm" loading={statement.isPending} onClick={() => statement.mutate()}>
                  <FilePlus2 /> Generate statement
                </Button>
              ) : undefined
            }
          />
          <DataTable<Doc> columns={docColumns} data={p.documents} dense emptyTitle="No documents" emptyDescription="Statements and reports for this portfolio appear here once generated." />
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Portfolio details" />
        <PanelBody>
          <InfoList className="grid gap-x-8 md:grid-cols-2">
            <InfoRow label="Investor">{p.investor.legalName} ({p.investor.ref})</InfoRow>
            <InfoRow label="Account">{p.account ? `${p.account.name} (${p.account.ref})` : '—'}</InfoRow>
            <InfoRow label="Type">{PORTFOLIO_TYPE_LABELS[p.type]}</InfoRow>
            <InfoRow label="Benchmark">{p.benchmark}</InfoRow>
            <InfoRow label="Status"><StatusIndicator tone={p.status === 'ACTIVE' ? 'success' : 'warning'}>{p.status === 'ACTIVE' ? 'Active' : p.status === 'ON_HOLD' ? 'On hold' : 'Closed'}</StatusIndicator></InfoRow>
            <InfoRow label="Mandate">{p.description}</InfoRow>
          </InfoList>
        </PanelBody>
      </Panel>

      <HoldingDialog open={holdingDialog.open} onOpenChange={(o) => setHoldingDialog((s) => ({ ...s, open: o }))} portfolioId={p.id} currency={p.baseCurrency} holding={holdingDialog.holding} />
      <TransactionDialog open={txnOpen} onOpenChange={setTxnOpen} portfolioId={p.id} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove draft holding"
        description={removing ? `Remove the draft ${removing.security.ticker} position from ${p.ref}? Only draft holdings can be removed; this is recorded in the audit trail.` : undefined}
        confirmLabel="Remove holding"
        tone="destructive"
        loading={remove.isPending}
        onConfirm={() => {
          if (removing) remove.mutate(removing);
        }}
      />
      <ConfirmDialog
        open={!!confirming}
        onOpenChange={(o) => !o && setConfirming(null)}
        title="Confirm holding"
        description={confirming ? `Confirm ${confirming.security.ticker} as a verified position? Confirmed holdings can no longer be edited directly; they change through recorded transactions.` : undefined}
        confirmLabel="Confirm holding"
        loading={confirm.isPending}
        onConfirm={() => {
          if (confirming) confirm.mutate(confirming);
        }}
      />
      <DocumentPreviewSheet doc={preview} onClose={() => setPreview(null)} />
    </>
  );
}
