'use client';

import * as React from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import type { z } from 'zod';
import { createDraftSchema, INVESTOR_TYPES, INVESTOR_TYPE_LABELS } from '@nexus/shared';
import { api, applyFieldErrors } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { SelectField, TextField } from '@/components/form/fields';
import type { DraftIdentity } from './types';

type Values = z.input<typeof createDraftSchema>;
const TYPE_OPTIONS = INVESTOR_TYPES.map((v) => ({ value: v, label: INVESTOR_TYPE_LABELS[v] }));

/**
 * First save creates the draft: we need only a legal name and an email, and hand back a private resume link.
 */
export function StartDialog({ open, onCreated, notice }: { open: boolean; onCreated: (identity: DraftIdentity, values: Values) => void; notice?: string | null }) {
  const form = useForm<Values, unknown, z.output<typeof createDraftSchema>>({ resolver: zodResolver(createDraftSchema) as never, defaultValues: { legalName: '', email: '' } });
  const [error, setError] = React.useState<string | null>(null);

  const create = useMutation({
    // No Idempotency-Key here on purpose: the API would persist the response (which carries the one-time resume token) for replay.
    // Double submits are prevented by the button's loading state instead.
    mutationFn: (v: Values) => api<{ reference: string; resumeToken: string }>('/public/applications', { method: 'POST', body: v }),
    onSuccess: (res, v) => {
      onCreated({ reference: res.reference, token: res.resumeToken }, v);
    },
    onError: (e) => {
      if (!applyFieldErrors(e, form.setError as never)) setError((e as Error).message);
    },
  });

  return (
    <Dialog open={open}>
      <DialogContent title="Start your application" description="Tell us who is applying. We save your draft as you go and give you a private link to come back to it." size="md" hideClose onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <FormProvider {...form}>
          <form
            id="start-form"
            className="grid gap-3.5"
            onSubmit={form.handleSubmit((v) => {
              setError(null);
              create.mutate(v);
            })}
            noValidate
          >
            {notice && <p className="rounded-md border border-[#ecd9b0] bg-warning-soft px-3 py-2 text-[12px] text-warning">{notice}</p>}
            <TextField name="legalName" label="Legal name of the investor" required autoComplete="organization" placeholder="e.g. Example Pension Fund" />
            <TextField name="email" label="Contact email" type="email" required autoComplete="email" help="Used only for this application." />
            <SelectField name="investorType" label="Investor type" optional options={TYPE_OPTIONS} />
            {error && <p role="alert" className="text-[12px] font-medium text-danger">{error}</p>}
          </form>
        </FormProvider>
        <DialogFooter>
          <Button type="submit" form="start-form" variant="primary" loading={create.isPending}>
            Start application
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
