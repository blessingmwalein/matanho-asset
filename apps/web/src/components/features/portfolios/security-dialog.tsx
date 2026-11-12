'use client';

import * as React from 'react';
import { FormProvider, useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ASSET_CLASSES, ASSET_CLASS_LABELS, CURRENCIES, createSecuritySchema, type CreateSecurityInput } from '@nexus/shared';
import { ApiError, api, applyFieldErrors } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { CurrencyField, FormSection, SelectField, TextField } from '@/components/form/fields';
import type { SecurityOption } from './types';

/** Create a security that is not yet in the reference list. Stacks above the holding / transaction dialogs. */
export function SecurityDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (s: SecurityOption) => void }) {
  const qc = useQueryClient();
  const form = useForm<CreateSecurityInput>({
    resolver: zodResolver(createSecuritySchema) as unknown as Resolver<CreateSecurityInput>,
    defaultValues: { ticker: '', name: '', assetClass: 'EQUITY', currency: 'USD', lastPrice: 0, isin: '', exchange: '' },
  });
  React.useEffect(() => {
    if (open) form.reset({ ticker: '', name: '', assetClass: 'EQUITY', currency: 'USD', lastPrice: 0, isin: '', exchange: '' });
  }, [open, form]);

  const create = useMutation({
    mutationFn: (v: CreateSecurityInput) => api<SecurityOption>('/securities', { method: 'POST', body: { ...v, isin: v.isin || undefined, exchange: v.exchange || undefined } }),
    onSuccess: (s) => {
      toast.success(`Security ${s.ticker} added`);
      void qc.invalidateQueries({ queryKey: ['securities'] });
      onCreated(s);
      onOpenChange(false);
    },
    onError: (err) => {
      if (!applyFieldErrors(err, form.setError as never)) toast.error(err instanceof ApiError ? err.message : 'Could not add the security');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add security" description="Add an instrument to the reference list so it can be held and traded." size="md">
        <FormProvider {...form}>
          {/* the form is nested inside another dialog's form tree in the DOM via portal; stop the submit bubbling */}
          <form
            onSubmit={(e) => {
              e.stopPropagation();
              void form.handleSubmit((v) => create.mutate(v))(e);
            }}
            noValidate
          >
            <FormSection columns={2}>
              <TextField<CreateSecurityInput> name="ticker" label="Ticker" required placeholder="e.g. DLTA.ZW" />
              <SelectField<CreateSecurityInput> name="assetClass" label="Asset class" required options={ASSET_CLASSES.map((a) => ({ value: a, label: ASSET_CLASS_LABELS[a] }))} />
              <TextField<CreateSecurityInput> name="name" label="Name" required className="sm:col-span-2" />
              <SelectField<CreateSecurityInput> name="currency" label="Currency" options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
              <CurrencyField<CreateSecurityInput> name="lastPrice" label="Last price" decimals={6} />
              <TextField<CreateSecurityInput> name="exchange" label="Exchange" optional />
              <TextField<CreateSecurityInput> name="isin" label="ISIN" optional />
            </FormSection>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={create.isPending}>
                Add security
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
