'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FormProvider, useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CURRENCIES, PORTFOLIO_TYPES, PORTFOLIO_TYPE_LABELS, createPortfolioSchema, type CreatePortfolioInput } from '@nexus/shared';
import { ApiError, api, applyFieldErrors } from '@/lib/api';
import { useIdempotencyKey } from '@/lib/idempotency';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { DateField, FormSection, FullWidth, SearchableSelectField, SelectField, TextField, TextareaField } from '@/components/form/fields';
import type { InvestorOption, StaffOption } from '@/components/features/investors/types';

const NONE = '__none__';

export function CreatePortfolioDialog({ open, onOpenChange, defaultInvestorId }: { open: boolean; onOpenChange: (o: boolean) => void; defaultInvestorId?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const key = useIdempotencyKey();
  const investors = useQuery({ queryKey: ['investor-options'], queryFn: () => api<InvestorOption[]>('/investors/options'), staleTime: 60_000, enabled: open });
  const staff = useQuery({ queryKey: ['staff-options'], queryFn: () => api<StaffOption[]>('/investors/staff-options'), staleTime: 5 * 60_000, enabled: open });

  const form = useForm<CreatePortfolioInput>({
    resolver: zodResolver(createPortfolioSchema) as unknown as Resolver<CreatePortfolioInput>,
    defaultValues: { investorId: defaultInvestorId ?? '', name: '', type: 'MANAGED_ACCOUNT', baseCurrency: 'USD', managerId: NONE, benchmark: '', inceptionDate: new Date().toISOString().slice(0, 10), description: '' },
  });
  React.useEffect(() => {
    if (open) form.reset({ investorId: defaultInvestorId ?? '', name: '', type: 'MANAGED_ACCOUNT', baseCurrency: 'USD', managerId: NONE, benchmark: '', inceptionDate: new Date().toISOString().slice(0, 10), description: '' });
  }, [open, defaultInvestorId, form]);

  const create = useMutation({
    mutationFn: (v: CreatePortfolioInput) =>
      api<{ id: string; ref: string; name: string }>('/portfolios', {
        method: 'POST',
        idempotencyKey: key.get(),
        body: { ...v, managerId: !v.managerId || v.managerId === NONE ? undefined : v.managerId, benchmark: v.benchmark || undefined, description: v.description || undefined },
      }),
    onSuccess: (p) => {
      toast.success(`Portfolio ${p.ref} created`);
      key.reset();
      void qc.invalidateQueries({ queryKey: ['portfolios'] });
      void qc.invalidateQueries({ queryKey: ['investor'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      onOpenChange(false);
      router.push(`/internal/portfolios/${p.id}`);
    },
    onError: (err) => {
      if (!applyFieldErrors(err, form.setError as never)) toast.error(err instanceof ApiError ? err.message : 'Could not create the portfolio');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Create portfolio" description="Opens a portfolio under an approved investor. An investment account is created automatically if the investor has none." size="lg">
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit((v) => create.mutate(v))} noValidate>
            <FormSection columns={2}>
              <FullWidth>
                <SearchableSelectField<CreatePortfolioInput>
                  name="investorId"
                  label="Investor"
                  required
                  placeholder="Select an investor"
                  searchPlaceholder="Search investors…"
                  loading={investors.isLoading}
                  options={(investors.data ?? []).map((i) => ({ value: i.id, label: i.name, hint: i.ref }))}
                />
              </FullWidth>
              <TextField<CreatePortfolioInput> name="name" label="Portfolio name" required placeholder="e.g. Balanced Growth" />
              <SelectField<CreatePortfolioInput> name="type" label="Portfolio type" required options={PORTFOLIO_TYPES.map((t) => ({ value: t, label: PORTFOLIO_TYPE_LABELS[t] }))} />
              <SelectField<CreatePortfolioInput> name="baseCurrency" label="Base currency" options={CURRENCIES.map((c) => ({ value: c, label: c }))} help="Transactions are recorded in this currency (no FX in the MVP model)." />
              <DateField<CreatePortfolioInput> name="inceptionDate" label="Inception date" required fromYear={2000} />
              <SelectField<CreatePortfolioInput>
                name="managerId"
                label="Portfolio manager"
                optional
                options={[{ value: NONE, label: 'Unassigned' }, ...(staff.data ?? []).map((s) => ({ value: s.id, label: s.name, hint: s.role ?? undefined }))]}
              />
              <TextField<CreatePortfolioInput> name="benchmark" label="Benchmark" optional placeholder="e.g. MSCI ACWI composite" />
              <FullWidth>
                <TextareaField<CreatePortfolioInput> name="description" label="Mandate description" optional rows={3} />
              </FullWidth>
            </FormSection>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={create.isPending}>
                Create portfolio
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
