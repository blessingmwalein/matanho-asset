'use client';

import * as React from 'react';
import { FormProvider, useForm, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { z } from 'zod';
import { CURRENCIES, executionCorrectionSchema, executionSchema, formatPrice, formatQuantity } from '@nexus/shared';
import { api, ApiError, applyFieldErrors, type Paged } from '@/lib/api';
import { useIdempotencyKey } from '@/lib/idempotency';
import { Button } from '@/components/ui/button';
import { ComboboxField, DateField, FormSection, FullWidth, NumberField, SelectField, TextareaField, TextField } from '@/components/form/fields';
import { Notice } from './notice';
import { addDaysIso, toLocalInput, type AccountOption, type SubmissionDetail, type SubmissionRow } from './types';

type Values = z.input<typeof executionCorrectionSchema>;

const DEMO = { tradeReference: 'TRD-DEMO-301', ticker: 'DLTA.ZW', side: 'BUY' as const, quantity: 10000, price: 0.184, currency: 'USD' as const, broker: 'IH Securities' };

function defaultsFor(accountId: string): Values {
  return {
    tradeReference: DEMO.tradeReference,
    executedAt: toLocalInput(new Date()),
    custodianAccountId: accountId,
    ticker: DEMO.ticker,
    side: DEMO.side,
    quantity: DEMO.quantity,
    price: DEMO.price,
    currency: DEMO.currency,
    settlementDate: addDaysIso(2),
    broker: DEMO.broker,
    note: '',
    correctionReason: '',
  };
}

function valuesFromDetail(d: SubmissionDetail): Values {
  return {
    tradeReference: d.tradeReference ?? '',
    executedAt: toLocalInput(d.date),
    custodianAccountId: d.account.id,
    ticker: d.ticker ?? '',
    side: d.side ?? 'BUY',
    quantity: Number(d.quantity),
    price: Number(d.price),
    currency: (d.currency as Values['currency']) ?? 'USD',
    settlementDate: d.settlementDate ?? addDaysIso(2),
    broker: d.broker ?? '',
    note: d.note ?? '',
    correctionReason: '',
  };
}

interface Correcting {
  id: string;
  ref: string;
  version: number;
  summary: string;
}

/**
 * Trade execution tab (custodian-portal.html). Duplicate trade references are rejected by the API (409) and the
 * user is guided to "Submit a correction", which creates version + 1 and keeps the original (UAT CST-003).
 */
export function ExecutionForm({
  accounts,
  correctionFor,
  onCorrectionConsumed,
  onSubmitted,
}: {
  accounts: AccountOption[];
  correctionFor?: SubmissionDetail | null;
  onCorrectionConsumed?: () => void;
  onSubmitted?: () => void;
}) {
  const qc = useQueryClient();
  const key = useIdempotencyKey();
  const [correcting, setCorrecting] = React.useState<Correcting | null>(null);
  const [duplicate, setDuplicate] = React.useState<string | null>(null);
  const modeRef = React.useRef(false);
  modeRef.current = !!correcting;

  const securities = useQuery({ queryKey: ['custodian', 'securities'], queryFn: () => api<Array<{ ticker: string; name: string; currency: string }>>('/custodian/securities'), staleTime: 10 * 60_000 });

  const resolver = React.useMemo<Resolver<Values>>(
    () => (values, c, o) => zodResolver((modeRef.current ? executionCorrectionSchema : executionSchema) as never)(values as never, c as never, o as never) as never,
    [],
  );
  const preferred = accounts.find((a) => a.accountNumber === 'BGF-001') ?? accounts[0];
  const form = useForm<Values>({ resolver, defaultValues: defaultsFor(preferred?.id ?? '') });

  // prefill the demo account once accounts arrive
  React.useEffect(() => {
    if (preferred && !form.getValues('custodianAccountId')) form.setValue('custodianAccountId', preferred.id);
  }, [preferred, form]);

  // "Submit a correction" from the history drawer
  React.useEffect(() => {
    if (!correctionFor || correctionFor.kind !== 'EXECUTION') return;
    form.reset(valuesFromDetail(correctionFor));
    setCorrecting({
      id: correctionFor.id,
      ref: correctionFor.ref,
      version: correctionFor.version,
      summary: `${correctionFor.side} ${formatQuantity(correctionFor.quantity)} ${correctionFor.ticker} @ ${formatPrice(correctionFor.price)}`,
    });
    setDuplicate(null);
    key.reset();
    onCorrectionConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [correctionFor]);

  const accountId = useWatch({ control: form.control, name: 'custodianAccountId' });
  const account = accounts.find((a) => a.id === accountId);

  const submit = useMutation({
    mutationFn: (v: Values) => {
      const body = { ...v, executedAt: new Date(v.executedAt).toISOString() };
      return correcting
        ? api<SubmissionRow>(`/custodian/executions/${correcting.id}/corrections`, { method: 'POST', body, idempotencyKey: key.get() })
        : api<SubmissionRow>('/custodian/executions', { method: 'POST', body, idempotencyKey: key.get() });
    },
    onSuccess: (row) => {
      toast.success(correcting ? 'Correction submitted' : 'Execution submitted', { description: `${row.ref} is available to Matanho Reconciliations.${correcting ? ' The original version is retained.' : ''}` });
      key.reset();
      setDuplicate(null);
      setCorrecting(null);
      form.reset({ ...defaultsFor(form.getValues('custodianAccountId')), tradeReference: '', quantity: undefined as never, price: undefined as never, ticker: '' });
      void qc.invalidateQueries({ queryKey: ['custodian'] });
      onSubmitted?.();
    },
    onError: (err) => {
      key.reset();
      if (err instanceof ApiError && err.status === 409 && err.errors?.tradeReference) {
        setDuplicate(err.errors.tradeReference);
        return;
      }
      if (!applyFieldErrors(err, form.setError as never)) toast.error(err instanceof Error ? err.message : 'Submission failed');
    },
  });

  const startCorrection = useMutation({
    mutationFn: async () => {
      const v = form.getValues();
      const res = await api<Paged<SubmissionRow>>('/custodian/submissions', { query: { kind: 'EXECUTION', q: v.tradeReference, accountId: v.custodianAccountId, pageSize: 20 } });
      const hit = res.data.find((r) => r.tradeReference === v.tradeReference && r.isCurrent);
      if (!hit) throw new Error('The original submission could not be found.');
      return hit;
    },
    onSuccess: (hit) => {
      setCorrecting({ id: hit.id, ref: hit.ref, version: hit.version, summary: `${hit.side} ${formatQuantity(hit.quantity)} ${hit.ticker} @ ${formatPrice(hit.price)}` });
      setDuplicate(null);
      key.reset();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not start the correction'),
  });

  const cancelCorrection = () => {
    setCorrecting(null);
    setDuplicate(null);
    form.reset(defaultsFor(form.getValues('custodianAccountId')));
  };

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit((v) => submit.mutate(v))} noValidate>
        {correcting && (
          <Notice
            tone="warning"
            title={`Correcting ${correcting.ref} (version ${correcting.version})`}
            className="mb-3"
            actions={
              <Button type="button" size="sm" variant="secondary" onClick={cancelCorrection}>
                Cancel correction
              </Button>
            }
          >
            Original: {correcting.summary}. Submitting creates version {correcting.version + 1}; the original record is retained and never overwritten.
          </Notice>
        )}
        {duplicate && !correcting && (
          <Notice
            tone="warning"
            role="alert"
            title="This trade reference was already submitted"
            className="mb-3"
            actions={
              <Button type="button" size="sm" variant="secondary" loading={startCorrection.isPending} onClick={() => startCorrection.mutate()}>
                Submit a correction
              </Button>
            }
          >
            {duplicate}
          </Notice>
        )}

        <FormSection columns={2}>
          <TextField<Values> name="tradeReference" label="Trade reference" required disabled={!!correcting} autoComplete="off" />
          <TextField<Values> name="executedAt" label="Execution time" type="datetime-local" required />
          <div className="grid gap-1.5">
            <SelectField<Values>
              name="custodianAccountId"
              label="Account / portfolio"
              required
              disabled={!!correcting}
              options={accounts.map((a) => ({ value: a.id, label: `${a.accountNumber} · ${a.name}` }))}
              placeholder="Select the account"
            />
          </div>
          <ComboboxField<Values> name="ticker" label="Security / ticker" placeholder="Search or type a ticker" options={(securities.data ?? []).map((s) => ({ value: s.ticker, label: s.ticker, hint: s.name }))} />
          <SelectField<Values> name="side" label="Side" options={[{ value: 'BUY', label: 'Buy' }, { value: 'SELL', label: 'Sell' }]} />
          <NumberField<Values> name="quantity" label="Quantity" required decimals={0} placeholder="10,000" />
          <NumberField<Values> name="price" label="Execution price" required decimals={6} placeholder="0.184" />
          <SelectField<Values> name="currency" label="Currency" options={CURRENCIES} />
          <DateField<Values> name="settlementDate" label="Settlement date" required fromYear={new Date().getFullYear() - 1} toYear={new Date().getFullYear() + 1} />
          <TextField<Values> name="broker" label="Executing broker" required autoComplete="off" />
          {account && (
            <FullWidth>
              <p className="rounded-md bg-surface-2 px-3 py-2 text-[11.5px] text-muted-foreground">
                {account.portfolio ? (
                  <>
                    Booked against <b className="font-semibold text-foreground">{account.accountNumber}</b>, linked to portfolio <b className="font-semibold text-foreground">{account.portfolio.ref} · {account.portfolio.name}</b> ({account.currency}).
                  </>
                ) : (
                  <>Account {account.accountNumber} is not yet linked to a Matanho portfolio.</>
                )}
              </p>
            </FullWidth>
          )}
          <FullWidth>
            <TextareaField<Values> name="note" label="Execution note" optional rows={3} placeholder="Optional market, allocation or settlement note" />
          </FullWidth>
          {correcting && (
            <FullWidth>
              <TextareaField<Values> name="correctionReason" label="Reason for the correction" required rows={2} placeholder="e.g. Quantity keyed incorrectly; corrected to the broker contract note" />
            </FullWidth>
          )}
        </FormSection>

        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => (correcting ? cancelCorrection() : form.reset(defaultsFor(form.getValues('custodianAccountId'))))}>
            Reset
          </Button>
          <Button type="submit" variant="primary" loading={submit.isPending}>
            {correcting ? 'Submit correction' : 'Submit execution'}
          </Button>
        </div>
        <p className="mt-3 border-l-[3px] border-primary bg-surface-2 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          Each submission is stored as an immutable record signed by your user. A correction creates a new version and the original is retained for audit; nothing is edited or deleted.
        </p>
      </form>
    </FormProvider>
  );
}
