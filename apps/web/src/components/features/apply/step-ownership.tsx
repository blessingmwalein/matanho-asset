'use client';

import * as React from 'react';
import { FormProvider, useWatch } from 'react-hook-form';
import { Check, TriangleAlert } from 'lucide-react';
import { makeStep1Schema, ownershipError, ownershipTotal } from '@nexus/shared';
import { CheckboxField, FormSection, FullWidth, PercentField, RepeaterField, TextField, TextareaField } from '@/components/form/fields';
import { cn } from '@/lib/utils';
import { pick, useStepForm } from './use-step-form';
import type { StepProps } from './types';

const KEYS = ['owners', 'signatories', 'ownershipNarrative', 'authorityNarrative'];
const EMPTY_OWNER = { fullName: '', ownershipPercent: undefined, nationality: '', idReference: '', email: '', phone: '', isController: false };
const EMPTY_SIGNATORY = { fullName: '', role: '', email: '', authority: '' };

/** Live ownership total (must equal 100% for entities; never above 100%). */
function OwnershipTotal({ investorType }: { investorType: StepProps['payload']['investorType'] }) {
  const owners = (useWatch({ name: 'owners' }) ?? []) as Array<{ ownershipPercent?: number | null }>;
  const total = ownershipTotal(owners);
  const err = ownershipError(investorType, owners);
  const ok = !err && total > 0;
  return (
    <div role="status" className={cn('rounded-md border px-3 py-2.5', ok ? 'border-[#cfe6dd] bg-success-soft' : total > 100 ? 'border-[#e6c3c9] bg-danger-soft' : 'border-border bg-surface-2')}>
      <div className="flex items-center justify-between gap-3 text-[12px]">
        <span className="flex items-center gap-1.5 font-semibold">
          {ok ? <Check className="size-3.5 text-success" /> : <TriangleAlert className={cn('size-3.5', total > 100 ? 'text-danger' : 'text-warning')} />}
          Ownership total
        </span>
        <b className="num">{total}% of 100%</b>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
        <div className={cn('h-full rounded-full', ok ? 'bg-success' : total > 100 ? 'bg-danger' : 'bg-primary')} style={{ width: `${Math.min(100, total)}%` }} />
      </div>
      {err && <p className="mt-1.5 text-[11.5px] leading-snug text-ink-2">{err}</p>}
    </div>
  );
}

/** Step 2: beneficial owners / controllers, authorised signatories and authority to invest. */
export function StepOwnership(props: StepProps) {
  const investorType = props.payload.investorType;
  const schema = React.useMemo(() => makeStep1Schema(investorType), [investorType]);
  const base = pick(props.payload, KEYS);
  const defaults = {
    ...base,
    owners: (base.owners as unknown[] | undefined)?.length ? base.owners : [EMPTY_OWNER],
    signatories: (base.signatories as unknown[] | undefined)?.length ? base.signatories : [EMPTY_SIGNATORY],
  };
  const form = useStepForm(schema, defaults, props);
  const ownersError = (form.formState.errors.owners as { root?: { message?: string }; message?: string } | undefined);
  const arrayError = ownersError?.root?.message ?? ownersError?.message;

  return (
    <FormProvider {...form}>
      <fieldset disabled={props.disabled} className="m-0 min-w-0 border-0 p-0">
        <div className="grid gap-4">
          <RepeaterField
            name="owners"
            label="Beneficial owners and controllers"
            help="Natural persons who ultimately own or control the investor, or the governing persons where no ownership applies."
            addLabel="Add owner / controller"
            emptyRow={EMPTY_OWNER}
            min={1}
            max={25}
            error={arrayError && !/Ownership/.test(arrayError) ? arrayError : undefined}
            renderRow={(row) => (
              <>
                <TextField name={`${row}.fullName`} label="Full name" required />
                <PercentField name={`${row}.ownershipPercent`} label="Ownership" required />
                <TextField name={`${row}.nationality`} label="Nationality" required />
                <TextField name={`${row}.idReference`} label="ID / passport reference" required />
                <TextField name={`${row}.email`} label="Email" optional type="email" />
                <div className="flex items-end pb-1.5 sm:col-span-2">
                  <CheckboxField name={`${row}.isController`} label="Controller" description="Has control but may hold 0%" />
                </div>
              </>
            )}
          />
          <OwnershipTotal investorType={investorType} />
        </div>

        <div className="mt-6 border-t border-border-soft pt-5">
          <RepeaterField
            name="signatories"
            label="Authorised signatories"
            help="People permitted to execute instructions or legal documents for this relationship."
            addLabel="Add signatory"
            emptyRow={EMPTY_SIGNATORY}
            min={1}
            max={25}
            renderRow={(row) => (
              <>
                <TextField name={`${row}.fullName`} label="Full name" required />
                <TextField name={`${row}.role`} label="Role / capacity" required />
                <TextField name={`${row}.email`} label="Email" required type="email" />
                <TextField name={`${row}.authority`} label="Signing authority" optional placeholder="e.g. Joint signatory" />
              </>
            )}
          />
        </div>

        <FormSection className="mt-6 border-t border-border-soft pt-5">
          <FullWidth>
            <TextareaField name="ownershipNarrative" label="Ownership structure description" optional rows={3} help="Parent entities, trustees, beneficiaries, controllers and any nominee arrangements." />
          </FullWidth>
          <FullWidth>
            <TextareaField name="authorityNarrative" label="Authority to invest" required rows={3} help="Board / trustee / investment committee authority and any signing rules." />
          </FullWidth>
        </FormSection>
      </fieldset>
    </FormProvider>
  );
}
