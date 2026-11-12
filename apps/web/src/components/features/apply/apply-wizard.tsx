'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Send, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import {
  computeReadiness,
  DOCUMENT_SLOTS,
  formatDateTime,
  makeStep1Schema,
  ONBOARDING_STEPS,
  step0Schema,
  step2Schema,
  step3Schema,
  step5Schema,
  type ApplicationPayload,
} from '@nexus/shared';
import { api, ApiError } from '@/lib/api';
import { useIdempotencyKey } from '@/lib/idempotency';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Panel } from '@/components/nx/layout';
import { Skeleton } from '@/components/ui/controls';
import { clearPointer, readPointer, resumeUrl, writePointer } from './pointer';
import { CopyLink } from './copy-link';
import { ReadinessPanel } from './readiness-panel';
import { StartDialog } from './start-dialog';
import { StepDocuments, type UploadResult } from './step-documents';
import { StepInvestor } from './step-investor';
import { StepKyc } from './step-kyc';
import { StepOwnership } from './step-ownership';
import { StepRail } from './step-rail';
import { StepReview } from './step-review';
import { StepTaxBank } from './step-taxbank';
import { SuccessPanel } from './success-panel';
import type { ApplicationView, DraftIdentity, SaveState, SlotDocument } from './types';

const AUTOSAVE_MS = 1200;
const LAST_STEP = ONBOARDING_STEPS.length - 1;
const REQUIRED_SLOTS = DOCUMENT_SLOTS.filter((s) => s.required);

/** Which steps are complete, from the draft payload and uploaded slots (deterministic, same schemas the API uses). */
function stepCompletion(p: Partial<ApplicationPayload>, docs: Record<string, SlotDocument>): boolean[] {
  return [
    step0Schema.safeParse(p).success,
    makeStep1Schema(p.investorType).safeParse({ owners: p.owners ?? [], signatories: p.signatories ?? [], ownershipNarrative: p.ownershipNarrative, authorityNarrative: p.authorityNarrative ?? '' }).success,
    step2Schema.safeParse(p).success,
    step3Schema.safeParse(p).success,
    REQUIRED_SLOTS.every((s) => !!docs[s.id]),
    step5Schema.safeParse({ consent: p.consent, signatureName: p.signatureName ?? '' }).success,
  ];
}

function SaveIndicator({ state, savedAt, onRetry }: { state: SaveState; savedAt: Date | null; onRetry: () => void }) {
  if (state === 'saving') return <span className="text-muted-foreground">Saving…</span>;
  if (state === 'error')
    return (
      <button type="button" onClick={onRetry} className="font-semibold text-danger hover:underline">
        Save failed. Retry
      </button>
    );
  if (state === 'saved' && savedAt) return <span className="num text-success">Draft saved {savedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>;
  return <span className="text-muted-foreground">{state === 'dirty' ? 'Unsaved changes' : 'Autosave on'}</span>;
}

export function ApplyWizard() {
  const search = useSearchParams();
  const qc = useQueryClient();
  const submitKey = useIdempotencyKey();

  const [booted, setBooted] = React.useState(false);
  const [identity, setIdentity] = React.useState<DraftIdentity | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const [hydrated, setHydrated] = React.useState(false);
  const [payload, setPayload] = React.useState<Partial<ApplicationPayload>>({});
  const [step, setStep] = React.useState(0);
  const [saveState, setSaveState] = React.useState<SaveState>('idle');
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const [justSubmitted, setJustSubmitted] = React.useState(false);
  const [submitErrors, setSubmitErrors] = React.useState<Record<string, string> | null>(null);

  const stepRef = React.useRef(0);
  const dirty = React.useRef<Record<string, unknown>>({});
  const timer = React.useRef<number | undefined>(undefined);
  const queue = React.useRef<Promise<boolean>>(Promise.resolve(true));
  const validator = React.useRef<(() => Promise<boolean>) | null>(null);
  const hydratedFor = React.useRef<string | null>(null);
  const cardTop = React.useRef<HTMLDivElement>(null);

  // ── identify the draft: resume link first, then the convenience pointer ──
  React.useEffect(() => {
    const ref = search.get('ref');
    const token = search.get('token');
    if (ref && token) setIdentity({ reference: ref, token });
    else {
      const p = readPointer();
      if (p) setIdentity(p);
    }
    setBooted(true);
    // read once on mount; later URL changes are made by this component itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const view = useQuery({
    queryKey: ['apply', identity?.reference],
    enabled: !!identity,
    queryFn: () => api<ApplicationView>(`/public/applications/${encodeURIComponent(identity!.reference)}`, { query: { token: identity!.token } }),
    retry: false,
    staleTime: Infinity,
    refetchOnMount: false,
  });

  // wrong link / expired pointer: forget it and ask to start again
  React.useEffect(() => {
    if (view.error instanceof ApiError && view.error.status === 404) {
      clearPointer();
      setIdentity(null);
      setHydrated(false);
      hydratedFor.current = null;
      setNotice('We could not find that application. The link may be incomplete. You can start a new application below.');
    }
  }, [view.error]);

  const data = view.data;
  const documents = React.useMemo(() => data?.documents ?? {}, [data?.documents]);
  const editable = data?.status === 'DRAFT' || data?.status === 'INFORMATION_REQUESTED';

  // hydrate local state once per application
  React.useEffect(() => {
    if (!data || !identity || hydratedFor.current === data.reference) return;
    hydratedFor.current = data.reference;
    const done = stepCompletion(data.payload, data.documents);
    const firstOpen = done.findIndex((d, i) => i < LAST_STEP && !d);
    const maxStep = firstOpen === -1 ? LAST_STEP : firstOpen;
    const start = Math.max(0, Math.min(data.step, maxStep));
    setPayload(data.payload);
    setStep(start);
    stepRef.current = start;
    setSavedAt(data.lastSavedAt ? new Date(data.lastSavedAt) : null);
    setSaveState(data.lastSavedAt ? 'saved' : 'idle');
    writePointer(identity);
    setHydrated(true);
  }, [data, identity]);

  // ── derived state ──
  const uploadedKey = Object.keys(documents).sort().join(',');
  const readiness = React.useMemo(() => computeReadiness(payload, uploadedKey ? uploadedKey.split(',') : []), [payload, uploadedKey]);
  const complete = React.useMemo(() => stepCompletion(payload, documents), [payload, documents]);
  const reachable = React.useCallback((i: number) => complete.slice(0, i).every(Boolean), [complete]);
  const requiredUploaded = REQUIRED_SLOTS.filter((s) => documents[s.id]).length;

  // ── autosave ──
  const doFlush = React.useCallback(
    async (nextStep?: number): Promise<boolean> => {
      if (!identity) return true;
      const body = dirty.current;
      if (!Object.keys(body).length && nextStep === undefined) return true;
      dirty.current = {};
      setSaveState('saving');
      try {
        await api(`/public/applications/${encodeURIComponent(identity.reference)}`, { method: 'PATCH', body: { step: nextStep ?? stepRef.current, payload: body }, query: { token: identity.token } });
        setSaveState('saved');
        setSavedAt(new Date());
        return true;
      } catch (e) {
        dirty.current = { ...body, ...dirty.current };
        setSaveState('error');
        if (e instanceof ApiError && e.status === 409) {
          toast.error(e.message);
          void qc.invalidateQueries({ queryKey: ['apply', identity.reference] });
        }
        return false;
      }
    },
    [identity, qc],
  );

  const flush = React.useCallback(
    (nextStep?: number) => {
      window.clearTimeout(timer.current);
      queue.current = queue.current.then(() => doFlush(nextStep));
      return queue.current;
    },
    [doFlush],
  );

  const flushRef = React.useRef(flush);
  flushRef.current = flush;
  React.useEffect(() => () => void flushRef.current(), []);

  const updateValues = React.useCallback(
    (values: Record<string, unknown>) => {
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(values)) clean[k] = v === undefined ? null : v; // null = cleared
      dirty.current = { ...dirty.current, ...clean };
      setPayload((prev) => ({ ...prev, ...values }));
      setSaveState('dirty');
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flushRef.current(), AUTOSAVE_MS);
    },
    [],
  );

  const registerValidator = React.useCallback((fn: () => Promise<boolean>) => {
    validator.current = fn;
  }, []);

  // ── navigation ──
  const goTo = React.useCallback(
    (i: number) => {
      if (i < 0 || i > LAST_STEP) return;
      if (i > step && !reachable(i)) {
        toast.error('Complete the current step before continuing.');
        return;
      }
      validator.current = null;
      setStep(i);
      stepRef.current = i;
      void flush(i);
      cardTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [flush, reachable, step],
  );

  const next = async () => {
    const ok = (await validator.current?.()) ?? true;
    if (!ok) return;
    goTo(step + 1);
  };

  // ── submit ──
  const submit = useMutation({
    mutationFn: async () => {
      const saved = await flush();
      if (!saved) throw new Error('Your latest changes could not be saved. Check your connection and try again.');
      return api<{ reference: string; status: ApplicationView['status']; submittedAt: string | null }>(`/public/applications/${encodeURIComponent(identity!.reference)}/submit`, {
        method: 'POST',
        body: {},
        query: { token: identity!.token },
        idempotencyKey: submitKey.get(),
      });
    },
    onSuccess: (res) => {
      submitKey.reset();
      setSubmitErrors(null);
      qc.setQueryData<ApplicationView>(['apply', identity!.reference], (old) => (old ? { ...old, status: res.status, submittedAt: res.submittedAt } : old));
      setJustSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: (e) => {
      setSubmitErrors(e instanceof ApiError && e.errors ? e.errors : null);
      toast.error((e as Error).message);
    },
  });

  const onSubmit = async () => {
    const ok = (await validator.current?.()) ?? true;
    if (!ok) return;
    if (!readiness.canSubmit) {
      toast.error('Some sections are still incomplete. Fix the items listed above first.');
      return;
    }
    submit.mutate();
  };

  const onUploaded = (res: UploadResult) => {
    if (!identity) return;
    qc.setQueryData<ApplicationView>(['apply', identity.reference], (old) => (old ? { ...old, documents: { ...old.documents, [res.slot]: res.document } } : old));
  };

  const onCreated = (id: DraftIdentity, v: { legalName: string; email: string; investorType?: ApplicationPayload['investorType'] }) => {
    writePointer(id);
    setNotice(null);
    hydratedFor.current = null;
    setHydrated(false);
    setIdentity(id);
    window.history.replaceState(null, '', `/apply?ref=${encodeURIComponent(id.reference)}&token=${encodeURIComponent(id.token)}`);
    toast.success('Draft created', { description: `Reference ${id.reference}. Copy your resume link to continue later.` });
    void v;
  };

  const link = identity ? resumeUrl(identity) : undefined;
  const meta = ONBOARDING_STEPS[step]!;

  // ── hero ──
  const hero = (
    <section className="mb-4 grid gap-4 border-b border-border pb-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-8">
      <div className="min-w-0">
        <div className="eyebrow">Investor / LP application</div>
        <h1 className="mt-1.5 text-[26px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[32px]">One application. One verified investor record.</h1>
        <p className="mt-2 max-w-[720px] text-[12.5px] leading-relaxed text-muted-foreground">
          Complete your institutional profile, beneficial ownership, KYC / AML declarations, tax and banking details and supporting evidence. Your draft saves automatically; a Compliance professional reviews every application and makes the final decision.
        </p>
      </div>
      <dl className="grid grid-cols-3 divide-x divide-border-soft overflow-hidden rounded-lg border border-border bg-surface text-[12px] lg:min-w-[430px]">
        <div className="min-w-0 px-3.5 py-2.5">
          <dt className="eyebrow">Draft</dt>
          <dd className="mt-1 text-[12.5px] font-semibold">
            <SaveIndicator state={identity ? saveState : 'idle'} savedAt={savedAt} onRetry={() => void flush()} />
          </dd>
          <dd className="mt-0.5 truncate text-[10.5px] text-muted-foreground">{identity ? 'Resume with your link' : 'Not started'}</dd>
        </div>
        <div className="min-w-0 px-3.5 py-2.5">
          <dt className="eyebrow">Evidence</dt>
          <dd className="num mt-1 text-[12.5px] font-semibold">{requiredUploaded}/{REQUIRED_SLOTS.length} required</dd>
          <dd className="mt-0.5 truncate text-[10.5px] text-muted-foreground">Originals are kept</dd>
        </div>
        <div className="min-w-0 px-3.5 py-2.5">
          <dt className="eyebrow">Decision</dt>
          <dd className="mt-1 text-[12.5px] font-semibold">Human controlled</dd>
          <dd className="mt-0.5 truncate text-[10.5px] text-muted-foreground">Compliance approves</dd>
        </div>
      </dl>
    </section>
  );

  // ── states before the wizard ──
  if (!booted || (identity && view.isLoading)) {
    return (
      <div>
        {hero}
        <Skeleton className="h-[420px] w-full" />
      </div>
    );
  }

  if (!identity) {
    return (
      <div>
        {hero}
        <Panel>
          <EmptyState title="Start your application" description="Enter your legal name and email to create a draft. You will get a private link so you can come back and finish later." />
        </Panel>
        <StartDialog open onCreated={onCreated} notice={notice} />
      </div>
    );
  }

  if (view.isError && !(view.error instanceof ApiError && view.error.status === 404)) {
    return (
      <div>
        {hero}
        <Panel>
          <ErrorState message={(view.error as Error).message} onRetry={() => void view.refetch()} />
        </Panel>
      </div>
    );
  }

  if (data && !editable) {
    return (
      <div>
        {hero}
        <SuccessPanel reference={data.reference} status={data.status} submittedAt={data.submittedAt} justSubmitted={justSubmitted} />
      </div>
    );
  }

  if (!data || !hydrated) {
    return (
      <div>
        {hero}
        <Skeleton className="h-[420px] w-full" />
      </div>
    );
  }

  const stepProps = { payload, onValues: updateValues, registerValidator };
  const requested = data.status === 'INFORMATION_REQUESTED' ? data.requestedInfo[0] : undefined;
  const resubmission = data.status === 'INFORMATION_REQUESTED';

  return (
    <div>
      {hero}
      {link && (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-primary-soft-border bg-primary-soft px-3.5 py-2.5 lg:hidden">
          <span className="text-[12px] font-semibold">Resume link</span>
          <CopyLink value={link} compact className="min-w-0 flex-1" />
        </div>
      )}
      <div className="grid gap-3.5 lg:grid-cols-[220px_minmax(0,1fr)_310px]">
        <StepRail current={step} complete={complete} reachable={reachable} onSelect={goTo} reference={data.reference} resumeLink={link} />

        <div ref={cardTop} className="min-w-0 scroll-mt-4">
          <Panel>
            <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-border px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <div className="eyebrow">Step {step + 1} of {ONBOARDING_STEPS.length}</div>
                <h2 className="mt-1 text-[19px] font-semibold tracking-tight">{meta.heading}</h2>
                <p className="mt-1 max-w-[620px] text-[12px] leading-relaxed text-muted-foreground">{meta.help}</p>
              </div>
              <div className="min-w-[150px] text-right">
                <div className="num text-[11px] text-muted-foreground">{Math.round(((step + 1) / ONBOARDING_STEPS.length) * 100)}% through the form</div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                  <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${((step + 1) / ONBOARDING_STEPS.length) * 100}%` }} />
                </div>
                <div className="mt-1.5 text-[11px]">
                  <SaveIndicator state={saveState} savedAt={savedAt} onRetry={() => void flush()} />
                </div>
              </div>
            </header>

            {requested && (
              <div role="status" className="border-b border-[#ecd9b0] bg-warning-soft px-4 py-3 sm:px-5">
                <div className="flex items-center gap-2 text-[12.5px] font-semibold text-warning">
                  <TriangleAlert className="size-4" /> Information requested by Compliance
                </div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-foreground">{requested.body}</p>
                <p className="num mt-1 text-[11px] text-muted-foreground">
                  {requested.authorName ? `${requested.authorName} · ` : ''}
                  {formatDateTime(requested.createdAt)}. Update the application below, then resubmit it from the Review step.
                </p>
              </div>
            )}

            <div className="px-4 py-5 sm:px-5">
              {step === 0 && <StepInvestor key="s0" {...stepProps} />}
              {step === 1 && <StepOwnership key="s1" {...stepProps} />}
              {step === 2 && <StepKyc key="s2" {...stepProps} />}
              {step === 3 && <StepTaxBank key="s3" {...stepProps} />}
              {step === 4 && <StepDocuments key="s4" identity={identity} documents={documents} onUploaded={onUploaded} registerValidator={registerValidator} />}
              {step === 5 && <StepReview key="s5" {...stepProps} readiness={readiness} documents={documents} goToStep={goTo} submitErrors={submitErrors} />}
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-2 px-4 py-3 sm:px-5">
              <Button type="button" variant="tertiary" onClick={() => goTo(step - 1)} disabled={step === 0}>
                <ArrowLeft /> Back
              </Button>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={async () => {
                    const ok = await flush();
                    if (ok) toast.success('Draft saved');
                    else toast.error('Could not save the draft. Try again.');
                  }}
                >
                  Save draft
                </Button>
                {step < LAST_STEP ? (
                  <Button type="button" variant="primary" onClick={next}>
                    Continue <ArrowRight />
                  </Button>
                ) : (
                  <Button type="button" variant="primary" onClick={onSubmit} loading={submit.isPending} disabled={submit.isPending || !readiness.canSubmit} title={readiness.canSubmit ? undefined : 'Complete every section first'}>
                    <Send /> {resubmission ? 'Resubmit application' : 'Submit application'}
                  </Button>
                )}
              </div>
            </footer>
          </Panel>
          <p className={cn('mt-2 px-1 text-[11px] text-muted-foreground', step < LAST_STEP && 'hidden')}>
            {readiness.canSubmit ? 'Submitting records the declaration and sends your application to Compliance.' : 'Submit is available once every section above shows complete.'}
          </p>
        </div>

        <ReadinessPanel readiness={readiness} payload={payload} onFix={goTo} reachable={reachable} />
      </div>
    </div>
  );
}
