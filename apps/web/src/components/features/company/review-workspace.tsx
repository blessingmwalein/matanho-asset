'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Download, Eye, MessageSquarePlus } from 'lucide-react';
import {
  daysUntil,
  formatBytes,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
  P,
  raiseQuestionSchema,
  requestCorrectionsSchema,
  type PackField,
} from '@nexus/shared';
import { api, ApiError, documentUrl } from '@/lib/api';
import { useCan } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/controls';
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/input';
import { useCrumbs } from '@/components/shell/crumbs';
import { ActivityTimeline, DocumentPreviewPanel, fileIconFor, ReviewPanel } from '@/components/nx/blocks';
import { Segmented } from '@/components/nx/filters';
import { ErrorState, PageHeader, Panel, PanelBody, PanelHeader, PanelSkeleton } from '@/components/nx/layout';
import { CompanySubmissionStatus, StatusIndicator } from '@/components/nx/status';
import { Notice } from '@/components/features/custodian/notice';
import { CompletionBar } from './completion-bar';
import type { ReviewDetail, ReviewSection } from './internal-types';
import type { FileDoc } from './types';

/* ── value formatting (read-only tables) ───────────────────────────────────── */
function fmtField(type: PackField['type'], v: unknown, currency: string): string | null {
  if (v === null || v === undefined || v === '') return null;
  switch (type) {
    case 'money':
      return formatMoney(v as number, currency, { decimals: 0 });
    case 'percent':
      return formatPercent(v as number, 2);
    case 'number':
      return formatNumber(v as number, 0);
    case 'date':
      return formatDate(v as string);
    default:
      return String(v);
  }
}

function FieldTables({ section, currency }: { section: ReviewSection; currency: string }) {
  const groups: Array<{ group: string | null; fields: ReviewSection['fields'] }> = [];
  for (const f of section.fields) {
    const last = groups[groups.length - 1];
    if (last && last.group === f.group) last.fields.push(f);
    else groups.push({ group: f.group, fields: [f] });
  }
  return (
    <div className="grid gap-4">
      {groups.map((g, i) => (
        <div key={g.group ?? i}>
          {g.group && <h4 className="mb-1.5 text-[11.5px] font-bold uppercase tracking-[0.07em] text-ink-3">{g.group}</h4>}
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full border-collapse text-[12.5px]">
              <tbody>
                {g.fields.map((f) => {
                  const text = fmtField(f.type, f.value, currency);
                  const numeric = ['money', 'number', 'percent'].includes(f.type);
                  return (
                    <tr key={f.key} className="border-b border-border-soft last:border-b-0">
                      <td className="w-[45%] px-3 py-2 text-muted-foreground">
                        {f.label}
                        {f.required && <span className="ml-0.5 text-danger">*</span>}
                      </td>
                      <td className={cn('px-3 py-2', numeric && 'num text-right font-medium', f.type === 'textarea' && 'leading-relaxed')}>
                        {text ?? <span className="text-ink-3">{f.required ? 'Not provided' : '—'}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function RepeaterTable({ r, currency }: { r: ReviewSection['repeaters'][number]; currency: string }) {
  return (
    <div>
      <h4 className="mb-1.5 text-[12.5px] font-semibold">{r.label}</h4>
      {r.rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-3 text-[12px] text-muted-foreground">No rows provided.</p>
      ) : (
        <div className="nx-scroll overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[420px] border-collapse text-[12.5px]">
            <thead className="bg-surface-2">
              <tr>
                {r.columns.map((c) => (
                  <th key={c.key} className={cn('h-8 border-b border-border px-3 text-left text-[10px] font-bold uppercase tracking-[0.07em] text-ink-3', c.type === 'money' && 'text-right')}>
                    {c.label}
                  </th>
                ))}
                {r.key === 'certificates' && <th className="h-8 border-b border-border px-3 text-left text-[10px] font-bold uppercase tracking-[0.07em] text-ink-3">Evidence</th>}
              </tr>
            </thead>
            <tbody>
              {r.rows.map((row, i) => (
                <tr key={i} className="border-b border-border-soft last:border-b-0">
                  {r.columns.map((c) => {
                    const v = row[c.key];
                    let text: string = v === null || v === undefined || v === '' ? '—' : String(v);
                    if (c.type === 'money' && v !== undefined && v !== null && v !== '') text = formatMoney(v as number, (row.currency as string) ?? currency, { decimals: 0 });
                    if (c.type === 'date' && v) text = formatDate(v as string);
                    return (
                      <td key={c.key} className={cn('px-3 py-2', c.type === 'money' && 'num text-right font-medium')}>
                        {text}
                      </td>
                    );
                  })}
                  {r.key === 'certificates' && (
                    <td className="px-3 py-2">
                      {(() => {
                        const days = typeof row.expiry_date === 'string' ? daysUntil(row.expiry_date) : null;
                        if (days === null) return '—';
                        if (days < 0) return <StatusIndicator tone="danger">Expired</StatusIndicator>;
                        if (days <= 60) return <StatusIndicator tone="warning">Expires in {days}d</StatusIndicator>;
                        return <StatusIndicator tone="success">Current</StatusIndicator>;
                      })()}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EvidenceList({ files, onPreview }: { files: ReviewSection['files']; onPreview: (d: FileDoc) => void }) {
  return (
    <div className="grid gap-2.5">
      {files.map((slot) => (
        <div key={slot.key} className="rounded-lg border border-border bg-surface-2 p-3">
          <div className="mb-1.5 text-[12.5px] font-semibold">
            {slot.label}
            {slot.required && <span className="ml-0.5 text-danger">*</span>}
          </div>
          {slot.documents.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">{slot.required ? 'Required file not uploaded.' : 'Not provided (optional).'}</p>
          ) : (
            <ul className="grid gap-1.5">
              {slot.documents.map((d) => {
                const Icon = fileIconFor(d.mimeType, d.fileName ?? undefined);
                return (
                  <li key={d.id} className="flex flex-wrap items-center gap-2.5 rounded-md border border-border bg-surface px-2.5 py-2 text-[12px]">
                    <Icon className="size-4 shrink-0 text-ink-3" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{d.fileName}</div>
                      <div className="num text-[10.5px] text-muted-foreground">
                        Version {d.versionNo}
                        {d.versions.length > 1 ? ` of ${d.versions.length}` : ''} · {formatBytes(d.sizeBytes)} · {formatDateTime(d.uploadedAt)}
                        {d.uploadedByName ? ` · ${d.uploadedByName}` : ''}
                      </div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => onPreview(d)}>
                      <Eye /> Preview
                    </Button>
                    <Button asChild size="sm" variant="tertiary">
                      <a href={documentUrl(d.id, { version: d.versionNo })} aria-label={`Download ${d.fileName}`}>
                        <Download /> Download
                      </a>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function SectionPanel({ s, currency, onPreview }: { s: ReviewSection; currency: string; onPreview: (d: FileDoc) => void }) {
  const tone = s.complete ? 'success' : s.status === 'IN_PROGRESS' ? 'info' : 'warning';
  return (
    <Panel>
      <PanelHeader
        title={s.title}
        description={s.description}
        actions={<StatusIndicator tone={tone}>{s.complete ? 'Complete' : s.status === 'IN_PROGRESS' ? 'Incomplete' : 'Not started'}</StatusIndicator>}
      />
      <PanelBody className="grid gap-5">
        {!s.complete && s.missing.length > 0 && (
          <Notice tone="warning" title="Missing required items">
            {s.missing.join(', ')}
          </Notice>
        )}
        {s.fields.length > 0 && <FieldTables section={s} currency={currency} />}
        {s.repeaters.map((r) => (
          <RepeaterTable key={r.key} r={r} currency={currency} />
        ))}
        {s.files.length > 0 && (
          <div>
            <h4 className="mb-1.5 text-[12.5px] font-semibold">Evidence</h4>
            <EvidenceList files={s.files} onPreview={onPreview} />
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}

/** Real preview of the stored file, with a version switcher when the company has replaced it. */
function PreviewDialog({ doc, onClose }: { doc: FileDoc | null; onClose: () => void }) {
  const [version, setVersion] = React.useState<number>(1);
  React.useEffect(() => {
    if (doc) setVersion(doc.versionNo);
  }, [doc]);
  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && onClose()}>
      {doc && (
        <DialogContent title={doc.title} description={`${doc.fileName} · SHA-256 ${doc.sha256?.slice(0, 16)}…`} size="xl">
          {doc.versions.length > 1 && (
            <div className="mb-3 flex items-center gap-2">
              <span className="text-[11.5px] font-semibold text-ink-2">Version</span>
              <Segmented<string> size="sm" value={String(version)} onChange={(v) => setVersion(Number(v))} options={doc.versions.map((v) => ({ value: String(v.versionNo), label: `v${v.versionNo}${v.versionNo === doc.versionNo ? ' (current)' : ''}` }))} />
            </div>
          )}
          <DocumentPreviewPanel doc={{ id: doc.id, title: doc.title, mimeType: doc.mimeType, fileName: doc.versions.find((v) => v.versionNo === version)?.fileName ?? doc.fileName, version }} height={540} />
        </DialogContent>
      )}
    </Dialog>
  );
}

export function ReviewWorkspace({ id }: { id: string }) {
  const qc = useQueryClient();
  const can = useCan();
  const canReview = can(P.COMPANIES_REVIEW);
  const [preview, setPreview] = React.useState<FileDoc | null>(null);
  const [acceptOpen, setAcceptOpen] = React.useState(false);
  const [acceptNote, setAcceptNote] = React.useState('');
  const [correctionsOpen, setCorrectionsOpen] = React.useState(false);
  const [correctionsMsg, setCorrectionsMsg] = React.useState('');
  const [correctionsErr, setCorrectionsErr] = React.useState<string | null>(null);
  const [question, setQuestion] = React.useState('');
  const [questionSection, setQuestionSection] = React.useState<string>('__all__');
  const [questionErr, setQuestionErr] = React.useState<string | null>(null);

  const q = useQuery({ queryKey: ['company-review', id], queryFn: () => api<ReviewDetail>(`/company-submissions/${id}`) });
  const d = q.data;
  useCrumbs(d ? [{ label: d.company.name }, { label: d.period.label }] : null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['company-review', id] });
    void qc.invalidateQueries({ queryKey: ['company-register'] });
    void qc.invalidateQueries({ queryKey: ['nav-counts'] });
  };

  const raise = useMutation({
    mutationFn: () => api(`/company-submissions/${id}/questions`, { method: 'POST', body: { question: question.trim(), requirementKey: questionSection === '__all__' ? undefined : questionSection } }),
    onSuccess: () => {
      toast.success('Question raised', { description: 'The company has been notified. The pack is now waiting on their answer.' });
      setQuestion('');
      setQuestionErr(null);
      refresh();
    },
    onError: (e) => setQuestionErr(e instanceof ApiError ? (e.errors?.question ?? e.message) : 'Could not raise the question'),
  });

  const corrections = useMutation({
    mutationFn: () => api(`/company-submissions/${id}/request-corrections`, { method: 'POST', body: { message: correctionsMsg.trim() } }),
    onSuccess: () => {
      toast.success('Corrections requested', { description: 'The company can edit and resubmit the pack.' });
      setCorrectionsOpen(false);
      setCorrectionsMsg('');
      refresh();
    },
    onError: (e) => setCorrectionsErr(e instanceof ApiError ? (e.errors?.message ?? e.message) : 'Could not request corrections'),
  });

  const accept = useMutation({
    mutationFn: () => api(`/company-submissions/${id}/accept`, { method: 'POST', body: { note: acceptNote.trim() || undefined } }),
    onSuccess: () => {
      toast.success('Pack accepted', { description: 'The period is closed and the company has been notified.' });
      setAcceptOpen(false);
      setAcceptNote('');
      refresh();
    },
    onError: (e) => {
      setAcceptOpen(false);
      toast.error(e instanceof Error ? e.message : 'Could not accept the pack');
    },
  });

  const submitQuestion = () => {
    const parsed = raiseQuestionSchema.safeParse({ question });
    if (!parsed.success) {
      setQuestionErr(parsed.error.issues[0]?.message ?? 'Write the question');
      return;
    }
    setQuestionErr(null);
    raise.mutate();
  };
  const submitCorrections = () => {
    const parsed = requestCorrectionsSchema.safeParse({ message: correctionsMsg });
    if (!parsed.success) {
      setCorrectionsErr(parsed.error.issues[0]?.message ?? 'Describe the corrections required');
      return;
    }
    setCorrectionsErr(null);
    corrections.mutate();
  };

  if (q.isLoading) return <PanelSkeleton rows={10} />;
  if (q.error || !d) return <ErrorState message={(q.error as Error | null)?.message ?? 'Submission not found'} onRetry={() => void q.refetch()} />;

  const due = daysUntil(d.period.dueDate);
  const decided = d.status === 'ACCEPTED';

  return (
    <div>
      <PageHeader
        eyebrow={`Reporting submission · ${d.ref}`}
        title={`${d.company.name} · ${d.period.label}`}
        description={`${d.company.sector ?? ''}${d.company.fundName ? ` · ${d.company.fundName}` : ''}`}
        meta={<CompanySubmissionStatus status={d.status} />}
      />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* pack */}
        <div className="grid min-w-0 gap-4">
          {d.status === 'DRAFT' && <Notice tone="neutral" title="Not submitted yet">The company is still preparing this pack. Review actions become available once it is submitted.</Notice>}
          {d.reviewNote && d.status === 'CORRECTIONS_REQUESTED' && (
            <Notice tone="warning" title="Corrections requested">
              {d.reviewNote}
            </Notice>
          )}
          {d.sections.map((s) => (
            <SectionPanel key={s.key} s={s} currency={d.currency} onPreview={setPreview} />
          ))}
        </div>

        {/* review rail */}
        <div className="grid gap-4 xl:sticky xl:top-20">
          <Panel>
            <PanelHeader title="Review" description={`Version ${d.version}${d.submittedAt ? ` · submitted ${formatDateTime(d.submittedAt)}` : ''}`} />
            <PanelBody className="grid gap-3.5">
              <div>
                <div className="mb-1 flex items-center justify-between text-[11.5px] text-muted-foreground">
                  <span>Pack completion</span>
                  <span className="num">{d.completion.done} of {d.completion.total} required items</span>
                </div>
                <CompletionBar pct={d.completionPct} />
              </div>
              <dl className="grid gap-1.5 text-[12px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Due</dt>
                  <dd className="num font-medium">
                    {formatDate(d.period.dueDate)}
                    {!decided && due !== null && due < 0 && d.status === 'DRAFT' ? ' · overdue' : ''}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Submitted by</dt>
                  <dd className="font-medium">{d.submittedByName ?? '—'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Compliance evidence</dt>
                  <dd className="font-medium">{d.certificates.total ? `${d.certificates.current}/${d.certificates.total} current${d.certificates.expiring ? `, ${d.certificates.expiring} expiring` : ''}` : '—'}</dd>
                </div>
                {d.reviewedAt && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Last reviewed</dt>
                    <dd className="font-medium">
                      {d.reviewedByName} · {formatDateTime(d.reviewedAt)}
                    </dd>
                  </div>
                )}
              </dl>

              {decided ? (
                <Notice tone="success" title="Accepted">
                  {d.reviewNote ?? 'This pack has been accepted and the period is closed.'}
                </Notice>
              ) : d.canReview && canReview ? (
                <ReviewPanel title="Decision" description={d.canAccept ? 'Accept the pack or send it back to the company.' : `${d.openQuestions} open question${d.openQuestions > 1 ? 's' : ''} must be answered before the pack can be accepted.`}>
                  <Button variant="secondary" onClick={() => setCorrectionsOpen(true)}>
                    Request corrections
                  </Button>
                  <Button variant="primary" disabled={!d.canAccept} onClick={() => setAcceptOpen(true)}>
                    <Check /> Accept pack
                  </Button>
                </ReviewPanel>
              ) : !canReview ? (
                <Notice tone="neutral">You have read-only access to this pack.</Notice>
              ) : (
                <Notice tone="neutral" title="Waiting on the company">
                  {d.status === 'DRAFT' ? 'The pack has not been submitted.' : 'The company has to respond before the next review step.'}
                </Notice>
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Questions" description={d.questions.length ? `${d.openQuestions} open · ${d.questions.length} total` : 'Raise a question to ask the company for clarification.'} />
            <PanelBody className="grid gap-3">
              {d.questions.map((qq) => (
                <div key={qq.id} className="rounded-lg border border-border bg-surface px-3 py-2.5 text-[12.5px]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium leading-relaxed">{qq.question}</div>
                    {qq.status === 'OPEN' ? <StatusIndicator tone="warning">Open</StatusIndicator> : <StatusIndicator tone="success">{qq.status === 'CLOSED' ? 'Closed' : 'Answered'}</StatusIndicator>}
                  </div>
                  <div className="num mt-0.5 text-[11px] text-muted-foreground">
                    {qq.raisedByName} · {formatDateTime(qq.createdAt)}
                  </div>
                  {qq.answer && (
                    <div className="mt-2 rounded-md bg-surface-2 px-2.5 py-2 text-ink-2">
                      {qq.answer}
                      <div className="num mt-1 text-[11px] text-muted-foreground">
                        {qq.answeredByName} · {formatDateTime(qq.answeredAt)}
                      </div>
                      {qq.attachments.map((a) => (
                        <a key={a.id} href={documentUrl(a.id)} className="mt-1 block text-[11.5px] font-semibold text-primary hover:underline">
                          {a.fileName}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {canReview && d.canReview && (
                <div className="border-t border-border-soft pt-3">
                  <label htmlFor="new-question" className="mb-1.5 block text-[11.5px] font-semibold text-ink-2">
                    Raise a question
                  </label>
                  <Select value={questionSection} onValueChange={setQuestionSection}>
                    <SelectTrigger aria-label="Section the question relates to" className="mb-2 h-8 text-[12px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">General (whole pack)</SelectItem>
                      {d.sections.map((s) => (
                        <SelectItem key={s.key} value={s.key}>
                          {s.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Textarea id="new-question" rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} aria-invalid={!!questionErr} placeholder="e.g. Please explain the movement in cost of sales against last month." />
                  {questionErr && (
                    <p role="alert" className="mt-1 text-[11.5px] font-medium text-danger">
                      {questionErr}
                    </p>
                  )}
                  <div className="mt-2 flex justify-end">
                    <Button size="sm" variant="secondary" loading={raise.isPending} onClick={submitQuestion}>
                      <MessageSquarePlus /> Raise question
                    </Button>
                  </div>
                </div>
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Status history" />
            <PanelBody>
              <ActivityTimeline items={d.timeline} empty="No review activity yet." />
            </PanelBody>
          </Panel>
        </div>
      </div>

      <PreviewDialog doc={preview} onClose={() => setPreview(null)} />

      <ConfirmDialog
        open={acceptOpen}
        onOpenChange={setAcceptOpen}
        title="Accept this reporting pack?"
        description={`The ${d.period.label} pack for ${d.company.name} will be marked accepted and the period closed. The company is notified.`}
        confirmLabel="Accept pack"
        loading={accept.isPending}
        onConfirm={() => accept.mutate()}
      >
        <label htmlFor="accept-note" className="mb-1.5 block text-[11.5px] font-semibold text-ink-2">
          Note to the company <span className="font-normal text-ink-3">(optional)</span>
        </label>
        <Textarea id="accept-note" rows={2} value={acceptNote} onChange={(e) => setAcceptNote(e.target.value)} />
      </ConfirmDialog>

      <Dialog open={correctionsOpen} onOpenChange={setCorrectionsOpen}>
        <DialogContent title="Request corrections" description="The pack returns to the company, who can edit and resubmit it. Describe exactly what needs to change.">
          <label htmlFor="corrections-msg" className="mb-1.5 block text-[11.5px] font-semibold text-ink-2">
            Corrections required <span className="text-danger">*</span>
          </label>
          <Textarea id="corrections-msg" rows={4} value={correctionsMsg} onChange={(e) => setCorrectionsMsg(e.target.value)} aria-invalid={!!correctionsErr} placeholder="e.g. The balance sheet does not balance: total assets differ from liabilities plus equity." />
          {correctionsErr && (
            <p role="alert" className="mt-1 text-[11.5px] font-medium text-danger">
              {correctionsErr}
            </p>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCorrectionsOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={corrections.isPending} onClick={submitCorrections}>
              Send to company
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
