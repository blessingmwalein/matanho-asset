'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, ExternalLink } from 'lucide-react';
import { formatBytes, formatDate, formatDateTime, formatNumber, formatPrice, formatQuantity, P, resolveExceptionSchema } from '@nexus/shared';
import { api, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/input';
import { ActivityTimeline, DetailSection, DocumentPreviewPanel } from '@/components/nx/blocks';
import { ErrorState, InfoList, InfoRow, PanelSkeleton } from '@/components/nx/layout';
import { ReconStatusLabel, StatusIndicator, Tag } from '@/components/nx/status';
import { Notice } from '@/components/features/custodian/notice';
import { EXCEPTION_LABELS, ITEM_KIND_LABELS, type DiffRow, type ReconDetail, type ReconException } from './types';

function fmt(field: string, v: string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  switch (field) {
    case 'quantity':
      return formatQuantity(v);
    case 'price':
      return formatPrice(v);
    case 'closingCash':
    case 'holdingsMarketValue':
      return formatNumber(v, 2);
    case 'tradeDate':
    case 'settlementDate':
      return formatDate(v);
    default:
      return v;
  }
}

const prettyKey = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

function SnapshotCard({ title, data, empty }: { title: string; data: Record<string, unknown> | null; empty: string }) {
  const entries = Object.entries(data ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== '' && typeof v !== 'object');
  return (
    <div className="min-w-0 rounded-lg border border-border">
      <div className="border-b border-border bg-surface-2 px-3 py-2 text-[11.5px] font-semibold text-ink-2">{title}</div>
      {entries.length ? (
        <InfoList className="px-3">
          {entries.map(([k, v]) => (
            <InfoRow key={k} label={prettyKey(k)}>
              <span className="break-words">{String(v)}</span>
            </InfoRow>
          ))}
        </InfoList>
      ) : (
        <p className="px-3 py-4 text-[12px] text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

function Comparison({ rows }: { rows: DiffRow[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="nx-scroll overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-[12.5px]">
          <thead className="bg-surface-2">
            <tr className="text-left">
              <th className="h-9 w-[28%] border-b border-border px-3 text-[10px] font-bold uppercase tracking-[0.07em] text-ink-3">Field</th>
              <th className="h-9 border-b border-border px-3 text-[10px] font-bold uppercase tracking-[0.07em] text-ink-3">Custodian (source)</th>
              <th className="h-9 border-b border-border px-3 text-[10px] font-bold uppercase tracking-[0.07em] text-ink-3">Matanho internal book</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.field} className={cn('border-b border-border-soft last:border-b-0', r.differs && 'bg-warning-soft')}>
                <td className="px-3 py-2.5 align-top text-muted-foreground">
                  <span className="font-medium text-ink-2">{r.label}</span>
                  {r.differs && <Tag tone="warning" className="ml-2">Differs</Tag>}
                  {r.note && <div className="mt-0.5 text-[11px] font-normal text-ink-3">{r.note}</div>}
                </td>
                <td className={cn('num px-3 py-2.5 align-top', r.differs ? 'font-semibold text-foreground' : 'text-foreground')}>{fmt(r.field, r.custodian)}</td>
                <td className={cn('num px-3 py-2.5 align-top', r.differs ? 'font-semibold text-foreground' : 'text-foreground')}>{fmt(r.field, r.internal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ResolveDialog({ exception, onClose, onDone }: { exception: ReconException | null; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    setNote('');
    setError(null);
  }, [exception?.id]);

  const resolve = useMutation({
    mutationFn: () => api(`/reconciliation/exceptions/${exception!.id}/resolve`, { method: 'POST', body: { note: note.trim() } }),
    onSuccess: () => {
      toast.success('Exception resolved', { description: 'Your decision, name and the time have been recorded.' });
      onDone();
      onClose();
    },
    onError: (e) => setError(e instanceof ApiError ? (e.errors?.note ?? e.message) : 'Could not record the resolution'),
  });

  const submit = () => {
    const parsed = resolveExceptionSchema.safeParse({ note });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Add a resolution note');
      return;
    }
    setError(null);
    resolve.mutate();
  };

  return (
    <Dialog open={!!exception} onOpenChange={(o) => !o && onClose()}>
      {exception && (
        <DialogContent title="Resolve exception" description="Record why this difference is accepted or explained. Internal records and the custodian's source values stay unchanged.">
          <div className="rounded-md border border-border bg-surface-2 px-3 py-2.5 text-[12.5px]">
            <div className="font-semibold">{EXCEPTION_LABELS[exception.type]}</div>
            <div className="mt-0.5 text-muted-foreground">{exception.description}</div>
          </div>
          <label htmlFor="resolution-note" className="mb-1.5 mt-4 block text-[11.5px] font-semibold text-ink-2">
            Resolution note <span className="text-danger">*</span>
          </label>
          <Textarea id="resolution-note" rows={4} value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={!!error} placeholder="e.g. Confirmed with the custodian by phone: partial fill; the balance settles tomorrow." />
          <div className="mt-1 flex items-center justify-between text-[11px]">
            {error ? <span role="alert" className="font-medium text-danger">{error}</span> : <span className="text-muted-foreground">At least 10 characters. This is stored with your name and the time.</span>}
            <span className="num text-ink-3">{note.trim().length}</span>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" loading={resolve.isPending} onClick={submit}>
              Record resolution
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

/**
 * Reconciliation item workspace: custodian source vs Matanho internal book side by side, exceptions with an
 * auditable resolution workflow, the original submission (and day-end file), and a timeline.
 * Nothing here edits internal data or the custodian's submitted values.
 */
export function ReconItemSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const can = useCan();
  const canResolve = can(P.RECON_RESOLVE);
  const [resolving, setResolving] = React.useState<ReconException | null>(null);
  const [note, setNote] = React.useState('');

  const q = useQuery({ queryKey: ['recon', 'item', id], queryFn: () => api<ReconDetail>(`/reconciliation/items/${id}`), enabled: !!id });
  const d = q.data;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['recon'] });
    void qc.invalidateQueries({ queryKey: ['custodian'] });
    void qc.invalidateQueries({ queryKey: ['nav-counts'] });
  };

  const addNote = useMutation({
    mutationFn: () => api(`/reconciliation/items/${id}/notes`, { method: 'POST', body: { note: note.trim() } }),
    onSuccess: () => {
      setNote('');
      toast.success('Note added');
      void qc.invalidateQueries({ queryKey: ['recon', 'item', id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not add the note'),
  });

  const title = d ? (d.kind === 'DAY_END' ? `Day-end · ${d.submission?.account.accountNumber ?? ''}` : (d.tradeReference ?? 'Reconciliation item')) : 'Reconciliation item';
  const hasComparison = !!d && d.differences.length > 0;
  const orphan = d?.kind === 'INTERNAL_ORPHAN';

  return (
    <>
      <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
        {id && (
          <SheetContent
            width="xl"
            eyebrow={d ? `${ITEM_KIND_LABELS[d.kind]} · ${d.batch.ref} · ${formatDate(d.batch.businessDate)}` : 'Reconciliation'}
            title={title}
            description={d ? `${d.portfolio ? `${d.portfolio.ref} · ${d.portfolio.name}` : 'No portfolio'}${d.submission ? ` · ${d.submission.custodian.name}` : ''}` : undefined}
          >
            {q.isLoading && <PanelSkeleton rows={8} />}
            {q.error && <ErrorState message={(q.error as Error).message} onRetry={() => void q.refetch()} />}
            {d && (
              <>
                <div className="flex flex-wrap items-center gap-4 border-b border-border-soft px-5 py-3">
                  <ReconStatusLabel status={d.status} />
                  <span className="text-[12px] text-muted-foreground">
                    {d.exceptions.length === 0 ? 'No exceptions' : `${d.openExceptions} open of ${d.exceptions.length} exception${d.exceptions.length > 1 ? 's' : ''}`}
                  </span>
                  {d.superseded && <Tag>Superseded custodian version</Tag>}
                </div>

                <div className="px-5 pt-4">
                  <Notice tone="info" title="Source values are preserved">
                    The custodian&apos;s submitted values are stored exactly as received, and Matanho&apos;s internal transactions and holdings are never modified from this screen. Resolving an exception records a decision, who made it and when.
                  </Notice>
                </div>

                <DetailSection
                  title={orphan ? 'Internal trade without a custodian record' : 'Custodian vs Matanho internal book'}
                  description={d.kind === 'DAY_END' ? 'Differences are highlighted. Internal figures are taken from current holdings (MVP simplification), not a historical snapshot.' : 'Fields that differ are highlighted. A matching trade reference alone is never enough to match.'}
                >
                  {hasComparison ? (
                    <Comparison rows={d.differences} />
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      <SnapshotCard title="Custodian (source)" data={d.source} empty="No custodian record has been received." />
                      <SnapshotCard title="Matanho internal book" data={d.internal} empty="No matching internal record." />
                    </div>
                  )}
                  {d.kind === 'DAY_END' && typeof d.internal?.basis === 'string' && <p className="mt-2 text-[11px] leading-relaxed text-ink-3">{d.internal.basis}</p>}
                </DetailSection>

                <DetailSection title="Exceptions" description={d.exceptions.length ? 'Resolve each exception with a note. When all are resolved the item and the custodian record are marked Resolved.' : undefined}>
                  {d.exceptions.length === 0 ? (
                    <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                      <Check className="size-4 text-success" /> Every compared field agrees. Nothing to resolve.
                    </p>
                  ) : (
                    <ul className="grid gap-2.5">
                      {d.exceptions.map((x) => (
                        <li key={x.id} className="rounded-lg border border-border bg-surface px-3.5 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[12.5px] font-semibold">{EXCEPTION_LABELS[x.type]}</span>
                                {x.status === 'OPEN' ? <StatusIndicator tone="warning">Open</StatusIndicator> : <StatusIndicator tone="success">Resolved</StatusIndicator>}
                              </div>
                              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{x.description}</p>
                              {(x.expected || x.actual) && (
                                <p className="num mt-1 text-[11.5px] text-muted-foreground">
                                  Internal: <b className="font-semibold text-foreground">{x.expected ?? '—'}</b> · Custodian: <b className="font-semibold text-foreground">{x.actual ?? '—'}</b>
                                </p>
                              )}
                            </div>
                            {x.status === 'OPEN' && canResolve && (
                              <Button size="sm" variant="secondary" onClick={() => setResolving(x)}>
                                Resolve…
                              </Button>
                            )}
                          </div>
                          {x.status === 'RESOLVED' && (
                            <div className="mt-2.5 rounded-md border border-border-soft bg-surface-2 px-3 py-2 text-[12px]">
                              <div className="text-ink-2">{x.resolutionNote}</div>
                              <div className="num mt-1 text-[11px] text-muted-foreground">
                                Resolved by <b className="font-semibold text-foreground">{x.resolvedByName ?? 'unknown'}</b> · {formatDateTime(x.resolvedAt)}
                              </div>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {d.openExceptions > 0 && !canResolve && <p className="mt-3 text-[11.5px] text-muted-foreground">You have read-only access. An operations officer must resolve open exceptions.</p>}
                </DetailSection>

                {d.submission && (
                  <DetailSection title="Original custodian submission" description="Preserved as submitted; corrections create a new version.">
                    <InfoList>
                      <InfoRow label="Reference" mono>{d.submission.ref} (version {d.submission.version})</InfoRow>
                      <InfoRow label="Custodian">{d.submission.custodian.name}</InfoRow>
                      <InfoRow label="Account">{d.submission.account.accountNumber} · {d.submission.account.name}</InfoRow>
                      <InfoRow label="Submitted by">{d.submission.submittedByName ?? '—'} · {formatDateTime(d.submission.createdAt)}</InfoRow>
                      {d.submission.correctionReason && <InfoRow label="Correction">{d.submission.correctionReason}</InfoRow>}
                      {d.submission.fileSha256 && <InfoRow label="File SHA-256" mono><span className="break-all text-[11.5px]">{d.submission.fileSha256}</span></InfoRow>}
                    </InfoList>
                    <div className="mt-3">
                      <Button asChild variant="secondary" size="sm">
                        <Link href={`/internal/operations/custodian?q=${encodeURIComponent(d.submission.ref)}`}>
                          <ExternalLink /> Open in custodian submissions
                        </Link>
                      </Button>
                    </div>
                    {d.submission.document && (
                      <div className="mt-4">
                        <div className="mb-1.5 text-[11.5px] font-semibold text-ink-2">
                          Official day-end file · {d.submission.document.fileName} · {formatBytes(d.submission.document.sizeBytes)}
                        </div>
                        <DocumentPreviewPanel doc={{ id: d.submission.document.id, title: d.submission.document.title, mimeType: d.submission.document.mimeType, fileName: d.submission.document.fileName, version: d.submission.document.version }} height={340} />
                      </div>
                    )}
                  </DetailSection>
                )}

                {d.transaction && (
                  <DetailSection title="Linked internal transaction" description="Read-only. Matched by reconciliation; each internal trade is consumed by at most one item.">
                    <InfoList>
                      <InfoRow label="Transaction" mono>{d.transaction.ref} · {d.transaction.tradeReference ?? 'no reference'}</InfoRow>
                      <InfoRow label="Trade">{d.transaction.side} {formatQuantity(d.transaction.quantity)} {d.transaction.ticker} @ {formatPrice(d.transaction.price)} {d.transaction.currency}</InfoRow>
                      <InfoRow label="Trade date">{formatDate(d.transaction.tradeDate)}</InfoRow>
                      <InfoRow label="Settlement">{formatDate(d.transaction.settlementDate)}</InfoRow>
                      <InfoRow label="Broker">{d.transaction.broker ?? '—'}</InfoRow>
                    </InfoList>
                  </DetailSection>
                )}

                <DetailSection title="Notes and history">
                  <ActivityTimeline items={d.timeline.map((t) => ({ id: t.id, title: t.title, body: t.body, at: t.at, actor: t.actor, tone: t.tone }))} empty="No activity has been recorded for this item yet." />
                  {canResolve && (
                    <div className="mt-4 border-t border-border-soft pt-3">
                      <label htmlFor="recon-note" className="mb-1.5 block text-[11.5px] font-semibold text-ink-2">
                        Add a note
                      </label>
                      <Textarea id="recon-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Visible in the item history. Does not change the status." />
                      <div className="mt-2 flex justify-end">
                        <Button size="sm" variant="secondary" disabled={note.trim().length < 3} loading={addNote.isPending} onClick={() => addNote.mutate()}>
                          Add note
                        </Button>
                      </div>
                    </div>
                  )}
                </DetailSection>
              </>
            )}
          </SheetContent>
        )}
      </Sheet>
      <ResolveDialog exception={resolving} onClose={() => setResolving(null)} onDone={refresh} />
    </>
  );
}
