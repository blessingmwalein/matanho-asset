'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, FileSearch2 } from 'lucide-react';
import { formatBytes, formatDate, formatDateTime, formatMoney, formatNumber, formatPrice, formatQuantity } from '@nexus/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { DetailKpis, DetailSection, DocumentPreviewPanel } from '@/components/nx/blocks';
import { ErrorState, InfoList, InfoRow, PanelSkeleton } from '@/components/nx/layout';
import { ReconStatusLabel, StatusIndicator, Tag } from '@/components/nx/status';
import { Notice } from './notice';
import { referenceOf, type SubmissionDetail, type SubmissionRow } from './types';

/**
 * Detail drawer for one custodian submission: submitted values, version history (corrections supersede, never
 * overwrite), the original day-end file, and the reconciliation link. Used by the custodian portal and the
 * internal register.
 */
export function SubmissionSheet({
  mode,
  row,
  onClose,
  onCorrect,
}: {
  mode: 'custodian' | 'internal';
  row: SubmissionRow | null;
  onClose: () => void;
  onCorrect?: (detail: SubmissionDetail) => void;
}) {
  const internal = mode === 'internal';
  const base = internal ? '/custodian-submissions' : '/custodian/submissions';
  const q = useQuery({
    queryKey: ['custodian', mode, 'detail', row?.kind, row?.id],
    queryFn: () => api<SubmissionDetail>(`${base}/${row!.kind}/${row!.id}`),
    enabled: !!row,
  });
  const d = q.data;
  const isExec = (d?.kind ?? row?.kind) === 'EXECUTION';

  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      {row && (
        <SheetContent
          width="lg"
          eyebrow={row.kind === 'EXECUTION' ? 'Trade execution' : 'Day-end package'}
          title={referenceOf(row)}
          description={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="num">{row.ref}</span>
              <span>
                {internal ? `${row.custodian.name} · ` : ''}
                {row.account.accountNumber}
                {row.portfolio ? ` · ${row.portfolio.ref} ${row.portfolio.name}` : ''}
              </span>
            </span>
          }
          actions={
            !internal && d && d.isCurrent && onCorrect ? (
              <Button variant="secondary" size="sm" onClick={() => onCorrect(d)}>
                Submit a correction
              </Button>
            ) : undefined
          }
        >
          {q.isLoading && <PanelSkeleton rows={6} />}
          {q.error && <ErrorState message={(q.error as Error).message} onRetry={() => void q.refetch()} />}
          {d && (
            <>
              <div className="flex flex-wrap items-center gap-3 border-b border-border-soft px-5 py-3">
                {d.isCurrent ? <StatusIndicator tone="info">Submitted</StatusIndicator> : <Tag>Superseded by a later version</Tag>}
                <span className="text-[12px] text-muted-foreground">Version {d.version}</span>
                <ReconStatusLabel status={d.reconStatus} />
              </div>

              <div className="px-5 pt-4">
                {isExec ? (
                  <DetailKpis items={[{ label: 'Side', value: d.side }, { label: 'Quantity', value: formatQuantity(d.quantity) }, { label: 'Price', value: `${formatPrice(d.price)} ${d.currency}` }]} />
                ) : (
                  <DetailKpis
                    items={[
                      { label: 'Closing cash', value: formatMoney(d.closingCash, d.currency, { decimals: 0 }) },
                      { label: 'Holdings value', value: formatMoney(d.holdingsMarketValue, d.currency, { decimals: 0 }) },
                      { label: 'Trades in book', value: d.tradeCount },
                    ]}
                  />
                )}
              </div>

              {!d.isCurrent && (
                <div className="px-5 pt-4">
                  <Notice tone="neutral" title="This version has been superseded">
                    A later correction replaced it for reconciliation. The original record below is retained unchanged for audit.
                  </Notice>
                </div>
              )}
              {d.correctionReason && (
                <div className="px-5 pt-4">
                  <Notice tone="warning" title="Correction reason">
                    {d.correctionReason}
                  </Notice>
                </div>
              )}

              <DetailSection title="Submitted values" description="Exactly as entered by the custodian user.">
                <InfoList>
                  {isExec ? (
                    <>
                      <InfoRow label="Trade reference" mono>{d.tradeReference}</InfoRow>
                      <InfoRow label="Security">{d.ticker}</InfoRow>
                      <InfoRow label="Execution time">{formatDateTime(d.date)}</InfoRow>
                      <InfoRow label="Settlement date">{formatDate(d.settlementDate)}</InfoRow>
                      <InfoRow label="Broker">{d.broker}</InfoRow>
                      <InfoRow label="Note">{d.note || '—'}</InfoRow>
                    </>
                  ) : (
                    <>
                      <InfoRow label="Statement date">{formatDate(d.date)}</InfoRow>
                      <InfoRow label="Closing cash" mono>{formatNumber(d.closingCash, 2)} {d.currency}</InfoRow>
                      <InfoRow label="Holdings value" mono>{formatNumber(d.holdingsMarketValue, 2)} {d.currency}</InfoRow>
                      <InfoRow label="Trades in book" mono>{d.tradeCount}</InfoRow>
                      <InfoRow label="Control note">{d.note || '—'}</InfoRow>
                    </>
                  )}
                  <InfoRow label="Account">{d.account.accountNumber} · {d.account.name}</InfoRow>
                  <InfoRow label="Portfolio">{d.portfolio ? `${d.portfolio.ref} · ${d.portfolio.name}` : 'Not linked'}</InfoRow>
                  <InfoRow label="Submitted by">{d.submittedByName ?? '—'} · {formatDateTime(d.createdAt)}</InfoRow>
                  {d.fileSha256 && <InfoRow label="File SHA-256" mono><span className="break-all text-[11.5px]">{d.fileSha256}</span></InfoRow>}
                </InfoList>
                <details className="mt-3 rounded-md border border-border-soft bg-surface-2">
                  <summary className="cursor-pointer px-3 py-2 text-[12px] font-semibold text-ink-2">Raw payload as stored (source of truth)</summary>
                  <pre className="nx-scroll max-h-64 overflow-auto border-t border-border-soft px-3 py-2 text-[11px] leading-relaxed">{JSON.stringify(d.rawPayload, null, 2)}</pre>
                </details>
              </DetailSection>

              <DetailSection title="Version history" description={d.versions.length > 1 ? 'Corrections create a new version; earlier versions are never edited or deleted.' : 'No corrections have been submitted.'}>
                <ol className="grid gap-2">
                  {d.versions.map((v) => (
                    <li key={v.id} className="rounded-md border border-border bg-surface px-3 py-2.5 text-[12px]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">
                          Version {v.version} <span className="num font-normal text-muted-foreground">· {v.ref}</span>
                        </span>
                        {v.isCurrent ? <StatusIndicator tone="success">Current</StatusIndicator> : <Tag>Superseded</Tag>}
                      </div>
                      <div className="num mt-1 text-muted-foreground">
                        {isExec
                          ? `${formatQuantity(v.quantity)} @ ${formatPrice(v.price)} ${v.currency} · settles ${formatDate(v.settlementDate)}`
                          : `Cash ${formatNumber(v.closingCash, 2)} · holdings ${formatNumber(v.holdingsMarketValue, 2)} · ${v.tradeCount} trades`}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {v.submittedByName} · {formatDateTime(v.createdAt)}
                      </div>
                      {v.correctionReason && <div className="mt-1 text-ink-2">Reason: {v.correctionReason}</div>}
                    </li>
                  ))}
                </ol>
              </DetailSection>

              {d.document && (
                <DetailSection title="Official day-end file" description={`${d.document.fileName} · ${formatBytes(d.document.sizeBytes)} · stored original, SHA-256 verified`}>
                  <DocumentPreviewPanel doc={{ id: d.document.id, title: d.document.title, mimeType: d.document.mimeType, fileName: d.document.fileName, version: d.document.version }} height={360} />
                </DetailSection>
              )}

              <DetailSection title="Reconciliation">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-[12.5px]">
                    {d.reconItem ? (
                      <>
                        Reconciled in <span className="num font-semibold">{d.reconItem.batchRef}</span> ({formatDate(d.reconItem.businessDate)}).{' '}
                        {d.reconItem.openExceptions > 0 ? `${d.reconItem.openExceptions} open exception${d.reconItem.openExceptions > 1 ? 's' : ''}.` : d.reconItem.exceptionCount > 0 ? 'All exceptions resolved.' : 'No exceptions.'}
                      </>
                    ) : (
                      <>Not yet reconciled against Matanho&apos;s internal book.</>
                    )}
                  </div>
                  {internal && d.isCurrent && (
                    <Button asChild variant={d.reconItem ? 'secondary' : 'primary'} size="sm">
                      <Link href={d.reconItem ? `/internal/operations/reconciliation?item=${d.reconItem.id}` : '/internal/operations/reconciliation'}>
                        {d.reconItem ? <FileSearch2 /> : <ExternalLink />}
                        {d.reconItem ? 'Open reconciliation item' : 'Start reconciliation'}
                      </Link>
                    </Button>
                  )}
                </div>
              </DetailSection>
            </>
          )}
        </SheetContent>
      )}
    </Sheet>
  );
}
