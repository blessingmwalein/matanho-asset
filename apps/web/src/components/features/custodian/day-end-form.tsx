'use client';

import * as React from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { z } from 'zod';
import { CURRENCIES, dayEndFormSchema } from '@nexus/shared';
import { api, ApiError, applyFieldErrors } from '@/lib/api';
import { useIdempotencyKey } from '@/lib/idempotency';
import { Button } from '@/components/ui/button';
import { CurrencyField, DateField, FileField, FormSection, FullWidth, NumberField, SelectField, TextareaField } from '@/components/form/fields';
import { Notice } from './notice';
import { todayIso, type AccountOption, type SubmissionDetail, type SubmissionRow } from './types';

type Values = z.input<typeof dayEndFormSchema> & { file?: File; correctionReason?: string };

const DEFAULT_NOTE = 'Official day-end balances approved for reconciliation.';

function defaultsFor(accountId: string): Values {
  return { statementDate: todayIso(), custodianAccountId: accountId, closingCash: undefined as never, currency: 'USD', holdingsMarketValue: undefined as never, tradeCount: undefined as never, controlNote: DEFAULT_NOTE, file: undefined, correctionReason: '' };
}

/**
 * Day-end package tab. Sent as multipart so the official file is stored with its SHA-256.
 * An existing package for the same account and statement date is never overwritten: the API answers 409 and
 * the user may submit a correction, which creates version + 1 and retains the original.
 */
export function DayEndForm({
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
  const [duplicate, setDuplicate] = React.useState<string | null>(null);
  const [correction, setCorrection] = React.useState<{ ref: string; version: number } | null>(null);
  const preferred = accounts.find((a) => a.accountNumber === 'BGF-001') ?? accounts[0];
  const form = useForm<Values>({ resolver: zodResolver(dayEndFormSchema) as never, defaultValues: defaultsFor(preferred?.id ?? '') });

  React.useEffect(() => {
    if (preferred && !form.getValues('custodianAccountId')) form.setValue('custodianAccountId', preferred.id);
  }, [preferred, form]);

  React.useEffect(() => {
    if (!correctionFor || correctionFor.kind !== 'DAY_END') return;
    form.reset({
      statementDate: correctionFor.date,
      custodianAccountId: correctionFor.account.id,
      closingCash: Number(correctionFor.closingCash),
      currency: correctionFor.currency as Values['currency'],
      holdingsMarketValue: Number(correctionFor.holdingsMarketValue),
      tradeCount: correctionFor.tradeCount ?? 0,
      controlNote: '',
      file: undefined,
      correctionReason: '',
    });
    setCorrection({ ref: correctionFor.ref, version: correctionFor.version });
    setDuplicate(null);
    key.reset();
    onCorrectionConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [correctionFor]);

  const accountId = useWatch({ control: form.control, name: 'custodianAccountId' });
  const currency = useWatch({ control: form.control, name: 'currency' }) ?? 'USD';
  const account = accounts.find((a) => a.id === accountId);

  const submit = useMutation({
    mutationFn: (v: Values) => {
      const fd = new FormData();
      fd.set('statementDate', v.statementDate);
      fd.set('custodianAccountId', v.custodianAccountId);
      fd.set('closingCash', String(v.closingCash));
      fd.set('currency', v.currency ?? 'USD');
      fd.set('holdingsMarketValue', String(v.holdingsMarketValue));
      fd.set('tradeCount', String(v.tradeCount));
      if (v.controlNote) fd.set('controlNote', v.controlNote);
      if (correction) {
        fd.set('correction', 'true');
        fd.set('correctionReason', v.correctionReason?.trim() || v.controlNote || '');
      }
      if (v.file) fd.set('file', v.file);
      return api<SubmissionRow>('/custodian/day-end', { method: 'POST', form: fd, idempotencyKey: key.get() });
    },
    onSuccess: (row) => {
      toast.success(correction ? 'Corrected day-end package submitted' : 'Day-end package submitted', {
        description: `${row.ref} for ${row.account.accountNumber} is ready for reconciliation.${correction ? ' The original is retained.' : ''}`,
      });
      key.reset();
      setDuplicate(null);
      setCorrection(null);
      form.reset(defaultsFor(form.getValues('custodianAccountId')));
      void qc.invalidateQueries({ queryKey: ['custodian'] });
      onSubmitted?.();
    },
    onError: (err) => {
      key.reset();
      if (err instanceof ApiError && err.status === 409 && err.errors?.statementDate) {
        setDuplicate(err.errors.statementDate);
        return;
      }
      if (!applyFieldErrors(err, form.setError as never)) toast.error(err instanceof Error ? err.message : 'Submission failed');
    },
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit((v) => submit.mutate(v))} noValidate>
        {correction && (
          <Notice
            tone="warning"
            title={`Correcting ${correction.ref}${correction.version ? ` (version ${correction.version})` : ''}`}
            className="mb-3"
            actions={
              <Button type="button" size="sm" variant="secondary" onClick={() => { setCorrection(null); form.reset(defaultsFor(form.getValues('custodianAccountId'))); }}>
                Cancel correction
              </Button>
            }
          >
            Submitting creates {correction.version ? `version ${correction.version + 1}` : 'the next version'} for this statement date. The original package and its file are retained.
          </Notice>
        )}
        {duplicate && !correction && (
          <Notice
            tone="warning"
            role="alert"
            title="A package already exists for this account and date"
            className="mb-3"
            actions={
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  setCorrection({ ref: 'the existing package', version: 0 });
                  setDuplicate(null);
                  key.reset();
                }}
              >
                Submit as a correction
              </Button>
            }
          >
            {duplicate}
          </Notice>
        )}

        <FormSection columns={2}>
          <DateField<Values> name="statementDate" label="Statement date" required fromYear={new Date().getFullYear() - 1} toYear={new Date().getFullYear()} disabled={!!correction} />
          <SelectField<Values> name="custodianAccountId" label="Account" required disabled={!!correction} options={accounts.map((a) => ({ value: a.id, label: `${a.accountNumber} · ${a.name}` }))} placeholder="Select the account" />
          <CurrencyField<Values> name="closingCash" label="Closing cash" required currency={currency} placeholder="0.00" />
          <SelectField<Values> name="currency" label="Currency" options={CURRENCIES} />
          <CurrencyField<Values> name="holdingsMarketValue" label="Holdings market value" required currency={currency} placeholder="0.00" />
          <NumberField<Values> name="tradeCount" label="Trades in day-end book" required decimals={0} placeholder="0" />
          {account && (
            <FullWidth>
              <p className="rounded-md bg-surface-2 px-3 py-2 text-[11.5px] text-muted-foreground">
                {account.portfolio ? (
                  <>
                    Reconciled against portfolio <b className="font-semibold text-foreground">{account.portfolio.ref} · {account.portfolio.name}</b>. Internal figures are taken from Matanho&apos;s current holdings.
                  </>
                ) : (
                  <>Account {account.accountNumber} is not linked to a Matanho portfolio.</>
                )}
              </p>
            </FullWidth>
          )}
          <FullWidth>
            <FileField<Values> name="file" label="Official day-end file" optional accept=".csv,.xlsx,.xls,.pdf,.txt" title="Select the holdings / cash / settlement file" hint="CSV, Excel, PDF or text · the file name and SHA-256 fingerprint are recorded" />
          </FullWidth>
          <FullWidth>
            <TextareaField<Values> name="controlNote" label="Control note" optional rows={3} />
          </FullWidth>
          {correction && (
            <FullWidth>
              <TextareaField<Values> name="correctionReason" label="Reason for the correction" required rows={2} placeholder="e.g. Closing cash restated after late settlement" />
            </FullWidth>
          )}
        </FormSection>

        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => form.reset(defaultsFor(form.getValues('custodianAccountId')))}>
            Reset
          </Button>
          <Button type="submit" variant="primary" loading={submit.isPending}>
            {correction ? 'Submit corrected package' : 'Submit day-end package'}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
