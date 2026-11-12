'use client';

import * as React from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';
import { INVESTOR_STATUSES, KYC_STATUSES, KYC_STATUS_LABELS, RISK_RATINGS, titleCase } from '@nexus/shared';
import { ApiError, api, applyFieldErrors } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { FormSection, SelectField, TextField } from '@/components/form/fields';
import type { InvestorDetail, StaffOption } from './types';

const NONE = '__none__';

const schema = z.object({
  contactName: z.string().trim().min(2, 'Contact name is required'),
  email: z.email('Enter a valid email address'),
  phone: z.string().trim().optional(),
  relationshipManagerId: z.string(),
  status: z.enum(INVESTOR_STATUSES),
  kycStatus: z.enum(KYC_STATUSES),
  riskRating: z.string(),
});
type Values = z.infer<typeof schema>;

/** Edit relationship manager, status, KYC status and contact details (INVESTORS_MANAGE). Changes are audited server-side. */
export function InvestorEditDialog({ investor, open, onOpenChange }: { investor: InvestorDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const staff = useQuery({ queryKey: ['staff-options'], queryFn: () => api<StaffOption[]>('/investors/staff-options'), staleTime: 5 * 60_000, enabled: open });

  const defaults = React.useMemo<Values>(
    () => ({
      contactName: investor.contact.name,
      email: investor.contact.email,
      phone: investor.contact.phone ?? '',
      relationshipManagerId: investor.relationshipManager?.id ?? NONE,
      status: investor.status,
      kycStatus: investor.kyc.status,
      riskRating: investor.kyc.riskRating ?? NONE,
    }),
    [investor],
  );
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  React.useEffect(() => {
    if (open) form.reset(defaults);
  }, [open, defaults, form]);

  const save = useMutation({
    mutationFn: (v: Values) =>
      api(`/investors/${investor.id}`, {
        method: 'PATCH',
        body: {
          contactName: v.contactName,
          email: v.email,
          phone: v.phone || null,
          relationshipManagerId: v.relationshipManagerId === NONE ? null : v.relationshipManagerId,
          status: v.status,
          kycStatus: v.kycStatus,
          riskRating: v.riskRating === NONE ? null : v.riskRating,
        },
      }),
    onSuccess: () => {
      toast.success('Investor updated');
      void qc.invalidateQueries({ queryKey: ['investor', investor.id] });
      void qc.invalidateQueries({ queryKey: ['investors'] });
      onOpenChange(false);
    },
    onError: (err) => {
      if (!applyFieldErrors(err, form.setError as never)) toast.error(err instanceof ApiError ? err.message : 'Could not update the investor');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Edit investor" description={`${investor.legalName} · ${investor.ref}. Changes are recorded in the audit trail.`} size="lg">
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate>
            <FormSection title="Relationship" columns={2}>
              <SelectField<Values>
                name="relationshipManagerId"
                label="Relationship manager"
                options={[{ value: NONE, label: 'Unassigned' }, ...(staff.data ?? []).map((s) => ({ value: s.id, label: s.name, hint: s.role ?? undefined }))]}
              />
              <SelectField<Values> name="status" label="Relationship status" options={INVESTOR_STATUSES.map((s) => ({ value: s, label: titleCase(s) }))} />
              <SelectField<Values> name="kycStatus" label="KYC status" options={KYC_STATUSES.map((s) => ({ value: s, label: KYC_STATUS_LABELS[s] }))} />
              <SelectField<Values> name="riskRating" label="Risk rating" options={[{ value: NONE, label: 'Not rated' }, ...RISK_RATINGS.map((r) => ({ value: r, label: titleCase(r) }))]} />
            </FormSection>
            <FormSection title="Contact" columns={2}>
              <TextField<Values> name="contactName" label="Contact person" required />
              <TextField<Values> name="email" label="Email" type="email" required />
              <TextField<Values> name="phone" label="Telephone" optional />
            </FormSection>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={save.isPending}>
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
