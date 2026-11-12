'use client';

import * as React from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { ASSET_CLASS_LABELS, createHoldingSchema, updateHoldingSchema, type AssetClass } from '@nexus/shared';
import { ApiError, api, applyFieldErrors } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { ComboboxField, CurrencyField, DateField, FormSection, FullWidth, NumberField, SearchableSelectField } from '@/components/form/fields';
import { InfoList, InfoRow } from '@/components/nx/layout';
import { PRICE_SOURCES, setZodErrors, todayIso } from './form-utils';
import { SecurityDialog } from './security-dialog';
import { PORTFOLIO_QUERY_KEYS, type HoldingRow, type SecurityOption } from './types';

interface Values {
  securityId: string;
  quantity?: number;
  averageCost?: number;
  currentPrice?: number;
  valuationDate: string;
  priceSource: string;
}

/** Add (DRAFT / manual) or edit a draft holding. Market value is calculated by the server as quantity × current price. */
export function HoldingDialog({
  open,
  onOpenChange,
  portfolioId,
  currency = 'USD',
  holding,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  portfolioId: string;
  currency?: string;
  /** when set the dialog edits this draft holding; otherwise it adds a new one */
  holding?: HoldingRow | null;
}) {
  const qc = useQueryClient();
  const editing = !!holding;
  const [securityOpen, setSecurityOpen] = React.useState(false);
  const securities = useQuery({ queryKey: ['securities', ''], queryFn: () => api<SecurityOption[]>('/securities'), staleTime: 60_000, enabled: open });

  const form = useForm<Values>({ defaultValues: { securityId: '', valuationDate: todayIso(), priceSource: 'Manual entry' } });
  React.useEffect(() => {
    if (!open) return;
    form.reset(
      holding
        ? {
            securityId: holding.security.id,
            quantity: Number(holding.quantity),
            averageCost: Number(holding.averageCost),
            currentPrice: Number(holding.currentPrice),
            valuationDate: holding.valuationDate.slice(0, 10),
            priceSource: holding.priceSource ?? 'Manual entry',
          }
        : { securityId: '', quantity: undefined, averageCost: undefined, currentPrice: undefined, valuationDate: todayIso(), priceSource: 'Manual entry' },
    );
  }, [open, holding, form]);

  const secId = form.watch('securityId');
  const selected = (securities.data ?? []).find((s) => s.id === secId);
  // choosing a security prefills price and cost from its reference price (editable)
  const selectedId = selected?.id;
  React.useEffect(() => {
    if (editing || !selected) return;
    const p = Number(selected.lastPrice);
    if (p > 0) {
      form.setValue('currentPrice', p);
      form.setValue('averageCost', p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, editing]);

  const save = useMutation({
    mutationFn: (body: unknown) => (editing ? api(`/holdings/${holding!.id}`, { method: 'PATCH', body }) : api(`/portfolios/${portfolioId}/holdings`, { method: 'POST', body })),
    onSuccess: () => {
      toast.success(editing ? 'Draft holding updated' : 'Draft holding added');
      for (const k of PORTFOLIO_QUERY_KEYS) void qc.invalidateQueries({ queryKey: k });
      onOpenChange(false);
    },
    onError: (err) => {
      if (!applyFieldErrors(err, form.setError as never)) toast.error(err instanceof ApiError ? err.message : 'Could not save the holding');
    },
  });

  const onSubmit = (v: Values) => {
    const payload = editing
      ? { quantity: v.quantity, averageCost: v.averageCost, currentPrice: v.currentPrice, valuationDate: v.valuationDate, priceSource: v.priceSource }
      : { securityId: v.securityId || undefined, quantity: v.quantity, averageCost: v.averageCost, currentPrice: v.currentPrice, valuationDate: v.valuationDate, priceSource: v.priceSource };
    const parsed = (editing ? updateHoldingSchema : createHoldingSchema).safeParse(payload);
    if (!parsed.success) return setZodErrors(parsed.error, form.setError as never);
    if (!editing && !v.securityId) return form.setError('securityId', { type: 'validate', message: 'Select a security' });
    save.mutate(parsed.data);
  };

  const options = (securities.data ?? []).map((s) => ({ value: s.id, label: `${s.ticker} · ${s.name}`, hint: ASSET_CLASS_LABELS[s.assetClass as AssetClass] }));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          title={editing ? `Edit draft holding${holding ? `: ${holding.security.ticker}` : ''}` : 'Add holding'}
          description="Manual holdings start as drafts and stay editable until confirmed. Market value = quantity × current price (simplified MVP valuation)."
          size="lg"
        >
          <FormProvider {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
              <FormSection columns={2}>
                <FullWidth>
                  {editing && holding ? (
                    <InfoList>
                      <InfoRow label="Security">{holding.security.ticker} · {holding.security.name}</InfoRow>
                    </InfoList>
                  ) : (
                    <div className="grid gap-1.5">
                      <SearchableSelectField<Values>
                        name="securityId"
                        label="Security"
                        required
                        placeholder="Select a security"
                        searchPlaceholder="Search ticker or name…"
                        loading={securities.isLoading}
                        options={options}
                      />
                      <button type="button" onClick={() => setSecurityOpen(true)} className="inline-flex w-fit items-center gap-1 text-[11.5px] font-semibold text-primary hover:underline">
                        <Plus className="size-3" /> Security not listed? Add it
                      </button>
                    </div>
                  )}
                </FullWidth>
                <NumberField<Values> name="quantity" label="Quantity" required decimals={6} placeholder="0" />
                <CurrencyField<Values> name="currentPrice" label="Current price" required currency={currency} decimals={6} />
                <CurrencyField<Values> name="averageCost" label="Average cost" required currency={currency} decimals={6} help="Per unit, used for unrealised gain." />
                <DateField<Values> name="valuationDate" label="Valuation date" required fromYear={2015} />
                <FullWidth>
                  <ComboboxField<Values> name="priceSource" label="Price source" options={PRICE_SOURCES} help="Recorded with the holding for audit. Source of the holding is “Manual”." />
                </FullWidth>
              </FormSection>
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={save.isPending}>
                  {editing ? 'Save changes' : 'Add draft holding'}
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
          void qc.setQueryData<SecurityOption[]>(['securities', ''], (old) => [...(old ?? []), s]);
          form.setValue('securityId', s.id, { shouldValidate: true });
          if (Number(s.lastPrice) > 0) {
            form.setValue('currentPrice', Number(s.lastPrice));
            form.setValue('averageCost', Number(s.lastPrice));
          }
        }}
      />
    </>
  );
}
