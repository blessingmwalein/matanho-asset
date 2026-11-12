'use client';

import * as React from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookOpen, Save, Send } from 'lucide-react';
import { certificateStatus, computePackCompletion, daysUntil, formatDate, formatDateTime, REPORTING_PACK } from '@nexus/shared';
import { api, ApiError } from '@/lib/api';
import { useIdempotencyKey } from '@/lib/idempotency';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/controls';
import { ConfirmDialog, Dialog, DialogContent } from '@/components/ui/dialog';
import { DocumentPreviewPanel } from '@/components/nx/blocks';
import { EmptyState, ErrorState, KpiStrip, Panel, PanelBody, PanelHeader, PanelSkeleton } from '@/components/nx/layout';
import { CompanySubmissionStatus as SubmissionStatus, StatusIndicator, Tag } from '@/components/nx/status';
import { Notice } from '@/components/features/custodian/notice';
import { PackSectionPanel, type PreviewTarget } from './pack-form';
import { QuestionsPanel } from './questions-panel';
import { buildTasks, toFormValues, toPayload, type Dashboard, type FileDoc, type FV, type PeriodDetail, type Task } from './types';

const fileKeysOf = (files: Record<string, FileDoc[]>) => Object.keys(files).filter((k) => files[k]!.length > 0);

const TASK_TONE: Record<Task['status'], 'success' | 'warning' | 'danger' | 'info'> = { COMPLETE: 'success', DUE: 'warning', IN_PROGRESS: 'info', EXPIRING: 'warning', EXPIRED: 'danger' };
const TAG_TONE: Record<Task['status'], 'success' | 'warning' | 'danger' | 'info'> = TASK_TONE;

/** Quick upload row for the three required evidence files ("Submit reporting pack" card in company-portal.html). */
function QuickUpload({ label, docs, editable, uploading, onPick, onJump }: { label: string; docs: FileDoc[]; editable: boolean; uploading: boolean; onPick: (file: File) => void; onJump: () => void }) {
  const input = React.useRef<HTMLInputElement>(null);
  const doc = docs[0];
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-[#c4c0b4] px-3 py-2.5">
      <div className="min-w-0">
        <button type="button" onClick={onJump} className="text-left text-[12.5px] font-semibold hover:text-primary">
          {label}
        </button>
        <div className="truncate text-[11.5px] text-muted-foreground">{doc ? `${doc.fileName} · v${doc.versionNo}` : 'Not uploaded yet'}</div>
      </div>
      {editable && (
        <>
          <input ref={input} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.csv,.txt,.xls,.xlsx,.doc,.docx" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ''; }} />
          <Button type="button" size="sm" variant="secondary" loading={uploading} onClick={() => input.current?.click()}>
            {doc ? 'Replace' : 'Upload'}
          </Button>
        </>
      )}
      {!editable && doc && <StatusIndicator tone="success">Uploaded</StatusIndicator>}
    </div>
  );
}

function statusBanner(d: PeriodDetail, remaining: number) {
  const s = d.submission;
  switch (s.status) {
    case 'DRAFT':
      return { tone: 'neutral' as const, title: 'Draft: not yet submitted', body: remaining > 0 ? `${remaining} required item${remaining > 1 ? 's' : ''} still to complete before you can submit.` : 'All required items are complete. Review and submit the pack.' };
    case 'SUBMITTED':
    case 'RESUBMITTED':
      return { tone: 'info' as const, title: `${s.status === 'RESUBMITTED' ? 'Resubmitted' : 'Submitted'} for review${s.submittedAt ? ` on ${formatDateTime(s.submittedAt)}` : ''}`, body: `Version ${s.version} is with the investment team. The pack is read-only unless they request corrections or raise a question.` };
    case 'QUESTIONS_OPEN':
      return { tone: 'warning' as const, title: 'The investment team has questions', body: 'Answer the open questions below. When the last question is answered the pack returns to review.' };
    case 'CORRECTIONS_REQUESTED':
      return { tone: 'warning' as const, title: 'Corrections requested', body: s.reviewNote ?? 'Update the pack and resubmit it.' };
    case 'ACCEPTED':
      return { tone: 'success' as const, title: 'Accepted by the investment team', body: `${s.reviewedByName ? `${s.reviewedByName}${s.reviewedAt ? ` · ${formatDateTime(s.reviewedAt)}` : ''}. ` : ''}${s.reviewNote ?? 'This period is closed.'}` };
  }
}

export function CompanyPortal() {
  const qc = useQueryClient();
  const submitKey = useIdempotencyKey();
  const [periodId, setPeriodId] = React.useState<string>();
  const [hydratedId, setHydratedId] = React.useState<string>();
  const [openSections, setOpenSections] = React.useState<Record<string, boolean>>({});
  const [preview, setPreview] = React.useState<PreviewTarget | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [guideOpen, setGuideOpen] = React.useState(false);
  const [gate, setGate] = React.useState<string[] | null>(null);
  const [uploadingKey, setUploadingKey] = React.useState<string | null>(null);

  const dash = useQuery({
    queryKey: ['company', 'dashboard', periodId ?? 'auto'],
    queryFn: () => api<Dashboard>('/company-portal/dashboard', { query: { periodId } }),
    placeholderData: keepPreviousData,
  });
  const activeId = periodId ?? dash.data?.selected?.id;
  const detailQ = useQuery({ queryKey: ['company', 'period', activeId], queryFn: () => api<PeriodDetail>(`/company-portal/periods/${activeId}`), enabled: !!activeId });
  const detail = detailQ.data;

  const form = useForm<FV>({ defaultValues: {} });
  const watched = useWatch({ control: form.control }) as FV;

  // hydrate the form once per period (never on background refetches, so unsaved edits are safe)
  React.useEffect(() => {
    if (!detail || hydratedId === detail.period.id) return;
    form.reset(toFormValues(detail.values));
    setHydratedId(detail.period.id);
    const c = computePackCompletion(detail.values, fileKeysOf(detail.files));
    setOpenSections(Object.fromEntries(c.sections.map((s) => [s.key, detail.editable ? !s.complete : false])));
    setGate(null);
  }, [detail, hydratedId, form]);

  const ready = !!detail && hydratedId === detail.period.id;
  const fileKeys = detail ? fileKeysOf(detail.files) : [];
  const completion = React.useMemo(() => computePackCompletion(watched ?? {}, fileKeys), [watched, fileKeys.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const certs = React.useMemo(() => certificateStatus((watched as FV)?.certificates), [watched]);
  const tasks = React.useMemo(() => buildTasks(completion, certs), [completion, certs]);
  const remaining = completion.total - completion.done;
  const editable = !!detail?.editable;
  const openQuestions = detail?.questions.filter((q) => q.status === 'OPEN').length ?? 0;

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['company'] });

  const save = useMutation({
    mutationFn: () => api<PeriodDetail>(`/company-portal/periods/${activeId}/values`, { method: 'PUT', body: { values: toPayload(form.getValues()) } }),
    onSuccess: (d) => {
      qc.setQueryData(['company', 'period', activeId], d);
      form.reset(toFormValues(d.values));
      setGate(null);
      toast.success('Draft saved', { description: `${d.completion.percent}% of the pack is complete.` });
      void qc.invalidateQueries({ queryKey: ['company', 'dashboard'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not save the draft'),
  });

  const upload = useMutation({
    mutationFn: ({ key, file }: { key: string; file: File }) => {
      const fd = new FormData();
      fd.set('key', key);
      fd.set('file', file);
      return api<PeriodDetail>(`/company-portal/periods/${activeId}/files`, { method: 'POST', form: fd });
    },
    onMutate: ({ key }) => setUploadingKey(key),
    onSuccess: (d, v) => {
      qc.setQueryData(['company', 'period', activeId], d);
      toast.success('File uploaded', { description: `${v.file.name} was stored with its fingerprint.` });
      void qc.invalidateQueries({ queryKey: ['company', 'dashboard'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? (e.errors?.file ?? e.message) : 'Upload failed'),
    onSettled: () => setUploadingKey(null),
  });

  const submit = useMutation({
    mutationFn: async () => {
      await api(`/company-portal/periods/${activeId}/values`, { method: 'PUT', body: { values: toPayload(form.getValues()) } });
      return api<{ alreadySubmitted: boolean; status: string; version: number }>(`/company-portal/periods/${activeId}/submit`, { method: 'POST', idempotencyKey: submitKey.get() });
    },
    onSuccess: (r) => {
      submitKey.reset();
      setConfirmOpen(false);
      setGate(null);
      toast.success(r.alreadySubmitted ? 'This pack was already submitted' : 'Reporting pack submitted for review', { description: `Version ${r.version} is with the investment team.` });
      invalidate();
    },
    onError: (e) => {
      submitKey.reset();
      setConfirmOpen(false);
      if (e instanceof ApiError && e.status === 422) {
        setGate(Object.values(e.errors ?? {}));
        toast.error('The pack is incomplete', { description: 'The outstanding items are listed above the pack.' });
        window.setTimeout(() => document.getElementById('gate')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      } else toast.error(e instanceof Error ? e.message : 'Submission failed');
    },
  });

  const switchPeriod = (id: string) => {
    if (id === activeId) return;
    if (form.formState.isDirty && !window.confirm('You have unsaved changes in this pack. Switch period and discard them?')) return;
    setPeriodId(id);
    setHydratedId(undefined);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const jumpTo = (key: string) => {
    setOpenSections((o) => ({ ...o, [key]: true }));
    window.setTimeout(() => document.getElementById(`section-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  /* ── loading / empty / error ─────────────────────────────────────────────── */
  if (dash.isLoading) return <PanelSkeleton rows={8} />;
  if (dash.error) return <ErrorState message={(dash.error as Error).message} onRetry={() => void dash.refetch()} />;
  const d = dash.data;
  if (!d?.company || d.periods.length === 0) {
    return <EmptyState title="No reporting periods yet" description="The investment team has not opened a reporting period for your company. You will be notified when one is available." />;
  }

  const banner = detail ? statusBanner(detail, remaining) : null;
  const due = detail ? daysUntil(detail.period.dueDate) : null;
  const dueHint = detail ? `Due ${formatDate(detail.period.dueDate)}${editable && due !== null ? (due < 0 ? ` · ${Math.abs(due)} day${Math.abs(due) === 1 ? '' : 's'} overdue` : due === 0 ? ' · today' : ` · ${due} day${due === 1 ? '' : 's'} left`) : ''}` : undefined;
  const covHint = certs.total === 0 ? 'No certificates recorded' : certs.expired > 0 ? `${certs.expired} expired` : certs.expiring > 0 ? `${certs.expiring} expiring within 60 days` : 'Evidence current';
  const requiredSlots = REPORTING_PACK.flatMap((s) => s.files.filter((f) => f.required).map((f) => ({ ...f, section: s.key })));

  return (
    <div className="grid gap-3">
      {/* hero */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface px-5 py-5">
        <div className="min-w-0">
          <span className="eyebrow !text-primary">{d.company.name.toUpperCase()}</span>
          <h1 className="mt-1 text-[24px] font-semibold leading-tight tracking-[-0.03em]">Monthly reporting</h1>
          <p className="mt-1 text-[12px] text-muted-foreground">Submit the numbers once. The investment team reviews the controlled pack in Private Markets.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={activeId} onValueChange={switchPeriod}>
            <SelectTrigger aria-label="Reporting period" className="h-9 w-[190px] text-[12.5px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {d.periods.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="secondary" onClick={() => setGuideOpen(true)}>
            <BookOpen /> Reporting guide
          </Button>
        </div>
      </section>

      {d.needsAction.length > 0 && (
        <Notice
          tone="warning"
          title="Another period needs your attention"
          actions={d.needsAction.map((p) => (
            <Button key={p.id} size="sm" variant="secondary" onClick={() => switchPeriod(p.id)}>
              Open {p.label}
            </Button>
          ))}
        >
          {d.needsAction.map((p) => `${p.label}: ${p.openQuestions > 0 ? `${p.openQuestions} open question${p.openQuestions > 1 ? 's' : ''}` : p.status === 'CORRECTIONS_REQUESTED' ? 'corrections requested' : `${p.completionPct}% complete`}`).join(' · ')}
        </Notice>
      )}

      {!ready || !detail ? (
        detailQ.error ? (
          <ErrorState message={(detailQ.error as Error).message} onRetry={() => void detailQ.refetch()} />
        ) : (
          <PanelSkeleton rows={8} />
        )
      ) : (
        <FormProvider {...form}>
          {/* status strip */}
          <KpiStrip
            items={[
              { label: 'Current period', value: detail.period.label, hint: dueHint },
              { label: 'Completion', value: `${completion.percent}%`, hint: remaining > 0 ? `${remaining} item${remaining > 1 ? 's' : ''} remaining` : 'All required items complete' },
              { label: 'Open questions', value: openQuestions, hint: 'Investment team' },
              { label: 'Covenants', value: certs.total ? `${certs.current} / ${certs.total}` : '–', hint: covHint },
            ]}
          />

          {banner && (
            <Notice tone={banner.tone} title={banner.title} role="status">
              {banner.body}
            </Notice>
          )}
          {gate && (
            <div id="gate">
              <Notice tone="danger" role="alert" title="The pack cannot be submitted yet">
                The server checked the pack and these required items are outstanding:
                <ul className="mt-1.5 list-disc pl-5">
                  {gate.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
              </Notice>
            </div>
          )}

          {/* attention + submit */}
          <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <Panel>
              <PanelHeader title="What needs attention" description={editable ? 'Select an item to jump to it.' : undefined} />
              <div className="px-4 pb-2">
                {tasks.map((t) => (
                  <button key={t.key} type="button" onClick={() => jumpTo(t.key)} className="grid w-full grid-cols-[1fr_auto] items-center gap-3 border-t border-border-soft py-3 text-left first:border-t-0 hover:text-primary">
                    <span className="min-w-0">
                      <strong className="block text-[12.5px] font-semibold">{t.title}</strong>
                      <small className="mt-0.5 block text-[11.5px] text-muted-foreground">{t.status !== 'COMPLETE' && t.missing.length ? `Missing: ${t.missing.slice(0, 3).join(', ')}${t.missing.length > 3 ? ` and ${t.missing.length - 3} more` : ''}` : t.description}</small>
                    </span>
                    <Tag tone={TAG_TONE[t.status]}>{t.label}</Tag>
                  </button>
                ))}
              </div>
            </Panel>

            <Panel>
              <PanelHeader title="Submit reporting pack" description={`${detail.period.label} · version ${detail.submission.version}`} />
              <PanelBody className="grid gap-2.5">
                {requiredSlots.map((s) => (
                  <QuickUpload key={s.key} label={s.label} docs={detail.files[s.key] ?? []} editable={editable} uploading={uploadingKey === s.key} onPick={(file) => upload.mutate({ key: s.key, file })} onJump={() => jumpTo(s.section)} />
                ))}
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11.5px] text-muted-foreground">{form.formState.isDirty ? <span className="font-semibold text-warning">Unsaved changes</span> : editable ? 'All changes saved' : 'Read-only'}</span>
                  <div className="flex gap-2">
                    <Button variant="secondary" disabled={!editable} loading={save.isPending} onClick={() => save.mutate()}>
                      <Save /> Save draft
                    </Button>
                    <Button variant="primary" disabled={!editable} onClick={() => setConfirmOpen(true)}>
                      <Send /> {detail.submission.status === 'DRAFT' ? 'Submit pack' : 'Resubmit pack'}
                    </Button>
                  </div>
                </div>
              </PanelBody>
            </Panel>
          </div>

          {detail.questions.length > 0 && <QuestionsPanel questions={detail.questions} />}

          {/* reporting pack */}
          <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight">Reporting pack</h2>
              <p className="text-[11.5px] text-muted-foreground">Values are in {detail.currency}. Required fields are marked *. Completion is calculated from the saved values and uploaded files.</p>
            </div>
            <div className="flex gap-3 text-[12px] font-semibold text-primary">
              <button type="button" className="hover:underline" onClick={() => setOpenSections(Object.fromEntries(REPORTING_PACK.map((s) => [s.key, true])))}>
                Expand all
              </button>
              <button type="button" className="hover:underline" onClick={() => setOpenSections({})}>
                Collapse all
              </button>
            </div>
          </div>
          {REPORTING_PACK.map((s) => (
            <PackSectionPanel
              key={s.key}
              section={s}
              task={tasks.find((t) => t.key === s.key)!}
              open={!!openSections[s.key]}
              onToggle={() => setOpenSections((o) => ({ ...o, [s.key]: !o[s.key] }))}
              editable={editable}
              currency={detail.currency}
              files={detail.files}
              uploadingKey={uploadingKey}
              onUpload={(key, file) => upload.mutate({ key, file })}
              onPreview={setPreview}
            />
          ))}
          {editable && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="secondary" loading={save.isPending} onClick={() => save.mutate()}>
                <Save /> Save draft
              </Button>
              <Button variant="primary" onClick={() => setConfirmOpen(true)}>
                <Send /> {detail.submission.status === 'DRAFT' ? 'Submit pack' : 'Resubmit pack'}
              </Button>
            </div>
          )}

          {/* history */}
          <Panel>
            <PanelHeader title="Reporting history" description="Packs for earlier and upcoming periods." />
            <div className="nx-scroll overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-[12.5px]">
                <thead className="bg-surface-2">
                  <tr className="text-left">
                    {['Period', 'Status', 'Completion', 'Due', ''].map((h) => (
                      <th key={h} className="h-9 border-y border-border px-4 text-[10px] font-bold uppercase tracking-[0.07em] text-ink-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.periods.map((p) => (
                    <tr key={p.id} className={cn('border-b border-border-soft last:border-b-0', p.id === activeId && 'bg-primary-soft/50')}>
                      <td className="px-4 py-2.5 font-semibold">{p.label}</td>
                      <td className="px-4 py-2.5">
                        <SubmissionStatus status={p.status} />
                      </td>
                      <td className="num px-4 py-2.5">{p.completionPct}%</td>
                      <td className="num px-4 py-2.5">{formatDate(p.dueDate)}</td>
                      <td className="px-4 py-2.5 text-right">
                        {p.id === activeId ? <span className="text-[11.5px] text-muted-foreground">Viewing</span> : (
                          <Button size="sm" variant="tertiary" onClick={() => switchPeriod(p.id)}>
                            Open
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </FormProvider>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={detail?.submission.status === 'DRAFT' ? 'Submit the reporting pack?' : 'Resubmit the reporting pack?'}
        description={
          remaining > 0
            ? `${remaining} required item${remaining > 1 ? 's are' : ' is'} still outstanding. The server will not accept an incomplete pack and will list what is missing.`
            : 'Your latest values will be saved and the pack sent to the investment team. It becomes read-only unless they request corrections or raise a question.'
        }
        confirmLabel={detail?.submission.status === 'DRAFT' ? 'Submit pack' : 'Resubmit pack'}
        loading={submit.isPending}
        onConfirm={() => submit.mutate()}
      />

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        {preview && (
          <DialogContent title={preview.title} description={preview.fileName ?? undefined} size="xl">
            <DocumentPreviewPanel doc={preview} height={520} />
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent title="Reporting guide" description="What the investment team needs each month. Required items are marked and checked before you can submit." size="lg">
          <div className="grid gap-4">
            {REPORTING_PACK.map((s) => (
              <div key={s.key}>
                <h3 className="text-[13px] font-semibold">{s.title}</h3>
                <p className="text-[11.5px] text-muted-foreground">{s.description}</p>
                <ul className="mt-1.5 list-disc pl-5 text-[12px] text-ink-2">
                  {s.fields.filter((f) => f.required).length > 0 && <li>Required figures: {s.fields.filter((f) => f.required).map((f) => f.label).join(', ')}</li>}
                  {s.repeaters.filter((r) => r.minRows > 0).map((r) => (
                    <li key={r.key}>
                      At least {r.minRows} {r.label.toLowerCase()} row
                    </li>
                  ))}
                  {s.files.map((f) => (
                    <li key={f.key}>
                      {f.label}
                      {f.required ? ' (required)' : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="text-[11.5px] text-muted-foreground">Certificates expiring within 60 days are flagged so renewals can be planned. Re-uploading a file keeps earlier versions.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
