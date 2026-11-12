'use client';

import * as React from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CircleAlert, Plus } from 'lucide-react';
import { SIDES, TRANSACTION_TYPE_LABELS, formatPrice, recordTransactionSchema, type Side, type TransactionType } from '@nexus/shared';
import { ApiError, api, applyFieldErrors } from '@/lib/api';
import { useIdempotencyKey } from '@/lib/idempotency';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { ComboboxField, CurrencyField, DateField, FormSection, FullWidth, NumberField, RadioGroupField, SearchableSelectField, SelectField, TextField, TextareaField } from '@/components/form/fields';
import { Segmented } from '@/components/nx/filters';
import { BROKERS, setZodErrors, todayIso } from './form-utils';
import { SecurityDialog } from './security-dialog';
import { PORTFOLIO_QUERY_KEYS, type PortfolioOption, type SecurityOption } from './types';

type Mode = 'TRADE' | 'CASH';
const CASH_TYPES: TransactionType[] = ['CASH_IN', 'CASH_OUT', 'DIVIDEND', 'FEE'];

interface Values {
  portfolioId: string;
  type: TransactionType;
  side: Side;
  securityId: string;
  quantity?: number;
  price?: number;
  amount?: number;
  tradeDate: string;
  settlementDate: string;
  tradeReference: string;
  broker: string;
  notes: string;
}

const blank = (portfolioId: string): Values => ({
  portfolioId,
  type: 'CASH_IN',
  side: 'BUY',
  securityId: '',
  quantity: undefined,
  price: undefined,
  amount: undefined,
  tradeDate: todayIso(),
  settlementDate: '',
  tradeReference: '',
  broker: '',
  notes: '',
});

/**
 * Record an investment transaction. TRADE: buy / sell a security (cash moves by quantity × price). Cash event: contribution,
 * withdrawal, dividend or fee. The API rejects overselling and negative cash with a clear message, shown inline.
 */
export function TransactionDialog({
  open,
  onOpenChange,
  portfolioId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** lock the dialog to one portfolio (portfolio detail page) */
  portfolioId?: string;
}) {
  const qc = useQueryClient();
  const key = useIdempotencyKey();
  const [mode, setMode] = React.useState<Mode>('TRADE');
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [securityOpen, setSecurityOpen] = React.useState(false);

  const portfolios = useQuery({ queryKey: ['portfolio-options'], queryFn: () => api<PortfolioOption[]>('/portfolios/options'), staleTime: 60_000, enabled: open });
  const securities = useQuery({ queryKey: ['securities', ''], queryFn: () => api<SecurityOption[]>('/securities'), staleTime: 60_000, enabled: open });

  const form = useForm<Values>({ defaultValues: blank(portfolioId ?? '') });
  React.useEffect(() => {
    if (open) {
      form.reset(blank(portfolioId ?? ''));
      setMode('TRADE');
      setServerError(null);
    }
  }, [open, portfolioId, form]);

  const pid = form.watch('portfolioId');
  const type = form.watch('type');
  const secId = form.watch('securityId');
  const portfolio = (portfolios.data ?? []).find((p) => p.id === pid);
  const currency = portfolio?.baseCurrency ?? 'USD';
  const selectedSecurity = (securities.data ?? []).find((s) => s.id === secId);

  // choosing a security prefills its reference price (editable)
  const selectedSecurityId = selectedSecurity?.id;
  React.useEffect(() => {
    if (mode !== 'TRADE' || !selectedSecurity) return;
    const p = Number(selectedSecurity.lastPrice);
    if (p > 0) form.setValue('price', p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedSecurityId]);

  const record = useMutation({
    mutationFn: (body: unknown) => api<{ ref: string; holdingChanges?: Array<{ ticker: string; before: string; after: string }> }>('/transactions', { method: 'POST', body, idempotencyKey: key.get() }),
    onSuccess: (t) => {
      toast.success(`Transaction ${t.ref} recorded`, { description: t.holdingChanges?.length ? t.holdingChanges.map((c) => `${c.ticker}: ${formatPrice(c.before)} → ${formatPrice(c.after)}`).join(' · ') : undefined });
      key.reset();
      for (const k of PORTFOLIO_QUERY_KEYS) void qc.invalidateQueries({ queryKey: k });
      onOpenChange(false);
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : 'Could not record the transaction';
      const mapped = applyFieldErrors(err, form.setError as never);
      // oversell / insufficient cash / duplicate reference: show prominently, keep the form open
      setServerError(msg);
      if (!mapped) toast.error(msg);
    },
  });

  const onSubmit = (v: Values) => {
    setServerError(null);
    const common = {
      portfolioId: v.portfolioId,
      currency,
      tradeDate: v.tradeDate,
      settlementDate: v.settlementDate || undefined,
      tradeReference: v.tradeReference || undefined,
      notes: v.notes || undefined,
    };
    const payload =
      mode === 'TRADE'
        ? { ...common, type: 'TRADE' as const, side: v.side, securityId: v.securityId || undefined, quantity: v.quantity, price: v.price, broker: v.broker || undefined }
        : { ...common, type: v.type, amount: v.amount, securityId: v.type === 'DIVIDEND' && v.securityId ? v.securityId : undefined };
    const parsed = recordTransactionSchema.safeParse(payload);
    if (!parsed.success) return setZodErrors(parsed.error, form.setError as never);
    record.mutate(parsed.data);
  };

  const securityOptions = (securities.data ?? [])
    .filter((s) => (mode === 'TRADE' ? s.assetClass !== 'CASH' : s.assetClass !== 'CASH'))
    .map((s) => ({ value: s.id, label: `${s.ticker} · ${s.name}`, hint: formatPrice(s.lastPrice) }));
  const portfolioOptions = (portfolios.data ?? [])
    .filter((p) => p.status === 'ACTIVE')
    .map((p) => ({ value: p.id, label: `${p.ref} · ${p.name}`, hint: p.investorName }));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          title="Record transaction"
          description="Completed transactions update holdings and cash immediately (simplified valuation: quantity × price, no fees, accruals or FX)."
          size="lg"
        >
          <FormProvider {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
              <div className="mb-4">
                <Segmented<Mode>
                  value={mode}
                  onChange={(m) => {
                    setMode(m);
                    setServerError(null);
                    form.clearErrors();
                  }}
                  options={[
                    { value: 'TRADE', label: 'Trade (buy / sell)' },
                    { value: 'CASH', label: 'Cash event' },
                  ]}
                />
              </div>
              <FormSection columns={2}>
                <FullWidth>
                  <SearchableSelectField<Values>
                    name="portfolioId"
                    label="Portfolio"
                    required
                    disabled={!!portfolioId}
                    placeholder="Select a portfolio"
                    searchPlaceholder="Search portfolios…"
                    loading={portfolios.isLoading}
                    options={portfolioOptions.length || !portfolioId ? portfolioOptions : [{ value: portfolioId, label: 'Current portfolio' }]}
                  />
                </FullWidth>

                {mode === 'TRADE' ? (
                  <>
                    <FullWidth>
                      <RadioGroupField<Values> name="side" label="Side" inline options={SIDES.map((s) => ({ value: s, label: s === 'BUY' ? 'Buy' : 'Sell' }))} />
                    </FullWidth>
                    <FullWidth>
                      <div className="grid gap-1.5">
                        <SearchableSelectField<Values>
                          name="securityId"
                          label="Security"
                          required
                          placeholder="Select a security"
                          searchPlaceholder="Search ticker or name…"
                          loading={securities.isLoading}
                          options={securityOptions}
                        />
                        <button type="button" onClick={() => setSecurityOpen(true)} className="inline-flex w-fit items-center gap-1 text-[11.5px] font-semibold text-primary hover:underline">
                          <Plus className="size-3" /> Security not listed? Add it
                        </button>
                      </div>
                    </FullWidth>
                    <NumberField<Values> name="quantity" label="Quantity" required decimals={6} placeholder="0" />
                    <CurrencyField<Values> name="price" label="Price" required currency={currency} decimals={6} />
                    <ComboboxField<Values> name="broker" label="Broker" options={BROKERS} placeholder="Select or type a broker" />
                    <TextField<Values> name="tradeReference" label="Trade reference" optional placeholder="e.g. TRD-2026-0412" help="Must be unique within the portfolio." />
                  </>
                ) : (
                  <>
                    <SelectField<Values> name="type" label="Event type" required options={CASH_TYPES.map((t) => ({ value: t, label: TRANSACTION_TYPE_LABELS[t] }))} />
                    <CurrencyField<Values> name="amount" label="Amount" required currency={currency} />
                    {type === 'DIVIDEND' && (
                      <FullWidth>
                        <SearchableSelectField<Values> name="securityId" label="Paying security" optional placeholder="Select a security" options={securityOptions} loading={securities.isLoading} />
                      </FullWidth>
                    )}
                    <TextField<Values> name="tradeReference" label="Reference" optional className="sm:col-span-2" />
                  </>
                )}

                <DateField<Values> name="tradeDate" label={mode === 'TRADE' ? 'Trade date' : 'Date'} required fromYear={2015} />
                {mode === 'TRADE' && <DateField<Values> name="settlementDate" label="Settlement date" optional fromYear={2015} />}
                <FullWidth>
                  <TextareaField<Values> name="notes" label="Notes" optional rows={2} />
                </FullWidth>
              </FormSection>

              {serverError && (
                <div role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-[#e6c3c9] bg-danger-soft px-3 py-2.5 text-[12.5px] text-danger">
                  <CircleAlert className="mt-px size-4 shrink-0" />
                  <span>{serverError}</span>
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={record.isPending}>
                  Record transaction
                </Button>
              </DialogFooter>
            </form>
          </FormProvider>
        </DialogContent>
      </Dialog>
      <SecurityDialog
        open={securityOpen}
        onOpenChange={setSecurityOpen}
        onCreated={(s) => {
          qc.setQueryData<SecurityOption[]>(['securities', ''], (old) => [...(old ?? []), s]);
          form.setValue('securityId', s.id, { shouldValidate: true });
          if (Number(s.lastPrice) > 0) form.setValue('price', Number(s.lastPrice));
        }}
      />
    </>
  );
}
